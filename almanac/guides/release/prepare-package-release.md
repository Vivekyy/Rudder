---
title: "Prepare Package Release"
summary: "Prepare package release explains how to change the package version so the existing publish and release-alert workflows ship the intended artifacts."
topics: [guides, release, package, automation]
sources:
  - id: publish
    type: file
    path: .github/workflows/publish.yml
  - id: release-alert
    type: file
    path: .github/workflows/release-alert.yml
  - id: package
    type: file
    path: package.json
---

# Prepare Package Release

Prepare a package release when a branch should publish a new `@ruddercode/rudder-core` version after merge to `main`. The release work is version-driven: `package.json` supplies the package name and version, the release-alert workflow tells the PR whether merge would publish package artifacts or create a GitHub Release, and the publish workflow runs on `main` to publish missing artifacts, push the `v<version>` tag when npmjs.org publishing succeeds, and create a GitHub Release when needed [@package] [@release-alert] [@publish]. See [Release Automation](../../architecture/release/release-automation), [Tag-Gated Publishing](../../decisions/release/tag-gated-publishing), [Package Scripts](../../reference/tooling/package-scripts), and [GitHub Workflows](../../reference/automation/github-workflows) for the surrounding reference material.

## Choose The Version

The package manifest currently names the package `@ruddercode/rudder-core` and stores the release version in the `version` field [@package]. The publish and release-alert workflows both compute `tag="v${version}"` from that manifest value [@publish] [@release-alert].

Use a package version change to signal a user-facing release. The release-alert workflow's no-release PR comment tells contributors to bump `package.json` with `npm version patch --no-git-tag-version` when they intend to ship a user-facing change [@release-alert]. Use the appropriate semver level for the change, and do not create the git tag locally as part of the PR because the publish workflow owns tag creation after registry publishing succeeds [@publish].

## Validate Before Merge

Run the package's publishability checks before relying on automation. `prepublishOnly` runs `npm run typecheck`, `npm test`, and `npm run build` [@package]. Those are the same checks described in [Run Checks](../contributor/run-checks), and they catch local TypeScript, test, and build failures before the release branch reaches `main`.

Also confirm that the package name remains scoped. Both release workflows fail if `package.json` contains an unscoped package name because GitHub Packages requires a scope [@publish] [@release-alert].

## Read The Release Alert

On PRs targeting `main`, the release-alert workflow checks whether the version's tag exists, whether GitHub Packages already has the package version, and whether a GitHub Release exists for the tag [@release-alert]. It posts or updates a sticky PR comment marked by `<!-- release-alert -->`, so repeated pushes update one comment instead of creating new release notices [@release-alert].

If the alert says merge will publish, verify that the named version and targets are intentional. If it says no package publish on merge, the current version is already tagged, present in GitHub Packages, and has a GitHub Release; bump the version before merging if a new release is required [@release-alert].

## What Happens On Main

The publish workflow runs on pushes to `main` and on manual dispatch with concurrency group `publish-packages` [@publish]. It reads the manifest version and package name, checks for the `v<version>` tag, checks GitHub Packages for the same package version with a temporary `.npmrc`, and checks whether the GitHub Release for the tag exists [@publish].

If the tag is missing, npmjs.org publishing is enabled; if GitHub Packages returns a missing-version response, GitHub Packages publishing is enabled; if the GitHub Release is missing, release creation is enabled [@publish]. When package publishing is needed, the workflow installs Node 24, upgrades npm for Trusted Publishers support, runs `npm ci`, publishes to the needed registries, pushes the tag only if it was missing, and creates the GitHub Release with generated notes when needed [@publish].

## Recover From A Bad Alert

If the PR alert names an unexpected version, fix `package.json` before merge [@release-alert]. If it says merge would only backfill missing artifacts because the tag already exists, do not merge unless that backfill is intentional [@release-alert]. If the publish workflow cannot determine registry or release state, it emits an error and exits instead of guessing [@publish].
