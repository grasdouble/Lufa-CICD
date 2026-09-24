import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { readSharedRules, syncAgents } from '../sync-agents.mjs';

const beginMarker = '<!-- BEGIN:AGENTS.shared -->';
const endMarker = '<!-- END:AGENTS.shared -->';

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function initialAgents(sharedText = 'Old shared rules') {
  return [
    '# Repository instructions',
    '',
    beginMarker,
    '<!-- source: @grasdouble/lufa_config_agents@1.0.0 -->',
    '',
    sharedText,
    '',
    endMarker,
    '',
    '## Repository-specific instructions',
    '',
    'Keep this section unchanged.',
    '',
  ].join('\n');
}

function initRepo(temp) {
  const cwd = join(temp, 'repo');
  const remote = join(temp, 'remote.git');
  const headBranch = 'dependabot/agents-update';
  mkdirSync(cwd, { recursive: true });
  execFileSync('git', ['init', '--bare', remote], { stdio: 'ignore' });
  execFileSync('git', ['init', '-b', headBranch, cwd], { stdio: 'ignore' });
  git(cwd, ['config', 'user.name', 'Test User']);
  git(cwd, ['config', 'user.email', 'test@example.com']);
  writeFileSync(join(cwd, 'AGENTS.md'), initialAgents());
  execFileSync('git', ['-C', cwd, 'add', 'AGENTS.md']);
  execFileSync('git', ['-C', cwd, 'commit', '-m', 'base'], { stdio: 'ignore' });
  execFileSync('git', ['-C', cwd, 'remote', 'add', 'origin', remote]);
  execFileSync('git', ['-C', cwd, 'push', '-u', 'origin', headBranch], { stdio: 'ignore' });
  return { cwd, remote, headBranch };
}

test('reads the public Core source rather than the private npm package for consumer repos', async () => {
  const urls = [];
  const source = await readSharedRules({
    cwd: '.',
    repository: 'grasdouble/Lufa-Design-System',
    fetchImpl: async (url) => {
      urls.push(url);
      return url.endsWith('package.json')
        ? { ok: true, status: 200, json: async () => ({ version: '1.2.3' }) }
        : { ok: true, status: 200, text: async () => 'Shared rules\n' };
    },
  });

  assert.equal(source.version, '1.2.3');
  assert.equal(source.sharedContent, 'Shared rules');
  assert.deepEqual(urls.sort(), [
    'https://raw.githubusercontent.com/grasdouble/Lufa-Core/main/packages/config/agents/AGENTS.shared.md',
    'https://raw.githubusercontent.com/grasdouble/Lufa-Core/main/packages/config/agents/package.json',
  ]);
});

test('uses the local marker only when synchronizing the Core source repository', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'sync-agents-source-'));
  const packageDirectory = join(temp, 'packages', 'config', 'agents');
  try {
    mkdirSync(packageDirectory, { recursive: true });
    writeFileSync(join(packageDirectory, 'AGENTS.shared.md'), 'Core shared rules\n');
    writeFileSync(join(packageDirectory, 'package.json'), JSON.stringify({ version: '1.2.3' }));
    const source = await readSharedRules({ cwd: temp, repository: 'grasdouble/Lufa-Core' });
    assert.deepEqual(source, { sharedContent: 'Core shared rules', version: 'local' });
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('check mode reports stale shared rules without modifying the checkout', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'sync-agents-check-'));
  try {
    const { cwd, headBranch } = initRepo(temp);
    const original = readFileSync(join(cwd, 'AGENTS.md'), 'utf8');
    const result = await syncAgents({
      cwd,
      mode: 'check',
      headBranch,
      source: { sharedContent: 'Updated shared rules', version: '1.2.3' },
    });

    assert.equal(result.changed, true);
    assert.equal(result.synced, false);
    assert.equal(readFileSync(join(cwd, 'AGENTS.md'), 'utf8'), original);
    assert.equal(git(cwd, ['status', '--porcelain']), '');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('sync mode commits and pushes only the shared AGENTS block, then is idempotent', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'sync-agents-push-'));
  try {
    const { cwd, remote, headBranch } = initRepo(temp);
    const input = {
      cwd,
      mode: 'sync',
      headBranch,
      githubToken: 'test-token',
      source: { sharedContent: 'Updated shared rules', version: '1.2.3' },
    };
    const first = await syncAgents(input);
    const content = readFileSync(join(cwd, 'AGENTS.md'), 'utf8');
    assert.equal(first.changed, true);
    assert.equal(first.synced, true);
    assert.match(content, /@grasdouble\/lufa_config_agents@1\.2\.3/);
    assert.match(content, /Updated shared rules/);
    assert.match(content, /Keep this section unchanged\./);
    assert.equal(git(cwd, ['status', '--porcelain']), '');
    assert.equal(git(cwd, ['--git-dir', remote, 'rev-parse', `refs/heads/${headBranch}`]), first.commitSha);

    const second = await syncAgents(input);
    assert.equal(second.changed, false);
    assert.equal(second.synced, true);
    assert.equal(second.commitSha, first.commitSha);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('check mode succeeds when the shared block already matches', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'sync-agents-current-'));
  try {
    const { cwd, headBranch } = initRepo(temp);
    const updated = initialAgents('Updated shared rules').replace(
      '<!-- source: @grasdouble/lufa_config_agents@1.0.0 -->',
      '<!-- source: @grasdouble/lufa_config_agents@1.2.3 — DO NOT EDIT this block manually, run `pnpm sync:agents` -->',
    );
    writeFileSync(join(cwd, 'AGENTS.md'), updated);
    execFileSync('git', ['-C', cwd, 'add', 'AGENTS.md']);
    execFileSync('git', ['-C', cwd, 'commit', '-m', 'sync agents'], { stdio: 'ignore' });
    const result = await syncAgents({
      cwd,
      mode: 'check',
      headBranch,
      source: { sharedContent: 'Updated shared rules', version: '1.2.3' },
    });

    assert.equal(result.changed, false);
    assert.equal(result.synced, true);
    assert.ok(existsSync(join(cwd, 'AGENTS.md')));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
