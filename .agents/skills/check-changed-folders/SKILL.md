---
name: check-changed-folders
description: Run typecheck, tests, and build for the rudder package on the current branch versus main, verify the centralized agent-instruction layout, and verify agent attribution. Use when asked to run "/check", to validate a branch before commit/PR, or whenever a user asks to run checks before publishing.
---

# Check Changed Folders

Identify what changed on the branch, verify the centralized agent-instruction layout and agent attribution, run the package checks, and report pass/fail status with actionable failure output.
Rudder is a single npm package, so the checks are repo-wide rather than per-folder.

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

- `AGENTS.md` is the canonical repository guidance.
- `.agents/skills/` is the only reusable-workflow source.
  Do not add command aliases or edit tool-specific symlinks.
- Ensure that every skill has a corresponding `skills/<skill-name>/agents/openai.yaml` detailing its Codex display name, short description, and default prompt.
- Confirm the compatibility links resolve correctly:
  - `.claude/skills` -> `../.agents/skills`
  - `.codex/skills` -> `../.agents/skills`
- If any link is missing or resolves outside `.agents/`, mark the check as failed and report the broken path.

3. Verify agent attribution.
   If a coding agent wrote code included in the
branch, inspect `git log origin/main..HEAD` and require every such agent to appear as a commit author or in a `Co-authored-by:` trailer.
Missing agent attribution on committed work fails the check.
If the agent-written work is still uncommitted, report attribution as pending and name the trailer that must be added when committing.
Human-only changes are not subject to this check.

4. Install dependencies if `node_modules/` does not exist: run `npm install`.

5. Run the package checks (the same set `prepublishOnly` runs, so green means publishable):

```bash
npm run typecheck
npm test
npm run build
```

6. Surface and address open PR comments.
   If the current branch has an open GitHub PR, always invoke the `address-pr-comments` skill before finishing.
   That skill fetches open review comments (Greptile, human reviewers) for the PR, dedupes them, and fixes/declines/defers each one.
   Only if `gh` is unavailable or there is no PR for the current branch, treat this step as `skipped`.
   If any comment is acted on, re-run the checks before reporting.

7. Report concise results:

- State whether typecheck, tests, and build passed, failed, or were skipped.
- Include dedicated results for agent-instruction layout, agent attribution, and PR comments (`passed`, `failed`, `pending`, or `skipped`) and why.
- For failures, include the key error output and which command failed.
- Distinguish real failures (broken agent links, missing agent attribution, type errors, test failures, unaddressed P0/P1 PR comments) from environment issues (missing CLI tools, no PR).

## Notes

- Default comparison branch is `origin/main` (not local `main`, which may be stale).
- The `.agents/` layout is a required gate, not an optional reminder.
- Agent attribution is required only when an agent contributed code.
- If nothing relevant changed, state that no checks were required.
