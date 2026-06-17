Run the package checks for the current branch and enforce Claude/Codex config sync before committing or opening a PR.

## Steps

1. **Identify what changed** against `origin/main`, including local staged/unstaged work:

   ```bash
   git fetch origin main
   git diff --name-only origin/main...HEAD
   git diff --name-only
   git diff --name-only --cached
   ```

   Rudder is a single npm package, so there is no per-folder map — if anything under `src/`, `bin/`, `test/`, or a build/config file (`package.json`, `tsconfig*.json`, `.github/`) changed, the package checks below apply.

2. **Enforce Claude/Codex sync before running checks:**

   - Claude-side paths: `CLAUDE.md`, `.claude/`
   - Codex-side paths: `AGENTS.md`, `.codex/`
   - If any Claude-side path changed, require at least one Codex-side path change in the same diff, and vice versa.
   - If this requirement fails, mark `/check` as failed and report which side changed without a mirrored update.
   - When both sides changed, verify intent parity for mirrored artifacts:
     - `CLAUDE.md` <-> `AGENTS.md`
     - `.claude/commands/check.md` <-> `.codex/skills/check-changed-folders/SKILL.md`
     - `.claude/commands/address-pr-comments.md` <-> `.codex/skills/address-pr-comments/SKILL.md`

3. **Install dependencies if needed.** If `node_modules/` does not exist, run `npm install` first.

4. **Run the package checks** (this is also what `prepublishOnly` runs, so a green `/check` means publishable):

   ```bash
   npm run typecheck
   npm test
   npm run build
   ```

5. **Surface and address open PR comments.** If the current branch has an open GitHub PR, run the `/address-pr-comments` flow before finishing — fetch open review comments (Greptile, human reviewers), dedupe, and fix/decline/defer each. If `gh` is unavailable or there is no PR, treat this step as `skipped`. If any comment is acted on, re-run the checks above before reporting.

6. **Report results.** Summarize which checks passed, failed, or were skipped, including dedicated results for Claude/Codex sync and PR comments. For failures, show the key error output and the failing command. Distinguish real failures (type errors, test failures, unaddressed P0/P1 PR comments) from environment issues (missing CLI tools, no PR).

## Notes

- Default comparison branch is `origin/main` (not local `main`, which may be stale).
- Claude/Codex parity is a required gate, not an optional reminder.
