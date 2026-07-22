---
title: "BYOK Skill Workflow"
summary: "Rudder's product direction is to guide the user's current coding agent with a local skill workflow instead of making separate model calls itself."
topics: [decisions, product-intent]
sources:
  - id: product-readme
    type: file
    path: README.md
  - id: session-tagger
    type: file
    path: src/session-tagger.ts
---

Rudder's BYOK skill workflow decision is that test generation should happen inside the user's existing coding-agent session, using that agent's configured model access and credentials, rather than through a separate Rudder-owned model call [@product-readme]. The README describes the local version of Rudder as a skill-guided workflow: the skill gathers current-session intent, inspects the worktree, resets test changes, directs the agent to generate unit tests, runs repository tooling, measures coverage, and asks follow-up questions in the same session [@product-readme]. This decision ties the proposed [intent-driven test generation](../../concepts/product/intent-driven-test-generation), [test intent standards](../../concepts/product/test-intent-standards), and product [prompt history](../../concepts/runtime/prompt-history) into one workflow, while the implemented runtime currently supplies [session branch tracking](../../concepts/runtime/session-branch-tracking) for session/worktree association [@session-tagger].

## Status

Documented product direction. The README lists "BYOK generation" as a product decision and says the user's current coding agent performs generation with the user's existing model credentials [@product-readme]. It also lists "Skill-driven workflow" and "Current-session UX" as product decisions, so the decision is about provider boundary and user experience as much as model billing [@product-readme].

## Context

Rudder's proposed workflow depends on intent that exists in the current coding session. The README says prompts can explain wanted behavior, edge cases, and tradeoffs that do not appear in comments or commit messages, and Rudder uses that local session context to create tests for production code in the current worktree [@product-readme]. The same document says follow-up questions should stay concrete and should ask only for information the repository, implementation, existing test conventions, or current session cannot infer [@product-readme].

A separate model call would move generation away from the session that produced the implementation. The README instead places prompt reading, generated tests, coverage results, questions, and answers inside the current coding-agent session [@product-readme].

## Decision

Rudder will be delivered to the user's coding agent as a skill plus deterministic local helper tools. The skill defines the workflow rules for gathering session intent, evaluating test changes, clearing the test slate, generating tests, running native tooling, measuring coverage, and asking the next question [@product-readme]. Local tools handle deterministic worktree and session-data operations, while the user's current agent handles reasoning and generation [@product-readme].

## Consequences

The decision keeps generation repository- and provider-agnostic. The README says the workflow should discover and use the repository's own language, test framework, commands, and coverage tooling, and should not tie generation to one provider [@product-readme]. It also keeps every follow-up question in the session where the feature was implemented, so user answers become part of the same intent stream used for later generation passes [@product-readme]. Runtime session tagging can identify sessions associated with a branch, but it does not replace the future prompt-text capture implied by that product workflow [@session-tagger].

The tradeoff is that Rudder's local workflow must express instructions clearly enough for supported coding agents to execute. The README's delivery plan starts with defining an agent-agnostic skill contract, then building deterministic local tools for session lookup, base resolution, diff classification, and test reset [@product-readme]. Future product work should preserve this boundary unless a later decision explicitly moves model selection or generation into Rudder itself.
