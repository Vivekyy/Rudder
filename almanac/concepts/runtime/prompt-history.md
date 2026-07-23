---
title: "Prompt History"
summary: "Prompt history is Rudder's local prompt text context for intent-driven test generation, stored per agent prompt and reconciled to the active Git branch."
topics: [concepts, product-intent, prompt-history, prompt-capture]
sources:
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
  - id: context-script
    type: file
    path: skills/rudder/scripts/context.mjs
  - id: readme
    type: file
    path: README.md
---

# Prompt History

Prompt history is Rudder's local record of prompt text that can explain user intent for generated tests. The README says coding-session prompts and follow-up answers can name expected behavior, edge cases, and tradeoffs that never appear in code diffs [@readme]. The implemented runtime now stores submitted prompt text in `prompt_branches`, associates each prompt with source/session/prompt IDs, repository, branch, and timestamps, and exposes lookup helpers for session and branch context [@schema] [@prompt-tagger].

## Product Meaning

The README describes Rudder as running inside the same coding-agent session where the feature was built, using that session context plus worktree changes to create tests for new production code [@readme]. In that product model, prompt history is behavioral evidence: it carries the user's stated expectations and the answers to later clarification questions [@readme].

The current implementation gives the [Rudder Skill Runtime](../../architecture/runtime/rudder-skill-runtime) local prompt context for that model. The skill still asks the host coding agent to reason about behavior, inspect tests, generate new tests, and interpret coverage; prompt history is evidence for those steps, not an automatic test oracle [@context-script].

## Capture Model

Prompt capture starts from coding-agent hooks. `recordPromptHookEvent()` normalizes Claude Code, Codex, and Cursor payloads, records prompt text on submit events, and reconciles the prompt to the active branch on stop events [@prompt-hook]. `recordPromptBranch()` writes the submitted prompt with the branch active before the turn runs, while `reconcilePromptBranch()` updates the row to the branch active after the turn and sets `reconciled_at` [@prompt-tagger].

Prompt capture can be disabled before a write. `promptCaptureDisabled()` returns true when `RUDDER_DISABLE_PROMPT_CAPTURE` is exactly `1` or when the `prompt-capture-disabled` marker exists under the Rudder home directory [@prompt-control].

## Working Implication

When updating the product workflow, treat prompt history as local and branch-scoped. `skills/rudder/scripts/context.mjs` reads prompts for the resolved repository and branch from `prompt_branches` and returns them beside the branch diff, so the skill can combine implementation changes with user-stated intent [@context-script]. Use [Prompt Branch Store](../../architecture/runtime/prompt-branch-store), [Prompt Branches Schema](../../reference/database/prompt-branches-schema), and [Use Prompt Capture](../../guides/runtime/use-prompt-capture) for current implementation work.
