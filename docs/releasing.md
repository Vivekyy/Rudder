# Release the Rudder Plugin

Rudder publishes `@ruddercode/rudder-plugin` to npmjs.org.
The first version is published manually.
Later versions are published from GitHub Actions through npm Trusted Publishing.
No npm write token belongs in GitHub Actions or repository settings.

## Bootstrap the npm package

Merge the release changes into `main`.
The first `publish.yml` run will report that manual bootstrap is required.
It will not create the plugin tag or GitHub Release yet.

Use a clean checkout of the exact `main` commit:

```text
git fetch origin
git switch main
git pull --ff-only origin main
git status --short
npm ci
npm run check:agent-layout
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

The status command must produce no output.
Authenticate the local npm client with a short-lived granular write token.
Keep that token in the local npm configuration only.
Never add it to the repository or GitHub Actions.

Publish the scoped package publicly:

```text
npm publish --access public --registry=https://registry.npmjs.org
npm view @ruddercode/rudder-plugin@0.1.0 version
```

The npm account must own or have write access to the `@ruddercode` scope.
Direct publication also requires npm two-factor authentication or a granular access token configured to bypass two-factor authentication.

## Configure Trusted Publishing

Open the published package settings on npmjs.org.
Add a GitHub Actions Trusted Publisher with:

- organization or user: `RudderCode`
- repository: `Rudder`
- workflow filename: `publish.yml`
- environment: leave empty
- allowed action: `npm publish`

The filename is case-sensitive and must not include `.github/workflows/`.
The workflow already grants `id-token: write` and uses a supported Node and npm version.

Rerun the workflow to create the first plugin tag and GitHub Release:

```text
gh workflow run publish.yml --ref main
```

After the workflow succeeds, set npm publishing access to require two-factor authentication and disallow token publishing.
Revoke the short-lived bootstrap token.

## Publish Later Versions

Bump the version in `package.json` and `package-lock.json`.
Open and merge the release pull request.
The release alert will identify the npm package, plugin tag, and GitHub Release that will be created.

On `main`, `publish.yml` validates and publishes the missing npm version through OIDC.
It then creates `rudder-plugin-v<version>` and the matching GitHub Release.

If npm reports an authentication error, confirm that the Trusted Publisher
names `RudderCode`, `Rudder`, and `publish.yml` exactly.
