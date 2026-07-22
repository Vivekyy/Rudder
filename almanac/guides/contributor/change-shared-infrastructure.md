---
title: "Change Shared Infrastructure"
summary: "Change shared infrastructure explains how to modify Rudder's package, TypeScript, automation, runtime foundation, or contributor workflow surfaces without touching protected paths."
topics: [guides, contributor-workflow, infrastructure, validation]
sources:
  - id: agentsignore
    type: file
    path: .agentsignore
  - id: agentsignore-workflow
    type: file
    path: .github/workflows/agentsignore.yml
  - id: package
    type: file
    path: package.json
  - id: tsconfig
    type: file
    path: tsconfig.json
  - id: tsconfig-build
    type: file
    path: tsconfig.build.json
  - id: db-client
    type: file
    path: src/db/client.ts
  - id: session-tagger
    type: file
    path: src/session-tagger.ts
  - id: telemetry
    type: file
    path: src/telemetry.ts
  - id: test-workflow
    type: file
    path: .github/workflows/test.yml
---

# Change Shared Infrastructure

Use this guide when a task changes shared foundations rather than one isolated feature: package metadata or scripts, TypeScript compiler settings, GitHub automation, mirrored Claude/Codex contributor workflows, generated database migrations, session branch tracking, or telemetry lifecycle behavior [@package] [@tsconfig] [@tsconfig-build] [@db-client] [@session-tagger] [@telemetry]. The goal is to keep the change tied to the affected foundation, avoid [Protected Paths](../../reference/contributor/protected-paths), and finish with the repo's [Run Checks](run-checks) gate.

## Confirm The Surface

Start by naming the shared surface the task changes. Package work changes the manifest contract, dependency set, published file allowlist, or npm script behavior [@package]. TypeScript work changes the shared NodeNext compiler model or the emitting build overlay [@tsconfig] [@tsconfig-build]. Runtime-foundation work changes local database migration application, Rudder home resolution, dashboard port parsing, session branch tracking, or telemetry identity and PostHog client behavior [@db-client] [@session-tagger] [@telemetry].

If the task is product behavior rather than shared infrastructure, use the product-intent and runtime pages that describe that area instead of treating this guide as an approval gate. If the task does change a shared surface, continue with the protected-path check before editing.

## Check Protected Paths

Read `.agentsignore` before editing. The current protected paths are `README.md`, `LICENSE`, `CLAUDE.md`, and `assets/` [@agentsignore].

Pull requests to `main` run an `Enforce .agentsignore` workflow that checks changed paths against `.agentsignore` from both the base and head revisions [@agentsignore-workflow]. The workflow writes the diff path list, runs `git check-ignore --no-index` against both rule sets, and fails only when the head revision still protects a changed path [@agentsignore-workflow]. When the head rules allow a path that the base rules protected, the workflow publishes a neutral `agentsignore-policy` check to show that the pull request explicitly relaxed protection [@agentsignore-workflow]. Treat that relaxation as an intentional policy change, not a routine workaround; otherwise move the change to an unprotected path or ask the user for a different route.

## Make The Infrastructure Edit

Keep the edit inside the system area the task actually touches. For package or TypeScript changes, remember that the package manifest defines the core validation commands and published file list, while the TypeScript configs define the source globs and build output contract [@package] [@tsconfig] [@tsconfig-build]. For runtime-foundation changes, keep persistent paths derived from `rudderHome()` and keep telemetry's opt-in client lifecycle aligned with the environment-variable contract [@db-client] [@telemetry].

When an infrastructure change affects agent command behavior, consult [Run Checks](run-checks) for the parity gate that applies to mirrored contributor instructions. Do not modify `CLAUDE.md` itself because it is protected by `.agentsignore` [@agentsignore].

## Verify And Recover

After a shared infrastructure change, run the package validation commands from `package.json` [@package].

```bash
npm run typecheck
npm test
npm run build
```

Those commands map to `tsc --noEmit`, `node --test`, and a clean TypeScript build to `dist`; the Test workflow runs the same sequence after `npm ci` on Node 24 [@package] [@test-workflow]. If validation fails, keep the fix inside the same shared surface when possible. If the failure points to a protected path, use [Protected Paths](../../reference/contributor/protected-paths) instead of working around the rule.
