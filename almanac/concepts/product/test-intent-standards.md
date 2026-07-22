---
title: "Test Intent Standards"
summary: "Test intent standards define how Rudder distinguishes direct user intent from inferred or preexisting test changes during generation."
topics: [concepts, product-intent, test-generation-intent]
sources:
  - id: readme
    type: file
    path: README.md
---

# Test Intent Standards

Test intent standards are the proposed rules that keep Rudder's generated unit tests grounded in what the user directly intended during a coding session. They require a fresh test slate, treat changes to existing tests as intentional only when the user's prompts directly encode that intent, and use narrow questions to resolve ambiguities that affect test expectations [@readme]. These standards sit inside [Intent-Driven Test Generation](intent-driven-test-generation) and constrain the [BYOK Skill Workflow](../../decisions/product/byok-skill-workflow).

## Direct Intent

The direct-intent standard applies when the worktree already contains changes to existing tests. The README defines those changes as important signals because they can show that established behavior is changing, but it also says Rudder should preserve such a change as a requirement only when the current session's prompts directly express the intent to change it [@readme]. If the prompts do not encode that intent, Rudder should flag the test change to the user in the current session before continuing [@readme].

This rule prevents regenerated tests from silently accepting behavior just because a test file already changed. The source of truth for a changed expectation is the user's expressed intent, not the mere presence of a changed assertion or fixture.

## Fresh Test Slate

The fresh test slate is the reset that happens before generation begins. Rudder is expected to revert all testing code introduced or changed in the worktree, including committed, staged, unstaged, and untracked test changes relative to the merge base [@readme]. The current agent identifies test paths from repository structure and conventions instead of relying on one language or test framework [@readme].

The reset has a narrow scope. Production code remains unchanged, and the current agent owns the worktree's unit-test changes only for the duration of the workflow [@readme]. That makes the generated tests a product of session intent and repository behavior rather than a continuation of earlier test edits.

## Questions And Coverage

Rudder should ask questions only when they resolve an ambiguity that changes a test expectation. The README says Rudder should not ask for information it can infer from the repository, implementation, existing test conventions, or coding session, and gives the shape of a useful question as one that decides a concrete behavior under a specific condition [@readme].

Coverage is the loop control, not the source of intent. The proposed workflow runs the repository's native unit-test and coverage tooling, measures coverage of production code introduced in the worktree, asks concrete questions when coverage is below the configured minimum, incorporates each answer into the next pass, and continues until the target is reached before PR publication [@readme]. Contributors use [Run Checks](../../guides/contributor/run-checks) for the repository's validation procedure outside this product-generation loop.
