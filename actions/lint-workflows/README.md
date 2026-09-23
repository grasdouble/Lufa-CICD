# lint-workflows

Validates the calling repository's `.github/workflows/*.yml` and `*.yaml` files
with [actionlint](https://github.com/rhysd/actionlint): workflow syntax,
expressions, contexts and input references for known actions.
The official image includes ShellCheck and pyflakes for embedded scripts.

## Prerequisites

- A Linux runner with Docker, such as `ubuntu-latest`.
- The repository must be checked out with `actions/checkout` before this action.
- At least one workflow in `.github/workflows/`.
- `contents: read` permission for checkout; no additional secrets.

## Example

```yaml
name: Validate workflows

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          persist-credentials: false
      - uses: grasdouble/Lufa-CICD/actions/lint-workflows@lint-workflows-v1
```

## Contract

The action exposes no inputs or outputs and fails if actionlint detects an error.
It uses the calling repository's `.github/actionlint.yaml` configuration if
present. It does not validate `action.yml` metadata as workflows.

Before the first release, replace `@lint-workflows-v1` with a pushed catalogue commit SHA.
