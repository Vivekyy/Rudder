---
title: "Artifact-Checked Plugin Publishing"
summary: "Rudder publishes the root plugin package by checking npmjs.org, plugin tags, and GitHub Releases directly instead of treating a tag as the npm publish source of truth."
topics: [release, automation, decisions, plugin, package]
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

# Artifact-Checked Plugin Publishing

Rudder's release automation decision is to publish the repository-root plugin package by checking each release artifact directly. Both release workflows require `package.json` to name `@ruddercode/rudder-plugin`, derive `version` from that manifest, derive the plugin tag as `rudder-plugin-v<version>`, check npmjs.org for `name@version`, check local Git tags for that plugin tag, and check GitHub Releases for the same tag [@package-json] [@publish-workflow] [@release-alert]. The pull-request alert workflow mirrors the publish checks so maintainers can see whether merging to `main` will publish the plugin package, create the plugin tag, or create the GitHub Release before the merge happens [@release-alert].

## Status

Accepted in the current plugin release workflows. `publish.yml` runs on pushes to `main` and manual dispatch, with `contents: write` and `id-token: write` permissions [@publish-workflow]. `release-alert.yml` runs on pull requests opened, synchronized, or reopened against `main`, with read access to contents and write access to pull-request comments [@release-alert].

## Context

The package version is the release coordinate, but the npm registry is the npm publish source of truth. The publish workflow checks `npm view "@ruddercode/rudder-plugin@<version>" version --registry=https://registry.npmjs.org`; success disables npm publishing, while npm 404 enables publishing [@publish-workflow]. It separately checks whether the package exists at all, and a missing package plus missing version marks the publication as a bootstrap publish [@publish-workflow].

The plugin tag and GitHub Release are separate artifacts. Both workflows derive `tag="rudder-plugin-v${version}"`, check whether that tag exists, and check whether `gh api repos/${GITHUB_REPOSITORY}/releases/tags/${tag}` returns a release or 404 [@publish-workflow] [@release-alert]. This means a missing tag can be created even when npm already has the package version, and a missing GitHub Release can be backfilled for an existing tag [@publish-workflow].

## Decision

Rudder will publish the root plugin package to npmjs.org, create plugin-specific tags in the `rudder-plugin-v<version>` form, and create GitHub Releases by direct artifact checks [@publish-workflow]. It will not use GitHub Packages as a release target in the current workflow, and it will not infer npmjs.org state from the presence or absence of the Git tag [@publish-workflow].

## Consequences

The first npm publication needs `NPM_TOKEN` because the package must exist before Trusted Publisher setup can be configured; the publish workflow fails bootstrap publication when that secret is absent [@publish-workflow]. Later publications still run through the same validation step, which checks agent layout, typecheck, tests, build, and `npm pack --dry-run` before publishing [@publish-workflow].

Pull requests get an early warning. The release-alert job writes or updates a sticky comment marked with `<!-- release-alert -->`, reports whether merging will publish to npmjs.org, use the bootstrap token, create the plugin tag, or create the GitHub Release, and switches to a no-release note when all plugin artifacts already exist for the manifest version [@release-alert]. Release preparation should use [Prepare Package Release](../../guides/release/prepare-package-release) and [GitHub Workflows](../../reference/automation/github-workflows) instead of relying on a manual tag-first process.
