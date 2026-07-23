---
title: "Intent-Driven Test Generation"
summary: "Intent-driven test generation is Rudder's workflow for turning locally captured coding-session intent and worktree changes into verified unit tests."
topics: [concepts, product-intent, test-generation-intent]
sources:
  - id: readme
    type: file
    path: README.md
  - id: prompt-hook
    type: file
    path: src/prompt-hook.ts
  - id: context-script
    type: file
    path: skills/rudder/scripts/context.mjs
  - id: skill
    type: file
    path: skills/rudder/SKILL.md
---

# Intent-Driven Test Generation

Intent-driven test generation is the Rudder product model in which a coding agent uses the user's session prompts, answers, and worktree changes to generate unit tests for newly introduced production code. The product premise is that a session contains more behavioral intent than a diff: prompts can name expected behavior, edge cases, and tradeoffs that never become comments or commit messages [@readme]. The current plugin implements the local context layer by capturing submitted prompts, reconciling them to branches, and giving the Rudder skill a JSON view of branch prompts plus changed paths [@prompt-hook] [@context-script].

## Intent Source

The central input is the current coding-agent session. Rudder is designed to run inside the same session where the feature was built, so the workflow can use the user's prompts and later answers as product intent instead of requiring a separate specification document [@readme]. [Prompt History](../runtime/prompt-history) covers the implemented local prompt store that supplies this context to the skill [@prompt-hook] [@context-script].

Worktree changes provide the other input. The proposed flow resolves a merge base, identifies production code introduced in the worktree, and uses the user's prompts to understand the behavior that code is meant to implement [@readme]. This makes the diff the implementation target and the prompt history the behavioral target.

## Workflow Shape

Rudder starts from a fresh test slate before generation. The README states that Rudder reverts testing code already added or changed in the worktree so the generated suite is derived from user intent rather than from an earlier test-writing attempt [@readme]. The installed skill turns that into an explicit confirmation workflow around exact test paths and a recoverable backup before any reset [@skill]. The linked [Test Intent Standards](test-intent-standards) page explains the direct-intent rule that decides when changes to existing tests are treated as intentional requirements.

After the reset, the current agent owns the unit-test changes for the workflow while production code remains unchanged [@readme]. The agent generates tests, the repository's native test and coverage tools run, and uncovered production code becomes the basis for narrow questions when coverage is still below the target [@readme]. A useful question changes a concrete test expectation rather than asking for information the repository or session already provides [@readme].

## Generation Ownership

The local version is bring-your-own-key. Rudder does not choose a model or make a separate model API call; the user's current coding agent generates tests with the model and credentials already configured for that agent [@readme]. The product is therefore a skill-guided workflow backed by deterministic local context and worktree tools, not a provider-specific test generator [@readme] [@skill]. [BYOK Skill Workflow](../../decisions/product/byok-skill-workflow) records that product decision.

This ownership model keeps the feedback loop inside the coding session that produced the implementation. Prompts, generated tests, coverage results, follow-up questions, and user answers all stay in that session, and each answer feeds the next test-generation pass until the coverage target is reached [@readme].
