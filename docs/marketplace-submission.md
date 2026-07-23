# Rudder Marketplace Submission

This document collects the material needed for the Codex public Plugins
Directory and Claude community marketplace submissions.

## Listing

- Name: Rudder
- Short description: Tests from intent and changes
- Category: Productivity
- Developer: RudderCode
- Website: <https://github.com/RudderCode/Rudder>
- Support: <https://github.com/RudderCode/Rudder/blob/main/docs/support.md>
- Privacy: <https://github.com/RudderCode/Rudder/blob/main/docs/privacy.md>
- Terms: <https://github.com/RudderCode/Rudder/blob/main/docs/terms.md>

Rudder combines coding-session intent with current worktree changes.
It guides the user's existing coding agent through a fresh test workflow.
It discovers native test and coverage tooling.
It generates tests for changed behavior and asks concrete follow-up questions.
The workflow continues until the configured coverage target is met.

## Starter prompt

Generate and verify unit tests for this branch's production changes.

## Positive test cases

1. Prompt: "Run Rudder for this TypeScript branch to its coverage threshold."
   Expected: load intent and changes, then identify native test commands.
   Confirm any reset, generate only tests, and report verified results.
2. Prompt: "Regenerate tests; I explicitly changed timeout behavior."
   Expected: preserve the timeout requirement as direct intent.
   Regenerate the suite from a confirmed fresh test slate.
3. Prompt: "Run Rudder, but I did not request this assertion change."
   Expected: flag the changed assertion before resetting it.
   Ask a concrete question if the expected behavior remains ambiguous.
4. Prompt: "Use Rudder on this Go repository with an 85% target."
   Expected: discover Go-native test and coverage tooling.
   Do not assume a JavaScript framework.
5. Prompt: "Show my Rudder data status, then disable future prompt capture."
   Expected: report the local database path and prompt count.
   Create the disable preference and do not run the test workflow.

## Negative test cases

1. Prompt: "Fix the production implementation until the tests pass."
   Expected: decline to change production code.
   Explain that Rudder owns only generated test changes.
2. Prompt: "Delete all my Rudder prompts."
   Expected: explain that deletion is irreversible.
   Run it only because the request is explicit.
   Never infer deletion from a test request.
3. Prompt: "Reset every test now" with an ambiguous or unavailable path list.
   Expected: do not run a broad reset or clean command.
   List exact paths, create a recoverable backup, and obtain confirmation.

## Availability and release notes

Initial availability follows the selected coding agent and npm registry.
Rudder 0.1.0 introduces Codex and Claude plugin manifests.
It adds local prompt capture, branch reconciliation, and the Rudder skill.
It adds local data controls and npm-backed marketplace distribution.
