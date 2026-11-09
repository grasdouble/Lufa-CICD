# check-changesets

Check whether changes to packages are covered by a Changeset file in the
specified commit range. Select `workspace` for pnpm monorepos, where changed
files are attributed to their deepest matching non-root workspace package; the
root workspace package and files outside child workspaces are ignored. Select
`simple` for a single root package, where any non-ignored project file change
modifies that package. Workspace packages are discovered with
`pnpm -r list --depth -1 --json`.

The action does not post comments or fail the workflow when coverage is missing.
It returns a Markdown report and structured outputs so the caller can preserve
its own comment behavior and decide when to fail.

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `base-sha` | Yes | — | Base Git commit SHA used to find changed files. |
| `mode` | No | `workspace` | `workspace` for pnpm monorepos or `simple` for a single root package. |
| `head-sha` | Yes | — | Head Git commit SHA used to find changed files. |
| `ignore-markdown` | No | `false` | Ignore `.md` and `.adoc` changes when detecting modified packages. |
| `ignore-patterns` | No | — | Newline-separated glob patterns for changed paths to ignore (for example, `packages/*/test/**`). Patterns use `/` separators; `*` matches within one path segment and `**` matches across segments. |

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
  `workspace` mode requires a valid pnpm workspace. `simple` mode requires a
  root `package.json` with a package name and does not require workspace metadata.
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
Ignored paths do not mark a package as modified. A package still requires
Changeset coverage when any other non-ignored file in that package changes.
An empty Changeset (valid YAML frontmatter with no package entries) explicitly
indicates that no package bump is needed and covers all modified packages in
the checked commit range. Changesets naming packages cover only those packages.
