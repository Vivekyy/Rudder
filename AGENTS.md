# Working in this repo

This file is the single source of truth for agent instructions. `CLAUDE.md` and
`CODEX.md` intentionally point here instead of duplicating this content.

Rudder is a local-first Electron app that records the prompts you give your AI
coding assistants and turns a day's worth of them into live stats and a readable
digest. It installs hooks into Claude Code and Codex that log each prompt to a
local SQLite DB in the app data directory.

## Agent Rules

- Type safety: avoid `any` unless necessary.
- Prefer `gh` CLI: when performing GitHub operations such as PRs, issues, and
  checkout, prefer the GitHub CLI (`gh`) over raw `git` commands where possible.
- Always fix lint warnings before pushing: CI fails on Biome warnings, not just
  errors. Run `npm run lint:fix` after edits and verify `npm run lint` exits 0
  before `git push`. Never push code that produces lint output, even
  auto-fixable formatting.

## Tech Stack

- Package Manager: npm via `package-lock.json` and `npm` scripts.
- Build System: TypeScript compiler for Electron/shared code, Next.js static
  renderer build, and `electron-builder` for desktop packaging.
- Desktop: Electron packaged for Linux, Windows, and macOS.
- Database: local SQLite through Node's built-in `node:sqlite` `DatabaseSync`
  API.
- UI: React with Next.js renderer output exported as static files for the
  packaged app.
- Code Quality: Biome for formatting/linting, `tsc --noEmit` for type checking,
  and Node's built-in `node --test` runner for tests.
- Next.js: Version 16. Never create `middleware.ts`; Next.js 16 renamed
  middleware to `proxy.ts`. Always use `proxy.ts` for request interception.

## Layout

- `src/` — shared TypeScript services used by Electron, hooks, and tests.
  - `db.ts` — SQLite open/schema (`prompts` + `prompt_tags`), inserts, `rudderPort()`.
  - `hooks.ts` — Claude/Codex capture hooks; best-effort `/notify` ping to the dashboard.
  - `classify.ts` — the single source of truth for the category/reaction rubric.
  - `tagger.ts` — classifies untagged prompts via the agent CLI (`ensureTagged`/`tagDay`).
  - `tags.ts` — tag queries + `statsForDay()` (the numbers the dashboard *and* digest read).
  - `agent.ts` — shared `runAgent`/`resolveAgent` shell-out to `claude`/`codex`.
  - `digest.ts` — renders the Markdown digest; numbers come from `statsForDay`, the LLM only writes prose.
  - `api-contract.ts` — typed preload/renderer API contract.
  - `settings.ts` — app-data settings for agent path/PATH cache.
  - `icon.ts` — zero-dependency PNG app-icon generator (built-in `node:zlib`).
  - `install.ts` — hook install/status helpers for the desktop app.
- `electron/` — Electron main/preload/API entrypoints. Main owns app lifecycle and hook mode; `api.ts` owns IPC and the notify endpoint.
- `app/` / `renderer/` — Next.js React renderer and desktop client adapter.
- `dist/` — compiled Node/Electron output. `out/` is the exported Next.js renderer.
- `test/` — `node --test` suites.

## Stats pipeline (dashboard + digest)

Per-prompt classification is the single source of the numbers, so the live
dashboard and the digest can never disagree:

- Each prompt is tagged exactly once (`prompt_tags`, keyed by `prompt_id`) with a
  `category` (architecting/tuning/bugfixing/housekeeping/ignored) and a `reaction`
  (agree/disagree/none), using the shared rubric in `classify.ts`.
- Tagging is **out-of-band**, never in the capture hook: the hook inserts the
  prompt and fires a best-effort `POST /notify` at the running desktop app,
  which debounces (~5s) and batches a single agent call. If the app is down,
  the prompt is just left untagged and backfilled by the next app startup or
  digest generation.
- `statsForDay()` aggregates tags into percentages (untagged rows count as
  `ignored` and are excluded from the denominator, so the four percentages sum
  to ~100% of counted prompts). Desktop digest generation calls `ensureTagged`
  then fills `{{CORRECTION_LINE}}`/`{{PCT_*}}` tokens with those exact numbers —
  the LLM is told not to reclassify or recompute.
- `TAGGER_VERSION` in `tags.ts`: bump it to invalidate existing tags (rows at an
  older version count as untagged and get reclassified). Bump it whenever the
  rubric or prompt rendering changes in a way that should re-tag history.
- The tagger inherits `RUDDER_DISABLE=1` via `runAgent`, so classifying a prompt
  never records the classification instruction as a new prompt.

## Local development

```
npm install          # install dev deps
npm run format       # Biome formatting check
npm run lint         # Biome formatting/linting, warnings fail CI
npm run typecheck    # tsc --noEmit
npm test             # node --test test/*.ts (requires Node >= 23.6)
npm run build        # compile Electron/main code and export the Next renderer
npm run package      # build desktop packages with electron-builder
```

Always run `npm run format`, `npm run lint`, `npm run typecheck`, and `npm test`
before committing. Use `npm run build` for app-level validation before opening a
PR.

### Gotcha: hook paths

Hook paths must point at a stable executable. The desktop app uses
`electronHookArgv()` so packaged hooks run the app executable in
`--rudder-hook claude|codex` mode without opening a window. Mismatching this
silently breaks prompt capture because the fail-safe wrapper swallows hook
errors.

## Pull request process

1. Branch off `main` (never commit directly to `main`).
2. Make the change; run the package checks via the `check-changed-folders` skill
   (Codex equivalent of `/check`) — or directly: `npm run format`,
   `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
3. Commit, push, and open a PR with `gh pr create --base main`.
4. After the PR opens, address any review comments with the `address-pr-comments`
   skill (Codex equivalent of `/address-pr-comments`).

## Continuous integration

`.github/workflows/test.yml` runs `npm ci`, `npm run format`, `npm run lint`,
`npm run typecheck`, `npm test`, and `npm run build` on every push. It is the
gate that keeps `main` green; make it a **required status check** in branch
protection so untested code can't merge.
`.github/workflows/publish.yml` is now a desktop packaging and release workflow.
On pushes to `main` it builds Linux, Windows, and macOS artifacts, then creates a
draft GitHub Release when `package.json` has a version without a matching
`v<version>` tag. It does not publish an npm package.
`.github/workflows/release-alert.yml` posts a sticky PR comment when merging
would create a new desktop release.

## Installing / re-wiring hooks

The desktop app's setup panel creates the DB and installs the Claude Code
`UserPromptSubmit` hook (`~/.claude/settings.json`) and the Codex `notify`
program (`~/.codex/config.toml`). Both point at the packaged Rudder executable in
hook mode.

Because each Conductor/git worktree is a separate checkout but `~/.claude/settings.json`
is global, hooks must not point into a throwaway checkout. Prefer the packaged app
or another stable executable path.

## Skills

### Available skills

- check-changed-folders: Run format/lint/typecheck/test/build for the package on
  the current branch and enforce `.claude/` / `.codex/` parity only when one of
  those folders changes. Use for `/check` requests and pre-PR validation. (file:
  .codex/skills/check-changed-folders/SKILL.md)
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

## Claude / Codex Folder Parity

Keep `.claude/` and `.codex/` automation instructions synchronized when either
folder changes. This rule does not apply to root instruction files:
`AGENTS.md` is the source of truth, while `CLAUDE.md` and `CODEX.md` intentionally
only point to it.

- `.claude/commands/check.md` <-> `.codex/skills/check-changed-folders/SKILL.md`
- `.claude/commands/address-pr-comments.md` <-> `.codex/skills/address-pr-comments/SKILL.md`
