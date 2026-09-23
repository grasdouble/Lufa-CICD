import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publishActions } from '../publish-actions.mjs';

const action = {
  path: 'actions/pr-comment', component: 'pr-comment',
  name: '@grasdouble/cicd-pr-comment', version: '1.2.0', private: true,
};
const missing = () => Object.assign(new Error('Not found'), { status: 404 });
const manifest = (version = '1.2.0') => JSON.stringify({ name: action.name, private: true, version });
const notes = '# Action\n\n## 1.2.0\n\n### Patch Changes\n\n- fix: handle pagination.\n\n## 1.1.0\n\nOld notes.\n';

function client({ refs = {}, releases = {}, files = {}, tags = {} } = {}) {
  const writes = [];
  const github = { rest: {
    git: {
      getRef: async ({ ref }) => {
        if (!refs[ref]) throw missing();
        return { data: { object: refs[ref] } };
      },
      getTag: async ({ tag_sha }) => ({ data: { object: tags[tag_sha] } }),
      createRef: async (request) => {
        writes.push(['tag', request]);
        refs[request.ref.replace(/^refs\//, '')] = { type: 'commit', sha: request.sha };
      },
    },
    repos: {
      getContent: async ({ path, ref }) => {
        const content = files[`${path}@${ref}`];
        if (content === undefined) throw missing();
        return { data: { type: 'file', encoding: 'base64', content: Buffer.from(content).toString('base64') } };
      },
      getReleaseByTag: async ({ tag }) => {
        if (!releases[tag]) throw missing();
        return { data: releases[tag] };
      },
      createRelease: async (request) => {
        writes.push(['release', request]);
        releases[request.tag_name] = request;
      },
    },
  } };
  return { github, writes, refs, releases };
}

const filesAt = (sha, version = '1.2.0', changelog = notes) => ({
  [`${action.path}/package.json@${sha}`]: manifest(version),
  [`${action.path}/CHANGELOG.md@${sha}`]: changelog,
});
const run = (github, actions = [action], sha = 'validated-main') =>
  publishActions({ github, owner: 'example', repo: 'catalogue', sha, actions });

test('publishes a component-prefixed tag at the validated SHA and only its release notes', async () => {
  const { github, writes } = client({ files: filesAt('validated-main') });
  await run(github);
  assert.deepEqual(writes, [
    ['tag', { owner: 'example', repo: 'catalogue', ref: 'refs/tags/pr-comment-v1.2.0', sha: 'validated-main' }],
    ['release', {
      owner: 'example', repo: 'catalogue', tag_name: 'pr-comment-v1.2.0', name: 'pr-comment-v1.2.0',
      target_commitish: 'validated-main', body: '### Patch Changes\n\n- fix: handle pagination.',
      draft: false, prerelease: false, make_latest: 'false',
    }],
  ]);
});

test('reruns after main advances do not move exact tags or duplicate releases', async () => {
  const { github, writes } = client({ files: filesAt('validated-main') });
  await run(github);
  await run(github, [action], 'newer-main');
  assert.equal(writes.length, 2);
});

test('returns all confirmed exact release tags even when every release already exists', async () => {
  const { github } = client({
    refs: { 'tags/pr-comment-v1.2.0': { type: 'commit', sha: 'original' } },
    releases: { 'pr-comment-v1.2.0': { draft: false, prerelease: false } },
    files: filesAt('original'),
  });
  const result = await run(github, [action], 'newer-main');
  assert.deepEqual(result.confirmedTags, ['pr-comment-v1.2.0']);
  assert.deepEqual(result.published, []);
});

test('recovers from a release API failure using the existing exact tag, not the new HEAD', async () => {
  const { github, writes } = client({
    refs: { 'tags/pr-comment-v1.2.0': { type: 'tag', sha: 'annotated' } },
    tags: { annotated: { type: 'commit', sha: 'original' } },
    files: filesAt('original'),
  });
  await run(github, [action], 'newer-main');
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], 'release');
  assert.equal(writes[0][1].target_commitish, 'original');
});

test('unreleased bootstrap packages are not published before Changesets versions them', async () => {
  const { github, writes } = client();
  await run(github, [{ ...action, version: '0.0.0' }]);
  assert.deepEqual(writes, []);
});

test('requires a changelog entry for the version before creating any tag', async () => {
  const { github, writes } = client({ files: filesAt('validated-main', '1.2.0', '## 1.1.0\nOld notes') });
  await assert.rejects(run(github), /changelog/i);
  assert.deepEqual(writes, []);
});

test('rejects an existing tag with mismatched package metadata', async () => {
  const { github, writes } = client({
    refs: { 'tags/pr-comment-v1.2.0': { type: 'commit', sha: 'wrong' } },
    files: filesAt('wrong', '1.1.0'),
  });
  await assert.rejects(run(github), /metadata mismatch/i);
  assert.deepEqual(writes, []);
});

test('marks prereleases without treating them as stable releases', async () => {
  const version = '2.0.0-next.0';
  const { github, writes } = client({ files: filesAt('validated-main', version, `## ${version}\n\nPreview.`) });
  await run(github, [{ ...action, version }]);
  assert.equal(writes[1][1].prerelease, true);
  assert.equal(writes[1][1].tag_name, 'pr-comment-v2.0.0-next.0');
});

test('never treats permission errors as a missing release', async () => {
  const { github, writes } = client({ files: filesAt('validated-main') });
  github.rest.repos.getReleaseByTag = async () => { throw Object.assign(new Error('Forbidden'), { status: 403 }); };
  await assert.rejects(run(github), /Forbidden/);
  assert.deepEqual(writes, []);
});

test('does not recreate a deleted exact tag for an existing release at a different HEAD', async () => {
  const { github, writes } = client({
    releases: { 'pr-comment-v1.2.0': { draft: false, prerelease: false } },
    files: filesAt('validated-main'),
  });
  await assert.rejects(run(github), /missing exact tag/i);
  assert.deepEqual(writes, []);
});
