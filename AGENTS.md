# Working in this repo

This is an experimental, pre-release product repo. Do not worry about things like
backwards compatibility, migrating functionality for existing users, etc.

## Infrastructure

- `.github/workflows/` retains CI and release automation.
- `.claude/commands/` and `.codex/skills/` retain contributor workflows.
- `package.json`, `package-lock.json`, and TypeScript configuration retain the
  package/tooling baseline.

Run `npm run typecheck`, `npm test`, and `npm run build` before changing shared
infrastructure. Use gitmoji in commit messages and PR titles.

Before editing files, read `.agentsignore` and never modify any files at paths 
matched by its gitignore-style patterns.
