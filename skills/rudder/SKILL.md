---
name: rudder
description: Generate and verify focused unit tests for branch changes using locally captured coding-session intent and the repository's native tooling. Use when the user asks to run Rudder, create or regenerate tests for current work, reach a coverage target, inspect captured Rudder context, disable or enable prompt capture, or delete Rudder prompt data. Do not use for unrelated test maintenance or requests to change production code.
---

# Rudder

Use the current coding agent to derive tests from intent and branch changes.
Keep prompt data and generation local; do not call a separate model or service.

## Handle data-control requests

For requests to inspect, disable, enable, or delete Rudder data, use
`scripts/manage-data.mjs` relative to this file:

```text
node <skill-directory>/scripts/manage-data.mjs status
node <skill-directory>/scripts/manage-data.mjs disable
node <skill-directory>/scripts/manage-data.mjs enable
node <skill-directory>/scripts/manage-data.mjs delete --confirm
```

Explain that `disable` affects future prompt capture.
Explain that `delete --confirm` irreversibly removes all prompt records.
Do not run deletion without the user explicitly requesting it.
Stop after completing a data-control request.

## Generate tests

1. Determine the repository root and target branch from the request.
   Determine the requested coverage target.
   Prefer the repository's configured coverage threshold.
   Ask for a target only when neither the request nor repository provides one.
2. Run `scripts/context.mjs` relative to this file with the repository working
   directory:

   ```text
   node <skill-directory>/scripts/context.mjs \
     --cwd <repository-root> \
     [--base <target-ref>]
   ```

3. Inspect the returned merge base, changed paths, and captured prompts.
   Inspect repository instructions, the production diff, and existing tests.
   Inspect the native test and coverage configuration.
   Treat helper classifications as candidates.
   Correct them using repository conventions.
4. Turn only directly expressed user intent into behavioral requirements.
   A captured prompt or the current conversation must require the expectation.
   Only then treat an existing test change as intended.
   Otherwise flag it as an ambiguity.
5. Show the exact tracked and untracked test paths that would be affected.
   Request explicit confirmation before clearing any test change.
   Do not proceed on silence or an ambiguous reply.
6. After confirmation, create a recoverable backup for the exact approved paths:

   ```text
   node <skill-directory>/scripts/backup-tests.mjs \
     --cwd <repository-root> \
     --base <target-ref> \
     --path <test-path> \
     [--path <test-path> ...]
   ```

   Verify the reported patch and copied untracked files exist.
   Then restore only the confirmed test paths to the merge-base state.
   Never use `git reset --hard`, broad `git clean`, or change production files.
7. Generate focused unit tests for changed production behavior.
   Follow existing organization, fixtures, naming, and framework conventions.
   Do not change production code, coverage configuration, or repository thresholds.
8. Run the narrowest relevant native tests first.
   Then run the applicable repository test and coverage commands.
   Measure changed production code when the tooling supports it.
9. Identify failures or uncovered branches that depend on missing intent.
   Ask one concrete question whose answer changes a test expectation.
   Do not ask for facts inferable from the code, repository, or captured prompts.
10. Incorporate the answer, rerun tests and coverage, and continue until the
    configured target passes or a concrete blocker remains.

Report the requirements derived from intent and test files changed.
Report commands run, coverage, unanswered ambiguities, and the backup location.
Never claim the target passed without command output that demonstrates it.
