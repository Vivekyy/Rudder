---
title: "Prepare Package Release"
summary: "Prepare package release explains how to change the plugin package version so the publish and release-alert workflows ship the intended npm, tag, and GitHub Release artifacts."
topics: [guides, release, package, automation, plugin]
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

Prepare a package release when a branch should publish a new `@ruddercode/rudder-plugin` version after merge to `main`. The release work is version-driven: `package.json` supplies the package name and version, the release-alert workflow tells the PR whether merge would publish the npm plugin package, create the plugin tag, or create a GitHub Release, and the publish workflow runs on `main` to create the missing artifacts [@package] [@release-alert] [@publish]. See [Release Automation](../../architecture/release/release-automation), [Artifact-Checked Plugin Publishing](../../decisions/release/artifact-checked-plugin-publishing), [Package Scripts](../../reference/tooling/package-scripts), and [GitHub Workflows](../../reference/automation/github-workflows) for the surrounding reference material.

## Choose The Version

The package manifest currently names the package `@ruddercode/rudder-plugin` and stores the release version in the `version` field [@package]. The publish and release-alert workflows both compute `tag="rudder-plugin-v${version}"` from that manifest value [@publish] [@release-alert].

Use a package version change to signal a user-facing release. The release-alert workflow's no-release PR comment tells contributors to bump `package.json` with `npm version patch --no-git-tag-version` when they intend to ship a user-facing change [@release-alert]. Use the appropriate semver level for the change, and do not create the git tag locally as part of the PR because the publish workflow owns tag creation after registry publishing succeeds [@publish].

## Validate Before Merge

Run the package's publishability checks before relying on automation. `prepublishOnly` runs `npm run typecheck`, `npm test`, and `npm run build` [@package]. Those are the same checks described in [Run Checks](../contributor/run-checks), and they catch local TypeScript, test, and build failures before the release branch reaches `main`.

Also confirm that the package name remains exactly `@ruddercode/rudder-plugin`. Both release workflows fail before release work if `package.json` contains another name [@publish] [@release-alert].

## Read The Release Alert

On PRs targeting `main`, the release-alert workflow checks whether npmjs.org already has the package version, whether the first publication would require the `NPM_TOKEN` bootstrap secret, whether the version's plugin tag exists, and whether a GitHub Release exists for the tag [@release-alert]. It posts or updates a sticky PR comment marked by `<!-- release-alert -->`, so repeated pushes update one comment instead of creating new release notices [@release-alert].

If the alert says merge will release the plugin, verify that the named version and artifact targets are intentional. If it says no plugin release on merge, the current version already has the npm package, plugin tag, and GitHub Release; bump the version before merging if a new release is required [@release-alert].

## What Happens On Main

The publish workflow runs on pushes to `main` and on manual dispatch with concurrency group `publish-rudder-plugin` [@publish]. It reads the manifest version and package name, checks npmjs.org for that package version, checks whether the plugin tag exists, and checks whether the GitHub Release for the tag exists [@publish].

If npmjs.org returns a missing-version response, npm publishing is enabled; if the package itself is also missing, bootstrap publishing requires `NPM_TOKEN`; if the tag or GitHub Release is missing, those artifacts are created [@publish]. When any release artifact is needed, the workflow installs Node 24, upgrades npm for Trusted Publishers support, runs `npm ci`, validates the package, publishes to npmjs.org when needed, pushes the tag when needed, and creates the GitHub Release with generated notes when needed [@publish].

## Recover From A Bad Alert

If the PR alert names an unexpected version, fix `package.json` before merge [@release-alert]. If it says merge would only backfill missing artifacts because the tag already exists, do not merge unless that backfill is intentional [@release-alert]. If the publish workflow cannot determine registry or release state, it emits an error and exits instead of guessing [@publish].
