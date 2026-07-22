---
title: "Run Checks"
summary: "Run checks is the repo-wide validation procedure for branch changes before commit, PR, or publishing."
topics: [guides, contributor-workflow, validation]
sources:
  - id: claude-check
    type: file
    path: .claude/commands/check.md
  - id: codex-check
    type: file
    path: .codex/skills/check-changed-folders/SKILL.md
  - id: package
    type: file
    path: package.json
  - id: test-workflow
    type: file
    path: .github/workflows/test.yml
---

# Run Checks

Run checks when a branch is ready for commit, PR review, or publishing validation. Rudder is a single npm package, so the local check flow is repo-wide: it identifies branch and working-tree changes, enforces Claude/Codex instruction parity, verifies agent attribution, installs dependencies when needed, runs TypeScript, test, and build commands, and surfaces open PR comments before reporting pass, fail, pending, or skip status [@claude-check] [@codex-check]. For background on how this guide fits the automation system, see [Contributor Automation](../../architecture/automation/contributor-automation), [Package Scripts](../../reference/tooling/package-scripts), and [GitHub Workflows](../../reference/automation/github-workflows).

## Start From The Branch Diff

Fetch `origin/main` first, because both the Claude command and Codex skill use `origin/main` rather than local `main` as the default comparison branch [@claude-check] [@codex-check].

```bash
git fetch origin main
git diff --name-only origin/main...HEAD
git diff --name-only
git diff --name-only --cached
```

The command docs treat changes under `src/`, `bin/`, `test/`, package and TypeScript config files, and `.github/` as reasons to run the package checks [@claude-check] [@codex-check]. If nothing relevant changed, report that no package checks were required instead of manufacturing a local test run [@codex-check].

## Check Agent Instruction Parity

Before running package commands, compare the Claude-side and Codex-side instruction files. Claude-side paths are `CLAUDE.md` and `.claude/`; Codex-side paths are `AGENTS.md` and `.codex/` [@claude-check] [@codex-check]. If either side changed without the other side changing in the same diff, the check fails and the report must name the side that lacks a mirrored update [@claude-check] [@codex-check].

When both sides changed, verify intent parity for the mirrored artifacts: `CLAUDE.md` with `AGENTS.md`, `.claude/commands/check.md` with `.codex/skills/check-changed-folders/SKILL.md`, and `.claude/commands/address-pr-comments.md` with `.codex/skills/address-pr-comments/SKILL.md` [@claude-check] [@codex-check]. This is a required gate, not a reminder [@claude-check] [@codex-check].

## Verify Agent Attribution

For committed agent-written work, inspect `git log origin/main..HEAD` and confirm every coding agent appears as a commit author or in a `Co-authored-by` trailer [@claude-check] [@codex-check]. Missing attribution fails the check. When agent-written changes are still uncommitted, report attribution as pending and add the identifying trailer when committing; human-only changes are outside this gate [@claude-check] [@codex-check].

## Run The Package Commands

Install dependencies if `node_modules/` is missing, then run the package checks in this order [@claude-check] [@codex-check].

```bash
npm run typecheck
npm test
npm run build
```

The package manifest defines `typecheck` as `tsc --noEmit`, `test` as `node --test`, and `build` as `rm -rf dist && tsc -p tsconfig.build.json` [@package]. Its `prepublishOnly` script runs the same three commands, so a green local check is also the package's publishability gate [@package]. The CI test workflow uses Node 24, runs `npm ci`, and then runs the same typecheck, test, and build sequence on every pushed branch and on manual dispatch [@test-workflow].

## Handle PR Comments

If the current branch has an open GitHub PR, run the [Address PR Comments](address-pr-comments) flow before finishing [@claude-check] [@codex-check]. If the GitHub CLI is unavailable or no PR exists, record that step as skipped rather than failed [@claude-check] [@codex-check]. If any comment leads to a fix, rerun the package commands before reporting results [@claude-check] [@codex-check].

## Report The Result

The final report should include separate status lines for Claude/Codex parity, agent attribution, typecheck, tests, build, and PR comments [@claude-check] [@codex-check]. For failures, include the failing command and the key error output; distinguish real failures such as missing agent attribution, type errors, test failures, or unaddressed high-priority comments from environment issues such as missing CLI tools or no PR [@claude-check] [@codex-check].
