import assert from 'node:assert/strict';
import { test } from 'node:test';
import { syncMajorTags } from '../sync-major-tags.mjs';

const components = {
  'actions/pr-comment': { component: 'pr-comment' },
  'actions/setup-node-pnpm': { component: 'setup-node-pnpm' },
};

function client({ releases = [], refs = {}, versions = {}, tags = {} } = {}) {
  const writes = [];
  const missing = () => Object.assign(new Error('Not found'), { status: 404 });
  const listReleases = () => {};
  const github = {
    paginate: async (method, request) => {
      assert.equal(method, listReleases);
      assert.equal(request.owner, 'example');
      assert.equal(request.repo, 'catalogue');
      return releases;
    },
    rest: {
      repos: {
        listReleases,
        getContent: async ({ path, ref }) => {
          assert.ok(path.endsWith('/package.json'));
          const version = versions[`${path}@${ref}`];
          if (!version) throw missing();
          return { data: {
            type: 'file', encoding: 'base64',
            content: Buffer.from(JSON.stringify({ version: version.trim() })).toString('base64'),
          } };
        },
      },
      git: {
        getRef: async ({ ref }) => {
          if (!refs[ref]) throw missing();
          return { data: { object: refs[ref] } };
        },
        getTag: async ({ tag_sha }) => ({ data: { object: tags[tag_sha] } }),
        createRef: async (request) => {
          writes.push(['create', request]);
          refs[request.ref.replace(/^refs\//, '')] = { type: 'commit', sha: request.sha };
        },
        updateRef: async (request) => {
          writes.push(['update', request]);
          refs[request.ref] = { type: 'commit', sha: request.sha };
        },
      },
    },
  };
  return { github, writes };
}

const release = (tag_name, extra = {}) => ({ tag_name, draft: false, prerelease: false, ...extra });
const commit = (sha) => ({ type: 'commit', sha });
const run = (github, confirmedTags = []) => syncMajorTags({ github, owner: 'example', repo: 'catalogue', components, confirmedTags });

test('creates an alias for a confirmed release before it appears in the releases listing', async () => {
  const { github, writes } = client({
    refs: { 'tags/setup-node-pnpm-v1.0.0': commit('setup-sha') },
    versions: { 'actions/setup-node-pnpm/package.json@setup-sha': '1.0.0' },
  });
  await run(github, ['setup-node-pnpm-v1.0.0']);
  assert.deepEqual(writes, [['create', {
    owner: 'example', repo: 'catalogue', ref: 'refs/tags/setup-node-pnpm-v1', sha: 'setup-sha',
  }]]);
});

test('a confirmed older version cannot displace a newer version visible in the releases listing', async () => {
  const { github, writes } = client({
    releases: [release('pr-comment-v1.2.0')],
    refs: { 'tags/pr-comment-v1.2.0': commit('new'), 'tags/pr-comment-v1.0.0': commit('old') },
    versions: { 'actions/pr-comment/package.json@new': '1.2.0' },
  });
  await run(github, ['pr-comment-v1.0.0']);
  assert.deepEqual(writes, [['create', {
    owner: 'example', repo: 'catalogue', ref: 'refs/tags/pr-comment-v1', sha: 'new',
  }]]);
});

test('confirmed drafts and prereleases cannot create a stable major alias', async () => {
  const { github, writes } = client({
    refs: { 'tags/pr-comment-v2.0.0-rc.1': commit('preview') },
  });
  await run(github, ['pr-comment-v2.0.0-rc.1']);
  assert.deepEqual(writes, []);
});

test('publishes separate aliases using exact tag commits, including annotated tags', async () => {
  const { github, writes } = client({
    releases: [release('pr-comment-v1.2.0'), release('setup-node-pnpm-v2.0.0')],
    refs: {
      'tags/pr-comment-v1.2.0': commit('comment-sha'),
      'tags/setup-node-pnpm-v2.0.0': { type: 'tag', sha: 'annotated' },
    },
    tags: { annotated: commit('setup-sha') },
    versions: {
      'actions/pr-comment/package.json@comment-sha': '1.2.0\n',
      'actions/setup-node-pnpm/package.json@setup-sha': '2.0.0\n',
    },
  });
  await run(github);
  assert.deepEqual(writes, [
    ['create', { owner: 'example', repo: 'catalogue', ref: 'refs/tags/pr-comment-v1', sha: 'comment-sha' }],
    ['create', { owner: 'example', repo: 'catalogue', ref: 'refs/tags/setup-node-pnpm-v2', sha: 'setup-sha' }],
  ]);
});

test('chooses the highest stable version per major, regardless of release order', async () => {
  const { github, writes } = client({
    releases: [
      release('pr-comment-v1.9.0'), release('pr-comment-v2.0.0'), release('pr-comment-v1.10.0'),
      release('pr-comment-v3.0.0', { draft: true }),
      release('pr-comment-v4.0.0', { prerelease: true }),
      release('pr-comment-v5.0.0-rc.1'), release('other-v1.0.0'), release('v1.0.0'),
    ],
    refs: { 'tags/pr-comment-v1.10.0': commit('v1'), 'tags/pr-comment-v2.0.0': commit('v2') },
    versions: { 'actions/pr-comment/package.json@v1': '1.10.0', 'actions/pr-comment/package.json@v2': '2.0.0' },
  });
  await run(github);
  assert.deepEqual(writes.map(([, { ref }]) => ref), ['refs/tags/pr-comment-v1', 'refs/tags/pr-comment-v2']);
});

test('reconciles already published releases on retries and is idempotent', async () => {
  const { github, writes } = client({
    releases: [release('pr-comment-v1.2.0')],
    refs: { 'tags/pr-comment-v1.2.0': commit('new'), 'tags/pr-comment-v1': commit('old') },
    versions: { 'actions/pr-comment/package.json@new': '1.2.0', 'actions/pr-comment/package.json@old': '1.1.0' },
  });
  await run(github);
  await run(github);
  assert.deepEqual(writes, [['update', {
    owner: 'example', repo: 'catalogue', ref: 'tags/pr-comment-v1', sha: 'new', force: true,
  }]]);
});

test('never rolls an alias back if its release is missing from the API results', async () => {
  const { github, writes } = client({
    releases: [release('pr-comment-v1.2.0')],
    refs: { 'tags/pr-comment-v1.2.0': commit('old'), 'tags/pr-comment-v1': commit('new') },
    versions: { 'actions/pr-comment/package.json@old': '1.2.0', 'actions/pr-comment/package.json@new': '1.3.0' },
  });
  await run(github);
  assert.deepEqual(writes, []);
});

test('rejects a release tag whose version does not match its component file', async () => {
  const { github, writes } = client({
    releases: [release('pr-comment-v1.2.0')],
    refs: { 'tags/pr-comment-v1.2.0': commit('wrong') },
    versions: { 'actions/pr-comment/package.json@wrong': '1.1.0' },
  });
  await assert.rejects(run(github), /version mismatch/i);
  assert.deepEqual(writes, []);
});

test('rejects conflicting commits for the same version instead of moving an alias', async () => {
  const { github, writes } = client({
    releases: [release('pr-comment-v1.2.0')],
    refs: { 'tags/pr-comment-v1.2.0': commit('one'), 'tags/pr-comment-v1': commit('two') },
    versions: { 'actions/pr-comment/package.json@one': '1.2.0', 'actions/pr-comment/package.json@two': '1.2.0' },
  });
  await assert.rejects(run(github), /conflicting commits/i);
  assert.deepEqual(writes, []);
});

test('rejects an existing alias pointing to another major', async () => {
  const { github, writes } = client({
    releases: [release('pr-comment-v1.2.0')],
    refs: { 'tags/pr-comment-v1.2.0': commit('one'), 'tags/pr-comment-v1': commit('two') },
    versions: { 'actions/pr-comment/package.json@one': '1.2.0', 'actions/pr-comment/package.json@two': '2.0.0' },
  });
  await assert.rejects(run(github), /major mismatch/i);
  assert.deepEqual(writes, []);
});

test('does not interpret permission failures as missing tags', async () => {
  const { github, writes } = client({ releases: [release('pr-comment-v1.2.0')] });
  github.rest.git.getRef = async () => { throw Object.assign(new Error('Forbidden'), { status: 403 }); };
  await assert.rejects(run(github), /Forbidden/);
  assert.deepEqual(writes, []);
});

test('does nothing before the first release and rejects ambiguous component names', async () => {
  const { github, writes } = client();
  await run(github);
  assert.deepEqual(writes, []);
  await assert.rejects(syncMajorTags({ github, owner: 'example', repo: 'catalogue', components: {
    'actions/one': { component: 'same' }, 'actions/two': { component: 'same' },
  } }), /duplicate/i);
});
