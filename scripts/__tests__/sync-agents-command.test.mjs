import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { URL } from 'node:url';

const root = new URL('../../', import.meta.url);

test('sync:agents downloads the private tool only when explicitly invoked', () => {
  const manifest = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  const lockfile = readFileSync(new URL('pnpm-lock.yaml', root), 'utf8');

  assert.equal(manifest.scripts['sync:agents'], 'pnpm dlx @grasdouble/lufa_config_agents');
  assert.equal(manifest.devDependencies?.['@grasdouble/lufa_config_agents'], undefined);
  assert.doesNotMatch(lockfile, /lufa_config_agents/);
});
