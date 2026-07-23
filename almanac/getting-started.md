---
title: "Getting Started"
summary: "Getting started routes agents through Rudder's current plugin package, prompt-capture runtime, skill workflow, automation, release, and product-intent clusters."
topics: [wiki, runtime, contributor-workflow, product-intent, plugin, prompt-capture]
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
  - id: prompt-hook
    type: file
    path: src/prompt-hook.ts
  - id: prompt-tagger
    type: file
    path: src/prompt-tagger.ts
  - id: skill
    type: file
    path: skills/rudder/SKILL.md
  - id: telemetry
    type: file
    path: src/telemetry.ts
  - id: test-workflow
    type: file
    path: .github/workflows/test.yml
  - id: dangerfile
    type: file
    path: dangerfile.ts
  - id: readme
    type: file
    path: README.md
---

# Getting Started

Getting started is the entry point for reading Rudder's wiki as a future coding agent. Start from the current implementation and the current product intent: the repository root is the `@ruddercode/rudder-plugin` npm package, the runtime captures prompt text into a local SQLite prompt store, the installed skill uses helper scripts for context, backup, and data controls, and the README describes the intent-driven test-generation product model [@package] [@prompt-hook] [@prompt-tagger] [@skill] [@readme]. The repository instructions describe Rudder as an experimental pre-release product, so future work should not assume compatibility migrations for existing users are required [@agents].

## Start With Current Surfaces

Use implementation-backed pages first when a task touches existing code. [Rudder Plugin Package](architecture/tooling/plugin-package), [Prompt Branch Store](architecture/runtime/prompt-branch-store), [Rudder Skill Runtime](architecture/runtime/rudder-skill-runtime), [Local State](architecture/runtime/local-state), [Telemetry](architecture/runtime/telemetry), [Package Baseline](architecture/tooling/package-baseline), and [Contributor Automation](architecture/automation/contributor-automation) explain the current package, runtime, and automation surfaces.

Protected files are a separate agent-safety boundary. Start with [Protected Paths](reference/contributor/protected-paths) when a task touches root documentation, assets, or agent compatibility paths, because Danger protects `README.md`, `LICENSE`, `CLAUDE.md`, `assets/**`, `.claude/**`, `.codex/**`, and `.cursor/**` for detected agent-authored pull requests [@dangerfile].

## Runtime State And Prompts

The current runtime code is small but real. `rudderHome()` resolves `RUDDER_HOME` or falls back to `~/.rudder`, `dbPath()` stores `rudder.db` under that root, and `openDb()` creates the directory, restricts local state permissions when possible, enables SQLite WAL mode, sets a 5000 ms busy timeout, enables secure deletion, applies generated Drizzle migrations, and initializes Drizzle over the same SQLite client [@db-client]. Start with [Local State](architecture/runtime/local-state) for the state-root model, then read [Prompt Branch Store](architecture/runtime/prompt-branch-store) and [Prompt Branches Schema](reference/database/prompt-branches-schema) when working with implemented prompt/worktree persistence.

Use [Use Prompt Capture](guides/runtime/use-prompt-capture) when hook or skill code needs to record, query, disable, or delete prompt data. The hook runtime normalizes Claude Code, Codex, and Cursor submit/stop payloads, while the skill context helper reads prompt records for the active repository branch [@prompt-hook] [@skill].

Telemetry uses the same local-state root for its anonymous identity file. It creates a PostHog client only when `POSTHOG_API_KEY` is set and `DO_NOT_TRACK` is not `1`, and its capture helpers become no-ops when the client is unavailable [@telemetry]. Read [Telemetry](architecture/runtime/telemetry) with [Environment Variables](reference/configuration/environment-variables) before changing event capture, opt-out behavior, identity storage, or shutdown behavior.

## Plugin, Tooling, And Checks

Rudder is packaged as `@ruddercode/rudder-plugin`, uses ESM, requires Node `>=23.6.0`, ships Claude Code and Codex plugin manifests, and builds a bundled prompt hook plus copied Drizzle migrations under `dist` [@package]. [Rudder Plugin Package](architecture/tooling/plugin-package) explains the plugin distribution surface; [Package Scripts](reference/tooling/package-scripts) and [TypeScript And Bundle Build](reference/tooling/typescript-build) give the exact command and compiler references.

For branch validation, start with [Run Checks](guides/contributor/run-checks). The local check flow verifies the centralized `.agents/skills` layout and agent attribution before running package commands, and the GitHub test workflow runs Node 24, `npm ci`, `npm run check:agent-layout`, `npm run format:markdown:check`, `npm run typecheck`, `npm test`, and `npm run build` on pushes and manual dispatch [@test-workflow]. [Contributor Automation](architecture/automation/contributor-automation), [Address PR Comments](guides/contributor/address-pr-comments), and [GitHub Workflows](reference/automation/github-workflows) cover the surrounding PR and automation surfaces.

## Releases

Release work starts from the plugin package version. The manifest stores the current package name and version, while the workflows derive npm, tag, and GitHub Release decisions from that manifest [@package]. Use [Prepare Package Release](guides/release/prepare-package-release) for the release task, then read [Release Automation](architecture/release/release-automation) and [Artifact-Checked Plugin Publishing](decisions/release/artifact-checked-plugin-publishing) for the workflow and decision details.

## Product Intent

The README describes Rudder's product as intent-driven test generation: it uses prompts from the current coding-agent session plus worktree changes to generate focused unit tests, run repository test and coverage tools, and ask follow-up questions until a coverage target is reached [@readme]. Read [Intent-Driven Test Generation](concepts/product/intent-driven-test-generation), [Test Intent Standards](concepts/product/test-intent-standards), and [BYOK Skill Workflow](decisions/product/byok-skill-workflow) before making product-shaping changes. [Prompt History](concepts/runtime/prompt-history) is now implemented as local prompt capture that supplies branch-specific intent to the skill [@prompt-tagger] [@skill].

## Common Starting Points

| Task | Start Here |
| --- | --- |
| Change package, tooling, automation, plugin, or runtime foundations | [Change Shared Infrastructure](guides/contributor/change-shared-infrastructure) |
| Check protected agent paths or inline guards | [Protected Paths](reference/contributor/protected-paths) |
| Work with local database state | [Local State](architecture/runtime/local-state) |
| Record, query, disable, or delete prompt capture data | [Use Prompt Capture](guides/runtime/use-prompt-capture) |
| Change the installed skill workflow or helper scripts | [Rudder Skill Runtime](architecture/runtime/rudder-skill-runtime) |
| Change telemetry behavior | [Telemetry](architecture/runtime/telemetry) |
| Validate a branch | [Run Checks](guides/contributor/run-checks) |
| Prepare a release | [Prepare Package Release](guides/release/prepare-package-release) |
| Understand the product model | [Intent-Driven Test Generation](concepts/product/intent-driven-test-generation) |
| Verify wiki maintenance | [CodeAlmanac Maintenance](reference/wiki/codealmanac-maintenance) |
