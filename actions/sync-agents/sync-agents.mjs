import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const beginMarker = '<!-- BEGIN:AGENTS.shared -->';
const endMarker = '<!-- END:AGENTS.shared -->';
const coreRepository = 'grasdouble/Lufa-Core';
const sharedRulesUrl = 'https://raw.githubusercontent.com/grasdouble/Lufa-Core/main/packages/config/agents';

export function buildSharedBlock(sharedContent, version) {
  const header = `${beginMarker}\n<!-- source: @grasdouble/lufa_config_agents@${version} — DO NOT EDIT this block manually, run \`pnpm sync:agents\` -->`;
  return `${header}\n\n${sharedContent.trimEnd()}\n\n${endMarker}`;
}

export function injectSharedBlock(agentsContent, sharedContent, version) {
  const beginIndex = agentsContent.indexOf(beginMarker);
  const endIndex = beginIndex === -1
    ? -1
    : agentsContent.indexOf(endMarker, beginIndex + beginMarker.length);
  if (beginIndex === -1 || endIndex === -1) {
    throw new Error('AGENTS.md is missing the shared-rules markers.');
  }

  const updated = [
    agentsContent.slice(0, beginIndex),
    buildSharedBlock(sharedContent, version),
    agentsContent.slice(endIndex + endMarker.length),
  ].join('');
  return { updated, changed: updated !== agentsContent };
}

function runGit(cwd, args, options = {}) {
  const result = execFileSync('git', args, { cwd, encoding: 'utf8', ...options });
  return typeof result === 'string' ? result.trim() : '';
}

export async function readSharedRules({ cwd, repository, fetchImpl = fetch }) {
  if (repository === coreRepository) {
    const agentsPackage = resolve(cwd, 'packages/config/agents');
    return {
      sharedContent: readFileSync(resolve(agentsPackage, 'AGENTS.shared.md'), 'utf8').trimEnd(),
      version: 'local',
    };
  }

  const [rulesResponse, packageResponse] = await Promise.all([
    fetchImpl(`${sharedRulesUrl}/AGENTS.shared.md`),
    fetchImpl(`${sharedRulesUrl}/package.json`),
  ]);
  if (!rulesResponse.ok) throw new Error(`Could not read shared agent rules (${rulesResponse.status}).`);
  if (!packageResponse.ok) throw new Error(`Could not read the shared agent package version (${packageResponse.status}).`);
  const packageManifest = await packageResponse.json();
  if (typeof packageManifest.version !== 'string' || !packageManifest.version) {
    throw new Error('The shared agent package has no valid version.');
  }
  return {
    sharedContent: (await rulesResponse.text()).trimEnd(),
    version: packageManifest.version,
  };
}

function commitAndPush({ cwd, headBranch, githubToken }) {
  runGit(cwd, ['config', 'user.name', 'github-actions[bot]']);
  runGit(cwd, ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com']);
  runGit(cwd, ['add', '--', 'AGENTS.md']);

  try {
    execFileSync('git', ['diff', '--cached', '--quiet', '--', 'AGENTS.md'], { cwd, stdio: 'ignore' });
    return { changed: false, commitSha: runGit(cwd, ['rev-parse', 'HEAD']) };
  } catch (error) {
    if (error.status !== 1) throw error;
  }

  execFileSync('git', ['commit', '-m', 'chore: sync shared agent rules', '--', 'AGENTS.md'], {
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

export async function syncAgents({
  cwd,
  mode,
  headBranch = '',
  githubToken = '',
  repository = '',
  source,
  fetchImpl = fetch,
}) {
  if (mode !== 'check' && mode !== 'sync') throw new Error('mode must be either "check" or "sync".');
  if (mode === 'sync') {
    if (!headBranch || /[\r\n]/.test(headBranch)) throw new Error('head-branch must be a valid Git branch name.');
    runGit(cwd, ['check-ref-format', '--branch', headBranch]);
    if (!githubToken || /[\r\n]/.test(githubToken)) throw new Error('sync mode requires a non-empty, single-line github-token.');
    if (runGit(cwd, ['status', '--porcelain'])) throw new Error('The checked out worktree must be clean.');
    const currentBranch = runGit(cwd, ['branch', '--show-current']);
    if (currentBranch !== headBranch) throw new Error(`Checked out branch "${currentBranch}" does not match head-branch "${headBranch}".`);
  }

  const shared = source ?? await readSharedRules({ cwd, repository, fetchImpl });
  const agentsPath = resolve(cwd, 'AGENTS.md');
  const currentContent = readFileSync(agentsPath, 'utf8');
  const { updated, changed } = injectSharedBlock(currentContent, shared.sharedContent, shared.version);
  const currentSha = runGit(cwd, ['rev-parse', 'HEAD']);
  if (!changed) return { changed: false, synced: true, commitSha: currentSha };
  if (mode === 'check') return { changed: true, synced: false, commitSha: currentSha };

  writeFileSync(agentsPath, updated, 'utf8');
  const { changed: committed, commitSha } = commitAndPush({ cwd, headBranch, githubToken });
  return { changed: committed, synced: true, commitSha };
}

function writeOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

async function main() {
  const mode = process.env.SYNC_MODE || 'check';
  const result = await syncAgents({
    cwd: process.env.GITHUB_WORKSPACE ?? process.cwd(),
    mode,
    headBranch: process.env.HEAD_BRANCH ?? '',
    githubToken: process.env.SYNC_GITHUB_TOKEN ?? '',
    repository: process.env.GITHUB_REPOSITORY ?? '',
  });
  writeOutput('changed', String(result.changed));
  writeOutput('commit-sha', result.commitSha);

  if (mode === 'check' && result.changed) {
    const message = 'AGENTS.md is out of date with the shared rules. Run the repository-supported sync command and commit the generated changes.';
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Shared agent rules are out of date\n\n${message}\n`);
    throw new Error(message);
  }
  if (mode === 'sync' && result.changed) {
    console.log(`Synced AGENTS.md and pushed ${result.commitSha} to ${process.env.HEAD_BRANCH}.`);
  } else {
    console.log('AGENTS.md is already up to date.');
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
