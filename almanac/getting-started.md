---
title: "Getting Started"
summary: "Getting started routes agents through Rudder's current runtime, tooling, automation, and README-backed product intent."
topics: [wiki, runtime, contributor-workflow, product-intent]
sources:
  - id: agents
    type: file
    path: AGENTS.md
  - id: package
    type: file
    path: package.json
  - id: db-client
    type: file
    path: src/db/client.ts
  - id: session-tagger
    type: file
    path: src/session-tagger.ts
  - id: telemetry
    type: file
    path: src/telemetry.ts
  - id: test-workflow
    type: file
    path: .github/workflows/test.yml
  - id: readme
    type: file
    path: README.md
  - id: agentsignore
    type: file
    path: .agentsignore
  - id: agentsignore-workflow
    type: file
    path: .github/workflows/agentsignore.yml
---

# Getting Started

Getting started is the entry point for reading Rudder's wiki as a future coding agent. Start from the current implementation and the current product intent: the source tree contains session branch tracking, generated database migrations, and telemetry runtime code; the package and automation files define validation and release behavior; and the README describes the proposed intent-driven test-generation product [@session-tagger] [@db-client] [@telemetry] [@package] [@test-workflow] [@readme]. The repository instructions describe Rudder as an experimental pre-release product, so future work should not revive the removed empty-skeleton policy or assume compatibility migrations for existing users are required [@agents].

## Start With Current Surfaces

Use the implementation-backed pages first when a task touches existing code. [Local State](architecture/runtime/local-state), [Session Branch Store](architecture/runtime/session-branch-store), [Telemetry](architecture/runtime/telemetry), [Package Baseline](architecture/tooling/package-baseline), and [Contributor Automation](architecture/automation/contributor-automation) explain the current runtime and automation surfaces.

Protected files are a separate agent-safety boundary. Start with [Protected Paths](reference/contributor/protected-paths) when a task touches root documentation, assets, or agent instructions, because `.agentsignore` protects `README.md`, `LICENSE`, `CLAUDE.md`, and `assets/`; the pull-request workflow fails changes still protected by the head rules and reports base-only protection matches as explicit relaxations [@agentsignore] [@agentsignore-workflow].

## Runtime State And Sessions

The current runtime code is small but real. `rudderHome()` resolves `RUDDER_HOME` or falls back to `~/.rudder`, `dbPath()` stores `rudder.db` under that root, and `openDb()` creates the directory, enables SQLite WAL mode, sets a 5000 ms busy timeout, applies generated Drizzle migrations, and initializes Drizzle over the same SQLite client [@db-client]. Start with [Local State](architecture/runtime/local-state) for the state-root model, then read [Session Branch Store](architecture/runtime/session-branch-store) and [Session Branches Schema](reference/database/session-branches-schema) when working with implemented session/worktree persistence.

Telemetry uses the same local-state root for its anonymous identity file. It creates a PostHog client only when `POSTHOG_API_KEY` is set and `DO_NOT_TRACK` is not `1`, and its capture helpers become no-ops when the client is unavailable [@telemetry]. Read [Telemetry](architecture/runtime/telemetry) with [Environment Variables](reference/configuration/environment-variables) before changing event capture, opt-out behavior, identity storage, or shutdown behavior.

Use [Use Session Branch Tracking](guides/runtime/use-session-branch-tracking) when code needs to record or query the repository branches associated with an agent session. That guide covers the safe calling sequence around `RUDDER_HOME`, Git branch resolution, best-effort hook capture, and the two lookup directions.

## Tooling, Checks, And Automation

Rudder is packaged as `@ruddercode/rudder-core`, uses ESM, requires Node `>=23.6.0`, and validates with `typecheck`, `test`, `build`, and `prepublishOnly` scripts in `package.json` [@package]. [Package Baseline](architecture/tooling/package-baseline) explains the package shape; [Package Scripts](reference/tooling/package-scripts) and [TypeScript Build](reference/tooling/typescript-build) give the exact command and compiler references.

For branch validation, start with [Run Checks](guides/contributor/run-checks). The local check flow mirrors the package scripts, and the GitHub test workflow runs Node 24, `npm ci`, `npm run typecheck`, `npm test`, and `npm run build` on pushes and manual dispatch [@test-workflow]. [Contributor Automation](architecture/automation/contributor-automation), [Address PR Comments](guides/contributor/address-pr-comments), and [GitHub Workflows](reference/automation/github-workflows) cover the surrounding PR and automation surfaces.

## Releases

Release work starts from the package version. The manifest stores the current package name and version [@package]. Use [Prepare Package Release](guides/release/prepare-package-release) for the release task, then read [Release Automation](architecture/release/release-automation) and [Tag-Gated Publishing](decisions/release/tag-gated-publishing) for the workflow and decision details.

## Product Intent

The README describes Rudder's proposed product as intent-driven test generation: it uses prompts from the current coding-agent session plus worktree changes to generate focused unit tests, run repository test and coverage tools, and ask follow-up questions until a coverage target is reached [@readme]. Read [Intent-Driven Test Generation](concepts/product/intent-driven-test-generation), [Test Intent Standards](concepts/product/test-intent-standards), and [BYOK Skill Workflow](decisions/product/byok-skill-workflow) before making product-shaping changes. [Prompt History](concepts/runtime/prompt-history) is README-backed product intent, while [Session Branch Tracking](concepts/runtime/session-branch-tracking) is the implemented session/worktree association model [@readme] [@session-tagger].

## Common Starting Points

| Task | Start Here |
| --- | --- |
| Change package, tooling, automation, or runtime foundations | [Change Shared Infrastructure](guides/contributor/change-shared-infrastructure) |
| Check protected agent paths | [Protected Paths](reference/contributor/protected-paths) |
| Work with local database state | [Local State](architecture/runtime/local-state) |
| Record or query session branch associations | [Use Session Branch Tracking](guides/runtime/use-session-branch-tracking) |
| Change telemetry behavior | [Telemetry](architecture/runtime/telemetry) |
| Validate a branch | [Run Checks](guides/contributor/run-checks) |
| Prepare a release | [Prepare Package Release](guides/release/prepare-package-release) |
| Understand the proposed product | [Intent-Driven Test Generation](concepts/product/intent-driven-test-generation) |
| Verify wiki maintenance | [CodeAlmanac Maintenance](reference/wiki/codealmanac-maintenance) |
