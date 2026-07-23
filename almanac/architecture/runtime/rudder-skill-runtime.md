---
title: "Rudder Skill Runtime"
summary: "The Rudder skill uses small local helper scripts for context gathering, exact-path test backups, and prompt-data controls while the host coding agent does the reasoning and test generation."
topics: [architecture, runtime, plugin, prompt-capture, test-generation-intent]
sources:
  - id: skill
    type: file
    path: skills/rudder/SKILL.md
  - id: context-script
    type: file
    path: skills/rudder/scripts/context.mjs
  - id: backup-script
    type: file
    path: skills/rudder/scripts/backup-tests.mjs
  - id: data-script
    type: file
    path: skills/rudder/scripts/manage-data.mjs
  - id: openai-surface
    type: file
    path: skills/rudder/agents/openai.yaml
  - id: skill-tests
    type: file
    path: test/skill-runtime.test.ts
---

# Rudder Skill Runtime

The Rudder skill runtime is the local helper layer behind the installed `$rudder` workflow. `skills/rudder/SKILL.md` tells the current coding agent to derive tests from captured intent and branch changes, while three executable scripts handle deterministic context, backup, and data-control operations [@skill] [@context-script] [@backup-script] [@data-script]. This preserves the [BYOK Skill Workflow](../../decisions/product/byok-skill-workflow): the user's current agent reasons about behavior and writes tests, while local scripts do repeatable filesystem, Git, and SQLite work [@skill].

## Context Helper

`scripts/context.mjs` resolves the repository root from `--cwd`, requires an attached Git branch, chooses a base ref from `--base` or common `origin/main` and `master` fallbacks, calculates the merge base, and returns changed tracked and untracked paths as JSON [@context-script]. It classifies likely test paths using directory and filename conventions, leaves all other changed paths in `otherPaths`, normalizes the repository key from the active branch remote or a hashed local Git common directory, and reads matching prompts from `prompt_branches` in the local Rudder database when that table exists [@context-script].

The skill treats this JSON as input, not as final judgment. It instructs the agent to inspect the merge base, changed paths, captured prompts, repository instructions, production diff, existing tests, and native test/coverage configuration before deciding which test changes matter [@skill].

## Backup Helper

`scripts/backup-tests.mjs` creates recoverable backups for explicit test paths before any reset. It requires `--cwd`, verifies the base ref, computes the merge base, requires at least one `--path`, normalizes each path to stay inside the repository, writes a binary-capable patch for tracked changes, copies listed untracked paths into the backup directory, and emits backup metadata as JSON [@backup-script].

The skill boundary is stricter than the helper's write behavior. The skill requires the agent to show the exact tracked and untracked test paths, get explicit confirmation, run the backup helper for only those paths, verify the reported patch and untracked copies, and then restore only the confirmed test paths to the merge-base state [@skill]. It forbids `git reset --hard`, broad `git clean`, production-code changes, coverage-configuration changes, and repository-threshold changes during generation [@skill].

## Data Controls

`scripts/manage-data.mjs` is the skill's local privacy-control entrypoint. It reports capture status and prompt count, writes or removes the persistent `prompt-capture-disabled` marker for disable/enable, and deletes prompt rows only when invoked as `delete --confirm` [@data-script]. Confirmed deletion enables SQLite secure deletion, deletes rows from `prompt_branches`, truncates WAL, vacuums the database, and returns the resulting status [@data-script].

The skill handles data-control requests separately from test generation. It instructs the agent to use `manage-data.mjs` for status, disable, enable, or delete requests, explain the effect of disabling and deletion, avoid deletion without an explicit request, and stop after completing the data-control task [@skill].

## Validation Contract

`test/skill-runtime.test.ts` exercises the three helper boundaries together: disabled capture blocks prompt writes, the context helper returns branch changes and locally captured prompt text, the backup helper backs up only explicit test paths, and the data helper requires confirmation before deleting prompt rows [@skill-tests]. The OpenAI surface file gives Codex a display name, short description, and default prompt for the same skill package [@openai-surface].
