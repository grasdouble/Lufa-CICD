import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const actionsDirectory = new URL('../../actions/', import.meta.url);

test('composite actions leave dependency installation and package builds to callers', () => {
  for (const directory of readdirSync(actionsDirectory)) {
    const actionFile = new URL(`../../actions/${directory}/action.yml`, import.meta.url);
    let content;
    try {
      content = readFileSync(actionFile, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    assert.doesNotMatch(content, /pnpm install\b/, `${directory} must not install project dependencies`);
    assert.doesNotMatch(
      content,
      /pnpm all:build|pnpm run "\$BUILD_SCRIPT"|build-command:|build-script:/,
      `${directory} must not build packages`,
    );
  }

  const qualityAction = readFileSync(new URL('../../actions/check-quality/action.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(qualityAction, /install-command|install-succeeded|build-command/);
});
