---
title: "Release Automation"
summary: "Release automation uses package.json version checks to publish the npm plugin package, create plugin tags and GitHub Releases, and warn PR authors before merge."
topics: [architecture, release, automation, package, plugin]
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

Rudder's release automation is split between a publishing workflow on `main` and a pull-request alert workflow that mirrors the publish decision before merge. Both workflows read `package.json`, require the package name to be `@ruddercode/rudder-plugin`, derive the manifest version, derive tag `rudder-plugin-v<version>`, check npmjs.org for the package version, check the Git tag, and check the GitHub Release [@package-json] [@publish-workflow] [@release-alert]. The resulting system publishes the npm plugin package, creates missing plugin tags, creates missing GitHub Releases, and posts a sticky PR comment when merging would create release artifacts [@publish-workflow] [@release-alert].

## Version As Release Input

`package.json` is the only version input for the workflows. The package is currently `@ruddercode/rudder-plugin` at version `0.1.0`, and both workflows turn that version into tag `rudder-plugin-v0.1.0` at runtime [@package-json] [@publish-workflow] [@release-alert]. The release-alert workflow performs the same package-name, version, tag, npm, and GitHub Release checks on pull requests to `main` [@release-alert].

Both workflows reject any package name other than `@ruddercode/rudder-plugin` before attempting release work [@publish-workflow] [@release-alert]. This is a release invariant: changing the package name affects plugin marketplace metadata, npm publication, and tag naming, so evaluate it through [Prepare Package Release](../../guides/release/prepare-package-release) and [Rudder Plugin Package](../tooling/plugin-package).

## Publish Job

The publish workflow runs on pushes to `main` and on manual dispatch, with a single `publish-rudder-plugin` concurrency group and `contents: write` plus `id-token: write` permissions [@publish-workflow]. Its first shell step checks whether npmjs.org already has `name@version`, whether the package exists at all, whether the `rudder-plugin-v<version>` tag exists, and whether a GitHub Release exists for that tag [@publish-workflow].

Those checks create separate flags for each artifact. A missing npmjs.org version enables npm publishing, a missing package plus missing version marks a bootstrap publish, a missing tag enables tag creation, and a missing GitHub Release enables release creation [@publish-workflow]. When any artifact is missing, the job upgrades npm, installs dependencies with `npm ci`, validates the plugin package, publishes to npmjs.org when needed, pushes the plugin tag when needed, and creates the GitHub Release with generated notes when needed [@publish-workflow].

The package scripts are part of that path because the publish workflow validates with `npm run check:agent-layout`, `npm run typecheck`, `npm test`, `npm run build`, and `npm pack --dry-run`, while `npm publish` also uses the package lifecycle in `package.json` [@publish-workflow] [@package-json]. The exact scripts are listed in [Package Scripts](../../reference/tooling/package-scripts).

## Release Alert Job

The release-alert workflow runs on pull requests opened, synchronized, or reopened against `main`; it has read permissions for contents plus write permission for pull request comments [@release-alert]. It uses a per-PR `plugin-release-alert-<pr-number>` concurrency group and cancels in-progress runs on newer pushes, so the latest branch state owns the PR warning [@release-alert].

The alert job mirrors the publish checks without publishing. It checks npmjs.org, bootstrap-token need, tag creation, and GitHub Release creation, then sets `will_release=true` when any release artifact would be created after merge [@release-alert]. A GitHub Script step searches for an existing comment containing `<!-- release-alert -->` and updates it, or creates one when missing [@release-alert]. The comment warns when merge would publish the plugin, use the bootstrap token, create the plugin tag, or create a release, and it switches to a no-release message when all plugin artifacts already exist for the version [@release-alert].

## Release Model

The current model is artifact-checked for npmjs.org, plugin tags, and GitHub Releases. A present npm package version disables npm publishing regardless of tag state, and a missing tag or release can still be backfilled independently [@publish-workflow] [@release-alert]. [Artifact-Checked Plugin Publishing](../../decisions/release/artifact-checked-plugin-publishing) records that policy, while [GitHub Workflows](../../reference/automation/github-workflows) gives the trigger and permission lookup.
