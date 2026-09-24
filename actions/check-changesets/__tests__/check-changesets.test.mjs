import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildComment, checkChangesets, parseChangesetPackages, readWorkspaces } from '../check-changesets.mjs';

const workspace = (name, path) => ({ name, path });

test('maps changes to the deepest matching workspace package, including private packages', () => {
  const result = checkChangesets({
    workspaces: [
      workspace('@example/root', '.'),
      workspace('@example/parent', 'packages/design-system'),
      workspace('@example/child', 'packages/design-system/main'),
      workspace('@example/app', 'apps/web'),
    ],
    changedFiles: [
      'packages/design-system/main/src/Button.tsx',
      'packages/design-system/package.json',
      'apps/web/package.json',
      'README.md',
    ],
    changesetFiles: [],
  });
  assert.deepEqual(result.modifiedPackages, ['@example/app', '@example/child', '@example/parent']);
  assert.deepEqual(result.missingPackages, result.modifiedPackages);
});

test('parses quoted Changesets package names and ignores frontmatter metadata', () => {
  const content = `---\n"@example/one": minor\n'@example/two': patch\n"@example/three": major # breaking change\n---\n\nRelease notes\n`;
  assert.deepEqual([...parseChangesetPackages(content)].sort(), ['@example/one', '@example/three', '@example/two']);
});

test('only changed Changeset files provide coverage; deleted files do not', () => {
  const workspaces = [workspace('@example/pkg', 'packages/pkg')];
  const result = checkChangesets({
    workspaces,
    changedFiles: ['packages/pkg/src/index.ts'],
    changesetFiles: [
      { path: '.changeset/added.md', content: '---\n"@example/pkg": patch\n---\n\nfix: add a feature.\n' },
      { path: '.changeset/removed.md', content: null },
      { path: '.changeset/README.md', content: 'Documentation only.' },
    ],
  });
  assert.deepEqual(result.missingPackages, []);
  const uncovered = checkChangesets({
    workspaces,
    changedFiles: ['packages/pkg/src/index.ts'],
    changesetFiles: [],
  });
  assert.deepEqual(uncovered.missingPackages, ['@example/pkg']);
});

test('optionally ignores Markdown and AsciiDoc files, but still checks manifests', () => {
  const args = {
    workspaces: [workspace('@example/pkg', 'packages/pkg')],
    changedFiles: ['packages/pkg/README.md', 'packages/pkg/docs/guide.adoc'],
    changesetFiles: [],
  };
  assert.deepEqual(checkChangesets(args).missingPackages, ['@example/pkg']);
  assert.deepEqual(checkChangesets({ ...args, ignoreMarkdown: true }).modifiedPackages, []);
  assert.deepEqual(checkChangesets({
    ...args, ignoreMarkdown: true, changedFiles: ['packages/pkg/package.json'],
  }).missingPackages, ['@example/pkg']);
});

test('ignores files outside workspace packages and deduplicates packages', () => {
  const result = checkChangesets({
    workspaces: [workspace('@example/pkg', 'packages/pkg')],
    changedFiles: ['.github/workflows/ci.yml', 'package.json', 'packages/pkg/a.js', 'packages/pkg/b.js'],
    changesetFiles: [],
  });
  assert.deepEqual(result.modifiedPackages, ['@example/pkg']);
  assert.deepEqual(result.missingPackages, ['@example/pkg']);
});

test('returns a valid success result when no package source files changed', () => {
  assert.deepEqual(checkChangesets({
    workspaces: [workspace('@example/pkg', 'packages/pkg')],
    changedFiles: ['README.md', '.github/workflows/ci.yml'],
    changesetFiles: [],
    ignoreMarkdown: true,
  }), { modifiedPackages: [], coveredPackages: [], missingPackages: [], passed: true });
});

test('builds a no-changeset-needed comment when no workspace package changed', () => {
  assert.equal(buildComment({ modifiedPackages: [], missingPackages: [] }), [
    '<!-- changeset-validation-comment -->',
    '## ✅ No Changeset Needed',
    '',
    'No packages were modified in this PR. No changeset is required.',
  ].join('\n'));
});

test('builds a failure comment without terminal formatting codes', () => {
  const comment = buildComment({
    modifiedPackages: ['@example/covered', '@example/missing'],
    missingPackages: ['@example/missing'],
  });

  assert.equal(comment, [
    '<!-- changeset-validation-comment -->',
    '## ⚠️ Changeset Validation Failed',
    '',
    'The following packages have been modified but are **not included in any changeset**:',
    '',
    '- `@example/missing`',
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
    '- ✅ `@example/covered`',
    '- ❌ `@example/missing`',
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
  ].join('\n'));
  assert.doesNotMatch(comment, /\u001b\[[0-9;]*m/);
});

test('builds a success comment listing all modified workspace packages', () => {
  const comment = buildComment({
    modifiedPackages: ['@example/one', '@example/two'],
    missingPackages: [],
  });

  assert.equal(comment, [
    '<!-- changeset-validation-comment -->',
    '## ✅ Changeset Validation Passed',
    '',
    'All modified packages are included in changesets. Great job!',
    '',
    '### Modified packages:',
    '',
    '- ✅ `@example/one`',
    '- ✅ `@example/two`',
  ].join('\n'));
});

test('discovers workspace packages with pnpm without treating other YAML lists as packages', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'check-changesets-'));
  try {
    mkdirSync(join(cwd, 'packages', 'real-package'), { recursive: true });
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: '@example/root', private: true }));
    writeFileSync(join(cwd, 'packages', 'real-package', 'package.json'), JSON.stringify({
      name: '@example/real-package',
      version: '1.0.0',
    }));
    writeFileSync(join(cwd, 'pnpm-workspace.yaml'), [
      'packages:',
      '  - packages/*',
      'minimumReleaseAgeExclude:',
      "  - '@example/*'",
      'publicHoistPattern:',
      "  - '@example/tool'",
      '',
    ].join('\n'));

    assert.deepEqual(readWorkspaces(cwd).filter(({ path }) => path !== '.'), [
      { name: '@example/real-package', path: 'packages/real-package' },
    ]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
