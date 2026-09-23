import { access, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function validateAction(action) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(action.component)
    || action.path !== `actions/${action.component}`
    || action.name !== `@grasdouble/cicd-${action.component}`
    || action.private !== true
    || !versionPattern.test(action.version)) {
    throw new Error(`Invalid private action package: ${action.path}`);
  }
}

export async function readActionPackages(root) {
  const actions = [];
  for (const entry of await readdir(join(root, 'actions'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = `actions/${entry.name}`;
    try {
      await access(join(root, path, 'action.yml'));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    const pkg = JSON.parse(await readFile(join(root, path, 'package.json'), 'utf8'));
    const action = { name: pkg.name, version: pkg.version, private: pkg.private, component: entry.name, path };
    validateAction(action);
    actions.push(action);
  }
  if (!actions.length) throw new Error('No action packages found.');
  return actions.sort((a, b) => a.component.localeCompare(b.component));
}
