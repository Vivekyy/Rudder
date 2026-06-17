# Working in this repo

Rudder records the prompts you give your AI coding assistants and turns a day's
worth of them into a readable digest. It installs hooks into Claude Code and
Codex that log each prompt to a local SQLite DB at `~/.rudder/rudder.db`.

## Layout

- `src/` — TypeScript sources (run directly via Node's type stripping in dev).
- `bin/rudder.ts` — CLI entry point.
- `dist/` — compiled output, the only code that ships (see `files` in `package.json`).
  Dev runs `bin/rudder.ts`; the published package runs `dist/bin/rudder.js`.
- `test/` — `node --test` suites.

## Local development

```
npm install        # install dev deps (typescript, @types/node, ...)
npm run typecheck   # tsc --noEmit
npm test            # node --test
npm run build       # rm -rf dist && tsc -p tsconfig.build.json
```

Always run `npm run typecheck` and `npm test` before committing. `prepublishOnly`
runs typecheck + test + build, so a broken tree cannot be published.

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

## Publishing to npm

Publishing is **tag-triggered**, not merge-triggered. `.github/workflows/publish.yml`
runs on any pushed tag matching `v*` and publishes `@vivekyy/rudder` to npm via a
**Trusted Publisher (OIDC)** — there is no `NPM_TOKEN` secret. The workflow runs
`npm ci`, `npm run typecheck`, `npm test`, then `npm publish`.

To cut a release **after the version-bump PR has merged to `main`**:

```
git checkout main && git pull
git tag v$(node -p "require('./package.json').version")   # tag must match package.json
git push --follow-tags
```

Then verify the `Publish to npm` workflow succeeded and `npm view @vivekyy/rudder version`
reflects the new release.

Notes:
- The tag must match the `version` in `package.json`. If the bump already merged,
  just tag that version — do **not** run `npm version patch` again (it would bump
  a second time).
- Tagging publishes whatever commit the tag points at, so always tag on `main`
  **after** merge, never on the feature branch.
- Trusted Publishing needs npm >= 11.5.1; the workflow upgrades npm before publishing.

## Installing / re-wiring hooks

`rudder init` creates the DB and installs the Claude Code `UserPromptSubmit` hook
(`~/.claude/settings.json`) and the Codex `notify` program (`~/.codex/config.toml`).
Both point at the absolute bin path of the rudder that ran `init`.

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
