---
title: "Package Scripts Reference"
summary: "This reference documents Rudder's npm scripts and the automation paths that call them."
topics: [reference, tooling, package, validation]
sources:
  - id: package-json
    type: file
    path: package.json
  - id: db-client
    type: file
    path: src/db/client.ts
  - id: test-workflow
    type: file
    path: .github/workflows/test.yml
  - id: check-skill
    type: file
    path: .agents/skills/check-changed-folders/SKILL.md
---

This reference lists the npm scripts defined by Rudder's package and the local or CI automation that reuses them. The scripts are the package-level command contract for typechecking, testing, building, database migration generation, and the prepublish gate [@package-json]. The [package baseline](../../architecture/tooling/package-baseline) explains how that contract fits the repository.

## Script Table

| Script | Command | Purpose |
| --- | --- | --- |
| `db:generate` | `drizzle-kit generate` | Runs Drizzle Kit's generate command [@package-json]. |
| `format:markdown` | `rumdl fmt` | Formats Markdown files [@package-json]. |
| `format:markdown:check` | `rumdl fmt --check` | Checks Markdown formatting without applying changes [@package-json]. |
| `danger:ci` | `danger ci --failOnErrors` | Runs Danger with failing errors for CI agent-guard enforcement [@package-json]. |
| `check:agent-layout` | `test -L .claude/skills && test -L .codex/skills && test .claude/skills -ef .agents/skills && test .codex/skills -ef .agents/skills && test ! -e .claude/commands && grep -Fxq '@AGENTS.md' CLAUDE.md` | Verifies Claude/Codex skill symlinks, absence of Claude command aliases, and the `CLAUDE.md` handoff [@package-json]. |
| `typecheck` | `tsc --noEmit` | Runs TypeScript checking without writing build output [@package-json]. |
| `build` | `rm -rf dist && esbuild bin/rudder-prompt-hook.ts --bundle --platform=node --format=esm --target=node23 --outfile=dist/rudder-prompt-hook.mjs && cp -R drizzle dist/drizzle` | Removes old `dist` output, bundles the prompt hook for Node ESM, then copies generated Drizzle migrations into the package build tree [@package-json]. |
| `pretest` | `npm run build` | Rebuilds the hook bundle before tests [@package-json]. |
| `test` | `node --test` | Runs Node's built-in test runner [@package-json]. |
| `prepack` | `npm run build` | Rebuilds package artifacts before `npm pack` [@package-json]. |
| `prepublishOnly` | `npm run typecheck && npm test` | Runs typecheck and the test lifecycle before publishing; `npm test` invokes `pretest`, so the bundle is rebuilt before the test suite [@package-json]. |

## Automation Consumers

The Test workflow installs dependencies with `npm ci`, then runs `npm run check:agent-layout`, `npm run format:markdown:check`, `npm run typecheck`, `npm test`, and `npm run build` in that order [@test-workflow]. The local check skill runs `npm run typecheck`, `npm test`, and `npm run build` after enforcing the centralized agent-instruction layout, verifying agent attribution, and installing dependencies when `node_modules/` is missing [@check-skill].

`prepublishOnly` relies on the npm test lifecycle for the build, and `prepack` rebuilds again before packaging [@package-json]. The `build` copy step is part of the database runtime contract because the installed prompt hook points `RUDDER_MIGRATIONS_PATH` at `dist/drizzle`; the decision is recorded in [Generated Drizzle Migrations](../../decisions/database/generated-drizzle-migrations) [@db-client]. The release workflow behavior is covered from the GitHub Actions side in the [GitHub Workflows](../automation/github-workflows) reference, release preparation is covered in [Prepare Package Release](../../guides/release/prepare-package-release), and the contributor-facing procedure is covered in [Run Checks](../../guides/contributor/run-checks).

## Change Surface

Changes to `typecheck`, `test`, or `build` affect local checks, the Test workflow, and package publication [@package-json] [@test-workflow] [@check-skill]. Changes to `build` can also affect runtime prompt capture if packaged output no longer includes `dist/rudder-prompt-hook.mjs` or `dist/drizzle` [@package-json]. Changes to `db:generate` affect migration-generation work and should be checked against the runtime migration decision [@package-json].
