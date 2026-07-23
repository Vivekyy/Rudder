---
title: "Contributor Automation"
summary: "Contributor automation connects centralized agent skills, local check flows, PR-comment remediation, CI validation, and Danger-based agent guards into one guarded branch workflow."
topics: [architecture, automation, contributor-workflow, validation]
sources:
  - id: agents-readme
    type: file
    path: .agents/README.md
  - id: check-skill
    type: file
    path: .agents/skills/check-changed-folders/SKILL.md
  - id: comments-skill
    type: file
    path: .agents/skills/address-pr-comments/SKILL.md
  - id: package
    type: file
    path: package.json
  - id: test-workflow
    type: file
    path: .github/workflows/test.yml
  - id: danger-workflow
    type: file
    path: .github/workflows/danger.yml
  - id: dangerfile
    type: file
    path: dangerfile.ts
---

Rudder's contributor automation is a set of local and CI gates for a repository that currently has one root plugin package and centralized agent workflows. `.agents/skills/` is the only reusable-workflow source, with `.claude/skills` and `.codex/skills` as compatibility symlinks [@agents-readme]. The `check-changed-folders` skill compares the branch with `origin/main`, verifies the centralized agent-instruction layout, verifies agent attribution, runs the package checks, and then invokes PR-comment remediation when a PR exists [@check-skill]. GitHub Actions repeats package validation on branch pushes, while the Danger workflow enforces protected paths and inline agent guards for agent-authored pull requests [@test-workflow] [@danger-workflow] [@dangerfile].

## Local Check Surface

The check surface is centralized in `.agents/skills/check-changed-folders/SKILL.md` [@check-skill]. It starts by fetching `origin/main`, collecting changed files from the merge-base diff plus unstaged and staged local changes, and treating Rudder as repo-wide rather than per-package [@check-skill]. When files under `src/`, `bin/`, `test/`, package or TypeScript configuration, or `.github/` change, the package checks apply [@check-skill].

The centralized layout itself is a hard gate. The check skill requires `AGENTS.md` as canonical guidance, `.agents/skills/` as the only reusable workflow source, `skills/<skill-name>/agents/openai.yaml` metadata for shared skills, `.claude/skills` and `.codex/skills` symlinks to `.agents/skills`, and no `.claude/commands` aliases [@agents-readme] [@check-skill]. The [Run Checks](../../guides/contributor/run-checks) guide turns this architecture into the step-by-step contributor procedure.

Before package checks, the local flow also checks that each coding agent represented in committed work is listed as a commit author or `Co-authored-by` trailer. Agent-written uncommitted work is reported as pending attribution until it is committed; human-only changes are outside this gate [@check-skill].

## Package Checks

After layout and attribution checks, the local flow installs dependencies with `npm install` only when `node_modules/` is missing, then runs `npm run typecheck`, `npm test`, and `npm run build` [@check-skill]. The Test workflow uses the CI equivalent plus layout and Markdown checks: checkout, Node 24 setup, `npm ci`, `npm run check:agent-layout`, `npm run format:markdown:check`, `npm run typecheck`, `npm test`, and `npm run build` on Ubuntu [@test-workflow]. The exact command meanings are listed in [Package Scripts](../../reference/tooling/package-scripts), while [GitHub Workflows](../../reference/automation/github-workflows) records CI triggers and permissions.

## PR Comment Remediation

The check flow delegates open PR feedback to a separate `address-pr-comments` skill [@check-skill]. That skill locates the current branch PR with `gh pr view`, fetches top-level issue comments and inline review comments through GitHub API endpoints, de-duplicates by path, line, author, and body hash, and ignores deploy-bot noise [@comments-skill]. Each remaining comment is verified against the current `HEAD`, then either fixed, declined with a reason, or deferred to the user when it needs a judgment call [@comments-skill].

That remediation flow has its own validation boundary. If it applies any fixes, it reruns `npm run typecheck`, `npm test`, and `npm run build`, but it does not invoke the full check flow again because that would re-enter the PR-comment workflow [@comments-skill]. The [Address PR Comments](../../guides/contributor/address-pr-comments) guide gives the operational procedure without duplicating the architecture here.

## Agent Guards

`dangerfile.ts` protects `README.md`, `LICENSE`, `CLAUDE.md`, `assets/**`, `.claude/**`, `.codex/**`, and `.cursor/**` from agent-authored pull request changes [@dangerfile]. It detects agent authorship from the PR author, commit author names and emails, and `Co-authored-by` trailers [@dangerfile]. The Danger workflow runs `npm run danger:ci` on pull requests to `main` after installing dependencies on Node 24 [@danger-workflow] [@package].

For detected-agent pull requests, Danger fails any changed path matching `PROTECTED_PATHS` and warns when the policy files `dangerfile.ts` or `.github/workflows/danger.yml` change [@dangerfile]. It also enforces inline `agent-guard:off` and `agent-guard:on` regions: invalid marker nesting fails, agent-authored changes inside protected regions fail, and marker changes warn for explicit review [@dangerfile]. The lookup version of this contract belongs in [Protected Paths](../../reference/contributor/protected-paths).
