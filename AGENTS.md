# Working in this repo

Rudder is intentionally an empty application skeleton. Keep product runtime
source, generated migrations, bundled skills, and frontend code out of the
repository until the new product design is established. Retain only base DB and
telemetry infrastructure, plus focused validation for that retained baseline.

## Infrastructure

- `.github/workflows/` retains CI and release automation.
- `.claude/commands/` and `.codex/skills/` retain contributor workflows.
- `package.json`, `package-lock.json`, and TypeScript configuration retain the
  package/tooling baseline.

Run `npm run typecheck`, `npm test`, and `npm run build` before changing shared
infrastructure. Use gitmoji in commit messages and PR titles.
