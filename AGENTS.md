# Working in this repo

Rudder is intentionally an empty application skeleton. Keep runtime source,
tests, generated migrations, bundled skills, and frontend code out of the
repository until the new product design is established. Retain only base DB and
telemetry infrastructure.

## Infrastructure

- `.github/workflows/` retains CI and release automation.
- `.claude/commands/` and `.codex/skills/` retain contributor workflows.
- `package.json`, `package-lock.json`, and TypeScript configuration retain the
  package/tooling baseline.

Run `npm run typecheck`, `npm test`, and `npm run build` before changing shared
infrastructure. Use gitmoji in commit messages and PR titles.

Before editing files, read `.agentsignore` and never modify any files at paths 
matched by its gitignore-style patterns.
