# changesets-release

Reuse Changesets version and publish steps after the caller has set up pnpm,
installed dependencies, and built packages. The action creates a version PR or
publishes packages. The caller provides checkout and all job configuration.

## Prerequisites

- A root `package.json` with a pnpm `packageManager` version and Changesets CLI v3.
- A checked-out repository on the intended release branch and a Linux runner
  with Bash available, such as `ubuntu-latest`.
- Node.js and pnpm set up, dependencies installed with registry authentication,
  a committed pnpm lockfile and Node.js version file.
- A `.changeset/config.json` and package-level publication settings maintained
  by the calling repository.
- The permissions and secrets listed below.

The action pins Changesets Action v2, which supports CLI v3. Review future
major upgrades together. Private-package versioning and tagging follow the
calling repository's Changesets configuration.

## Inputs

Action inputs are strings. `release-token` is required; other inputs have
defaults. `create-github-releases` accepts only `'true'` or `'false'`.

| Input | Default | Description |
| --- | --- | --- |
| `version-command` | `pnpm changeset version` | Command passed to Changesets for versioning |
| `publish-command` | `pnpm changeset publish` | Command passed to Changesets for publishing |
| `pr-title` | `Release: New Version Updates` | Release PR title |
| `commit-message` | `Release new versions` | Version commit message |
| `create-github-releases` | `'true'` | Whether to create GitHub releases |
| `release-token` | Required | Credential for Changesets repository operations |

The version and publish command inputs are executed by Changesets and should be
literal commands chosen by the caller, not values derived from PR titles, branch
names or other untrusted event data.

## Secrets and permissions

Pass the release credential explicitly through `with`. The calling workflow
sets up the registry before invoking this action:

- `release-token`: authenticates Changesets PR, commit, tag and release operations.

The same credential can be passed to `setup-node-pnpm` for package installation
and `release-token` for Changesets repository operations, or callers can use
separate credentials.

For the existing Grasdouble release configuration, the calling job grants `contents: write`, `packages: write`,
`pull-requests: write`, `issues: read`, `checks: read` and `statuses: read`.
The example checks out with the built-in token and credential persistence disabled.
The action reads no secrets from the catalogue repository and cannot set job
permissions, environments or timeouts.

## Outputs

| Output | Description |
| --- | --- |
| `published` | String `true` or `false`, indicating whether packages were published |
| `published-packages` | JSON array of published package names and versions |
| `has-changesets` | String indicating whether pending Changesets exist |
| `pr-number` | Release PR number, when created or updated |

## Calling workflow

```yaml
name: Release

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions: {}

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

jobs:
  release:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions:
      contents: write
      packages: write
      pull-requests: write
      issues: read
      checks: read
      statuses: read
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: grasdouble/Lufa-CICD/actions/setup-node-pnpm@setup-node-pnpm-v1
        with:
          github-token: ${{ secrets.LUFA_CI_SECRET_WRITE }}
      - run: pnpm install --frozen-lockfile
      - run: pnpm all:build
      - uses: grasdouble/Lufa-CICD/actions/changesets-release@changesets-release-v2
        id: release
        with:
          release-token: ${{ secrets.LUFA_CI_SECRET_WRITE }}
```

Read outputs through `steps.release.outputs.published` and the other output
names above. Triggers and concurrency belong to the caller. Invoke this action
only from trusted release contexts.

## Calling workflow setup

This action runs in the environment prepared by the caller. Call
`setup-node-pnpm` and install dependencies before invoking it. The action does
not install packages or configure Node.js/pnpm itself.

Pinning this action to a SHA fixes its own contents, but its internal major alias
still follows compatible updates. Fully immutable dependency chains require
pinning the internal reference to a published SHA too.
