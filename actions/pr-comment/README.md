# pr-comment

Create or update a PR comment using a stable marker. The action searches all
comment pages and updates only a comment belonging to the configured author.
If the supplied body does not contain the marker, the action prepends it.

## Inputs and outputs

| Input | Default | Description |
| --- | --- | --- |
| `github-token` | Required | Token with permission to write comments |
| `comment-marker` | Required | Unique marker identifying this report |
| `comment-body` | Required | Non-empty Markdown report |
| `issue-number` | Current event's PR/issue number | Explicit target for manual or other events |
| `comment-author` | `github-actions[bot]` | Login of the comment author to match |

Output: `comment-id`, the ID of the created or updated comment.

The target repository is always the calling repository. No checkout is needed;
the action loads its implementation from its own downloaded action directory.

## Example

```yaml
jobs:
  report:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: grasdouble/Lufa-CICD/actions/pr-comment@pr-comment-v1
        with:
          github-token: ${{ github.token }}
          comment-marker: '<!-- quality-report -->'
          comment-body: 'All quality checks passed.'
```

Use distinct markers for independent reports. When using a GitHub App or a PAT,
set `comment-author` to the login that creates the comments; otherwise subsequent
runs cannot find those comments by author.

For `workflow_dispatch`, supply `issue-number` explicitly. Invalid targets and
API errors fail the action. Fork and Dependabot PRs may have read-only tokens;
the caller must choose whether to skip comments or use a separate reporting job
with appropriate permissions. Do not execute untrusted PR code in a privileged
`pull_request_target` job just to enable commenting.
