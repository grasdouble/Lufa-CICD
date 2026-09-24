import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { formatReport, runPnpmOutdated, writeDependencyReport } from '../dependency-report.mjs';

test('leaves dependency installation to the calling workflow', () => {
  const action = readFileSync(new URL('../action.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(action, /pnpm install/);
});

test('runs pnpm outdated recursively and accepts its outdated-result exit code', () => {
  const output = runPnpmOutdated('/workspace', (command, args, options) => {
    assert.equal(command, 'pnpm');
    assert.deepEqual(args, ['outdated', '-r']);
    assert.equal(options.cwd, '/workspace');
    return { status: 1, stdout: 'package 1.0.0 1.1.0', stderr: '' };
  });

  assert.equal(output, 'package 1.0.0 1.1.0');
});

test('formats a report and publishes the same content to the summary and artifact file', () => {
  const temp = mkdtempSync(join(tmpdir(), 'dependency-report-'));
  try {
    const summaryFile = join(temp, 'summary.md');
    const report = writeDependencyReport({
      cwd: temp,
      runnerTemp: temp,
      summaryFile,
      runCommand: () => 'package 1.0.0 1.1.0',
    });
    const expected = '# Outdated Dependencies Report\n\n```text\npackage 1.0.0 1.1.0\n```\n';

    assert.equal(report.content, expected);
    assert.equal(readFileSync(report.reportPath, 'utf8'), expected);
    assert.equal(readFileSync(summaryFile, 'utf8'), `${expected}\n`);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('reports when no dependencies are outdated', () => {
  assert.equal(formatReport('  \n'), '# Outdated Dependencies Report\n\nNo outdated dependencies.\n');
});

test('fails on registry or command errors instead of publishing an empty report', () => {
  assert.throws(
    () => runPnpmOutdated('/workspace', () => ({ status: 2, stdout: '', stderr: 'registry unavailable' })),
    /pnpm outdated -r failed.*registry unavailable/,
  );
  assert.throws(
    () => runPnpmOutdated('/workspace', () => ({ status: 1, stdout: '', stderr: '' })),
    /pnpm outdated -r failed/,
  );
});
