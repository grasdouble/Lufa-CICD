import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { isAbsolute, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

function normalizePath(path) {
  return path.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
}

export function getAffectedPackages({ workspaces, changedFiles }) {
  const packageByPath = new Map(
    workspaces
      .filter(({ name, path }) => name && path && normalizePath(path) !== '.')
      .map(({ name, path }) => [normalizePath(path), name]),
  );
  const affected = new Set();

  for (const changedFile of changedFiles) {
    const file = normalizePath(changedFile);
    if (!file.endsWith('/package.json')) continue;
    const packagePath = file.slice(0, -'/package.json'.length);
    const name = packageByPath.get(packagePath);
    if (name) affected.add(name);
  }

  return [...affected].sort();
}

export function buildChangeset(packages) {
  return [
    '---',
    ...[...new Set(packages)].sort().map((name) => `${JSON.stringify(name)}: patch`),
    '---',
    '',
    'Dependency updates',
    '',
  ].join('\n');
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

function readChangedFiles(cwd, baseSha, headSha) {
  return execFileSync('git', ['diff', '--name-only', '-z', `${baseSha}...${headSha}`], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }).split('\0').filter(Boolean);
}

function isLegacyGeneratedChangeset(content) {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return false;
  const end = lines.indexOf('---', 1);
  return end >= 0 && lines.slice(end + 1).join('\n').trim() === 'Dependency updates';
}

function writeOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  const content = typeof value === 'string' ? value : JSON.stringify(value);
  const delimiter = `dependabot_changeset_${randomUUID()}`;
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<${delimiter}\n${content}\n${delimiter}\n`);
}

function runGit(cwd, args, options = {}) {
  const result = execFileSync('git', args, { cwd, encoding: 'utf8', ...options });
  return typeof result === 'string' ? result.trim() : '';
}

function commitAndPush({ cwd, paths, headBranch, githubToken }) {
  runGit(cwd, ['config', 'user.name', 'github-actions[bot]']);
  runGit(cwd, ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com']);
  runGit(cwd, ['add', '--', ...paths]);

  try {
    execFileSync('git', ['diff', '--cached', '--quiet', '--', ...paths], { cwd, stdio: 'ignore' });
    return { changed: false, commitSha: runGit(cwd, ['rev-parse', 'HEAD']) };
  } catch (error) {
    if (error.status !== 1) throw error;
  }

  execFileSync('git', ['commit', '-m', 'chore: add changeset for Dependabot update', '--', ...paths], {
    cwd,
    stdio: 'inherit',
  });

  const authorization = Buffer.from(`x-access-token:${githubToken}`, 'utf8').toString('base64');
  const env = {
    ...process.env,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${authorization}`,
  };
  execFileSync('git', ['push', 'origin', `HEAD:refs/heads/${headBranch}`], {
    cwd,
    env,
    stdio: 'inherit',
  });
  return { changed: true, commitSha: runGit(cwd, ['rev-parse', 'HEAD']) };
}

export function runDependabotChangeset({ cwd, baseSha, headSha, headBranch, pullRequestNumber, githubToken }) {
  if (!/^[0-9a-f]{7,64}$/i.test(baseSha) || !/^[0-9a-f]{7,64}$/i.test(headSha)) {
    throw new Error('Both base-sha and head-sha must be valid Git commit SHAs.');
  }
  if (!/^[1-9]\d*$/.test(String(pullRequestNumber))) {
    throw new Error('pull-request-number must be a positive integer.');
  }
  if (!headBranch || /[\r\n]/.test(headBranch)) throw new Error('head-branch must be a valid Git branch name.');
  runGit(cwd, ['check-ref-format', '--branch', headBranch]);
  if (!githubToken || /[\r\n]/.test(githubToken)) throw new Error('A non-empty, single-line github-token is required.');
  if (runGit(cwd, ['status', '--porcelain'])) throw new Error('The checked out worktree must be clean.');

  const changedFiles = readChangedFiles(cwd, baseSha, headSha);
  const affectedPackages = getAffectedPackages({
    workspaces: readWorkspaces(cwd),
    changedFiles,
  });
  const changesetFile = affectedPackages.length > 0
    ? `.changeset/dependabot-pr-${pullRequestNumber}.md`
    : '';

  if (affectedPackages.length === 0) {
    return {
      affectedPackages,
      changesetFile,
      changed: false,
      commitSha: runGit(cwd, ['rev-parse', 'HEAD']),
    };
  }

  const pathsToCommit = [];
  const changesetPath = resolve(cwd, changesetFile);
  const changesetContent = buildChangeset(affectedPackages);
  if (!existsSync(changesetPath) || readFileSync(changesetPath, 'utf8') !== changesetContent) {
    writeFileSync(changesetPath, changesetContent);
    pathsToCommit.push(changesetFile);
  }

  const legacyChangesetFiles = changedFiles.filter((path) => /^\.changeset\/dependabot-\d+\.md$/.test(path));
  for (const path of legacyChangesetFiles) {
    const legacyPath = resolve(cwd, path);
    if (!existsSync(legacyPath) || !isLegacyGeneratedChangeset(readFileSync(legacyPath, 'utf8'))) continue;
    rmSync(legacyPath);
    pathsToCommit.push(path);
  }

  if (pathsToCommit.length === 0) {
    return { affectedPackages, changesetFile, changed: false, commitSha: runGit(cwd, ['rev-parse', 'HEAD']) };
  }

  const { changed, commitSha } = commitAndPush({ cwd, paths: pathsToCommit, headBranch, githubToken });
  return { affectedPackages, changesetFile, changed, commitSha };
}

async function main() {
  const result = runDependabotChangeset({
    cwd: process.env.GITHUB_WORKSPACE ?? process.cwd(),
    baseSha: process.env.BASE_SHA ?? '',
    headSha: process.env.HEAD_SHA ?? '',
    headBranch: process.env.HEAD_BRANCH ?? '',
    pullRequestNumber: process.env.PULL_REQUEST_NUMBER ?? '',
    githubToken: process.env.DEPENDABOT_GITHUB_TOKEN ?? '',
  });
  writeOutput('affected-packages', result.affectedPackages);
  writeOutput('changeset-file', result.changesetFile);
  writeOutput('changed', String(result.changed));
  writeOutput('commit-sha', result.commitSha);
  if (result.affectedPackages.length === 0) {
    console.log('No workspace package manifests changed; no Changeset was generated.');
  } else if (result.changed) {
    console.log(`Pushed ${result.changesetFile} for ${result.affectedPackages.join(', ')}.`);
  } else {
    console.log(`${result.changesetFile} is already up to date.`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
