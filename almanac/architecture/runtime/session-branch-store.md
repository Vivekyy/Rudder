---
title: "Session Branch Store"
summary: "The session branch store records which coding-agent session IDs were first observed on normalized Git repository branches, using generated Drizzle migrations at database open."
topics: [architecture, runtime, session-branch-tracking, database, sqlite]
sources:
  - id: session-tagger
    type: file
    path: src/session-tagger.ts
  - id: schema
    type: file
    path: src/db/schema.ts
  - id: db-client
    type: file
    path: src/db/client.ts
  - id: migration
    type: file
    path: drizzle/20260722173002_ambiguous_overlord/migration.sql
  - id: session-tests
    type: file
    path: test/session-tagger.test.ts
  - id: migration-tests
    type: file
    path: test/migrations.test.ts
---

The session branch store is Rudder's implemented runtime bridge between a coding-agent session ID and the Git branch where that session was observed. It stores rows in the local SQLite database, keys each row by `source`, `session_id`, normalized repository, and normalized branch, and preserves the first observed timestamp when the same session/branch pair is recorded more than once [@session-tagger] [@schema]. Runtime startup applies the generated Drizzle migration before callers use the table, so the live database shape comes from committed files under `drizzle/` instead of embedded bootstrap SQL [@db-client] [@migration].

## Storage Boundary

The store depends on [Local State](local-state) for the physical database path. `openDb()` creates the Rudder home directory, opens `rudder.db`, enables WAL journaling, sets `PRAGMA busy_timeout = 5000`, wraps the `DatabaseSync` handle with Drizzle, and runs Drizzle's migrator against the repository `drizzle/` folder [@db-client]. If migration application throws, `openDb()` closes the raw SQLite handle before rethrowing, which prevents the module singleton from caching a partially initialized database [@db-client].

`src/db/schema.ts` declares the `session_branches` table with required text columns for `source`, `session_id`, `repository`, `branch`, and `observed_at` [@schema]. The generated migration creates the same table, adds a composite primary key across `source`, `session_id`, `repository`, and `branch`, and creates `idx_session_branches_repository_branch` for branch lookups [@migration] [@schema]. The exact schema contract is listed in [Session Branches Schema](../../reference/database/session-branches-schema).

## Branch Resolution

`resolveBranchContext(cwd)` resolves a portable repository/branch tuple from the current Git checkout. It canonicalizes the starting directory with `realpathSync`, asks Git for the worktree root with `rev-parse --show-toplevel`, and reads the active branch through `symbolic-ref --quiet --short HEAD` [@session-tagger]. A detached `HEAD` raises `BranchResolutionError`, and `tryRecordSessionBranch()` catches that path for hook-style callers that should continue outside normal Git branches [@session-tagger].

Repository keys prefer remotes over local filesystem identity. The resolver first checks the active branch's configured remote when it is not `.`, then falls back to `origin`, then to the first configured remote [@session-tagger]. Remote URLs are normalized by lowercasing the host, stripping leading and trailing slashes from the path, removing a trailing `.git`, and handling common HTTPS, SSH URL, and SCP-style forms [@session-tagger]. If no remote exists, the local repository key is `local:<sha256>` of the real Git common directory, which gives remote-less repositories a stable private key without storing the absolute path itself [@session-tagger].

## Writes And Reads

`recordSessionBranch(input)` validates that `source` and `sessionId` are nonblank after trimming, resolves the branch context from `input.cwd` or `process.cwd()`, normalizes `observedAt` to an ISO timestamp, and inserts the resulting row [@session-tagger]. On primary-key conflict it updates `observed_at` with SQL `min(existing, incoming)`, so repeated observations keep the earliest timestamp instead of the most recent one [@session-tagger]. The tests enforce that behavior by recording the same session three times and expecting the oldest timestamp to remain [@session-tests].

The read helpers expose the two lookup directions. `branchesForSession(source, sessionId)` returns all repository branches associated with one session, ordered by `observedAt`, repository, then branch [@session-tagger]. `sessionsForBranch(repository, branch)` normalizes the repository and branch input, then returns sessions ordered by `observedAt`, source, then session ID [@session-tagger]. Tests cover remote normalization across SCP, HTTPS, and SSH URLs, nested-directory resolution, isolation between branches, and best-effort no-op behavior outside Git repositories [@session-tests].

## Migration Contract

Generated migrations are part of the runtime contract. `test/migrations.test.ts` opens an isolated database with `RUDDER_HOME`, checks that `session_branches` exists, and verifies that Drizzle recorded one applied migration in `__drizzle_migrations` [@migration-tests]. Future schema changes need a generated migration under `drizzle/`, a matching Drizzle schema update, and updated tests that exercise the runtime open path rather than only the table declaration.
