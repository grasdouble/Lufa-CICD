import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ansiEscape = /\u001b\[[0-?]*[ -/]*[@-~]/g;

export function runPnpmOutdated(cwd, spawn = spawnSync) {
  const result = spawn('pnpm', ['outdated', '-r'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;

  const stdout = result.stdout ?? '';
  if (result.status === 0 || (result.status === 1 && stdout.trim())) return stdout;

  const details = (result.stderr || stdout).trim();
  throw new Error(`pnpm outdated -r failed with exit code ${result.status ?? 'unknown'}${details ? `: ${details}` : ''}`);
}

export function formatReport(stdout) {
  const report = stdout.replace(ansiEscape, '').trim();
  return `# Outdated Dependencies Report\n\n${report || 'No outdated dependencies.'}\n`;
}

export function writeDependencyReport({ cwd, runnerTemp, summaryFile, runCommand = runPnpmOutdated }) {
  const content = formatReport(runCommand(cwd));
  const reportPath = join(runnerTemp, 'outdated-dependencies.md');
  mkdirSync(runnerTemp, { recursive: true });
  writeFileSync(reportPath, content);
  appendFileSync(summaryFile, `${content}\n`);
  return { reportPath, content };
}

function writeOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

async function main() {
  const result = writeDependencyReport({
    cwd: process.env.GITHUB_WORKSPACE ?? process.cwd(),
    runnerTemp: process.env.RUNNER_TEMP ?? process.cwd(),
    summaryFile: process.env.GITHUB_STEP_SUMMARY,
  });
  writeOutput('report-path', result.reportPath);
  console.log(`Generated dependency report at ${result.reportPath}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
