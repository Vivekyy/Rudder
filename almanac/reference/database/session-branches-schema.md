---
title: "Session Branches Schema"
summary: "The session branches schema reference defines Rudder's SQLite table, Drizzle declaration, generated migration, indexes, and public helper contracts for session-to-branch tracking."
topics: [reference, database, session-branch-tracking, runtime, sqlite]
sources:
  - id: schema
    type: file
    path: src/db/schema.ts
  - id: migration
    type: file
    path: drizzle/20260722173002_ambiguous_overlord/migration.sql
  - id: db-client
    type: file
    path: src/db/client.ts
  - id: session-tagger
    type: file
    path: src/session-tagger.ts
  - id: migration-tests
    type: file
    path: test/migrations.test.ts
---

# Session Branches Schema

The `session_branches` table is Rudder's local SQLite storage contract for session-to-branch tracking. `src/db/schema.ts` declares the table through Drizzle, the generated migration under `drizzle/` creates it at runtime, and `src/session-tagger.ts` defines the write and lookup helper contracts [@schema] [@migration] [@session-tagger]. This reference is the exact lookup companion to [Session Branch Store](../../architecture/runtime/session-branch-store), [Session Branch Tracking](../../concepts/runtime/session-branch-tracking), and the [generated migrations decision](../../decisions/database/generated-drizzle-migrations).

## Runtime Creation

`openDb()` enables `PRAGMA journal_mode = WAL`, sets `PRAGMA busy_timeout = 5000`, constructs a Drizzle client over the same `DatabaseSync` handle, and calls `migrate(orm, { migrationsFolder })` where `migrationsFolder` resolves to the repository `drizzle/` directory relative to `src/db/client.ts` [@db-client]. The migration test opens an isolated database and asserts that `session_branches` exists and that `__drizzle_migrations` contains one applied migration row [@migration-tests].

## Columns

| Column | SQLite Migration | Drizzle Declaration | Helper Field |
| --- | --- | --- | --- |
| `source` | `text NOT NULL` [@migration] | `text('source').notNull()` [@schema] | Trimmed nonblank `source` string [@session-tagger] |
| `session_id` | `text NOT NULL` [@migration] | `sessionId: text('session_id').notNull()` [@schema] | Trimmed nonblank `sessionId` string [@session-tagger] |
| `repository` | `text NOT NULL` [@migration] | `text('repository').notNull()` [@schema] | Normalized repository key [@session-tagger] |
| `branch` | `text NOT NULL` [@migration] | `text('branch').notNull()` [@schema] | Trimmed branch name without `refs/heads/` [@session-tagger] |
| `observed_at` | `text NOT NULL` [@migration] | `observedAt: text('observed_at').notNull()` [@schema] | ISO timestamp string [@session-tagger] |

## Keys And Indexes

| Object | Definition | Helper Use |
| --- | --- | --- |
| `session_branches_pk` | Primary key on `source`, `session_id`, `repository`, and `branch` [@migration] | Conflict target for `recordSessionBranch()` [@session-tagger] |
| `idx_session_branches_repository_branch` | Non-unique index on `repository`, `branch` [@migration] | Matches the `sessionsForBranch(repository, branch)` filter [@session-tagger] |

## Helper Contracts

`recordSessionBranch(input)` accepts `source`, `sessionId`, optional `cwd`, and optional `observedAt` [@session-tagger]. It records a row for the resolved repository branch and returns the stored `SessionBranchRow`; repeated writes for the same primary key update `observed_at` with the minimum of the existing and incoming timestamps [@session-tagger].

`tryRecordSessionBranch(input)` wraps `recordSessionBranch()` and returns `null` on any failure [@session-tagger]. `branchesForSession(source, sessionId)` filters by normalized source and session ID, then orders by `observedAt`, repository, and branch [@session-tagger]. `sessionsForBranch(repository, branch)` normalizes repository and branch input, filters by that pair, and orders by `observedAt`, source, and session ID [@session-tagger].

## Normalization Rules

`normalizeRepository(repository)` rejects blank input, normalizes SCP-style remotes such as `git@github.com:owner/repo.git`, normalizes URL remotes such as HTTPS and `ssh://` by lowercasing the host and using the decoded path, strips a trailing `.git`, and leaves `file:` URLs to the fallback path handling [@session-tagger]. Branch normalization trims whitespace and removes a leading `refs/heads/` prefix [@session-tagger].
