---
title: "Prompt Branch Store"
summary: "The prompt branch store records captured prompt text and reconciles each prompt to the normalized Git branch active after its agent turn."
topics: [architecture, runtime, prompt-capture, prompt-history, database, sqlite]
sources:
  - id: db-client
    type: file
    path: src/db/client.ts
  - id: schema
    type: file
    path: src/db/schema.ts
  - id: prompt-tagger
    type: file
    path: src/prompt-tagger.ts
  - id: prompt-hook
    type: file
    path: src/prompt-hook.ts
  - id: prompt-control
    type: file
    path: src/prompt-control.ts
  - id: git-context
    type: file
    path: src/git-context.ts
  - id: prompt-migration
    type: file
    path: drizzle/20260722200723_prompt-branch-links/migration.sql
  - id: prompt-tests
    type: file
    path: test/prompt-tagger.test.ts
  - id: hook-tests
    type: file
    path: test/prompt-hook.test.ts
  - id: skill-tests
    type: file
    path: test/skill-runtime.test.ts
---

# Prompt Branch Store

The prompt branch store is Rudder's implemented local intent store. It records submitted prompt text together with agent source, session ID, prompt ID, normalized repository, normalized branch, submission time, and optional reconciliation time in `prompt_branches` [@schema] [@prompt-tagger]. The store exists so the installed [Rudder plugin package](../tooling/plugin-package) and [Rudder skill runtime](rudder-skill-runtime) can give the current coding agent branch-specific prompt context for [Prompt History](../../concepts/runtime/prompt-history) without calling a separate model service [@prompt-hook] [@skill-tests].

## Storage Boundary

The store uses the same [Local State](local-state) database path as the rest of the runtime. `openDb()` resolves `RUDDER_HOME` or `~/.rudder`, creates the state directory with mode `0700`, opens `rudder.db`, restricts the database file to mode `0600` when the filesystem supports it, enables WAL, sets a 5000 ms busy timeout, enables SQLite secure deletion, and applies committed Drizzle migrations before exposing the cached handles [@db-client]. `RUDDER_MIGRATIONS_PATH` can override the migration folder, which lets the bundled plugin hook point the migrator at `dist/drizzle` inside an installed package [@db-client].

`src/db/schema.ts` declares only the `prompt_branches` table in the exported schema object [@schema]. The prompt migration creates that table, adds indexes for repository/branch and source/session lookups, and drops the older `session_branches` table [@prompt-migration]. The exact table contract is listed in [Prompt Branches Schema](../../reference/database/prompt-branches-schema).

## Hook Lifecycle

`recordPromptHookEvent(source, payload)` is the hook-facing entrypoint. It first checks `promptCaptureDisabled()`, then normalizes Claude Code, Codex, or Cursor hook payloads into a shared shape [@prompt-hook] [@prompt-control]. `UserPromptSubmit` and `beforeSubmitPrompt` events become prompt submission events, while `Stop` becomes reconciliation [@prompt-hook].

On submit, `recordPromptBranch()` resolves the current repository and branch, validates nonblank source/session/prompt text, generates a UUID prompt ID when the provider did not send one, and inserts the prompt row [@prompt-tagger] [@git-context]. On conflict for the same source/session/prompt ID, it updates prompt text and keeps the earliest `submitted_at` value [@prompt-tagger]. On stop, `reconcilePromptBranch()` updates the row to the branch active after the turn and fills `reconciled_at`; when no prompt ID is available, it targets the latest unreconciled prompt for that source/session pair [@prompt-tagger]. Tests cover branch movement after a prompt creates a feature branch and the fallback to the latest unreconciled prompt [@prompt-tests].

## Query And Controls

The read paths are `promptsForSession(source, sessionId)` and `promptsForBranch(repository, branch)` [@prompt-tagger]. Session lookup orders prompts by submission time and prompt ID, while branch lookup normalizes repository and branch input before ordering by submission time, source, session ID, and prompt ID [@prompt-tagger].

Prompt capture is optional metadata. `promptCaptureDisabled()` returns true when `RUDDER_DISABLE_PROMPT_CAPTURE` is exactly `1` or when `<rudderHome()>/prompt-capture-disabled` exists [@prompt-control]. `setPromptCaptureEnabled(false)` writes that marker, and `setPromptCaptureEnabled(true)` removes it [@prompt-control]. The skill-runtime tests verify that both the environment variable and the preference marker prevent prompt rows from being stored [@skill-tests].

## Failure Boundary

The hook executable must not interrupt the host agent. `bin/rudder-prompt-hook.ts` catches all errors, closes cached database handles in `finally`, and prints no output when it succeeds or when Git context is unavailable [@hook-tests]. That behavior matters because prompt-submit hook stdout can become model-visible context in host agents, so Rudder's prompt capture path is deliberately silent [@hook-tests].
