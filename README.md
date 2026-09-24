# Lufa-CICD

Shared GitHub Actions catalogue for `grasdouble` projects. CI/CD
logic is maintained here; each project keeps a small workflow that defines its
triggers and calls the catalogue.

## Catalogue

| Action | Major alias | Purpose |
| --- | --- | --- |
| [`lint-workflows`](actions/lint-workflows/README.md) | `lint-workflows-v1` | Validate workflows with actionlint |
| [`setup-node-pnpm`](actions/setup-node-pnpm/README.md) | `setup-node-pnpm-v1` | Set up Node.js, pnpm, caching and registry authentication |
| [`pr-comment`](actions/pr-comment/README.md) | `pr-comment-v1` | Create or update an author-scoped, marked PR comment |
| [`check-changesets`](actions/check-changesets/README.md) | `check-changesets-v1` | Check changed workspace packages for Changeset coverage |
| [`dependabot-changeset`](actions/dependabot-changeset/README.md) | `dependabot-changeset-v1` | Generate and push one stable Changeset per Dependabot PR |
| [`ftp-deploy`](actions/ftp-deploy/README.md) | `ftp-deploy-v1` | Deploy a prepared directory over FTP or FTPS |
| [`changesets-release`](actions/changesets-release/README.md) | `changesets-release-v1` | Build and release pnpm packages with Changesets |

All components are **composite actions**, called from `jobs.<job>.steps`.
The calling project controls its triggers, checkout, runner, matrix, permissions,
environment, timeout and concurrency. Each action is versioned independently.

## Quick start

Once `setup-node-pnpm-v1` is published, create `.github/workflows/ci.yml` in a
pnpm project with a `packageManager` field and `.tool-versions` file:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read
  packages: read

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: grasdouble/Lufa-CICD/actions/setup-node-pnpm@setup-node-pnpm-v1
        with:
          github-token: ${{ github.token }}
      - run: pnpm install --frozen-lockfile
      - run: pnpm all:build
      - run: pnpm all:lint
```

The scripts must exist in the project's `package.json`. Commit `pnpm-lock.yaml`
and grant the caller access to any GitHub Packages dependencies.

To share the full release pipeline, use
[`changesets-release`](actions/changesets-release/README.md).

To add workflow validation to an existing job:

```yaml
jobs:
  workflows:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          persist-credentials: false
      - uses: grasdouble/Lufa-CICD/actions/lint-workflows@lint-workflows-v1
```

Each major alias is created automatically after its first
[release](docs/versioning.md). For a fixed version, use a tag such as
`pr-comment-v1.2.3` or a full commit SHA. Before first publication, individual
actions can be tested at a pushed SHA; nested action dependencies must also be
available at the refs they declare.

## Repository structure

```text
.github/
  dependabot.yml             # Third-party action updates
  workflows/
    ci.yml                   # Validation and per-action releases
actions/
  lint-workflows/            # Workflow validation
  setup-node-pnpm/           # Node.js/pnpm and registry setup
  pr-comment/                # Marked PR comments and behavior tests
  check-changesets/          # Changeset coverage validation for workspace packages
  dependabot-changeset/      # Idempotent Dependabot Changesets and branch pushes
  ftp-deploy/                # FTP/FTPS deployment
  changesets-release/        # pnpm package release steps
docs/
  versioning.md              # Releases and compatibility
scripts/
  action-packages.mjs        # Discover private action workspace packages
  publish-actions.mjs        # Exact Git tags and GitHub Releases
  sync-major-tags.mjs        # Stable per-action major aliases
.changeset/                  # Versioning configuration and release notes
pnpm-workspace.yaml          # One private package per action
```

Each action directory contains its `action.yml`, README and private `package.json`.
Changesets updates its version and creates an adjacent `CHANGELOG.md` when the
version PR is prepared. These packages are never published to npm.

## Access from consuming projects

- If the catalogue is public, repositories allowed to use GitHub Actions can
  call it.
- If it is private, configure **Settings → Actions → General → Access** for
  eligible repositories under the same owner or organization. A public consumer
  repository cannot call a private catalogue.
- The project's or organization's Actions policies must allow this catalogue
  and the third-party actions it uses.
- Grant the calling job the permissions documented by each action. Pass secrets
  explicitly through action inputs; actions cannot grant job permissions.

A local reference such as `uses: ./actions/my-action` points to the caller's
checkout. Use a versioned remote reference to consume the catalogue, and
`github.action_path` inside an action to load its bundled scripts.

## Maintenance

- [Add or update a component](CONTRIBUTING.md)
- [Publish a release and update consuming projects](docs/versioning.md)

Use `pnpm changeset` to choose which action versions to bump and describe the
changes. CI validates its workflow, runs action and release-automation tests, and
smoke-tests the local Node.js/pnpm action. After validation on `main`, it publishes
merged action versions and updates their major aliases, then uses Changesets to
prepare the next version PR. Dependabot proposes weekly action updates. Changesets
Action major updates require a coordinated CLI compatibility review.
