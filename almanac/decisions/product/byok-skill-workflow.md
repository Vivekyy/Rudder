---
title: "BYOK Skill Workflow"
summary: "Rudder's product direction is to guide the user's current coding agent with a local skill workflow instead of making separate model calls itself."
topics: [decisions, product-intent]
sources:
  - id: product-readme
    type: file
    path: README.md
  - id: skill
    type: file
    path: skills/rudder/SKILL.md
  - id: plugin-package
    type: file
    path: package.json
  - id: context-script
    type: file
    path: skills/rudder/scripts/context.mjs
  - id: backup-script
    type: file
    path: skills/rudder/scripts/backup-tests.mjs
---

Rudder's BYOK skill workflow decision is that test generation happens inside the user's existing coding-agent session, using that agent's configured model access and credentials, rather than through a separate Rudder-owned model call [@product-readme]. The root plugin package ships the Rudder skill and deterministic helper scripts; the skill gathers local prompt intent, inspects the worktree, confirms and backs up test resets, directs the agent to generate unit tests, runs repository tooling, measures coverage, and asks follow-up questions in the same session [@plugin-package] [@skill]. This decision ties [intent-driven test generation](../../concepts/product/intent-driven-test-generation), [test intent standards](../../concepts/product/test-intent-standards), and [prompt history](../../concepts/runtime/prompt-history) into one local workflow.

## Status

Accepted and partially implemented. The README lists "BYOK generation" as a product decision and says the user's current coding agent performs generation with the user's existing model credentials [@product-readme]. The current package implements the delivery mechanism as a local plugin skill with helper scripts for context gathering and exact-path test backups, while the host agent still owns reasoning and test generation [@plugin-package] [@skill] [@context-script] [@backup-script].

## Context

Rudder's proposed workflow depends on intent that exists in the current coding session. The README says prompts can explain wanted behavior, edge cases, and tradeoffs that do not appear in comments or commit messages, and Rudder uses that local session context to create tests for production code in the current worktree [@product-readme]. The same document says follow-up questions should stay concrete and should ask only for information the repository, implementation, existing test conventions, or current session cannot infer [@product-readme].

A separate model call would move generation away from the session that produced the implementation. The README instead places prompt reading, generated tests, coverage results, questions, and answers inside the current coding-agent session [@product-readme].

## Decision

Rudder is delivered to the user's coding agent as a skill plus deterministic local helper tools. The skill defines the workflow rules for gathering session intent, evaluating test changes, clearing the test slate, generating tests, running native tooling, measuring coverage, and asking the next question [@skill]. Local tools handle deterministic worktree, backup, and prompt-data operations, while the user's current agent handles reasoning and generation [@skill] [@context-script] [@backup-script].

## Consequences

The decision keeps generation repository- and provider-agnostic. The README says the workflow should discover and use the repository's own language, test framework, commands, and coverage tooling, and should not tie generation to one provider [@product-readme]. It also keeps every follow-up question in the session where the feature was implemented, so user answers become part of the same intent stream used for later generation passes [@product-readme]. The implemented helper layer can supply branch changes, captured prompts, and recoverable test backups, but the host agent still owns behavioral judgment and generated test edits [@context-script] [@backup-script] [@skill].

The tradeoff is that Rudder's local workflow must express instructions clearly enough for supported coding agents to execute. The helper scripts can provide repository context, prompt records, and recoverable backups, but they do not determine behavioral intent or generate tests [@context-script] [@backup-script] [@skill]. Future product work should preserve this boundary unless a later decision explicitly moves model selection or generation into Rudder itself.
