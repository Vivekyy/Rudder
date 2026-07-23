---
title: "Prompt Branches Schema"
summary: "The prompt branches schema reference defines Rudder's local prompt table, Drizzle declaration, migration, indexes, hook normalization, and helper contracts."
topics: [reference, database, prompt-capture, prompt-history, runtime, sqlite]
sources:
  - id: schema
    type: file
    path: src/db/schema.ts
  - id: prompt-migration
    type: file
    path: drizzle/20260722200723_prompt-branch-links/migration.sql
  - id: db-client
    type: file
    path: src/db/client.ts
  - id: prompt-tagger
    type: file
    path: src/prompt-tagger.ts
  - id: prompt-hook
    type: file
    path: src/prompt-hook.ts
  - id: prompt-control
    type: file
    path: src/prompt-control.ts
  - id: migrations-test
    type: file
    path: test/migrations.test.ts
  - id: prompt-tests
    type: file
    path: test/prompt-tagger.test.ts
---

# Prompt Branches Schema

The `prompt_branches` table is Rudder's SQLite storage contract for captured prompt intent. Drizzle declares the table in `src/db/schema.ts`, the generated migration under `drizzle/` creates it at runtime, and `src/prompt-tagger.ts` defines the write, reconciliation, and lookup helper contracts [@schema] [@prompt-migration] [@prompt-tagger]. This reference is the exact lookup companion to [Prompt Branch Store](../../architecture/runtime/prompt-branch-store), [Prompt History](../../concepts/runtime/prompt-history), and the [generated migrations decision](../../decisions/database/generated-drizzle-migrations).

## Runtime Creation

`openDb()` enables WAL, sets `PRAGMA busy_timeout = 5000`, enables `PRAGMA secure_delete = ON`, constructs a Drizzle client over the same `DatabaseSync` handle, and runs `migrate(orm, { migrationsFolder })` before caching the handles [@db-client]. The migration test opens a new database and asserts that `prompt_branches` is the live prompt/session table and that Drizzle recorded two applied migrations [@migrations-test].

## Columns

| Column | SQLite Migration | Drizzle Declaration | Helper Field |
| --- | --- | --- | --- |
| `source` | `text NOT NULL` [@prompt-migration] | `text('source').notNull()` [@schema] | Trimmed nonblank source such as `claude-code`, `codex`, or `cursor` [@prompt-hook] [@prompt-tagger]. |
| `session_id` | `text NOT NULL` [@prompt-migration] | `sessionId: text('session_id').notNull()` [@schema] | Trimmed nonblank agent session ID [@prompt-hook] [@prompt-tagger]. |
| `prompt_id` | `text NOT NULL` [@prompt-migration] | `promptId: text('prompt_id').notNull()` [@schema] | Provider prompt key or generated UUID when missing [@prompt-hook] [@prompt-tagger]. |
| `prompt_text` | `text NOT NULL` [@prompt-migration] | `promptText: text('prompt_text').notNull()` [@schema] | Submitted prompt text; blank text is rejected [@prompt-tagger]. |
| `repository` | `text NOT NULL` [@prompt-migration] | `text('repository').notNull()` [@schema] | Normalized repository key [@prompt-tagger]. |
| `branch` | `text NOT NULL` [@prompt-migration] | `text('branch').notNull()` [@schema] | Normalized branch name [@prompt-tagger]. |
| `submitted_at` | `text NOT NULL` [@prompt-migration] | `submittedAt: text('submitted_at').notNull()` [@schema] | ISO submission timestamp [@prompt-tagger]. |
| `reconciled_at` | `text` [@prompt-migration] | `reconciledAt: text('reconciled_at')` [@schema] | ISO stop/reconciliation timestamp or `null` [@prompt-tagger]. |

## Keys And Indexes

| Object | Definition | Helper Use |
| --- | --- | --- |
| `prompt_branches_pk` | Primary key on `source`, `session_id`, and `prompt_id` [@prompt-migration] | Conflict target for `recordPromptBranch()` [@prompt-tagger]. |
| `idx_prompt_branches_repository_branch` | Non-unique index on `repository`, `branch` [@prompt-migration] | Matches `promptsForBranch(repository, branch)` filters [@prompt-tagger]. |
| `idx_prompt_branches_session` | Non-unique index on `source`, `session_id`, `submitted_at` [@prompt-migration] | Matches session prompt lookup and ordering [@prompt-tagger]. |

## Hook Field Mapping

| Source | Session Field | Prompt Field | Submit Events |
| --- | --- | --- | --- |
| `claude-code` | `session_id` | `prompt_id` | `UserPromptSubmit` [@prompt-hook]. |
| `codex` | `session_id` | `turn_id` | `UserPromptSubmit` [@prompt-hook]. |
| `cursor` | `conversation_id` or `session_id` | `generation_id` | `beforeSubmitPrompt` [@prompt-hook]. |

The hook normalizer also accepts `Stop` as reconciliation, uses `cwd` when present, falls back to the first `workspace_roots` entry, and then falls back to the process working directory [@prompt-hook].

## Helper Contracts

`recordPromptBranch(input)` records a submitted prompt and returns the stored row. Replaying the same source/session/prompt ID updates prompt text and keeps the earliest submission time [@prompt-tagger] [@prompt-tests].

`reconcilePromptBranch(input)` updates a submitted prompt to the branch active after the agent turn. If the input omits a prompt ID, it reconciles the latest unreconciled prompt for the same source/session pair [@prompt-tagger] [@prompt-tests].

`promptsForSession(source, sessionId)` returns prompts ordered by `submittedAt` and `promptId` [@prompt-tagger]. `promptsForBranch(repository, branch)` normalizes repository and branch input, then returns branch prompts ordered by submission time, source, session ID, and prompt ID [@prompt-tagger].

`promptCaptureDisabled()` disables writes when `RUDDER_DISABLE_PROMPT_CAPTURE` is `1` or when the preference marker exists under the Rudder home directory [@prompt-control].
