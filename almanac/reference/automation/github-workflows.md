---
title: "GitHub Workflows Reference"
summary: "This reference lists the triggers, permissions, jobs, and key behavior of Rudder's GitHub Actions workflows."
topics: [reference, automation, github-actions, validation, release]
sources:
  - id: test-workflow
    type: file
    path: .github/workflows/test.yml
  - id: danger-workflow
    type: file
    path: .github/workflows/danger.yml
  - id: dangerfile
    type: file
    path: dangerfile.ts
  - id: publish-workflow
    type: file
    path: .github/workflows/publish.yml
  - id: release-alert
    type: file
    path: .github/workflows/release-alert.yml
---

# GitHub Workflows Reference

This reference covers the four GitHub Actions workflows in Rudder: package validation, Danger agent guards, plugin publishing, and plugin release alerts [@test-workflow] [@danger-workflow] [@publish-workflow] [@release-alert]. Use it for exact triggers, permissions, job names, and command sequences; use [Contributor Automation](../../architecture/automation/contributor-automation) and [Release Automation](../../architecture/release/release-automation) for the system-level explanation.

| Workflow | File | Trigger | Permissions | Main job |
| --- | --- | --- | --- | --- |
| Test | `.github/workflows/test.yml` | Push to any branch and manual `workflow_dispatch` | `contents: read` | `test` [@test-workflow]. |
| Enforce agent guards | `.github/workflows/danger.yml` | Pull requests targeting `main` | `contents: read`, `pull-requests: write` | `danger` [@danger-workflow]. |
| Publish Rudder plugin | `.github/workflows/publish.yml` | Push to `main` and manual `workflow_dispatch` | `contents: write`, `id-token: write` | `publish` [@publish-workflow]. |
| Plugin release alert | `.github/workflows/release-alert.yml` | Pull requests opened, synchronized, or reopened against `main` | `contents: read`, `pull-requests: write` | `release-alert` [@release-alert]. |

## Test

The Test workflow runs one `test` job on `ubuntu-latest` [@test-workflow]. The job checks out the repository, sets up Node 24, installs dependencies with `npm ci`, then runs `npm run check:agent-layout`, `npm run format:markdown:check`, `npm run typecheck`, `npm test`, and `npm run build` [@test-workflow]. These commands are the CI version of the package and documentation checks listed in [Package Scripts](../tooling/package-scripts).

## Enforce Agent Guards

The Danger workflow runs one `danger` job on pull requests targeting `main` [@danger-workflow]. The job checks out full history, sets up Node 24, installs dependencies with `npm ci`, and runs `npm run danger:ci` with `GITHUB_TOKEN` [@danger-workflow].

`dangerfile.ts` applies only when it detects agent authorship from the PR author, commit author names and emails, or `Co-authored-by` trailers [@dangerfile]. For detected-agent PRs, it fails changes to `README.md`, `LICENSE`, `CLAUDE.md`, `assets/**`, `.claude/**`, `.codex/**`, and `.cursor/**`; it also fails invalid inline agent guard markers and changes inside protected inline regions [@dangerfile]. Policy file changes and guard marker changes warn reviewers instead of silently changing the guard surface [@dangerfile].

## Publish Rudder Plugin

The publish workflow serializes runs with concurrency group `publish-rudder-plugin` and does not cancel an in-progress publish [@publish-workflow]. The job checks out full history, reads `package.json` for `name` and `version`, derives `tag=rudder-plugin-v<version>`, and fails if the package name is not exactly `@ruddercode/rudder-plugin` [@publish-workflow].

The first step sets artifact flags. It checks npmjs.org with `npm view`, detects whether this is a first publication that needs `NPM_TOKEN`, checks the plugin tag with `git rev-parse`, and checks the GitHub Release through `gh api repos/${GITHUB_REPOSITORY}/releases/tags/${tag}` [@publish-workflow]. When any artifact is missing, the workflow sets up Node 24, installs the latest npm for Trusted Publishers support, runs `npm ci`, validates the plugin package, publishes to npmjs.org when needed, pushes the tag when needed, and creates the GitHub Release with generated notes when missing [@publish-workflow].

## Plugin Release Alert

The release-alert workflow uses concurrency group `plugin-release-alert-${{ github.event.pull_request.number }}` and cancels older in-progress runs for the same PR [@release-alert]. Its check step reads `package.json`, derives the same package fields as the publish workflow, rejects package names other than `@ruddercode/rudder-plugin`, checks npmjs.org with `npm view`, detects bootstrap-token need, checks the plugin tag, and checks the GitHub Release with `gh api` [@release-alert].

The comment step uses `actions/github-script@v7` with the hidden marker `<!-- release-alert -->` [@release-alert]. It updates the existing marked comment when present or creates a new comment, warning when merge will publish the plugin package, use the bootstrap token, create the plugin tag, or create the GitHub Release, and reporting no plugin release when all artifacts already exist for the version [@release-alert].
