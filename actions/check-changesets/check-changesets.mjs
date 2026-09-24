import { randomUUID } from 'node:crypto';
import { appendFileSync, readFileSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { isAbsolute, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const changesetName = /^[A-Za-z0-9@][A-Za-z0-9@._/-]*$/;

export function parseChangesetPackages(content) {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return new Set();
  const end = lines.indexOf('---', 1);
  if (end < 0) throw new Error('Changeset has unterminated YAML frontmatter.');

  const packages = new Set();
  for (const line of lines.slice(1, end)) {
    const match = /^\s*(?:"([^"\n]+)"|'([^'\n]+)'|([^\s:#]+))\s*:\s*(patch|minor|major)\s*(?:#.*)?$/.exec(line);
    if (!match) continue;
    const name = match[1] ?? match[2] ?? match[3];
    if (!changesetName.test(name)) throw new Error(`Invalid Changesets package name: ${name}`);
    packages.add(name);
  }
  return packages;
}

function normalizePath(path) {
  return path.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
}

export function checkChangesets({ workspaces, changedFiles, changesetFiles, ignoreMarkdown = false }) {
  const packagesByPath = workspaces
    .filter(({ name, path }) => name && path && normalizePath(path) !== '.')
    .map(({ name, path }) => ({ name, path: normalizePath(path) }))
    .sort((a, b) => b.path.length - a.path.length);
  const packageNames = new Set(packagesByPath.map(({ name }) => name));
  const modifiedPackages = new Set();

  for (const changedFile of changedFiles) {
    const file = normalizePath(changedFile);
    if (ignoreMarkdown && /\.(?:md|adoc)$/i.test(file)) continue;
    const workspace = packagesByPath.find(({ path }) => file.startsWith(`${path}/`));
    if (workspace) modifiedPackages.add(workspace.name);
  }

  const coveredPackages = new Set();
  for (const changeset of changesetFiles) {
    if (!changeset.content || changeset.path === '.changeset/README.md') continue;
    for (const name of parseChangesetPackages(changeset.content)) {
      if (packageNames.has(name)) coveredPackages.add(name);
    }
  }

  const modified = [...modifiedPackages].sort();
  const covered = modified.filter((name) => coveredPackages.has(name));
  const missing = modified.filter((name) => !coveredPackages.has(name));
  return {
    modifiedPackages: modified,
    coveredPackages: covered,
    missingPackages: missing,
    passed: missing.length === 0,
  };
}

export function readWorkspaces(cwd) {
  const workspaceRoot = realpathSync(cwd);
  const raw = execFileSync('pnpm', ['-r', 'list', '--depth', '-1', '--json'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const result = JSON.parse(raw);
  if (!Array.isArray(result)) throw new Error('pnpm returned an invalid workspace package list.');
  return result
    .filter(({ name, path }) => name && path)
    .map(({ name, path }) => {
      const absolutePath = realpathSync(isAbsolute(path) ? path : resolve(cwd, path));
      return { name, path: normalizePath(relative(workspaceRoot, absolutePath)) || '.' };
    });
}

function writeOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  const content = typeof value === 'string' ? value : JSON.stringify(value);
  const delimiter = `changesets_${randomUUID()}`;
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<${delimiter}\n${content}\n${delimiter}\n`);
}

export function runCheck({ cwd, baseSha, headSha, ignoreMarkdown }) {
  if (!/^[0-9a-f]{7,64}$/i.test(baseSha) || !/^[0-9a-f]{7,64}$/i.test(headSha)) {
    throw new Error('Both base-sha and head-sha must be valid Git commit SHAs.');
  }
  const changedFiles = execFileSync('git', ['diff', '--name-only', '-z', `${baseSha}...${headSha}`], {
    cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  }).split('\0').filter(Boolean);
  const changesetPaths = changedFiles.filter((file) => file.startsWith('.changeset/') && file.endsWith('.md'));
  const changesetFiles = changesetPaths.map((path) => {
    try {
      return { path, content: readFileSync(resolve(cwd, path), 'utf8') };
    } catch (error) {
      if (error.code === 'ENOENT') return { path, content: null };
      throw error;
    }
  });

  return checkChangesets({ workspaces: readWorkspaces(cwd), changedFiles, changesetFiles, ignoreMarkdown });
}

export function buildComment({ modifiedPackages, missingPackages }) {
  if (modifiedPackages.length === 0) {
    return [
      '<!-- changeset-validation-comment -->',
      '## ✅ No Changeset Needed',
      '',
      'No packages were modified in this PR. No changeset is required.',
    ].join('\n');
  }
  if (missingPackages.length > 0) {
    const missing = new Set(missingPackages);
    return [
      '<!-- changeset-validation-comment -->',
      '## ⚠️ Changeset Validation Failed',
      '',
      'The following packages have been modified but are **not included in any changeset**:',
      '',
      ...missingPackages.map((name) => `- \`${name}\``),
      '',
      '### What you need to do:',
      '',
      '1. Run `pnpm changeset` to create a new changeset',
      '2. Select the modified packages that need version bumps',
      '3. Choose the appropriate version bump (major, minor, or patch)',
      '4. Write a clear description of the changes',
      '5. Commit the generated changeset file',
      '',
      '### All modified packages:',
      '',
      ...modifiedPackages.map((name) => `- ${missing.has(name) ? '❌' : '✅'} \`${name}\``),
      '',
      '### Why is this important?',
      '',
      'Changesets ensure that:',
      '- All package changes are properly versioned',
      '- Changelogs are automatically generated',
      '- Dependent packages are updated correctly',
      '- Release notes are comprehensive',
      '',
      '### Need help?',
      '',
      '- [Changesets documentation](https://github.com/changesets/changesets)',
    ].join('\n');
  }
  return [
    '<!-- changeset-validation-comment -->',
    '## ✅ Changeset Validation Passed',
    '',
      'All modified packages are included in changesets. Great job!',
      '',
      '### Modified packages:',
    '',
    ...modifiedPackages.map((name) => `- ✅ \`${name}\``),
  ].join('\n');
}

async function main() {
  const result = runCheck({
    cwd: process.env.GITHUB_WORKSPACE ?? process.cwd(),
    baseSha: process.env.BASE_SHA ?? '',
    headSha: process.env.HEAD_SHA ?? '',
    ignoreMarkdown: process.env.IGNORE_MARKDOWN === 'true',
  });
  writeOutput('modified-packages', result.modifiedPackages);
  writeOutput('covered-packages', result.coveredPackages);
  writeOutput('missing-packages', result.missingPackages);
  writeOutput('modified-count', String(result.modifiedPackages.length));
  writeOutput('missing-count', String(result.missingPackages.length));
  writeOutput('passed', String(result.passed));
  writeOutput('comment-body', buildComment(result));
  console.log(`Modified workspace packages: ${result.modifiedPackages.length}`);
  console.log(`Covered by Changesets: ${result.coveredPackages.length}`);
  console.log(`Missing Changesets: ${result.missingPackages.length}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
