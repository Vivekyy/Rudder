---
title: "Contributor Automation"
summary: "Contributor automation connects local agent check flows, PR-comment remediation, CI validation, and .agentsignore enforcement into one guarded branch workflow."
topics: [architecture, automation, contributor-workflow, validation]
sources:
  - id: claude-check
    type: file
    path: .claude/commands/check.md
  - id: codex-check
    type: file
    path: .codex/skills/check-changed-folders/SKILL.md
  - id: claude-comments
    type: file
    path: .claude/commands/address-pr-comments.md
  - id: codex-comments
    type: file
    path: .codex/skills/address-pr-comments/SKILL.md
  - id: test-workflow
    type: file
    path: .github/workflows/test.yml
  - id: agentsignore-workflow
    type: file
    path: .github/workflows/agentsignore.yml
  - id: agentsignore
    type: file
    path: .agentsignore
---

Rudder's contributor automation is a set of local and CI gates for a repository that currently has one npm package and mirrored agent workflows [@claude-check] [@codex-check]. The local `/check` command and Codex `check-changed-folders` skill compare the branch with `origin/main`, enforce Claude/Codex instruction parity, verify agent attribution, run the package checks, and then surface PR comments when a PR exists [@claude-check] [@codex-check]. GitHub Actions repeats the package validation on every branch push and conditionally evaluates `.agentsignore` policy for pull requests with detected agent authorship, failing head-protected changes while reporting explicit protection relaxations as neutral checks [@test-workflow] [@agentsignore-workflow].

## Local Check Surface

The Claude and Codex check surfaces intentionally describe the same workflow. Both start by fetching `origin/main`, collecting changed files from the merge-base diff plus unstaged and staged local changes, and treating Rudder as a single npm package rather than trying to map work to subpackages [@claude-check] [@codex-check]. When files under `src/`, `bin/`, `test/`, package or TypeScript configuration, or `.github/` change, the repo-wide package checks apply [@claude-check] [@codex-check].

The same instructions make Claude/Codex parity a hard gate. Changes on the Claude side (`CLAUDE.md`, `.claude/`) must be mirrored by at least one Codex-side change (`AGENTS.md`, `.codex/`), and the mirrored artifacts are checked for intent parity before package checks run [@claude-check] [@codex-check]. The [run checks guide](../../guides/contributor/run-checks) turns this architecture into the step-by-step contributor procedure.

Before package checks, the local flow also checks that each coding agent represented in committed work is listed as a commit author or `Co-authored-by` trailer. Agent-written uncommitted work is reported as pending attribution until it is committed; human-only changes are outside this gate [@claude-check] [@codex-check].

## Package Checks

After parity passes, the local flow installs dependencies with `npm install` only when `node_modules/` is missing, then runs `npm run typecheck`, `npm test`, and `npm run build` [@claude-check] [@codex-check]. The Test workflow uses the CI equivalent: checkout, Node 24 setup, `npm ci`, `npm run typecheck`, `npm test`, and `npm run build` on Ubuntu [@test-workflow]. The exact command meanings are listed in the [package scripts reference](../../reference/tooling/package-scripts), while the [GitHub workflows reference](../../reference/automation/github-workflows) records the CI triggers and permissions.

## PR Comment Remediation

The check flow delegates open PR feedback to a separate address-PR-comments workflow. The Claude command and Codex skill both locate the current branch PR with `gh pr view`, fetch top-level issue comments and inline review comments through GitHub API endpoints, de-duplicate by path, line, author, and body hash, and ignore deploy-bot noise [@claude-comments] [@codex-comments]. Each remaining comment is verified against the current `HEAD`, then either fixed, declined with a reason, or deferred to the user when it needs a judgment call [@claude-comments] [@codex-comments].

That remediation flow has its own validation boundary. If it applies any fixes, it reruns `npm run typecheck`, `npm test`, and `npm run build`, but it does not invoke the full check flow again because that would re-enter the PR-comment workflow [@claude-comments] [@codex-comments]. The [address PR comments guide](../../guides/contributor/address-pr-comments) gives the operational procedure without duplicating the architecture here.

## Protected Paths

`.agentsignore` protects `README.md`, `LICENSE`, `CLAUDE.md`, `assets/`, and the root `.claude/`, `.codex/`, and `.cursor/` directories from agent-authored PR changes [@agentsignore]. The enforcement workflow runs one job on pull requests targeting `main`; it recognizes agent authorship from commit authors, `Co-authored-by` trailers, or the PR author's login, then gates path evaluation on that detection step output [@agentsignore-workflow]. For detected-agent pull requests, the evaluation step computes changed paths between the PR base and head SHAs, loads `.agentsignore` rules from both base and head revisions when present, and uses `git check-ignore --no-index` inside a temporary matcher repository to identify protected changes for each revision separately [@agentsignore-workflow].

For detected-agent pull requests, the head rule check is authoritative for failure: if a changed path remains protected by the pull request's `.agentsignore`, the workflow emits a GitHub Actions error, creates an `agentsignore-policy` check run with conclusion `failure`, and exits nonzero [@agentsignore-workflow]. Base-only matches mean the pull request explicitly relaxed `.agentsignore`; the workflow reports those paths with a notice and a `neutral` check run instead of failing, while changes protected by neither revision receive a `success` check run. The path-evaluation step and its `agentsignore-policy` check are skipped for pull requests without detected agent authorship [@agentsignore-workflow]. The lookup version of this contract belongs in the [protected paths reference](../../reference/contributor/protected-paths).
