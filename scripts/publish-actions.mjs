import { validateAction } from './action-packages.mjs';
import { optionalResource, readFileAtRef, resolveTag } from './github-files.mjs';

function changelogEntry(changelog, version) {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);
  if (start === -1) throw new Error(`Missing changelog entry for ${version}`);
  const next = lines.findIndex((line, index) => index > start && /^## /.test(line));
  const body = lines.slice(start + 1, next === -1 ? undefined : next).join('\n').trim();
  if (!body) throw new Error(`Empty changelog entry for ${version}`);
  return body;
}

// Called only by trusted main CI, before Changesets modifies the checkout.
export async function publishActions({ github, owner, repo, sha, actions }) {
  if (!sha) throw new Error('A validated commit SHA is required.');
  const planned = [];
  for (const action of actions) {
    validateAction(action);
    if (action.version === '0.0.0') continue;
    const tag = `${action.component}-v${action.version}`;
    const existingSha = await resolveTag({ github, owner, repo, tag, optional: true });
    const existingRelease = await optionalResource(() => github.rest.repos.getReleaseByTag({ owner, repo, tag }));
    if (existingRelease && !existingSha) throw new Error(`Published release has a missing exact tag: ${tag}`);
    const target = existingSha ?? sha;
    const pkg = JSON.parse(await readFileAtRef({ github, owner, repo, path: `${action.path}/package.json`, ref: target }));
    if (pkg.name !== action.name || pkg.version !== action.version || pkg.private !== true) {
      throw new Error(`Action metadata mismatch at ${tag}`);
    }
    const prerelease = action.version.includes('-');
    if (existingRelease) {
      if (existingRelease.draft || existingRelease.prerelease !== prerelease) {
        throw new Error(`Unexpected draft or prerelease state for ${tag}`);
      }
      continue;
    }
    const changelog = await readFileAtRef({ github, owner, repo, path: `${action.path}/CHANGELOG.md`, ref: target });
    planned.push({ tag, target, prerelease, body: changelogEntry(changelog, action.version), createTag: !existingSha });
  }

  // Complete validation first. On retry, reuse tags already created at their original SHA.
  for (const { tag, target, prerelease, body, createTag } of planned) {
    if (createTag) await github.rest.git.createRef({ owner, repo, ref: `refs/tags/${tag}`, sha: target });
    await github.rest.repos.createRelease({
      owner, repo, tag_name: tag, name: tag, target_commitish: target, body,
      draft: false, prerelease, make_latest: 'false',
    });
  }
  return planned.map(({ tag }) => tag);
}
