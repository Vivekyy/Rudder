---
title: "Package Baseline"
summary: "The package baseline defines Rudder's scoped ESM TypeScript package, validation scripts, dependency set, build output, and publishable files."
topics: [architecture, tooling, package, typescript]
sources:
  - id: package-json
    type: file
    path: package.json
  - id: package-lock
    type: file
    path: package-lock.json
  - id: src-index
    type: file
    path: src/index.ts
  - id: tsconfig
    type: file
    path: tsconfig.json
  - id: tsconfig-build
    type: file
    path: tsconfig.build.json
  - id: gitignore
    type: file
    path: .gitignore
---

Rudder's package baseline is the repo's build and distribution frame. The package is published as `@ruddercode/rudder-core`, uses ESM, requires Node `>=23.6.0`, builds TypeScript declarations and JavaScript into `dist`, copies generated Drizzle migrations into `dist/drizzle`, and exposes only `dist`, `assets`, `README.md`, and `LICENSE` as package files [@package-json] [@tsconfig-build]. That baseline connects runtime and tooling work to [contributor automation](../automation/contributor-automation), because the package scripts define the command set those pages reuse [@package-json].

## Package Contract

`package.json` is the public package contract. It names the package, version `0.2.1`, Apache-2.0 license, GitHub repository metadata, runtime dependencies, development dependencies, supported Node engine, package scripts, and package file allowlist [@package-json]. It also declares `main`, `types`, and the package root export to point at `./dist/src/index.js` and `./dist/src/index.d.ts`, while `src/index.ts` exports the source-side database and session tagger APIs that compile to that public entrypoint [@package-json] [@src-index]. `package-lock.json` records the same root package name, version, license, dependency groups, and Node engine in lockfile format, so dependency installation resolves from a committed npm lockfile rather than from only semver ranges [@package-lock].

The package file allowlist keeps distribution narrow. `dist` carries compiled output, `assets` carries the retained visual assets, and the root `README.md` and `LICENSE` ship with the package [@package-json]. Build output and transient development files are excluded from the working tree by `.gitignore`, which ignores `node_modules/`, `dist/`, TypeScript build info, logs, `.env` files except `.env.example`, coverage, and common editor files [@gitignore].

## TypeScript Shape

The base TypeScript configuration targets `ES2023`, uses `NodeNext` module and module-resolution behavior, enables `strict`, sets Node types, and includes `bin/**/*.ts` and `src/**/*.ts` [@tsconfig]. The configuration also enables TypeScript-extension imports and relative import rewriting, which means source can use `.ts` import paths while emitted JavaScript can be rewritten during build [@tsconfig].

The build configuration extends the base config but turns emitting back on, writes output to `dist`, uses the repository root as `rootDir`, emits declarations, and disables source maps [@tsconfig-build]. The companion [TypeScript build reference](../../reference/tooling/typescript-build) records those compiler options as lookup material; this architecture page explains why they matter to the package boundary.

## Scripts And Validation

The baseline has five npm scripts: `db:generate`, `typecheck`, `build`, `test`, and `prepublishOnly` [@package-json]. `typecheck` runs `tsc --noEmit`, `test` runs Node's built-in test runner, and `build` removes `dist`, compiles with `tsconfig.build.json`, and copies `drizzle/` into `dist/drizzle` [@package-json]. `prepublishOnly` chains `typecheck`, `test`, and `build`, so the package-level publish lifecycle has the same validation set described in the [package scripts reference](../../reference/tooling/package-scripts) [@package-json].

This structure makes the package baseline small but not inert. Future runtime or CLI code must fit the existing NodeNext TypeScript model, emit build output under `dist`, ship declarations for exported APIs, keep generated migrations available to compiled code, and keep the validation scripts green before package publication [@tsconfig] [@tsconfig-build] [@package-json].

## Dependency Boundary

The runtime dependency set is deliberately limited to Drizzle ORM and PostHog's Node client, while TypeScript, Drizzle Kit, and Node type definitions are development dependencies [@package-json]. Drizzle ORM and Drizzle Kit are pinned to `1.0.0-rc.4` instead of semver ranges, which keeps generated migration behavior tied to the exact tool/runtime pair recorded in the lockfile [@package-json] [@package-lock]. The lockfile records those groups under the root package entry, which gives future changes a clear signal when dependency scope changes from tooling-only to runtime code [@package-lock].

Package changes should be read together with [contributor automation](../automation/contributor-automation). That page explains how local check surfaces and GitHub Actions reuse the `typecheck`, `test`, and `build` scripts documented here.
