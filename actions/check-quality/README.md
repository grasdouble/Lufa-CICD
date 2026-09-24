# check-quality

Run caller-provided quality commands in order: dependency install, build,
lint, typecheck, and formatting check. Leave an input empty to skip that step.
Project-specific tests remain in the caller's workflow.

## Input

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `install-command` | No | Empty (skip) | Shell command to install dependencies. |
| `build-command` | No | Empty (skip) | Shell command to build the project or its packages. |
| `lint-command` | No | Empty (skip) | Shell command to lint the project. |
| `typecheck-command` | No | Empty (skip) | Shell command to typecheck the project. |
| `format-command` | No | Empty (skip) | Shell command to check formatting. |

## Outputs

| Output | Description |
| --- | --- |
| `install-succeeded` | `true` if installation succeeded or its command was omitted; otherwise `false`. |
| `build-succeeded` | `true` if the build succeeded or its command was omitted after installation; otherwise `false`. |

Commands run in the order listed above. If installation fails, all subsequent
commands are skipped. If build fails, lint and formatting still run after a
successful install; typechecking runs only after a successful or omitted build
because build commands may generate types required by typechecking. The caller
can use `build-succeeded` to gate project-specific tests and `install-succeeded`
to gate checks that require installed dependencies.

## Requirements

- Linux runner with Bash available. Set up any tools referenced by the supplied
  commands before calling the action.
- Commands start in the caller's repository root. Include directory changes in
  a command when it needs to run in a subdirectory. Any package scripts invoked
  by a command must exist in that package's `package.json`.
- Each non-empty command is run by Bash. Keep command inputs static in the
  workflow; do not construct them from pull request titles, branch names, or
  other untrusted data.
- The caller must grant `packages: read` and configure registry authentication
  when a supplied install command downloads private GitHub Packages dependencies.
- The caller owns checkout, triggers, runner, job permissions, timeout and
  project-specific tests.

## Example

The action works with both a single package and a monorepo. For a single package:

```yaml
- uses: grasdouble/Lufa-CICD/actions/check-quality@check-quality-v1
  with:
    install-command: pnpm install --frozen-lockfile
    build-command: pnpm build
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
  - uses: grasdouble/Lufa-CICD/actions/check-quality@check-quality-v1
    id: quality
    with:
      install-command: pnpm install --frozen-lockfile
      build-command: pnpm all:build
      lint-command: pnpm all:lint
      typecheck-command: pnpm all:typecheck
      format-command: pnpm all:prettier:check
  - if: always() && steps.quality.outputs.build-succeeded == 'true'
    run: pnpm all:test
```
