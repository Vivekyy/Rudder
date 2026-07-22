---
title: "Prompt History"
summary: "Prompt history is README-backed product context for future test generation; the current runtime tracks session-to-branch associations but does not persist prompt text."
topics: [concepts, product-intent, prompt-history, session-branch-tracking]
sources:
  - id: db-index
    type: file
    path: src/db/index.ts
  - id: schema
    type: file
    path: src/db/schema.ts
  - id: session-tagger
    type: file
    path: src/session-tagger.ts
  - id: readme
    type: file
    path: README.md
---

# Prompt History

Prompt history is the README-backed product input that would let Rudder generate tests from user intent expressed during a coding-agent session. The proposed workflow says prompts and follow-up answers explain expected behavior, edge cases, and tradeoffs that may not appear in code diffs [@readme]. The current runtime does not persist prompt text; it stores [session branch tracking](session-branch-tracking) rows that associate a session ID with a normalized repository branch [@schema] [@session-tagger].

## Product Meaning

The README describes Rudder as running inside the same coding-agent session where the feature was built, using that session context plus worktree changes to create tests for new production code [@readme]. In that product model, prompt history is behavioral evidence: it carries the user's stated expectations and the answers to later clarification questions [@readme].

This concept should therefore be read as product intent, not as an implemented prompt database. [Intent-Driven Test Generation](../product/intent-driven-test-generation) and [Test Intent Standards](../product/test-intent-standards) define how prompt history is expected to matter once the workflow can gather it.

## Current Runtime Boundary

The implemented database schema currently exports `sessionBranches`, not a prompt table [@schema]. The database index module re-exports only the client helpers and schema metadata, while the package root also exports the session tagger APIs [@db-index] [@session-tagger]. The concrete implemented capability is to record and query which sessions were observed on which repository branches, not to read back prompt text by day or source [@session-tagger].

The distinction matters for future product work. Code that needs the current implemented session context should use [Session Branch Store](../../architecture/runtime/session-branch-store), [Session Branches Schema](../../reference/database/session-branches-schema), and [Use Session Branch Tracking](../../guides/runtime/use-session-branch-tracking). Code that needs prompt text capture still needs a new implementation and should not assume an insert or day-query helper already exists.

## Working Implication

When updating the product workflow, keep implemented session association separate from future prompt history capture. Session branch tracking can answer "which branch was this session on?" [@session-tagger]. The proposed prompt-history capability must answer "what intent did the user express in that session?" [@readme]. Those are related inputs to the README workflow, but only the branch association is implemented in the current code.
