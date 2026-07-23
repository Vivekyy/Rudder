---
title: "Rudder Plugin Package"
summary: "The root npm package distributes Rudder as one Claude Code and Codex plugin with manifests, hooks, skill files, docs, assets, and a bundled prompt-capture hook."
topics: [architecture, tooling, package, plugin, prompt-capture, release]
sources:
  - id: package-json
    type: file
    path: package.json
  - id: claude-manifest
    type: file
    path: .claude-plugin/plugin.json
  - id: codex-manifest
    type: file
    path: .codex-plugin/plugin.json
  - id: marketplace
    type: file
    path: .claude-plugin/marketplace.json
  - id: hooks
    type: file
    path: hooks/hooks.json
  - id: hook-bin
    type: file
    path: bin/rudder-prompt-hook.ts
  - id: skill
    type: file
    path: skills/rudder/SKILL.md
  - id: plugin-tests
    type: file
    path: test/plugin-package.test.ts
  - id: install-doc
    type: file
    path: docs/install.md
  - id: publish-workflow
    type: file
    path: .github/workflows/publish.yml
---

# Rudder Plugin Package

The repository root is now the publishable Rudder plugin package. `package.json` names the package `@ruddercode/rudder-plugin`, requires Node `>=23.6.0`, and includes plugin-specific artifacts such as `.claude-plugin`, `.codex-plugin`, `assets`, `docs`, `hooks`, `skills`, and `dist` in the npm file allowlist [@package-json]. The package carries both Claude Code and Codex plugin manifests, a public marketplace catalog that points at the npm package, the Rudder skill, and a bundled prompt-capture hook [@claude-manifest] [@codex-manifest] [@marketplace] [@hooks] [@skill].

## Distribution Shape

The Claude manifest and Codex manifest share the public plugin name `rudder`, version, description, license, repository, keywords, and `./skills/` path [@claude-manifest] [@codex-manifest]. The Claude manifest also points at `./hooks/hooks.json`, while the Codex manifest carries interface metadata such as display name, short description, category, default prompt, icon, logo, privacy URL, and terms URL [@claude-manifest] [@codex-manifest].

The marketplace catalog under `.claude-plugin/marketplace.json` lists one plugin named `rudder` and resolves it from npm package `@ruddercode/rudder-plugin` version `0.1.0` on the public npm registry [@marketplace]. The install docs describe Claude Code and Codex marketplace installation separately but state that both use the same npm-backed plugin package [@install-doc].

## Bundled Hook

`hooks/hooks.json` registers command hooks for `UserPromptSubmit` and `Stop` [@hooks]. Each command executes Node with `--input-type=module`, resolves the plugin root from `PLUGIN_ROOT` or `CLAUDE_PLUGIN_ROOT`, and imports `dist/rudder-prompt-hook.mjs` from that root [@hooks]. The source executable reads JSON hook payloads from stdin, infers Codex from `PLUGIN_ROOT`, infers Claude Code from `CLAUDE_PLUGIN_ROOT`, sets `RUDDER_MIGRATIONS_PATH` to the installed `dist/drizzle` folder, records the prompt hook event, catches failures, and closes the database handle [@hook-bin].

The `build` script creates the installed hook artifact by bundling `bin/rudder-prompt-hook.ts` with esbuild for Node ESM output at `dist/rudder-prompt-hook.mjs`, then copying committed Drizzle migrations into `dist/drizzle` [@package-json]. `pretest` and `prepack` both run the build, so tests and packed artifacts use a freshly generated bundle [@package-json]. Plugin package tests enforce matching Claude/Codex metadata, required package file entries, marketplace npm source fields, hook command shape, and silent prompt-hook execution for both `PLUGIN_ROOT` and `CLAUDE_PLUGIN_ROOT` environments [@plugin-tests].

## Release Boundary

The publish workflow expects the root package name to be exactly `@ruddercode/rudder-plugin`, checks npmjs.org for the version, creates plugin tags in the `rudder-plugin-v<version>` form, and validates the package with agent layout, typecheck, tests, build, and `npm pack --dry-run` before publishing [@publish-workflow]. The release behavior is covered in [Release Automation](../release/release-automation), and the command surface is listed in [Package Scripts](../../reference/tooling/package-scripts).
