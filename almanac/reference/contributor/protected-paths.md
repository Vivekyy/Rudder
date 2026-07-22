---
title: "Protected Paths"
summary: "The protected paths reference lists the current .agentsignore rules and the pull-request workflow outcomes for head-protected, base-only protected, and unprotected changes."
topics: [reference, contributor-workflow, automation, protected-paths]
sources:
  - id: agentsignore
    type: file
    path: .agentsignore
  - id: agentsignore-workflow
    type: file
    path: .github/workflows/agentsignore.yml
---

Agent-protected paths are repository paths listed in `.agentsignore` and evaluated by the pull-request enforcement workflow when a pull request has detected agent authorship. The current `.agentsignore` protects the root `README.md`, `LICENSE`, `CLAUDE.md`, and the `/assets/` directory [@agentsignore]. CI detects agent authorship from commit authors, `Co-authored-by` trailers, or the PR author's login; only detected-agent pull requests have their changed paths checked against `.agentsignore` rules and receive an `agentsignore-policy` check run [@agentsignore-workflow].

## Current Rules

| Pattern | Scope |
| --- | --- |
| `README.md` | Protects the root README file [@agentsignore]. |
| `LICENSE` | Protects the root license file [@agentsignore]. |
| `CLAUDE.md` | Protects the root Claude instruction handoff file [@agentsignore]. |
| `/assets/` | Protects the root `assets/` directory and paths beneath it [@agentsignore]. |

These are gitignore-style patterns, and the CI workflow evaluates them with `git check-ignore --no-index` against the changed-path list for each revision's rules [@agentsignore-workflow].

## CI Enforcement

The `.github/workflows/agentsignore.yml` workflow runs on `pull_request` events targeting `main` and grants `checks: write` plus `contents: read` so it can create a policy check run on the pull request head SHA [@agentsignore-workflow]. Its `detect-agent-authorship` job checks full commit history and trailers between the base and head SHAs, along with the PR author's login. The `enforce-agentsignore` job always runs and publishes `agentsignore-policy`; if detection does not report agent authorship, it creates a successful check explaining that enforcement was not required [@agentsignore-workflow]. For detected-agent pull requests, it checks out the repository with full history, records changed paths between `github.event.pull_request.base.sha` and `github.event.pull_request.head.sha` using `git diff --name-only --no-renames -z`, and stores those paths in a runner-temporary file [@agentsignore-workflow].

The workflow evaluates base and head rule sets separately. For each of `BASE_SHA` and `HEAD_SHA`, it tries to read `.agentsignore` from that revision with `git show`; missing files are skipped [@agentsignore-workflow]. It then creates a temporary Git repository, copies the revision's rules into `.git/info/exclude`, runs `git check-ignore --no-index -z --stdin` against the changed-path list, and sorts the matched paths uniquely into revision-specific output files [@agentsignore-workflow].

For a detected-agent pull request, the outcome is head-first. If any changed path still matches the head revision's `.agentsignore`, the workflow creates an `agentsignore-policy` check run with conclusion `failure`, emits an Actions error headed "This pull request changes paths protected by its .agentsignore:", prints the head-protected paths, and exits with status `1` [@agentsignore-workflow]. If the head rules allow every changed path but the base rules protected at least one of them, the workflow creates the same check run with conclusion `neutral`, emits a notice that `.agentsignore` was relaxed, and exits successfully [@agentsignore-workflow]. If neither revision protects a changed path, the workflow creates a `success` check run, prints "No agent-protected paths changed.", and exits successfully [@agentsignore-workflow].

## Related Workflow

The broader contributor automation is covered by [Contributor Automation](../../architecture/automation/contributor-automation), and shared-infrastructure edits can use [Change Shared Infrastructure](../../guides/contributor/change-shared-infrastructure). The exact GitHub workflow surface is collected in [GitHub Workflows](../../reference/automation/github-workflows).
