# dependency-report

Run `pnpm outdated -r`, append the result to the GitHub Actions job summary, and
upload the Markdown report as an artifact. The caller installs dependencies and
sets up registry authentication before invoking the action. The action does not
change repository files, create commits, or open pull requests.

## Outputs

| Output | Description |
| --- | --- |
| `report-path` | Runner-local path to the generated Markdown report. |
| `artifact-url` | Authenticated URL for the uploaded report artifact. |

The artifact is named `outdated-dependencies-report` and is retained for 30
days. If `pnpm outdated -r` reports outdated packages with exit code 1, its
output is still included. Other command failures fail the action rather than
publishing an empty report.

## Requirements

- Linux runner with Node.js, pnpm, and repository dependencies already set up.
- Caller job grants `packages: read` and configures registry authentication when
  the frozen install downloads private GitHub Packages dependencies.
- The caller owns checkout, triggers, schedule, job timeout, and permissions.

## Example

```yaml
name: Weekly dependency report

on:
  schedule:
    - cron: '0 0 * * 1'
  workflow_dispatch:

permissions:
  contents: read
  packages: read

jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: grasdouble/Lufa-CICD/actions/setup-node-pnpm@setup-node-pnpm-v1
        with:
          github-token: ${{ github.token }}
      - uses: grasdouble/Lufa-CICD/actions/dependency-report@dependency-report-v1
        id: report
```
