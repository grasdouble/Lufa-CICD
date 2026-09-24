# check-changesets

Find changed pnpm workspace packages between two commits and check whether each
is covered by a Changeset file changed in that commit range. Workspace packages
are discovered with `pnpm -r list --depth -1 --json`, so package definitions
come from pnpm rather than parsing `pnpm-workspace.yaml` lines.

The action does not post comments or fail the workflow when coverage is missing.
It returns a Markdown report and structured outputs so the caller can preserve
its own comment behavior and decide when to fail.

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `base-sha` | Yes | — | Base Git commit SHA used to find changed files. |
| `head-sha` | Yes | — | Head Git commit SHA used to find changed files. |
| `ignore-markdown` | No | `false` | Ignore `.md` and `.adoc` changes when detecting modified packages. |

## Outputs

| Output | Description |
| --- | --- |
| `modified-packages` | JSON array of modified workspace package names. |
| `covered-packages` | JSON array of modified package names covered by changed Changesets. |
| `missing-packages` | JSON array of modified package names without coverage. |
| `modified-count` | Number of modified workspace packages. |
| `missing-count` | Number of packages without Changeset coverage. |
| `passed` | `true` when no modified package is missing Changeset coverage. |
| `comment-body` | Markdown report for the caller to post. |

## Requirements

- Run on a Linux runner with Node.js and pnpm available.
- Check out the caller's repository with both commit SHAs available (for
  example, use `actions/checkout` with `fetch-depth: 0`).
- The workspace root must have a valid `pnpm-workspace.yaml`.
- The caller supplies any permissions needed to publish the report; this action
  itself needs no GitHub token or API permissions.
- If the caller posts the report with `pr-comment`, its job needs
  `pull-requests: write`. The caller sets the job timeout; this action does not
  set permissions or a timeout.

## Example

```yaml
- uses: grasdouble/Lufa-CICD/actions/check-changesets@check-changesets-v1
  id: changesets
  with:
    base-sha: ${{ github.event.pull_request.base.sha }}
    head-sha: ${{ github.event.pull_request.head.sha }}
    ignore-markdown: 'true'

- uses: grasdouble/Lufa-CICD/actions/pr-comment@pr-comment-v1
  with:
    github-token: ${{ github.token }}
    comment-marker: '<!-- changeset-validation-comment -->'
    comment-body: ${{ steps.changesets.outputs.comment-body }}

- if: steps.changesets.outputs.missing-count > 0
  run: exit 1
```

The action identifies package coverage only from Changeset files changed in the
given commit range. Deleted Changeset files do not provide coverage.
