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
  - id: claude-check
    type: file
    path: .claude/commands/check.md
  - id: codex-check
    type: file
    path: .codex/skills/check-changed-folders/SKILL.md
---

This reference lists the npm scripts defined by Rudder's package and the local or CI automation that reuses them. The scripts are the package-level command contract for typechecking, testing, building, database migration generation, and the prepublish gate [@package-json]. The [package baseline](../../architecture/tooling/package-baseline) explains how that contract fits the repository.

## Script Table

| Script | Command | Purpose |
| --- | --- | --- |
| `db:generate` | `drizzle-kit generate` | Runs Drizzle Kit's generate command [@package-json]. |
| `typecheck` | `tsc --noEmit` | Runs TypeScript checking without writing build output [@package-json]. |
| `build` | `rm -rf dist && tsc -p tsconfig.build.json && cp -R drizzle dist/drizzle` | Removes old `dist` output, emits the build with `tsconfig.build.json`, then copies generated Drizzle migrations into the published build tree [@package-json]. |
| `test` | `node --test` | Runs Node's built-in test runner [@package-json]. |
| `prepublishOnly` | `npm run typecheck && npm test && npm run build` | Chains the package validation set before publishing [@package-json]. |

## Automation Consumers

The Test workflow installs dependencies with `npm ci`, then runs `npm run typecheck`, `npm test`, and `npm run build` in that order [@test-workflow]. The local Claude `/check` command and Codex `check-changed-folders` skill run the same three package checks after enforcing Claude/Codex parity, verifying agent attribution, and installing dependencies when `node_modules/` is missing [@claude-check] [@codex-check].

`prepublishOnly` repeats the same validation set through npm script composition, so the package manifest keeps release validation aligned with local and CI validation [@package-json]. The `build` copy step is also part of the database runtime contract because the compiled database client resolves migrations relative to emitted JavaScript; the decision is recorded in [Generated Drizzle Migrations](../../decisions/database/generated-drizzle-migrations) [@db-client]. The release workflow behavior is covered from the GitHub Actions side in the [GitHub workflows reference](../automation/github-workflows), release preparation is covered in the [prepare package release guide](../../guides/release/prepare-package-release), and the contributor-facing procedure is covered in the [run checks guide](../../guides/contributor/run-checks).

## Change Surface

Changes to `typecheck`, `test`, or `build` affect three paths at once: local checks, the Test workflow, and the package prepublish gate [@package-json] [@test-workflow] [@claude-check] [@codex-check]. Changes to `build` can also affect runtime database startup if compiled output no longer includes `dist/drizzle` [@package-json]. Changes to `db:generate` affect migration-generation work and should be checked against the runtime migration decision [@package-json].
