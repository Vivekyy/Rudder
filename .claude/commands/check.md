Run the package checks for the current branch and enforce `.claude/` / `.codex/` config sync before committing or opening a PR.

## Steps

1. **Identify what changed** against `origin/main`, including local staged/unstaged work:

   ```bash
   git fetch origin main
   git diff --name-only origin/main...HEAD
   git diff --name-only
   git diff --name-only --cached
   ```

   Rudder is a single npm package, so there is no per-folder map — if anything under `src/`, `bin/`, `test/`, or a build/config file (`package.json`, `tsconfig*.json`, `.github/`, `biome.json`) changed, the package checks below apply.

2. **Enforce `.claude/` / `.codex/` sync for folder changes only:**

   - This gate applies only to changes under `.claude/` and `.codex/`.
   - It does **not** apply to root instruction files such as `CLAUDE.md`, `CODEX.md`, or `AGENTS.md`.
   - If any `.claude/` path changed, require at least one `.codex/` path change in the same diff, and vice versa.
   - If this requirement fails, mark `/check` as failed and report which folder changed without a mirrored update.
   - When both folders changed, verify intent parity for mirrored artifacts:
     - `.claude/commands/check.md` <-> `.codex/skills/check-changed-folders/SKILL.md`
     - `.claude/commands/address-pr-comments.md` <-> `.codex/skills/address-pr-comments/SKILL.md`

3. **Install dependencies if needed.** If `node_modules/` does not exist, run `npm install` first.

4. **Run the package checks:**

   ```bash
   npm run format
   npm run lint
   npm run typecheck
   npm test
   npm run build
   ```

5. **Surface and address open PR comments.** If the current branch has an open GitHub PR, run the `/address-pr-comments` flow before finishing — fetch open review comments (Greptile, human reviewers), dedupe, and fix/decline/defer each. If `gh` is unavailable or there is no PR, treat this step as `skipped`. If any comment is acted on, re-run the checks above before reporting.

6. **Report results.** Summarize which checks passed, failed, or were skipped, including dedicated results for `.claude/` / `.codex/` sync and PR comments. For failures, show the key error output and the failing command. Distinguish real failures (type errors, test failures, unaddressed P0/P1 PR comments) from environment issues (missing CLI tools, no PR).

## Notes

- Default comparison branch is `origin/main` (not local `main`, which may be stale).
- `.claude/` / `.codex/` parity is a required gate only when one of those folders changes.
