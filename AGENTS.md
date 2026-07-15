# Working in this repo

Rudder records the prompts you give your AI coding assistants, shows live stats,
and learns durable rules from your corrections. It installs hooks into Claude
Code and Codex that log each prompt to a local SQLite DB at
`~/.rudder/rudder.db`.

## Layout

- `src/` — TypeScript sources (run directly via Node's type stripping in dev).
  - `db/` — Drizzle schema/client, generated-migration runner, and prompt queries
    on Drizzle's native `node:sqlite` driver.
  - `hooks.ts` — Claude/Codex `UserPromptSubmit` capture + learned-rule injection.
  - `transcript.ts` — bounded, fail-open reading of Claude/Codex JSONL session tails.
  - `compiler.ts` / `rules.ts` — TRACE-inspired rule compilation, lifecycle,
    storage, retrieval, and prompt context rendering.
  - `classify.ts` — the single source of truth for the category/reaction rubric.
  - `tagger.ts` — classifies untagged prompts via the agent CLI (`ensureTagged`/`tagDay`).
  - `tags.ts` — tag queries + `statsForDay()` (the numbers the dashboard and CLI read).
  - `agent.ts` — shared `runAgent`/`resolveAgent` shell-out to `claude`/`codex`.
  - `serve.ts` / `ui.ts` — the `rudder start` daemon and its inlined dashboard page
    (also a PWA: `ui.ts` exports the manifest + service worker, served by `serve.ts`).
  - `icon.ts` — zero-dependency PNG app-icon generator (built-in `node:zlib`).
  - `install.ts` — `rudder init` (DB + hook wiring).
- `bin/rudder.ts` — CLI entry point.
- `dist/` — compiled output, the only code that ships (see `files` in `package.json`).
  Dev runs `bin/rudder.ts`; the published package runs `dist/bin/rudder.js`.
- `test/` — `node --test` suites.

## Stats pipeline

Per-prompt classification is the single source of the numbers, so the live
dashboard and `rudder stats` can never disagree:

- Each prompt is tagged exactly once (`prompt_tags`, keyed by `prompt_id`) with a
  `category` (architecting/tuning/bugfixing/housekeeping/ignored) and a `reaction`
  (agree/disagree/none), using the shared rubric in `classify.ts`.
- Tagging is **out-of-band**, never in the capture hook: the hook inserts the
  prompt and fires a best-effort `POST /notify` at the `rudder start` daemon,
  which debounces (~1.5s) and batches a single agent call. If the daemon is down,
  the prompt is just left untagged and backfilled by the next `rudder start` or
  `rudder stats`.
- `statsForDay()` aggregates tags into percentages (untagged rows count as
  `ignored` and are excluded from the denominator, so the four percentages sum
  to ~100% of counted prompts). `rudder stats` calls `ensureTagged` unless
  `--no-tag` is passed.
- `TAGGER_VERSION` in `tags.ts`: bump it to invalidate existing tags (rows at an
  older version count as untagged and get reclassified). Bump it whenever the
  rubric or prompt rendering changes in a way that should re-tag history.
- The tagger inherits `RUDDER_DISABLE=1` via `runAgent`, so classifying a prompt
  never records the classification instruction as a new prompt.

## Learned-rules pipeline

Both Claude Code and Codex use native `UserPromptSubmit` hooks. The hook records
the prompt, reads a bounded transcript tail for prior-turn evidence, queues a
`trace_events` row, and injects already-compiled project/global rules as
`additionalContext`. Compilation never runs in the hook: `rudder start`
debounces it out-of-band, and `rudder rules` can run it explicitly.

The compiler resolves atomic rules with `NEW`/`NOOP`/`UPDATE`/`SUPERSEDE`.
`memory_rules` keeps immutable versions and `rule_evidence` preserves
provenance. Prompt-time retrieval is a local SQLite query; no LLM runs on the
hot path.

## Local development

```
npm install        # install dev deps (typescript, @types/node, ...)
npm run db:generate # regenerate drizzle/ migrations after src/db/schema.ts changes
npm run typecheck   # tsc --noEmit
npm test            # node --test
npm run build       # rm -rf dist && tsc -p tsconfig.build.json
```

Always run `npm run typecheck` and `npm test` before committing. `prepublishOnly`
runs typecheck + test + build, so a broken tree cannot be published.
When the Drizzle schema changes, run `npm run db:generate` and commit the
generated `drizzle/` migration artifacts; runtime DB initialization applies those
migrations instead of hand-written bootstrap SQL.

### Gotcha: dev vs. published paths

Code that resolves file paths relative to itself must work in **both** layouts:
the `.ts` source tree (dev) and the compiled `.js` under `dist/` (published).
`rudderArgv()` in `src/install.ts` is the canonical example — it derives the bin
extension from the running module so `rudder init` writes a hook pointing at a
file that actually exists in each case. Mismatching this silently breaks prompt
capture (the hook fails and the fail-safe wrapper swallows the error).

## Pull request process

1. Branch off `main` (never commit directly to `main`).
2. Make the change; run the package checks via the `check-changed-folders` skill
   (Codex equivalent of `/check`) — or directly: `npm run typecheck`, `npm test`,
   `npm run build`.
3. If the change is user-facing or fixes a bug, bump the version in the same PR:
   `npm version patch --no-git-tag-version` (use `--no-git-tag-version` so the
   tag is cut later from `main`, not from the feature branch).
4. Commit, push, and open a PR with `gh pr create --base main`.
5. After the PR opens, address any review comments with the `address-pr-comments`
   skill (Codex equivalent of `/address-pr-comments`).

## Continuous integration

`.github/workflows/test.yml` runs `npm ci`, `npm run typecheck`, `npm test`, and
`npm run build` on every push. It is the gate that keeps `main` green; make it a
**required status check** in branch protection so untested code can't merge.
Testing deliberately lives here, separate from the publish flow (the archer
`testing.yml` split) — `publish.yml` only builds and publishes.

`.github/workflows/release-alert.yml` runs on every PR targeting `main` and posts
a **sticky PR comment** when merging will publish package artifacts or create a
GitHub Release. It mirrors `publish.yml`'s checks — npmjs.org is gated by the
`v<version>` tag, and GitHub Packages plus GitHub Releases are checked directly so
an existing npmjs.org release can be backfilled there. The comment is updated in
place on each push (via a hidden `<!-- release-alert -->` marker) rather than
duplicated.

## Publishing packages and releases

Publishing is **automatic on merge to `main`** — there is no manual tagging step.
`.github/workflows/publish.yml` runs on every push to `main` as a single job whose
steps:

1. compute `v<version>` from `package.json`.
2. publish to npmjs.org if that tag does not exist, using a **Trusted Publisher
   (OIDC)** — there is no `NPM_TOKEN` secret. The release path does **not** run
   tests itself — that's `test.yml`'s job (see CI above). `npm publish` still runs
   `prepublishOnly` (typecheck + test + build) as an intrinsic guard, so a broken
   tree can't ship.
3. publish to GitHub Packages via `GITHUB_TOKEN` if that registry is missing
   `@vivekyy/rudder@<version>`. The `repository` field in `package.json` links the
   GitHub package back to this repo so it appears under the repo's Packages.
4. push the `v<version>` tag as the npmjs.org "shipped" marker, **after** npmjs.org
   publishes successfully and GitHub Packages is satisfied (so a failed publish
   leaves no tag and a re-run retries cleanly).
5. create the GitHub Release for `v<version>` if it is missing, using
   `gh release create --generate-notes` so the release description is autogenerated
   from GitHub's release notes generator.

So the only way to publish a new npmjs.org release is to land a version bump
(`npm version patch --no-git-tag-version`, see the PR process) on `main`.
Forgetting to bump means no new npmjs.org publish (safe); the workflow can still
backfill GitHub Packages or a missing GitHub Release for an already-tagged version.

After a version-bump PR merges, verify the `Publish packages and releases` workflow
succeeded, `npm view @vivekyy/rudder version` reflects the new release, the package
appears under the repo's GitHub Packages, and the GitHub Release exists with
autogenerated release notes.

Notes:
- **The OIDC workflow is `publish.yml`** (unchanged from before). The Trusted
  Publisher at npmjs.com -> package -> Settings -> Trusted Publisher must name
  `publish.yml` — which is what it already is, so no reconfiguration is needed.
- The git tag is created **after a successful npmjs.org publish**, so it is a
  marker, not the trigger. Do **not** push `v*` tags by hand — and never run
  `npm version patch` on `main` (it would bump a second time).
- If a publish ever fails midway (e.g. a transient npm error), no tag is written;
  re-run `Publish packages and releases` from the Actions tab (`workflow_dispatch`)
  and it retries the missing registry and release artifacts.

## Installing / re-wiring hooks

`rudder init` creates the DB and installs native `UserPromptSubmit` hooks for
Claude Code (`~/.claude/settings.json`) and Codex (`~/.codex/hooks.json`). Both
point at the absolute bin path of the rudder that ran `init`.

Because each Conductor/git worktree is a separate checkout but `~/.claude/settings.json`
is global, a hook pointing into a specific worktree breaks once that worktree is
deleted. Prefer a **global install** (`npm i -g @vivekyy/rudder`) so the hook
points at a stable path (`/opt/homebrew/bin/rudder`) that survives worktree churn.

## Skills

### Available skills

- check-changed-folders: Run typecheck/test/build for the package on the current
  branch and enforce Claude/Codex sync. Use for `/check` requests and pre-PR
  validation. (file: .codex/skills/check-changed-folders/SKILL.md)
- address-pr-comments: Fetch open review comments on the current branch's PR,
  dedupe them, and fix/decline/defer each with a written reason. Invoked
  automatically by `check-changed-folders` when a PR exists. (file:
  .codex/skills/address-pr-comments/SKILL.md)

### Trigger rules

- If the user asks to run checks/tests/lint for the branch or references `/check`,
  use `check-changed-folders`.
- If the user asks to address PR comments, fix Greptile findings, or references
  `/address-pr-comments`, use `address-pr-comments`.

## Gitmoji

Use [gitmoji](https://gitmoji.dev/) in all commit messages and PR titles. Pick the
most specific emoji that fits the change.

Note: `:zap:` and `:sparkles:` are swapped from the standard guide (`:zap:` = new
features, `:sparkles:` = performance).

| Emoji | Code | Description |
|-------|------|-------------|
| 🎨 | `:art:` | Improve structure / format of the code |
| ⚡️ | `:zap:` | Introduce new features |
| 🔥 | `:fire:` | Remove code or files |
| 🐛 | `:bug:` | Fix a bug |
| 🚑️ | `:ambulance:` | Critical hotfix |
| ✨ | `:sparkles:` | Improve performance |
| 📝 | `:memo:` | Add or update documentation |
| 🚀 | `:rocket:` | Deploy stuff |
| ✅ | `:white_check_mark:` | Add, update, or pass tests |
| 🔒️ | `:lock:` | Fix security or privacy issues |
| 🔖 | `:bookmark:` | Release / Version tags |
| 🚨 | `:rotating_light:` | Fix compiler / linter warnings |
| 🚧 | `:construction:` | Work in progress |
| 💚 | `:green_heart:` | Fix CI Build |
| ⬆️ | `:arrow_up:` | Upgrade dependencies |
| ⬇️ | `:arrow_down:` | Downgrade dependencies |
| 📌 | `:pushpin:` | Pin dependencies to specific versions |
| 👷 | `:construction_worker:` | Add or update CI build system |
| ♻️ | `:recycle:` | Refactor code |
| ➕ | `:heavy_plus_sign:` | Add a dependency |
| ➖ | `:heavy_minus_sign:` | Remove a dependency |
| 🔧 | `:wrench:` | Add or update configuration files |
| ✏️ | `:pencil2:` | Fix typos |
| ⏪️ | `:rewind:` | Revert changes |
| 📦️ | `:package:` | Add or update compiled files or packages |
| 🚚 | `:truck:` | Move or rename resources |
| 💥 | `:boom:` | Introduce breaking changes |
| 💡 | `:bulb:` | Add or update source code comments |
| 🗃️ | `:card_file_box:` | Perform database related changes |
| 🔊 | `:loud_sound:` | Add or update logs |
| 🔇 | `:mute:` | Remove logs |
| 🏷️ | `:label:` | Add or update types |
| 🚩 | `:triangular_flag_on_post:` | Add, update, or remove feature flags |
| 🥅 | `:goal_net:` | Catch errors |
| 🗑️ | `:wastebasket:` | Deprecate code needing cleanup |
| 🩹 | `:adhesive_bandage:` | Simple fix for non-critical issue |
| ⚰️ | `:coffin:` | Remove dead code |
| 🧪 | `:test_tube:` | Add a failing test |
| 🦺 | `:safety_vest:` | Add or update validation code |
| 🙈 | `:see_no_evil:` | Add or update a .gitignore file |

(The full gitmoji set applies; this table lists the codes most common in this
repo. See https://gitmoji.dev for the rest.)

## Claude / Codex parity

Keep Claude and Codex instructions synchronized. Any change to one side must be
mirrored on the other in the same PR (the `check-changed-folders` skill enforces
this as a gate):

- `CLAUDE.md` <-> `AGENTS.md`
- `.claude/commands/check.md` <-> `.codex/skills/check-changed-folders/SKILL.md`
- `.claude/commands/address-pr-comments.md` <-> `.codex/skills/address-pr-comments/SKILL.md`
