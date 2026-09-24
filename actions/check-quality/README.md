# check-quality

Run caller-provided lint, typecheck, and formatting commands. Dependency
installation and package builds are the caller's responsibility. Leave any
command input empty to skip that check. Project-specific tests remain in the
caller's workflow.

## Input

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `check-agent-rules` | No | `false` | Check the generated shared block in the caller's root `AGENTS.md`. |
| `lint-command` | No | Empty (skip) | Shell command to lint the project. |
| `typecheck-command` | No | Empty (skip) | Shell command to typecheck the project. |
| `format-command` | No | Empty (skip) | Shell command to check formatting. |

## Behavior

When `check-agent-rules` is true, the action calls `sync-agents` in check mode
before the quality commands. It does not modify the caller's branch. Stale
`AGENTS.md` content fails the action. Publish `sync-agents-v1` before using
`check-quality-v2` with this input enabled.

Lint, typecheck, and formatting commands run in that order. The caller should
gate typechecking on its build step when generated types are required, and gate
project-specific tests on the caller's build step.

## Requirements

- Linux runner with Bash available. Set up any tools referenced by the supplied
  commands before calling the action.
- The caller checks out the repository, sets up Node.js/pnpm as needed, and
  installs dependencies before invoking this action.
- Commands start in the caller's repository root. Include directory changes in
  a command when it needs to run in a subdirectory. Any package scripts invoked
  by a command must exist in that package's `package.json`.
- Each non-empty command is run by Bash. Keep command inputs static in the
  workflow; do not construct them from pull request titles, branch names, or
  other untrusted data.
- `sync-agents` reads shared rules from public `Lufa-Core`; it does not require
  the internal agent package or a write token in check mode. Publish
  `sync-agents-v1` before using `check-agent-rules: 'true'`.
- The caller must grant `packages: read` and configure registry authentication
  when its dependency-install step downloads private GitHub Packages dependencies.
- The caller owns checkout, triggers, runner, job permissions, timeout and
  project-specific tests.

## Example

The action works with both a single package and a monorepo. For a single package:

```yaml
steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  - uses: grasdouble/Lufa-CICD/actions/setup-node-pnpm@setup-node-pnpm-v1
    with:
      github-token: ${{ github.token }}
  - run: pnpm install --frozen-lockfile
  - run: pnpm build
  - uses: grasdouble/Lufa-CICD/actions/check-quality@check-quality-v2
    with:
      check-agent-rules: 'true'
      lint-command: pnpm lint
      typecheck-command: pnpm typecheck
      format-command: pnpm prettier:check
```

For a monorepo, pass the root scripts instead:

```yaml
steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  - uses: grasdouble/Lufa-CICD/actions/setup-node-pnpm@setup-node-pnpm-v1
    with:
      github-token: ${{ github.token }}
  - run: pnpm install --frozen-lockfile
  - id: build
    run: pnpm all:build
  - uses: grasdouble/Lufa-CICD/actions/check-quality@check-quality-v2
    id: quality
    with:
      check-agent-rules: 'true'
      lint-command: pnpm all:lint
      typecheck-command: pnpm all:typecheck
      format-command: pnpm all:prettier:check
  - if: always() && steps.build.outcome == 'success'
    run: pnpm all:test
```
