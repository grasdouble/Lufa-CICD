import { Buffer } from 'node:buffer';

export async function optionalResource(request) {
  try {
    return (await request()).data;
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

export async function readFileAtRef({ github, owner, repo, path, ref }) {
  const { data } = await github.rest.repos.getContent({ owner, repo, path, ref });
  if (data.type !== 'file' || data.encoding !== 'base64') throw new Error(`Invalid file: ${path}@${ref}`);
  return Buffer.from(data.content, 'base64').toString('utf8');
}

export async function resolveTag({ github, owner, repo, tag, optional = false }) {
  const data = await optionalResource(() => github.rest.git.getRef({ owner, repo, ref: `tags/${tag}` }));
  if (!data) {
    if (optional) return null;
    throw new Error(`Missing tag: ${tag}`);
  }
  let { object } = data;
  const seen = new Set();
  while (object.type === 'tag') {
    if (seen.has(object.sha) || seen.size >= 10) throw new Error(`Invalid annotated tag chain: ${tag}`);
    seen.add(object.sha);
    ({ data: { object } } = await github.rest.git.getTag({ owner, repo, tag_sha: object.sha }));
  }
  if (object.type !== 'commit') throw new Error(`Tag does not reference a commit: ${tag}`);
  return object.sha;
}
