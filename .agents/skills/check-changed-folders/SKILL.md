---
name: check-changed-folders
description: Run typecheck, tests, and build for the rudder package on the current branch versus main, and verify the centralized agent-instruction layout. Use when asked to run "/check", to validate a branch before commit/PR, or whenever a user asks to run checks before publishing.
---

# Check Changed Folders

Identify what changed on the branch, verify the centralized agent-instruction layout, run the package checks, and report pass/fail status with actionable failure output. Rudder is a single npm package, so the checks are repo-wide rather than per-folder.

## Workflow

1. Identify changed files against `main`, including local staged/unstaged changes:

```bash
git fetch origin main
git diff --name-only origin/main...HEAD
git diff --name-only
git diff --name-only --cached
```

   If anything under `src/`, `bin/`, `test/`, or a build/config file (`package.json`, `tsconfig*.json`, `.github/`) changed, the package checks below apply.

2. Verify the centralized agent-instruction layout before running checks:

- `AGENTS.md` is the canonical repository guidance; `CLAUDE.md` delegates to it.
- `.agents/skills/` is the only reusable-workflow source. Do not add command aliases or edit tool-specific symlinks.
- Confirm the compatibility links resolve correctly:
  - `.claude/skills` -> `../.agents/skills`
  - `.codex/skills` -> `../.agents/skills`
- Cursor and current Codex discover `.agents/skills/` directly, so do not add a duplicate `.cursor/` configuration directory.
- If any link is missing or resolves outside `.agents/`, mark the check as failed and report the broken path.

3. Install dependencies if `node_modules/` does not exist: run `npm install`.

4. Run the package checks (the same set `prepublishOnly` runs, so green means publishable):

```bash
npm run typecheck
npm test
npm run build
```

5. Surface and address open PR comments. If the current branch has an open GitHub PR, always invoke the `address-pr-comments` skill before finishing. That skill fetches open review comments (Greptile, human reviewers) for the PR, dedupes them, and fixes/declines/defers each one. Only if `gh` is unavailable or there is no PR for the current branch, treat this step as `skipped`. If any comment is acted on, re-run the checks before reporting.

6. Report concise results:

- State whether typecheck, tests, and build passed, failed, or were skipped.
- Include dedicated results for agent-instruction layout and PR comments (`passed`, `failed`, or `skipped`) and why.
- For failures, include the key error output and which command failed.
- Distinguish real failures (type errors, test failures, broken agent links, unaddressed P0/P1 PR comments) from environment issues (missing CLI tools, no PR).

## Notes

- Default comparison branch is `origin/main` (not local `main`, which may be stale).
- The `.agents/` layout is a required gate, not an optional reminder.
- If nothing relevant changed, state that no checks were required.
