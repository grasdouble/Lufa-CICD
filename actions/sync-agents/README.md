# sync-agents

Keep the generated shared-rules block in the caller's root `AGENTS.md` aligned
with `packages/config/agents/AGENTS.shared.md` in the public
[`Lufa-Core`](https://github.com/grasdouble/Lufa-Core) repository. The action
does not download the internal npm package.

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `mode` | No | `check` | `check` fails if `AGENTS.md` is stale; `sync` updates the existing branch. |
| `head-branch` | Required in `sync` mode | — | Existing caller branch to push the update to. |
| `github-token` | Required in `sync` mode | — | Token with permission to push to the caller branch. |

## Outputs

| Output | Description |
| --- | --- |
| `changed` | `true` when the generated shared block differs from the caller's file. |
| `commit-sha` | Current HEAD SHA in check mode or the pushed commit SHA in sync mode. |

### Check mode

Use in CI quality workflows. It does not write files or require a token. If the
shared block is stale, the action fails and recommends running the repository's
supported sync command locally and committing the generated update.

### Sync mode

Use only on an existing Dependabot PR branch. The action writes only `AGENTS.md`,
commits that file, and pushes to the supplied branch. It never creates a PR or
pushes to the default branch. The caller grants `contents: write` and passes the
write token explicitly; the token is supplied to Git through process environment
configuration and is not written to the remote URL or repository config.

## Requirements

- Linux runner with Node.js and Git available.
- Check out the caller's target branch before running the action. In sync mode,
  the checkout branch must match `head-branch` and the working tree must be clean.
- The sync source is read from public `Lufa-Core` `main`; for `Lufa-Core` itself,
  the current checkout's local `packages/config/agents` package is used.
- In check mode, no write permissions or registry credentials are needed.

## Examples

Check mode in CI:

```yaml
- uses: grasdouble/Lufa-CICD/actions/sync-agents@sync-agents-v1
  with:
    mode: check
```

Sync mode on an existing Dependabot PR branch:

```yaml
- uses: grasdouble/Lufa-CICD/actions/sync-agents@sync-agents-v1
  with:
    mode: sync
    head-branch: ${{ github.head_ref }}
    github-token: ${{ secrets.LUFA_CI_SECRET_DEPENDABOT }}
```
