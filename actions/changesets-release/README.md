# changesets-release

Reuse Changesets release steps across pnpm repositories: Node.js/pnpm setup,
frozen dependency installation, build, then version PR creation or package
publication. The caller provides checkout and the job configuration.

## Prerequisites

- A root `package.json` with a pnpm `packageManager` version and Changesets CLI v3.
- A checked-out repository on the intended release branch and a Linux runner
  with Bash available, such as `ubuntu-latest`.
- A committed pnpm lockfile and Node.js version file.
- A `.changeset/config.json` and package-level publication settings maintained
  by the calling repository.
- The permissions and secrets listed below.

The action pins Changesets Action v2, which supports CLI v3. Review future
major upgrades together. Private-package versioning and tagging follow the
calling repository's Changesets configuration.

## Inputs

Action inputs are strings. The two credential inputs are required; other inputs
have defaults. `create-github-releases` accepts only `'true'` or `'false'`.

| Input | Default | Description |
| --- | --- | --- |
| `node-version-file` | `.tool-versions` | Node.js version file in the caller |
| `build-script` | `all:build` | Root pnpm script name; empty disables the build |
| `version-command` | `pnpm changeset version` | Command passed to Changesets for versioning |
| `publish-command` | `pnpm changeset publish` | Command passed to Changesets for publishing |
| `registry-url` | `https://npm.pkg.github.com` | Package registry |
| `scope` | `@grasdouble` | Registry scope |
| `pr-title` | `Release: New Version Updates` | Release PR title |
| `commit-message` | `Release new versions` | Version commit message |
| `create-github-releases` | `'true'` | Whether to create GitHub releases |
| `registry-token` | Required | Credential to install and publish packages |
| `release-token` | Required | Credential for Changesets repository operations |

`build-script` is a script name, not a shell command. The two command inputs are
executed by Changesets and should be literal commands chosen by the caller,
not values derived from PR titles, branch names or other untrusted event data.

## Secrets and permissions

Pass both credentials explicitly through `with`, using the caller's secrets:

- `registry-token`: authenticates dependency installation and package publication.
- `release-token`: authenticates Changesets PR, commit, tag and release operations.

They may use the same credential, as in the existing Grasdouble release jobs,
but are separate inputs so callers can configure different access scopes.
Whether the built-in token can replace either credential depends on package
access, repository rules and the need to trigger follow-up workflows.

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
      - uses: grasdouble/Lufa-CICD/actions/changesets-release@changesets-release-v1
        id: release
        with:
          registry-token: ${{ secrets.LUFA_CI_SECRET_WRITE }}
          release-token: ${{ secrets.LUFA_CI_SECRET_WRITE }}
```

Read outputs through `steps.release.outputs.published` and the other output
names above. Triggers and concurrency belong to the caller. Invoke this action
only from trusted release contexts.

## Catalogue dependency

This action calls `grasdouble/Lufa-CICD/actions/setup-node-pnpm@setup-node-pnpm-v1`.
Publish that dependency before using the release action. Adopting a new dependency
major requires a reviewed update and a release of this action.

Pinning this action to a SHA fixes its own contents, but its internal major alias
still follows compatible updates. Fully immutable dependency chains require
pinning the internal reference to a published SHA too.
