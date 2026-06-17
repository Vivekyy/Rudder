See [AGENTS.md](./AGENTS.md) for development, pull request, and npm publishing
instructions. It is the single source of truth for how to work in this repo.

Quick reference:

- Run `/check` (or `npm run typecheck`, `npm test`, `npm run build`) before committing.
- Branch off `main`; never commit directly to `main`.
- Bump the version in the same PR as a user-facing change
  (`npm version patch --no-git-tag-version`).
- After opening a PR, use `/address-pr-comments` to triage review feedback.
- **Publishing is tag-triggered.** After the version-bump PR merges to `main`,
  push a matching `v*` tag (`git tag v<version> && git push --follow-tags`) to
  fire `.github/workflows/publish.yml`, which publishes to npm via OIDC.
- Path-resolving code must work in both the `.ts` dev tree and the compiled
  `.js` under `dist/` — see the `rudderArgv()` note in AGENTS.md.

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
