---
title: "Change Shared Infrastructure"
summary: "Change shared infrastructure explains how to modify Rudder's package, TypeScript, automation, runtime foundation, plugin, or contributor workflow surfaces without touching protected paths."
topics: [guides, contributor-workflow, infrastructure, validation]
sources:
  - id: dangerfile
    type: file
    path: dangerfile.ts
  - id: danger-workflow
    type: file
    path: .github/workflows/danger.yml
  - id: package
    type: file
    path: package.json
  - id: tsconfig
    type: file
    path: tsconfig.json
  - id: db-client
    type: file
    path: src/db/client.ts
  - id: prompt-tagger
    type: file
    path: src/prompt-tagger.ts
  - id: prompt-control
    type: file
    path: src/prompt-control.ts
  - id: telemetry
    type: file
    path: src/telemetry.ts
  - id: test-workflow
    type: file
    path: .github/workflows/test.yml
---

# Change Shared Infrastructure

Use this guide when a task changes shared foundations rather than one isolated feature: package metadata or scripts, TypeScript compiler settings, GitHub automation, centralized agent workflows, generated database migrations, prompt capture, local state, plugin packaging, or telemetry lifecycle behavior [@package] [@tsconfig] [@db-client] [@prompt-tagger] [@prompt-control] [@telemetry]. The goal is to keep the change tied to the affected foundation, avoid [Protected Paths](../../reference/contributor/protected-paths), and finish with the repo's [Run Checks](run-checks) gate.

## Confirm The Surface

Start by naming the shared surface the task changes. Package work changes the manifest contract, dependency set, published file allowlist, bundled hook output, or npm script behavior [@package]. TypeScript work changes the shared NodeNext no-emit compiler model [@tsconfig]. Runtime-foundation work changes local database migration application, Rudder home resolution, dashboard port parsing, prompt capture, prompt data controls, or telemetry identity and PostHog client behavior [@db-client] [@prompt-tagger] [@prompt-control] [@telemetry].

If the task is product behavior rather than shared infrastructure, use the product-intent, plugin, and runtime pages that describe that area instead of treating this guide as an approval gate. If the task does change a shared surface, continue with the protected-path check before editing.

## Check Protected Paths

Read `dangerfile.ts` before editing. The current protected path patterns are `README.md`, `LICENSE`, `CLAUDE.md`, `assets/**`, `.claude/**`, `.codex/**`, and `.cursor/**` [@dangerfile].

Pull requests to `main` run the Danger workflow, which executes `npm run danger:ci` [@danger-workflow] [@package]. For agent-authored PRs, Danger fails changes to protected paths and changes inside inline `agent-guard:off` and `agent-guard:on` regions, while warning when policy files or guard markers change [@dangerfile]. Treat a protection relaxation as an intentional policy change, not a routine workaround; otherwise move the change to an unprotected path or ask the user for a different route.

## Make The Infrastructure Edit

Keep the edit inside the system area the task actually touches. For package or TypeScript changes, remember that the package manifest defines the validation commands, bundled hook output, and published file list, while `tsconfig.json` defines the no-emit source-checking globs [@package] [@tsconfig]. For runtime-foundation changes, keep persistent paths derived from `rudderHome()`, keep prompt capture aligned with the local data controls, and keep telemetry's opt-in client lifecycle aligned with the environment-variable contract [@db-client] [@prompt-control] [@telemetry].

When an infrastructure change affects agent workflow behavior, consult [Run Checks](run-checks) for the centralized `.agents/skills` layout gate. Do not modify `CLAUDE.md`, `.claude/**`, `.codex/**`, or `.cursor/**` from an agent-authored PR because those paths are protected by Danger [@dangerfile].

## Verify And Recover

After a shared infrastructure change, run the package validation commands from `package.json` [@package].

```bash
npm run typecheck
npm test
npm run build
```

Those commands map to `tsc --noEmit`, `node --test`, and a clean esbuild bundle plus migration copy to `dist`; the Test workflow runs the same sequence after layout and Markdown checks on Node 24 [@package] [@test-workflow]. If validation fails, keep the fix inside the same shared surface when possible. If the failure points to a protected path, use [Protected Paths](../../reference/contributor/protected-paths) instead of working around the rule.
