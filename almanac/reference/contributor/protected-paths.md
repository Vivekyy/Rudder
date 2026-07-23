---
title: "Protected Paths"
summary: "The protected paths reference lists the current Danger agent-guard rules, protected path patterns, inline guard markers, and policy-change warnings."
topics: [reference, contributor-workflow, automation, protected-paths]
sources:
  - id: dangerfile
    type: file
    path: dangerfile.ts
  - id: danger-workflow
    type: file
    path: .github/workflows/danger.yml
---

Agent-protected paths are repository paths matched by `PROTECTED_PATHS` in `dangerfile.ts` and evaluated by Danger when a pull request has detected agent authorship. The current protected patterns are `README.md`, `LICENSE`, `CLAUDE.md`, `assets/**`, `.claude/**`, `.codex/**`, and `.cursor/**` [@dangerfile]. CI detects agent authorship from the PR author, commit author names and emails, and `Co-authored-by` trailers; when no agent identity is detected, the scheduled Danger check returns before enforcing path or inline guards [@dangerfile].

## Current Rules

| Pattern | Scope |
| --- | --- |
| `README.md` | Protects the root README file [@dangerfile]. |
| `LICENSE` | Protects the root license file [@dangerfile]. |
| `CLAUDE.md` | Protects the root Claude instruction handoff file [@dangerfile]. |
| `assets/**` | Protects root assets and paths beneath them [@dangerfile]. |
| `.claude/**` | Protects Claude compatibility files and symlinks [@dangerfile]. |
| `.codex/**` | Protects Codex compatibility files and symlinks [@dangerfile]. |
| `.cursor/**` | Protects Cursor compatibility files [@dangerfile]. |

The matcher uses Node's `matchesGlob()` over changed files collected from Danger's created, modified, and deleted file lists [@dangerfile].

## CI Enforcement

The `.github/workflows/danger.yml` workflow runs on pull requests targeting `main`, installs Node 24 dependencies, and executes `npm run danger:ci` with `GITHUB_TOKEN` [@danger-workflow]. The Danger script warns when policy files change, including `dangerfile.ts` and `.github/workflows/danger.yml`, so policy edits are explicit review events instead of routine protected-path workarounds [@dangerfile].

For detected-agent pull requests, a changed file matching `PROTECTED_PATHS` fails with the protected path name and tells maintainers to relax `PROTECTED_PATHS` in a separately reviewed policy change if the edit is intentional [@dangerfile]. This is a direct failure rather than a neutral warning [@dangerfile].

## Inline Guards

Source files can also protect regions with comment-only markers. `agent-guard:off` starts a protected region, and `agent-guard:on` ends it; the marker parser accepts common comment prefixes such as `//`, `#`, `--`, `;`, block-comment prefixes, and HTML comments [@dangerfile]. Nested `off` markers, unmatched `on` markers, and unclosed `off` markers are invalid and fail the PR [@dangerfile].

When an agent-authored PR changes lines inside an inline protected region, Danger fails the file and points at the first protected head line when available [@dangerfile]. Adding or removing guard markers warns reviewers that inline policy changed; removing a marker can also warn how many previously protected deleted lines were exposed [@dangerfile].

## Related Workflow

The broader contributor automation is covered by [Contributor Automation](../../architecture/automation/contributor-automation), and shared-infrastructure edits can use [Change Shared Infrastructure](../../guides/contributor/change-shared-infrastructure). The exact GitHub workflow surface is collected in [GitHub Workflows](../../reference/automation/github-workflows).
