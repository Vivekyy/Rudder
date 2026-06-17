See [AGENTS.md](./AGENTS.md) for development, pull request, and npm publishing
instructions. It is the single source of truth for how to work in this repo.

Quick reference:

- Run `npm run typecheck` and `npm test` before committing.
- Branch off `main`; never commit directly to `main`.
- Bump the version in the same PR as a user-facing change
  (`npm version patch --no-git-tag-version`).
- **Publishing is tag-triggered.** After the version-bump PR merges to `main`,
  push a matching `v*` tag (`git tag v<version> && git push --follow-tags`) to
  fire `.github/workflows/publish.yml`, which publishes to npm via OIDC.
- Path-resolving code must work in both the `.ts` dev tree and the compiled
  `.js` under `dist/` — see the `rudderArgv()` note in AGENTS.md.
