See [AGENTS.md](./AGENTS.md) for development, pull request, and desktop packaging
instructions. It is the single source of truth for how to work in this repo.

Quick reference:

- Run `/check` (or `npm run typecheck`, `npm test`, `npm run build`) before committing.
- Branch off `main`; never commit directly to `main`.
- After opening a PR, use `/address-pr-comments` to triage review feedback.
- `.github/workflows/publish.yml` builds desktop artifacts on `main`; it no longer
  publishes the npm package.
- Hook path code must work for both the legacy CLI and the packaged Electron app.
  See the `rudderArgv()` / `electronHookArgv()` notes in AGENTS.md.
- The dashboard and the digest read the **same** per-prompt tags
  (`prompt_tags` / `statsForDay`), so their numbers always agree. Tagging is
  out-of-band (never in the capture hook) and uses the shared rubric in
  `classify.ts`. Bump `TAGGER_VERSION` to re-tag history. See the "Stats pipeline"
  section in AGENTS.md.

## Slash commands

- `/check` (`.claude/commands/check.md`) — run the package checks and enforce
  Claude/Codex sync; mirrors the `check-changed-folders` Codex skill.
- `/address-pr-comments` (`.claude/commands/address-pr-comments.md`) — fetch and
  remediate open PR review comments; mirrors the `address-pr-comments` Codex skill.

## Gitmoji

Use [gitmoji](https://gitmoji.dev/) in all commit messages and PR titles, picking
the most specific emoji. Note `:zap:` (new features) and `:sparkles:` (performance)
are swapped from the standard guide. See the table in [AGENTS.md](./AGENTS.md#gitmoji).

## Claude / Codex parity

Any change to a Claude-side file (`CLAUDE.md`, `.claude/`) must be mirrored on the
Codex side (`AGENTS.md`, `.codex/`) in the same PR, and vice versa:

- `CLAUDE.md` <-> `AGENTS.md`
- `.claude/commands/check.md` <-> `.codex/skills/check-changed-folders/SKILL.md`
- `.claude/commands/address-pr-comments.md` <-> `.codex/skills/address-pr-comments/SKILL.md`
