# Contributing to the catalogue

## Add a composite action

1. Create `actions/<name>/action.yml` with `name`, `description`, any
   `inputs`/`outputs`, and `runs.using: composite`.
2. Explicitly declare `shell` for every `run` step.
3. Add a `README.md` in the same directory documenting prerequisites, inputs,
   outputs, permissions and a versioned remote usage example.
4. Add its directory to `directories` in `.github/dependabot.yml` to track the
   third-party actions it uses.
5. List the component in the root `README.md` catalogue table.
6. Add a private `package.json` named `@grasdouble/cicd-<name>` with version
   `0.0.0`. The `actions/*` workspace glob discovers it automatically.
7. Add a major changeset for its first `1.0.0` release. Use `pnpm changeset` for
   subsequent changes and choose the appropriate bump for each affected action.

## Keep orchestration in consuming projects

The catalogue exposes actions called from `jobs.<job>.steps`. Consumers choose
triggers, runners, matrices, permissions, environments, timeouts and concurrency.
Document those requirements in each action's README. Workflows under `.github/`
validate and release this repository itself.

An action runs in the calling project's workspace. Load bundled scripts through
`github.action_path`. To call another catalogue action, use its remote path with
a component-specific version. `uses` references do not accept dynamic expressions
for the version. Document internal dependencies and review major upgrades.

## Conventions

- Write all repository content in English, including documentation, comments
  and examples.
- Use two-space YAML indentation and `kebab-case` file and input names.
- Pin third-party GitHub actions to SHAs with version comments; pin Docker
  actions to explicit versions.
- Pass shell inputs through `env` and quote variables instead of interpolating
  inputs directly into command text.
- Never hardcode secrets; declare required secrets explicitly.
- Any breaking contract change requires a new major version of the affected action.
- Version bumps and release notes come from `.changeset/*.md`, not commit titles.
  Every changed action package needs coverage, including tests and documentation.
- Use descriptive changeset filenames and prefix summaries with a conventional
  type such as `fix:` or `feat:`. Consolidate related entries before adding files.
- Keep runtime code within its action directory. Root-only tooling changes do not
  need an action changeset unless they affect the published action's behavior.

## Validate a change

Install dependencies with pnpm, then run action, publication and Changesets tests:

```sh
pnpm test
pnpm changeset status
```

With [actionlint](https://github.com/rhysd/actionlint) installed:

```sh
actionlint
git diff --check
```

Or with the same image used by CI:

```sh
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.12 -color
```

CI uses the local `./actions/lint-workflows` action to validate workflows in the
proposed commit and exercises `./actions/setup-node-pnpm` to check Node.js,
pnpm and token-backed registry configuration. Publication tests mock the GitHub
API; Changesets integration tests version temporary workspaces with the real CLI.
Once checks pass on `main`, the release job publishes merged versions, reconciles
major aliases, and creates or updates the Changesets version PR.

CI installs production tooling with `pnpm install --prod --frozen-lockfile
--ignore-scripts`. Changesets CLI is a root tooling dependency; the private shared
agent package is a development dependency used locally.

actionlint does not replace an integration test: for a
functional change, call the component from a test project using the SHA of the
pushed branch to check paths, permissions and secrets in the caller's context.

After validation, follow the [release procedure](docs/versioning.md).

## Agent rules

`AGENTS.md` contains a shared block generated from
`@grasdouble/lufa_config_agents`, followed by catalogue-specific rules.
After installing dependencies with pnpm or updating this package, run:

```sh
pnpm sync:agents
```

Edit local rules after the generated block. Changes to shared rules must be made
in the source package, then synchronized here.
