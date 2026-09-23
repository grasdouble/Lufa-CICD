import { readFileAtRef, resolveTag } from './github-files.mjs';

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function compareVersions(left, right) {
  const a = left.split('.').map(BigInt);
  const b = right.split('.').map(BigInt);
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}

export async function syncMajorTags({ github, owner, repo, components, confirmedTags = [] }) {
  const paths = new Map();
  for (const [path, { component }] of Object.entries(components)) {
    if (!/^actions\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(component)) {
      throw new Error(`Invalid action component: ${path}`);
    }
    if (paths.has(component)) throw new Error(`Duplicate component: ${component}`);
    paths.set(component, path);
  }

  const releases = await github.paginate(github.rest.repos.listReleases, { owner, repo, per_page: 100 });
  const latest = new Map();
  for (const release of [...releases, ...confirmedTags.map((tag_name) => ({ tag_name, draft: false, prerelease: false }))]) {
    if (release.draft || release.prerelease) continue;
    for (const [component, path] of paths) {
      const prefix = `${component}-v`;
      if (!release.tag_name.startsWith(prefix)) continue;
      const version = release.tag_name.slice(prefix.length);
      if (!stableVersion.test(version)) continue;
      const alias = `${prefix}${version.split('.')[0]}`;
      const previous = latest.get(alias);
      if (!previous || compareVersions(version, previous.version) > 0) {
        latest.set(alias, { path, version, tag: release.tag_name });
      }
    }
  }

  async function readVersion(path, sha) {
    const { version } = JSON.parse(await readFileAtRef({ github, owner, repo, path: `${path}/package.json`, ref: sha }));
    if (!stableVersion.test(version)) throw new Error(`Invalid stable version: ${path}@${sha}`);
    return version;
  }

  // Validate every target before writing. Never modify exact version tags.
  const updates = [];
  for (const [alias, { path, version, tag }] of latest) {
    const sha = await resolveTag({ github, owner, repo, tag });
    if (await readVersion(path, sha) !== version) throw new Error(`Release version mismatch: ${tag}`);
    const currentSha = await resolveTag({ github, owner, repo, tag: alias, optional: true });
    if (sha === currentSha) continue;
    if (currentSha) {
      const currentVersion = await readVersion(path, currentSha);
      if (currentVersion.split('.')[0] !== version.split('.')[0]) throw new Error(`Alias major mismatch: ${alias}`);
      const comparison = compareVersions(currentVersion, version);
      if (comparison > 0) continue;
      if (comparison === 0) throw new Error(`Conflicting commits for ${alias} version ${version}`);
    }
    updates.push({ alias, sha, create: currentSha === null });
  }
  for (const { alias, sha, create } of updates) {
    if (create) {
      await github.rest.git.createRef({ owner, repo, ref: `refs/tags/${alias}`, sha });
    } else {
      await github.rest.git.updateRef({ owner, repo, ref: `tags/${alias}`, sha, force: true });
    }
  }
  return updates;
}
