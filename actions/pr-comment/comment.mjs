export async function upsertComment({
  github,
  owner,
  repo,
  issueNumber,
  marker,
  body,
  author = 'github-actions[bot]',
}) {
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
    throw new Error('A positive PR or issue number is required.');
  }
  for (const [name, value] of Object.entries({ owner, repo, marker, body, author })) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`${name} must be a non-empty string.`);
    }
  }

  const content = body.includes(marker) ? body : `${marker}\n${body}`;
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });
  const existing = comments.find(
    (comment) => comment.user?.login === author && comment.body?.includes(marker)
  );

  if (existing) {
    await github.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body: content });
    return existing.id;
  }

  const { data } = await github.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body: content,
  });
  return data.id;
}
