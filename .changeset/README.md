# Changesets

Use `pnpm changeset` at the repository root to describe a change and select the
affected action packages. Choose patch, minor or major for each package.

The `@grasdouble/cicd-*` packages are private version metadata for GitHub Actions.
CI creates a version PR with updated `package.json` files and changelogs. After
merge, it publishes component-prefixed Git tags and GitHub Releases, never npm
packages.

See [versioning and publication](../docs/versioning.md) for the full lifecycle.
