# setup-node-pnpm

Set up Node.js, pnpm, a pnpm store cache and package registry authentication.
Checkout and dependency installation are separate steps so callers can run
their own checks before installing packages.

## Prerequisites

- Check out the calling repository before invoking the action.
- Declare a pnpm version in the root `package.json` `packageManager` field.
- Commit the Node.js version file and pnpm lockfile.
- Use a runner supported by the pinned upstream actions, with Bash available.
  The catalogue's smoke test runs on `ubuntu-latest`.

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `node-version-file` | `.tool-versions` | Node.js version file, relative to the repository root |
| `github-token` | Required | Registry token for package downloads or publication |
| `registry-url` | `https://npm.pkg.github.com` | Registry URL |
| `scope` | `@grasdouble` | Package scope associated with the registry |
| `cache-dependency-path` | `pnpm-lock.yaml` | Lockfile paths used to key the pnpm store cache |

## Outputs and environment

- `node-version`: installed Node.js version.
- `cache-hit`: whether the pnpm store cache was an exact match.
- `NPM_CONFIG_USERCONFIG`: temporary registry configuration created by setup-node.
- `NODE_AUTH_TOKEN`: masked token exported for subsequent steps in the job.

The temporary registry configuration references `${NODE_AUTH_TOKEN}` instead of
embedding the credential. The action does not overwrite the caller's `~/.npmrc`.
Do not upload the runner's environment files as artifacts.

## Example

```yaml
jobs:
  checks:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: read
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: grasdouble/Lufa-CICD/actions/setup-node-pnpm@setup-node-pnpm-v1
        with:
          github-token: ${{ github.token }}
      - run: pnpm install --frozen-lockfile
      - run: pnpm all:build
```

For GitHub Packages downloads, grant `packages: read` and ensure the calling
repository has access to the packages. Check package visibility before granting
a public repository access. Publication requires an appropriate write credential;
permissions for repository writes and workflow triggering must be evaluated
separately.
