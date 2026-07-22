---
title: "Release Automation"
summary: "Release automation uses package.json version checks to publish npm and GitHub package artifacts, create tags and releases, and warn PR authors before merge."
topics: [architecture, release, automation, package]
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

Rudder's release automation is split between a publishing workflow on `main` and a pull-request alert workflow that mirrors the publish decision before merge. Both workflows read `package.json` to derive the package name, version, scope, and `v<version>` tag; both require a scoped package name for GitHub Packages [@publish-workflow] [@release-alert]. The resulting system publishes to npmjs.org when the version tag is missing, backfills GitHub Packages or GitHub Releases when those artifacts are missing, and posts a sticky PR comment when merging would create release artifacts [@publish-workflow] [@release-alert].

## Version As Release Input

`package.json` is the only version input for the workflows. The package is currently `@ruddercode/rudder-core` at version `0.2.1`, and the publish workflow turns that version into tag `v0.2.1` at runtime rather than requiring a manually pushed release tag first [@package-json] [@publish-workflow]. The release-alert workflow performs the same package-name, version, tag, and scope calculation on pull requests to `main` [@release-alert].

Both workflows reject an unscoped package name before attempting GitHub Packages work, because the registry configuration depends on a package scope extracted from the `@scope/name` form [@publish-workflow] [@release-alert]. This is a release invariant: changing the package name affects registry authentication and should be evaluated through the [prepare package release guide](../../guides/release/prepare-package-release).

## Publish Job

The publish workflow runs on pushes to `main` and on manual dispatch, with a single `publish-packages` concurrency group and `contents: write`, `id-token: write`, and `packages: write` permissions [@publish-workflow]. Its first shell step checks whether the `v<version>` tag exists, whether GitHub Packages already has `name@version`, and whether a GitHub Release exists for the tag [@publish-workflow].

Those checks create separate flags for each artifact. A missing tag enables npmjs.org publishing; a missing GitHub Packages version enables GitHub Packages publishing; a missing GitHub Release enables release creation [@publish-workflow]. If either registry needs publishing, the job installs Node 24, upgrades npm to the latest version for Trusted Publishers support, installs dependencies with `npm ci`, and publishes the needed package artifacts [@publish-workflow]. After successful registry publishing, the job pushes the `v<version>` tag if it did not exist and creates the GitHub Release with generated notes when needed [@publish-workflow].

The package scripts are part of that path because `npm publish` runs against the package defined by `package.json`, including its `prepublishOnly` script chain of `npm run typecheck && npm test && npm run build` [@package-json]. The exact scripts are listed in the [package scripts reference](../../reference/tooling/package-scripts).

## Release Alert Job

The release-alert workflow runs on pull requests opened, synchronized, or reopened against `main`; it has read permissions for contents and packages plus write permission for pull request comments [@release-alert]. It uses a per-PR concurrency group and cancels in-progress runs on newer pushes, so the latest branch state owns the PR warning [@release-alert].

The alert job mirrors the publish checks without publishing. It checks the tag, GitHub Packages version, and GitHub Release, then sets `will_publish=true` when any release artifact would be created after merge [@release-alert]. A GitHub Script step searches for an existing comment containing `<!-- release-alert -->` and updates it, or creates one when missing [@release-alert]. The comment warns when merge would publish package artifacts or create a release, and it switches to a no-release message when the version is already tagged, present in GitHub Packages, and has a GitHub Release [@release-alert].

## Release Model

The current model is tag-gated for npmjs.org but artifact-aware for GitHub Packages and GitHub Releases. If the `v<version>` tag already exists, npmjs.org publishing is disabled, but the workflows can still backfill GitHub Packages or the GitHub Release when those artifacts are missing [@publish-workflow] [@release-alert]. The [tag-gated publishing decision](../../decisions/release/tag-gated-publishing) records that policy, while the [GitHub workflows reference](../../reference/automation/github-workflows) gives the trigger and permission lookup.
