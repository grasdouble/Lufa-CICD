# ⚠️ Agent — Read this entire file before acting

These rules apply to every session, including after a compact or checkpoint. Before making any change, verify you have internalized all sections below. Never add a rule without first checking it doesn't already exist.

---

<!-- BEGIN:AGENTS.shared -->
<!-- source: @grasdouble/lufa_config_agents@1.1.4 — DO NOT EDIT this block manually, run `pnpm sync:agents` -->

# Shared Agent Rules — Grasdouble Ecosystem

These rules apply to **every repo** in the Grasdouble ecosystem. They are maintained in `@grasdouble/lufa_config_agents` and referenced from each repo's `AGENTS.md`.

After reading this file, read the repo-specific `AGENTS.md` for rules that apply only to the current repository.

---

## Self-improvement — Update AGENTS.md when a mistake is identified

When the user points out a mistake or a recurring problem, **always update the repo's `AGENTS.md`** to prevent it from happening again — in the same response, before moving on.

- Identify the root cause, not just the symptom
- Write a rule specific enough to prevent the exact mistake
- Do not add vague rules ("be careful with X") — write actionable rules with ✅/❌ examples
- Check that a similar rule doesn't already exist before adding

**Rule template:**

```markdown
## Rule title — short imperative

One sentence explaining why this matters.

- ✅ Correct example
- ❌ Wrong example (with consequence if useful)
```

This applies to any type of mistake: tooling, workflow, code quality, file management, etc.

**✅ Update AGENTS.md when:**

- The user explicitly asks to add or change a rule
- A recurring mistake is identified (same error happened twice or more)
- A new validated pattern emerges that applies to any future session in this repo

**❌ Do NOT update AGENTS.md when:**

- The instruction is session-specific ("for this task, skip lint")
- The user qualified it with "for now", "just this time", "temporarily"
- The fact is already captured by a stored memory
- The rule would duplicate or contradict an existing section

**Agent memories vs AGENTS.md:**

- Use your agent's memory system (if available) for facts that could apply across multiple repos (user preferences, general conventions)
- Use AGENTS.md for rules that are **specific to this repo** (tooling, architecture, workflow)
- Use this shared file for rules that apply across **all** Grasdouble repos
- When in doubt: if it references a specific file, command, or package in this repo → AGENTS.md

---

## Critical thinking — Always challenge requests

Before implementing anything, evaluate the request critically:

- If the approach has flaws, better alternatives, or architectural concerns, **say so first** before executing
- Don't just implement what is asked — ask yourself if it's the right solution
- If you disagree, explain why clearly and propose an alternative
- Only proceed once the approach is validated (either confirmed by the user or after proposing a better option)

**Non-trivial = anything involving:** architecture decisions, API design, technology or library choices, naming that will be hard to change, security-sensitive code, or changes that affect more than one package.

- ✅ "You asked to add Redux here, but the app already uses Zustand — should I use Zustand instead for consistency?"
- ✅ "Splitting this into two components makes sense, but it will require changing the parent interface — is that acceptable?"
- ❌ Silently implementing a pattern that conflicts with the existing codebase
- ❌ Asking for validation on every trivial decision (adding a CSS class, fixing a typo)

---

## Git — No commits, no staging, no destructive operations

Never create git commits and never stage files. Leave all git operations to the user. **This rule also applies to any sub-agent or background agent you launch — always instruct sub-agents explicitly to never run `git commit` or `git add`.**

- ✅ `git diff`, `git status`, `git log`, `git stash`
- ❌ `git add` — never; staging is the user's responsibility
- ❌ `git commit` — never, even when asked to "save" or "apply" changes
- ❌ Launching a sub-agent without explicitly telling it "never run git commit or git add"
- ❌ `git rebase` — rewrites history
- ❌ `git reset --hard` — destroys uncommitted work
- ❌ `git push --force` / `git push --force-with-lease` — overwrites remote
- ❌ `git clean -fd` — permanently deletes untracked files

---

## Package Manager — Always use pnpm

This repo uses **pnpm** exclusively. Never use `npm` or `yarn`.

- ✅ `pnpm install`, `pnpm add <pkg>`, `pnpm run <script>`, `pnpm dlx <cmd>`
- ❌ `npm install`, `yarn add`
- ❌ `npx <cmd>` — bypasses pnpm, can silently pull packages from the npm registry; use `pnpm dlx` instead

---

## RTK — Token-Optimized CLI

**rtk** is a CLI proxy that filters and compresses command outputs, saving 60-90% tokens.

### Rule

Always prefix **bash/shell** commands with `rtk` (not tool calls like `ide-get_diagnostics`):

```bash
# Instead of:              Use:
git status                 rtk git status
git log -10                rtk git log -10
pnpm lint                  rtk pnpm lint
pnpm build                 rtk pnpm build
```

### Native rtk commands (run as-is, no prefix needed)

```bash
rtk gain              # Token savings dashboard
rtk gain --history    # Per-command savings history
rtk discover          # Find missed rtk opportunities
rtk proxy <cmd>       # Run raw (no filtering) but track usage
```

---

## TypeScript — Never call `tsc` directly

The `tsconfig` files in Grasdouble repos have `declaration: true` and `sourceMap: true`. **Running `tsc` without `--noEmit` emits `.js`, `.d.ts`, and `.map` files into `src/`. Always use the project scripts which set the correct flags.**

### Allowed — type checking

- ✅ `ide-get_diagnostics` tool — preferred, zero risk of file emission
- ✅ `pnpm typecheck` from a specific package folder
- ✅ `pnpm all:typecheck` from the root (runs all packages)

### Forbidden — always

- ❌ `tsc` — direct binary call
- ❌ `pnpm tsc` — still calls the binary directly, bypasses the script
- ❌ `tsc -p tsconfig.json` with any flags, including `--noEmit` or `--listEmittedFiles`

If stray generated files appear in `src/` (`.js`, `.js.map`, `.d.ts`, `.d.ts.map`), delete them immediately.

---

## Workflow — No planning files in the repository

Never create markdown files in the repository for planning, notes, or tracking.

- ✅ Use in-memory notes, session workspace files (e.g. `~/.copilot/session-state/*/plan.md`)
- ❌ `PLAN.md`, `TODO.md`, `NOTES.md`, or any tracking file committed to the repo
- ❌ Creating a markdown file "temporarily" — even temporary files pollute git history

This applies to sub-agents you launch: always instruct them not to create planning files in the repo.

---

## Accessibility — Non-negotiable

Every UI change must consider accessibility. This is not optional and must never be skipped during review or implementation.

Checklist to apply systematically:

- **Decorative elements** (svg, images without meaning) → `aria-hidden="true"`
- **Interactive elements** → keyboard accessible, `role` and `aria-*` attributes correct
- **Images** → `alt` attribute always present (empty string `""` if decorative)
- **Form fields** → associated `<label>` or `aria-label`
- **Color** → never the only means of conveying information
- **Focus** → visible focus indicator, logical tab order
- **Animations** → always respect `prefers-reduced-motion: reduce` — pause or skip any motion when active
- **Contrast** → WCAG AA minimum: 4.5:1 for text, 3:1 for large text and UI components
- **Semantic HTML** → use the right element first (`<button>`, `<nav>`, `<main>`…) before reaching for ARIA roles
- **Heading hierarchy** → logical `h1 → h2 → h3` structure, never skip levels
- **Live regions** → use `aria-live` for content that updates dynamically without a page reload

When writing or reviewing code, if an accessibility issue is found, fix it in the same task — never defer it.

---

## TDD — Test before code

When modifying existing code or implementing new behavior, always follow the **Red → Green → Refactor** cycle:

1. **Red** — Write or update the test first, run it, confirm it fails for the right reason
2. **Green** — Write the minimal code to make the test pass
3. **Refactor** — Clean up, then re-run tests to confirm they still pass

**Rules:**

- ✅ Write or update the failing test **before** changing the production code
- ✅ When a code change makes an existing test fail, update the test **before** running the code change — or update both together and confirm the test fails for the right reason first
- ✅ Run the affected test suite after every step (`pnpm test` in the package folder)
- ❌ Never write code first and tests after — the test must define expected behavior, not describe existing code
- ❌ Never leave tests broken and move on — all tests must pass before the task is considered done
- ❌ Never delete a test to make a suite pass — update it to match the new expected behavior, or justify removal explicitly

**What counts as "a change":**

- Modifying a component's rendered output (elements, attributes, text)
- Changing a function's signature or return value
- Adding, removing, or renaming props
- Changing accessibility attributes (aria, role, alt…)

**Exception:** When adding a brand-new feature with no existing test, write the test file first (even if it just has a skeleton), then implement.

---

## Changesets — Naming and content

When creating a changeset file manually in `.changeset/`, always use a **descriptive kebab-case name** — never a random hex ID.

- ✅ `.changeset/add-hero-animation.md`
- ✅ `.changeset/happy-lions-sing.md` (auto-generated by the CLI — acceptable)
- ❌ `.changeset/6197e9-63944d-6768e0.md`

**Content rules:**

- Always check `rtk git diff main --name-only` first to identify **all** changed packages before writing changesets (assumes `main` is the default branch — adjust if different)
- **Every package with changed files must be covered** — no exception, including private packages (`"private": true`), tests, storybook, docs…
  - ✅ All packages with file changes → changeset entry required
  - ❌ Never skip a package, regardless of its `private` field or purpose
- **Exception: the root `package.json` of a monorepo** — it is not a workspace package and does not need a changeset entry (changes to it, e.g. root devDependencies, are not tracked by changesets)
- Use `patch` for fixes/refactors, `minor` for new user-visible features, `major` for breaking changes
- **Always prefix the description** with a conventional commit type: `feat:`, `fix:`, `chore:`, `refactor:`, `perf:`, `docs:`, `style:`, `test:`
- **Always verify** the changeset after creation: `rtk pnpm changeset status`

**Consolidate before creating** — always check for existing changesets first:

Before creating a new changeset, run:

```bash
rtk git status --short .changeset/   # untracked / staged files
rtk git diff main --name-only -- .changeset/  # committed but not merged
```

- ✅ If an existing changeset targets the **exact same set of packages** you modified → **add your description to it** (same bump type or escalate)
- ✅ If an existing changeset covers some of your packages but also covers **packages you did not modify** → **create a new file** covering only the packages you changed
- ✅ Create a new file only when no existing changeset covers the package
- ❌ Never create a second changeset for the same package in the same branch

**Atomic vs independent — choose the right grouping:**

When multiple packages change together, decide before creating any file:

- ✅ **One shared file** when all packages changed as part of the **same atomic feature or fix** (e.g. a new component + its tests + its stories)
- ✅ **One file per package** when packages changed for **unrelated reasons** in the same branch
- ❌ One file per package when the changes are atomic — this creates unnecessary noise and splits a single story across multiple entries
- ❌ One shared file listing packages with unrelated changes — misleads readers about what changed and why

Prefix guide:

- `feat:` — new user-visible feature
- `fix:` — bug fix
- `chore:` — maintenance, config, tooling, dependency update
- `refactor:` — code restructuring without behavior change
- `perf:` — performance improvement
- `docs:` — documentation only
- `style:` — visual/CSS change with no logic change
- `test:` — test additions or changes

<!-- END:AGENTS.shared -->

---

## Repository scope — GitHub Actions catalogue

`Lufa-CICD` distributes independently versioned composite actions through Git refs.
The root `package.json` manages tooling. Each `actions/*` directory is a private
pnpm workspace package used by Changesets for version metadata, not npm publication.
Shared UI and TypeScript rules apply only when those technologies are present.

- ✅ Check the repository structure and available scripts before choosing commands.
- ❌ Copy rules referencing another project's packages, UI or build scripts.
- Use pnpm for this repository's tooling and shared package-management actions.
- Add catalogue actions only for a demonstrated consumer need or this repository's
  own validation and release needs.
  - ✅ Extract a setup action used by existing projects or a check used by catalogue CI.
  - ❌ Add generic demo actions for an assumed stack without an identified consumer.
- RTK applies to the agent's local shell commands, not to commands embedded in
  published workflows or actions.

## Shared rules — Synchronize from the installed package

Run `rtk pnpm sync:agents` after updating `@grasdouble/lufa_config_agents`.
Maintain catalogue-specific rules outside the generated block. Changes to shared
rules belong in the source package, not in this repository's generated copy.

## Catalogue layout and caller context

- Composite actions live in `actions/<name>/action.yml`, with an adjacent README.
- `.github/workflows/` is reserved for this catalogue's own validation and release
  automation. Consumers own their workflows, runners, matrices and environments.
- ✅ Extract shared steps into `actions/<name>/action.yml`.
- ❌ Add a public `workflow_call` workflow as a catalogue component.
- Register every public component in the root README catalogue.
- Use two-space YAML indentation and kebab-case file and input names.
- Action working directories refer to the caller's checkout. Load bundled scripts
  through `github.action_path`; reference other catalogue actions remotely with
  their component-specific version. Local actions are appropriate in catalogue CI.
- ✅ `uses: grasdouble/Lufa-CICD/actions/lint-workflows@lint-workflows-v1` after publication.
- ❌ `uses: ./actions/lint-workflows` to access this catalogue from a consumer.

## Public contracts and workflow permissions

- Document input types, defaults, outputs, required secrets and supported runners.
- Let callers choose triggers, path filters, matrices and concurrency.
- Document minimum permissions and timeouts for calling jobs. Actions cannot set
  job permissions or environments; callers pass credentials through action inputs.
- Pin third-party GitHub actions to commit SHAs with version comments; pin Docker
  actions to explicit versions. Include composite action folders in Dependabot.
- For annotated upstream tags, pin the peeled commit (`refs/tags/<tag>^{}` from
  `git ls-remote`), not the tag object's SHA. Verify `action.yml` at that commit.
- Pass inputs into shell scripts through environment variables and quote them.
- ✅ `run: pnpm run "$SCRIPT_NAME"` with `SCRIPT_NAME` supplied through `env`.
- ❌ Interpolate an input directly into the shell command text.

## Validation — Use the catalogue's actual checks

Run checks from the repository root:

| Change | Check |
| --- | --- |
| Any files | `rtk git diff --check` |
| Workflows | `rtk proxy actionlint` |
| Action and release scripts | `rtk pnpm test` |
| Changesets | `rtk pnpm changeset status` |
| Shared agent dependency | `rtk pnpm sync:agents` |

If actionlint is not installed, use the CI image:

```sh
rtk proxy docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.12 -color
```

For functional changes, define a consumer integration scenario before changing
the workflow or action, then exercise it against a pushed commit SHA. Test added
script logic with the appropriate test runner. actionlint validates workflows,
not all `action.yml` metadata or cross-repository runtime behavior.

Fix validation failures at their source. If a tool or remote execution is
unavailable, report that limitation explicitly. Action script tests use Node.js's
built-in test runner and live in adjacent `__tests__/` directories. Catalogue CI
also exercises the local setup action. There are no build or typecheck scripts;
do not invent `all:*` commands.

## Releases — Version each action independently

Follow `docs/versioning.md`. Changesets is the selected release tool for this
catalogue. Each action has a private `package.json`; Changesets updates its version
and changelog from explicit `.changeset/*.md` entries. Do not replace this tool
when changing how actions or workflows are organized.

- ✅ Add a changeset naming the affected action packages and their bump levels.
- ❌ Introduce Release Please or infer version bumps from commit titles.

- ✅ `pr-comment-v1.2.3` is immutable; `pr-comment-v1` follows stable major 1 releases.
- ❌ Use a global `@v1`, move exact version tags, or point stable aliases at prereleases.
- Breaking changes require a new major for the affected action, not other actions.
- Internal `uses` dependencies must name an explicit component ref. Adopting a new
  dependency major requires a reviewed change to the consuming action.
- The root package is tooling only and does not need a changeset. Keep all action
  packages private, with private-package versioning enabled and CLI tagging disabled.
- Catalogue publication creates only GitHub releases and component-prefixed tags;
  never run `changeset publish` for this catalogue. The consumer-facing
  `changesets-release` action still supports publishing consumer npm packages.
- CI automates release PRs, exact tags and major aliases after validation. Agents
  must not invoke publication scripts against GitHub or perform Git mutations.
- Reuse the ecosystem's `LUFA_CI_SECRET_WRITE` name for catalogue release writes
  so consumers and maintainers share the same secret convention.
  - ✅ `${{ secrets.LUFA_CI_SECRET_WRITE || github.token }}` for catalogue publication.
  - ❌ Introduce a new release-secret name for the same purpose without an explicit request.

---

## Language — Write all repository content in English

The conversation language must not determine the language of repository content.
Write all documentation, code comments, examples, configuration descriptions,
workflow and action labels, and PR titles, descriptions and comments in English.

- ✅ English README instructions and YAML comments, even when the user asks in French.
- ❌ French documentation, examples or PR content based on the conversation language.

---

## CI package downloads — Prefer GITHUB_TOKEN over a PAT

Use the workflow's built-in token to download Lufa packages so Dependabot-triggered CI does not depend on unavailable Actions secrets.

- ✅ For workflows downloading private GitHub Packages, use `${{ secrets.GITHUB_TOKEN }}` and grant `packages: read` in the consuming job's effective permissions.
- ✅ Grant the calling repository **Read** access under each package's **Manage Actions access** settings.
- ❌ Require a PAT solely for package downloads before checking whether `GITHUB_TOKEN` can provide the required access.
- ✅ Evaluate credentials used for pushing commits or triggering other workflows separately; package download access does not establish that those operations can use the same token.
