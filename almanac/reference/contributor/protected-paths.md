---
title: "Protected Paths"
summary: "The protected paths reference lists the current .agentsignore rules and the pull-request workflow that rejects changes matching either base or head rules."
topics: [reference, contributor-workflow, automation, protected-paths]
sources:
  - id: agentsignore
    type: file
    path: .agentsignore
  - id: agentsignore-workflow
    type: file
    path: .github/workflows/agentsignore.yml
---

Agent-protected paths are repository paths listed in `.agentsignore` and rejected by the pull-request enforcement workflow when they change. The current `.agentsignore` protects the root `README.md`, `LICENSE`, `CLAUDE.md`, and the `/assets/` directory [@agentsignore]. CI enforces that rule on pull requests to `main` by checking changed paths against `.agentsignore` rules from both the base and head revisions [@agentsignore-workflow].

## Current Rules

| Pattern | Scope |
| --- | --- |
| `README.md` | Protects the root README file [@agentsignore]. |
| `LICENSE` | Protects the root license file [@agentsignore]. |
| `CLAUDE.md` | Protects the root Claude instruction handoff file [@agentsignore]. |
| `/assets/` | Protects the root `assets/` directory and paths beneath it [@agentsignore]. |

These are gitignore-style patterns, and the CI workflow evaluates them with `git check-ignore --no-index` against the changed-path list [@agentsignore-workflow].

## CI Enforcement

The `.github/workflows/agentsignore.yml` workflow runs on `pull_request` events targeting `main` and grants only read access to repository contents [@agentsignore-workflow]. Its job checks out the repository with full history, records changed paths between `github.event.pull_request.base.sha` and `github.event.pull_request.head.sha` using `git diff --name-only --no-renames -z`, and stores those paths in a runner-temporary file [@agentsignore-workflow].

The workflow evaluates both old and new rule sets. For each of `BASE_SHA` and `HEAD_SHA`, it tries to read `.agentsignore` from that revision with `git show`; missing files are skipped [@agentsignore-workflow]. It then creates a temporary Git repository, copies the revision's rules into `.git/info/exclude`, and runs `git check-ignore --no-index -z --stdin` against the changed-path list [@agentsignore-workflow].

Matches from both revisions are sorted uniquely. If the protected-path output file is empty, the job prints "No agent-protected paths changed." and exits successfully [@agentsignore-workflow]. If any protected path changed, the job emits an error headed "This pull request changes paths protected by .agentsignore:", prints each matching path, and exits with status `1` [@agentsignore-workflow].

## Related Workflow

The broader contributor automation is covered by [Contributor Automation](../../architecture/automation/contributor-automation), and shared-infrastructure edits can use [Change Shared Infrastructure](../../guides/contributor/change-shared-infrastructure). The exact GitHub workflow surface is collected in [GitHub Workflows](../../reference/automation/github-workflows).
