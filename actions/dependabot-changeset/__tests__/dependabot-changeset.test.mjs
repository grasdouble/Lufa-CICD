import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildChangeset, getAffectedPackages, runDependabotChangeset } from '../dependabot-changeset.mjs';

const workspace = (name, path) => ({ name, path });

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

test('maps changed package manifests to workspace packages and ignores the root manifest', () => {
  assert.deepEqual(getAffectedPackages({
    workspaces: [
      workspace('@example/root', '.'),
      workspace('@example/parent', 'packages/parent'),
      workspace('@example/child', 'packages/parent/child'),
    ],
    changedFiles: [
      'package.json',
      'packages/parent/package.json',
      'packages/parent/child/package.json',
      'packages/parent/child/deep/package.json',
      'README.md',
    ],
  }), ['@example/child', '@example/parent']);
});

test('maps changed composite action metadata to its workspace package', () => {
  assert.deepEqual(getAffectedPackages({
    workspaces: [
      workspace('@grasdouble/cicd-ftp-deploy', 'actions/ftp-deploy'),
      workspace('@grasdouble/cicd-pr-comment', 'actions/pr-comment'),
    ],
    changedFiles: [
      'actions/ftp-deploy/action.yml',
      'actions/pr-comment/README.md',
    ],
  }), ['@grasdouble/cicd-ftp-deploy']);
});

test('builds deterministic patch Changeset content with sorted package names', () => {
  assert.equal(buildChangeset(['@example/z', '@example/a']), [
    '---',
    '"@example/a": patch',
    '"@example/z": patch',
    '---',
    '',
    'Dependency updates',
    '',
  ].join('\n'));
});

test('reuses a PR-specific Changeset, removes legacy timestamp files, and pushes only once', () => {
  const temp = mkdtempSync(join(tmpdir(), 'dependabot-changeset-'));
  const cwd = join(temp, 'repo');
  const remote = join(temp, 'remote.git');
  const branch = 'dependabot/npm_and_yarn/example-2.0.0';
  mkdirSync(join(cwd, 'packages', 'example'), { recursive: true });

  try {
    execFileSync('git', ['init', '--bare', remote], { stdio: 'ignore' });
    execFileSync('git', ['init', '-b', branch, cwd], { stdio: 'ignore' });
    git(cwd, ['config', 'user.name', 'Test User']);
    git(cwd, ['config', 'user.email', 'test@example.com']);
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: '@example/root', private: true }));
    writeFileSync(join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
    writeFileSync(join(cwd, 'packages', 'example', 'package.json'), JSON.stringify({
      name: '@example/package',
      version: '1.0.0',
      dependencies: { dependency: '^1.0.0' },
    }));
    execFileSync('git', ['-C', cwd, 'add', '.']);
    execFileSync('git', ['-C', cwd, 'commit', '-m', 'base'], { stdio: 'ignore' });
    const baseSha = git(cwd, ['rev-parse', 'HEAD']);
    execFileSync('git', ['-C', cwd, 'remote', 'add', 'origin', remote]);
    execFileSync('git', ['-C', cwd, 'push', '-u', 'origin', branch], { stdio: 'ignore' });

    writeFileSync(join(cwd, 'packages', 'example', 'package.json'), JSON.stringify({
      name: '@example/package',
      version: '1.0.0',
      dependencies: { dependency: '^2.0.0' },
    }));
    mkdirSync(join(cwd, '.changeset'), { recursive: true });
    const legacyFile = '.changeset/dependabot-1720000000.md';
    writeFileSync(join(cwd, legacyFile), [
      '---',
      '"@example/package": patch',
      '---',
      '',
      'Dependency updates',
      '',
    ].join('\n'));
    execFileSync('git', ['-C', cwd, 'add', '.']);
    execFileSync('git', ['-C', cwd, 'commit', '-m', 'update dependency'], { stdio: 'ignore' });
    const headSha = git(cwd, ['rev-parse', 'HEAD']);
    execFileSync('git', ['-C', cwd, 'push', 'origin', branch], { stdio: 'ignore' });

    const input = {
      cwd,
      baseSha,
      headSha,
      headBranch: branch,
      pullRequestNumber: '42',
      githubToken: 'test-token',
    };
    const first = runDependabotChangeset(input);
    const changesetFile = '.changeset/dependabot-pr-42.md';
    assert.deepEqual(first.affectedPackages, ['@example/package']);
    assert.equal(first.changesetFile, changesetFile);
    assert.equal(first.changed, true);
    assert.equal(existsSync(join(cwd, legacyFile)), false);
    assert.match(git(cwd, ['show', `HEAD:${changesetFile}`]), /"@example\/package": patch/);
    assert.equal(git(cwd, ['status', '--porcelain']), '');

    const committedSha = git(cwd, ['rev-parse', 'HEAD']);
    const second = runDependabotChangeset(input);
    assert.equal(second.changed, false);
    assert.equal(git(cwd, ['rev-parse', 'HEAD']), committedSha);
    assert.equal(git(cwd, ['--git-dir', remote, 'rev-parse', `refs/heads/${branch}`]), committedSha);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
