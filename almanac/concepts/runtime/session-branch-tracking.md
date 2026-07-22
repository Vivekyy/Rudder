---
title: "Session Branch Tracking"
summary: "Session branch tracking is Rudder's current implemented session context: it records which agent session IDs belong to which normalized repository branches."
topics: [concepts, runtime, session-branch-tracking, product-intent]
sources:
  - id: session-tagger
    type: file
    path: src/session-tagger.ts
  - id: schema
    type: file
    path: src/db/schema.ts
  - id: readme
    type: file
    path: README.md
---

# Session Branch Tracking

Session branch tracking is Rudder's current implemented way to connect local coding-agent sessions with worktree context. It records the session source, session ID, normalized repository key, normalized branch name, and the first observation timestamp in the `session_branches` table [@session-tagger] [@schema]. The concept supports the README's proposed current-session workflow, where Rudder must know which session belongs to the active worktree before it can use session intent for test generation [@readme].

## What It Identifies

The tracked identity is a repository branch, not a prompt transcript. `resolveBranchContext()` asks Git for the worktree root and active branch, then chooses a repository key from the branch remote, `origin`, the first configured remote, or a hashed local Git common directory when no remote exists [@session-tagger]. `normalizeRepository()` collapses common Git remote forms such as SCP-style SSH, HTTPS, and `ssh://` URLs into the same host/path key [@session-tagger].

The branch value is normalized by trimming whitespace and removing a leading `refs/heads/` prefix [@session-tagger]. That lets `sessionsForBranch()` accept either a plain branch name or a full heads ref when it looks up sessions [@session-tagger].

## What It Does Not Store

Session branch tracking does not persist prompt text, model names, raw hook payloads, or local-day prompt history. The current Drizzle schema exports `sessionBranches` as the schema object, and the current session tagger APIs record associations between sessions and branches rather than prompt rows [@schema] [@session-tagger]. [Prompt History](prompt-history) remains a README-backed product concept; it is not the currently implemented database model.

## Where To Use It

Use [Session Branch Store](../../architecture/runtime/session-branch-store) for the runtime flow, [Session Branches Schema](../../reference/database/session-branches-schema) for exact table and helper contracts, and [Use Session Branch Tracking](../../guides/runtime/use-session-branch-tracking) when adding hook or tool code that needs to record or query session/branch associations.
