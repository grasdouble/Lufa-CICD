import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function fixture(t, versions, changeset) {
  const dir = mkdtempSync(join(tmpdir(), 'lufa-cicd-version-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, '.changeset'));
  cpSync(join(root, '.changeset/config.json'), join(dir, '.changeset/config.json'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'version-fixture', private: true }));
  writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - actions/*\n');
  symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
  for (const [name, version] of Object.entries(versions)) {
    mkdirSync(join(dir, 'actions', name), { recursive: true });
    writeFileSync(join(dir, 'actions', name, 'package.json'), JSON.stringify({
      name: `@grasdouble/cicd-${name}`, version, private: true,
    }));
  }
  writeFileSync(join(dir, '.changeset/update-actions.md'), changeset);
  return dir;
}

function version(dir) {
  execFileSync(process.execPath, [join(root, 'node_modules/@changesets/cli/bin.js'), 'version'], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, CI: 'true' },
  });
}

test('Changesets bumps only the explicitly selected private action and generates its changelog', (t) => {
  const dir = fixture(t, { 'pr-comment': '1.0.0', 'ftp-deploy': '2.0.0' },
    '---\n"@grasdouble/cicd-pr-comment": patch\n---\n\nfix: handle paginated comments.\n');
  version(dir);
  const manifest = (name) => JSON.parse(readFileSync(join(dir, 'actions', name, 'package.json'), 'utf8'));
  assert.equal(manifest('pr-comment').version, '1.0.1');
  assert.equal(manifest('ftp-deploy').version, '2.0.0');
  assert.equal(manifest('pr-comment').private, true);
  const changelog = readFileSync(join(dir, 'actions/pr-comment/CHANGELOG.md'), 'utf8');
  assert.match(changelog, /## 1\.0\.1/);
  assert.match(changelog, /fix: handle paginated comments/);
});

test('major changesets promote private bootstrap actions from 0.0.0 to 1.0.0', (t) => {
  const config = JSON.parse(readFileSync(join(root, '.changeset/config.json'), 'utf8'));
  assert.deepEqual(config.privatePackages, { version: true, tag: false });
  const names = ['changesets-release', 'ftp-deploy', 'lint-workflows', 'pr-comment', 'setup-node-pnpm'];
  // The real bootstrap changeset is consumed by the first version PR.
  const initial = `---\n${names.map((name) => `"@grasdouble/cicd-${name}": major`).join('\n')}\n---\n\nfeat: initial actions.\n`;
  const dir = fixture(t, Object.fromEntries(names.map((name) => [name, '0.0.0'])), initial);
  version(dir);
  for (const name of names) {
    const pkg = JSON.parse(readFileSync(join(dir, 'actions', name, 'package.json'), 'utf8'));
    assert.equal(pkg.version, '1.0.0', name);
  }
});
