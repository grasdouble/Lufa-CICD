import assert from 'node:assert/strict';
import { test } from 'node:test';
import { upsertComment } from '../comment.mjs';

function client(comments = []) {
  const calls = [];
  const listComments = () => {};
  return {
    calls,
    github: {
      rest: {
        issues: {
          listComments,
          updateComment: async (request) => {
            calls.push(['update', request]);
            return { data: { id: request.comment_id } };
          },
          createComment: async (request) => {
            calls.push(['create', request]);
            return { data: { id: 42 } };
          },
        },
      },
      paginate: async (method, request) => {
        assert.equal(method, listComments);
        calls.push(['list', request]);
        return comments;
      },
    },
  };
}

const input = {
  owner: 'example',
  repo: 'consumer',
  issueNumber: 123,
  marker: '<!-- ci-report -->',
  body: 'Checks passed.',
};

test('creates a marked comment on the explicitly selected consumer PR', async () => {
  const { github, calls } = client();
  assert.equal(await upsertComment({ github, ...input }), 42);
  assert.deepEqual(calls, [
    ['list', { owner: 'example', repo: 'consumer', issue_number: 123, per_page: 100 }],
    ['create', {
      owner: 'example', repo: 'consumer', issue_number: 123,
      body: '<!-- ci-report -->\nChecks passed.',
    }],
  ]);
});

test('uses paginated results and only updates the configured author', async () => {
  const comments = Array.from({ length: 100 }, (_, id) => ({ id, body: 'Unrelated comment' }));
  comments[0] = { id: 1, body: input.marker, user: { login: 'contributor' } };
  comments.push({ id: 101, body: `${input.marker}\nOld report`, user: { login: 'github-actions[bot]' } });
  const { github, calls } = client(comments);
  assert.equal(await upsertComment({ github, ...input }), 101);
  assert.deepEqual(calls[1], ['update', {
    owner: 'example', repo: 'consumer', comment_id: 101,
    body: '<!-- ci-report -->\nChecks passed.',
  }]);
});

test('preserves an existing marker and supports a custom bot author', async () => {
  const body = `${input.marker}\nUpdated report`;
  const { github, calls } = client([
    { id: 3, body: input.marker, user: { login: 'release-app[bot]' } },
  ]);
  await upsertComment({ github, ...input, body, author: 'release-app[bot]' });
  assert.equal(calls[1][0], 'update');
  assert.equal(calls[1][1].body, body);
});

test('never updates a human comment that contains the same marker', async () => {
  const { github, calls } = client([
    { id: 3, body: input.marker, user: { login: 'contributor' } },
  ]);
  await upsertComment({ github, ...input });
  assert.equal(calls[1][0], 'create');
});

test('rejects invalid targets and empty content before making API requests', async () => {
  for (const overrides of [
    { issueNumber: 0 }, { issueNumber: 1.5 }, { issueNumber: undefined },
    { marker: '' }, { body: ' ' }, { owner: '' }, { repo: '' }, { author: '' },
  ]) {
    const { github, calls } = client();
    await assert.rejects(upsertComment({ github, ...input, ...overrides }));
    assert.equal(calls.length, 0);
  }
});

test('propagates permission errors rather than claiming the comment was posted', async () => {
  const { github } = client();
  const error = Object.assign(new Error('Resource not accessible by integration'), { status: 403 });
  github.rest.issues.createComment = async () => { throw error; };
  await assert.rejects(upsertComment({ github, ...input }), (actual) => actual === error);
});
