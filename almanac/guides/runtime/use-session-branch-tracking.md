---
title: "Use Session Branch Tracking"
summary: "Use session branch tracking explains how to record and query Rudder's session-to-branch associations safely from runtime or hook code."
topics: [guides, runtime, session-branch-tracking, database]
sources:
  - id: package
    type: file
    path: package.json
  - id: src-index
    type: file
    path: src/index.ts
  - id: db-index
    type: file
    path: src/db/index.ts
  - id: client
    type: file
    path: src/db/client.ts
  - id: session-tagger
    type: file
    path: src/session-tagger.ts
  - id: session-tests
    type: file
    path: test/session-tagger.test.ts
---

# Use Session Branch Tracking

Use session branch tracking when runtime or hook code needs to associate a coding-agent session ID with the active Git repository branch. The package root exports the database helpers and session tagger APIs, and `src/db/index.ts` now re-exports the database client and schema modules only [@package] [@src-index] [@db-index]. The implementation details are covered by [Session Branch Store](../../architecture/runtime/session-branch-store), [Local State](../../architecture/runtime/local-state), [Session Branches Schema](../../reference/database/session-branches-schema), and [Environment Variables](../../reference/configuration/environment-variables).

## Set Runtime State First

Set `RUDDER_HOME` before the first database-backed helper call when the process needs an isolated store. `rudderHome()` reads `RUDDER_HOME` or falls back to `~/.rudder`, and `dbPath()` appends `rudder.db` under that directory [@client]. `openDb()` caches the SQLite and Drizzle handles in module-level singletons, so changing `RUDDER_HOME` after the first open does not move the already-open database [@client].

The first open creates the Rudder home directory, opens Node's SQLite driver, enables WAL mode, sets a 5000 ms SQLite busy timeout, and applies generated Drizzle migrations before assigning the singleton handles [@client]. Use `closeDb()` in tests or short-lived processes that need to release the cached handles and restore environment variables cleanly [@client] [@session-tests].

## Record The Current Branch

Use `recordSessionBranch()` when failure to resolve Git context should fail the caller. The helper trims and validates `source` and `sessionId`, resolves the repository and branch from `cwd` or `process.cwd()`, stores `observedAt` as an ISO timestamp, and returns the stored row [@session-tagger].

```ts
import { recordSessionBranch } from '@ruddercode/rudder-core';

const row = recordSessionBranch({
  source: 'codex',
  sessionId: 'session-123',
  cwd: process.cwd(),
});
```

Use `tryRecordSessionBranch()` from hooks that should keep running outside a Git repository or on a detached `HEAD`. It returns the stored row on success and `null` when recording fails [@session-tagger]. Tests enforce that the best-effort helper ignores a non-Git directory without writing a session row [@session-tests].

## Query Associations

Use `branchesForSession(source, sessionId)` when starting from an agent session and looking for the repository branches where it has been observed. Results are ordered by first observation time, repository, and branch [@session-tagger].

```ts
import { branchesForSession } from '@ruddercode/rudder-core';

const branches = branchesForSession('codex', 'session-123');
```

Use `sessionsForBranch(repository, branch)` when starting from worktree context and looking for sessions associated with that branch. The helper normalizes repository URLs and strips a leading `refs/heads/` prefix from branch input before querying [@session-tagger].

```ts
import { sessionsForBranch } from '@ruddercode/rudder-core';

const sessions = sessionsForBranch(
  'https://github.com/rudder-test/example.git',
  'refs/heads/feature/session-list'
);
```

Tests cover the expected lookup behavior: repeated writes for the same session/branch preserve the earliest `observedAt`, sessions on another branch do not appear in branch results, and common Git remote forms normalize to the same repository key [@session-tests].
