---
title: "Run Checks"
summary: "Run checks is the repo-wide validation procedure for branch changes before commit, PR review, or publishing."
topics: [guides, contributor-workflow, validation]
sources:
  - id: check-skill
    type: file
    path: .agents/skills/check-changed-folders/SKILL.md
  - id: agents-readme
    type: file
    path: .agents/README.md
  - id: package
    type: file
    path: package.json
  - id: test-workflow
    type: file
    path: .github/workflows/test.yml
---

# Run Checks

Run checks when a branch is ready for commit, PR review, or publishing validation. Rudder is one repo-wide plugin package, so the local check flow identifies branch and working-tree changes, verifies the centralized agent-instruction layout, verifies agent attribution, installs dependencies when needed, runs TypeScript, test, and build commands, and surfaces open PR comments before reporting pass, fail, pending, or skip status [@check-skill]. For background on how this guide fits the automation system, see [Contributor Automation](../../architecture/automation/contributor-automation), [Package Scripts](../../reference/tooling/package-scripts), and [GitHub Workflows](../../reference/automation/github-workflows).

## Start From The Branch Diff

Fetch `origin/main` first, because the check skill uses `origin/main` rather than local `main` as the default comparison branch [@check-skill].

```bash
git fetch origin main
git diff --name-only origin/main...HEAD
git diff --name-only
git diff --name-only --cached
```

The check skill treats changes under `src/`, `bin/`, `test/`, package and TypeScript config files, and `.github/` as reasons to run the package checks [@check-skill]. If nothing relevant changed, report that no package checks were required instead of manufacturing a local test run [@check-skill].

## Check Agent Instruction Layout

Before running package commands, verify the centralized agent-instruction layout. `AGENTS.md` is the canonical repository guidance, `.agents/skills/` is the only reusable-workflow source, each shared skill needs `skills/<skill-name>/agents/openai.yaml`, and `.claude/skills` plus `.codex/skills` must resolve to `.agents/skills` [@agents-readme] [@check-skill].

The package script `check:agent-layout` enforces the symlinks, verifies that `.claude/commands` does not exist, and checks that `CLAUDE.md` contains the `@AGENTS.md` handoff [@package]. If a link is missing or resolves outside `.agents/`, mark the check as failed and report the broken path [@check-skill].

## Verify Agent Attribution

For committed agent-written work, inspect `git log origin/main..HEAD` and confirm every coding agent appears as a commit author or in a `Co-authored-by` trailer [@check-skill]. Missing attribution fails the check. When agent-written changes are still uncommitted, report attribution as pending and add the identifying trailer when committing; human-only changes are outside this gate [@check-skill].

## Run The Package Commands

Install dependencies if `node_modules/` is missing, then run the package checks in this order [@check-skill].

```bash
npm run typecheck
npm test
npm run build
```

The package manifest defines `typecheck` as `tsc --noEmit`, `test` as `node --test`, and `build` as the esbuild prompt-hook bundle plus `drizzle/` copy [@package]. The CI test workflow uses Node 24, runs `npm ci`, checks agent layout and Markdown formatting, and then runs the same typecheck, test, and build sequence on every pushed branch and on manual dispatch [@test-workflow].

## Handle PR Comments

If the current branch has an open GitHub PR, run the [Address PR Comments](address-pr-comments) flow before finishing [@check-skill]. If the GitHub CLI is unavailable or no PR exists, record that step as skipped rather than failed [@check-skill]. If any comment leads to a fix, rerun the package commands before reporting results [@check-skill].

## Report The Result

The final report should include separate status lines for agent-instruction layout, agent attribution, typecheck, tests, build, and PR comments [@check-skill]. For failures, include the failing command and the key error output; distinguish real failures such as broken agent links, missing agent attribution, type errors, test failures, or unaddressed high-priority comments from environment issues such as missing CLI tools or no PR [@check-skill].
