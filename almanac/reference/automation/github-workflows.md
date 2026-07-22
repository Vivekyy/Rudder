---
title: "GitHub Workflows Reference"
summary: "This reference lists the triggers, permissions, jobs, and key behavior of Rudder's GitHub Actions workflows."
topics: [reference, automation, github-actions, validation, release]
sources:
  - id: test-workflow
    type: file
    path: .github/workflows/test.yml
  - id: agentsignore-workflow
    type: file
    path: .github/workflows/agentsignore.yml
  - id: publish-workflow
    type: file
    path: .github/workflows/publish.yml
  - id: release-alert
    type: file
    path: .github/workflows/release-alert.yml
---

This reference covers the four GitHub Actions workflows in Rudder: package validation, `.agentsignore` enforcement, package publishing, and release alerts [@test-workflow] [@agentsignore-workflow] [@publish-workflow] [@release-alert]. Use it for exact triggers, permissions, job names, and command sequences; use [contributor automation](../../architecture/automation/contributor-automation) and [release automation](../../architecture/release/release-automation) for the system-level explanation.

| Workflow | File | Trigger | Permissions | Main job |
| --- | --- | --- | --- | --- |
| Test | `.github/workflows/test.yml` | Push to any branch and manual `workflow_dispatch` | `contents: read` | `test` [@test-workflow] |
| Enforce `.agentsignore` | `.github/workflows/agentsignore.yml` | Pull requests targeting `main` | `checks: write`, `contents: read` | `enforce-agentsignore` [@agentsignore-workflow] |
| Publish packages and releases | `.github/workflows/publish.yml` | Push to `main` and manual `workflow_dispatch` | `contents: write`, `id-token: write`, `packages: write` | `publish` [@publish-workflow] |
| Release alert | `.github/workflows/release-alert.yml` | Pull requests opened, synchronized, or reopened against `main` | `contents: read`, `packages: read`, `pull-requests: write` | `release-alert` [@release-alert] |

## Test

The Test workflow runs one `test` job on `ubuntu-latest` [@test-workflow]. The job checks out the repository, sets up Node 24, installs dependencies with `npm ci`, then runs `npm run typecheck`, `npm test`, and `npm run build` [@test-workflow]. These commands are the CI version of the same package checks listed in the [package scripts reference](../tooling/package-scripts).

## Enforce `.agentsignore`

The `.agentsignore` enforcement workflow runs one `enforce-agentsignore` job on pull requests to `main` and grants `checks: write` so the job can publish an `agentsignore-policy` check run on the PR head SHA [@agentsignore-workflow]. It checks out the repository with full history, writes changed paths between the PR base and head SHAs to a temporary file, then evaluates those paths against `.agentsignore` rules from both the base and head revisions when each revision has the file [@agentsignore-workflow].

The matcher uses a temporary Git repository, copies each revision's rules into `.git/info/exclude`, and runs `git check-ignore --no-index -z --stdin` over the changed path list, producing separate base and head match files [@agentsignore-workflow]. Head matches are failures: the job emits an Actions error, creates a `failure` check run, lists the paths that remain protected by the PR's `.agentsignore`, and exits with status 1 [@agentsignore-workflow]. Base-only matches are explicit relaxations: when the head rules allow the changed paths but the base rules protected them, the job emits an Actions notice, creates a `neutral` check run, and exits successfully [@agentsignore-workflow]. When neither revision protects a changed path, the job prints `No agent-protected paths changed.`, creates a `success` check run, and exits successfully [@agentsignore-workflow].

## Publish Packages And Releases

The publish workflow serializes runs with concurrency group `publish-packages` and does not cancel an in-progress publish [@publish-workflow]. The job checks out full history, reads `package.json` for `name` and `version`, derives `tag=v<version>` and the package scope, and fails if the package name is not scoped [@publish-workflow].

The first step sets artifact flags. It disables npmjs.org publishing when the tag already exists, checks GitHub Packages with a temporary npm config and `npm view`, and checks the GitHub Release through `gh api repos/${GITHUB_REPOSITORY}/releases/tags/${tag}` [@publish-workflow]. When a registry publish is needed, the workflow sets up Node 24, installs the latest npm for Trusted Publishers support, runs `npm ci`, publishes to npmjs.org or GitHub Packages as needed, pushes the tag if it was missing, and creates the GitHub Release with generated notes when missing [@publish-workflow].

## Release Alert

The release-alert workflow uses concurrency group `release-alert-${{ github.event.pull_request.number }}` and cancels older in-progress runs for the same PR [@release-alert]. Its check step reads `package.json`, derives the same package fields as the publish workflow, rejects unscoped package names, checks the tag, checks GitHub Packages with `npm view`, and checks the GitHub Release with `gh api` [@release-alert].

The comment step uses `actions/github-script@v7` with the hidden marker `<!-- release-alert -->` [@release-alert]. It updates the existing marked comment when present or creates a new comment, warning when merge will publish package artifacts or create a release and reporting no publish when the tag, GitHub Packages artifact, and GitHub Release already exist [@release-alert].
