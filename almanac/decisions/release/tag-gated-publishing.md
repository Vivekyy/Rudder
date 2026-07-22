---
title: "Tag-Gated Publishing"
summary: "Rudder uses the package version tag as the npmjs.org publish gate while checking GitHub Packages and GitHub Releases directly for missing artifacts."
topics: [release, automation, decisions]
sources:
  - id: publish-workflow
    type: file
    path: .github/workflows/publish.yml
  - id: release-alert
    type: file
    path: .github/workflows/release-alert.yml
  - id: package-json
    type: file
    path: package.json
---

Rudder's release automation decision is to treat the `v<version>` Git tag as the npmjs.org publish gate, while checking GitHub Packages and GitHub Releases directly for the same package version and tag [@publish-workflow] [@release-alert]. The publish workflow computes the package name and version from `package.json`, publishes to npmjs.org only when `refs/tags/v<version>` is missing, checks GitHub Packages with `npm view`, pushes the tag after package publishing succeeds, and creates a missing GitHub Release for that tag [@publish-workflow]. The pull-request alert workflow mirrors that logic so maintainers can see whether merging to `main` will publish package artifacts or backfill missing GitHub artifacts before the merge happens [@release-alert].

## Status

Accepted in the current GitHub Actions release workflows. `publish.yml` runs on pushes to `main` and manual dispatch, with write permissions for contents, OIDC identity, and packages [@publish-workflow]. `release-alert.yml` runs on pull requests opened, synchronized, or reopened against `main`, with read access to contents and packages and write access to pull-request comments [@release-alert].

## Context

The package version is the release coordinate. The package manifest currently names `@ruddercode/rudder-core`, sets version `0.2.1`, and runs `prepublishOnly` as `npm run typecheck && npm test && npm run build` before publishing [@package-json]. Both release workflows read `version` and `name` from `package.json`, derive `tag="v${version}"`, and fail if the package name is not scoped because GitHub Packages requires a scoped name [@publish-workflow] [@release-alert].

There are three artifact surfaces to reconcile. npmjs.org is inferred from the local Git tag: if `refs/tags/v<version>` already exists, the workflow treats the npmjs.org release as already shipped; if the tag is missing, it will publish to npmjs.org [@publish-workflow]. GitHub Packages is checked with a temporary npm config and `npm view <name>@<version> --registry=https://npm.pkg.github.com`; a 404 means the version is missing there [@publish-workflow]. GitHub Releases are checked with `gh api repos/${GITHUB_REPOSITORY}/releases/tags/${tag}`; an HTTP 404 means the release should be created [@publish-workflow].

## Decision

Rudder will not require maintainers to create release tags manually before publishing. On `main`, the publish job derives the tag from `package.json`, publishes missing package artifacts, pushes the tag only when it did not already exist, and creates the GitHub Release when missing [@publish-workflow]. npmjs.org publishing remains tag-gated, but GitHub Packages and GitHub Releases are direct backfill targets when those artifacts are missing for an existing version [@publish-workflow] [@release-alert].

## Consequences

The workflow supports both first-time release and backfill paths. A missing tag causes npmjs.org publishing and later tag creation, while an existing tag can still allow GitHub Packages or GitHub Release backfill if direct checks show those artifacts are absent [@publish-workflow]. Because the tag step runs after the npmjs.org and GitHub Packages publish steps, a failed package publish prevents a new release tag from being pushed [@publish-workflow].

Pull requests get an early warning. The release-alert job writes or updates a sticky comment marked with `<!-- release-alert -->`, reports whether merging will publish to npmjs.org, GitHub Packages, or create a GitHub Release, and switches to a no-release note when all artifacts already exist [@release-alert]. Release preparation should therefore use the planned [prepare package release guide](../../guides/release/prepare-package-release) and the [GitHub workflows reference](../../reference/automation/github-workflows) instead of relying on a manual tag-first process.
