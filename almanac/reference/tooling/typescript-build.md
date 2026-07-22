---
title: "TypeScript Build"
summary: "This reference records Rudder's TypeScript compiler settings, NodeNext module model, source globs, and build output contract."
topics: [reference, typescript, tooling, package]
sources:
  - id: tsconfig
    type: file
    path: tsconfig.json
  - id: tsconfig-build
    type: file
    path: tsconfig.build.json
  - id: package-json
    type: file
    path: package.json
---

This reference defines Rudder's TypeScript build contract. The base configuration is a strict, no-emit NodeNext setup for `bin/**/*.ts` and `src/**/*.ts`; the build configuration extends it, turns emitting on, emits declarations, and writes compiled output to `dist` [@tsconfig] [@tsconfig-build]. The package manifest declares the package as ESM, requires Node `>=23.6.0`, points the package root export at `dist/src/index.js` and `dist/src/index.d.ts`, and wires `typecheck`, `build`, and `prepublishOnly` to these compiler settings [@package-json].

## Package Context

| Field | Value |
| --- | --- |
| Package module type | `"module"` [@package-json] |
| Node engine | `>=23.6.0` [@package-json] |
| Package entrypoint | `main` and `exports["."].import` point to `./dist/src/index.js` [@package-json] |
| Type entrypoint | `types` and `exports["."].types` point to `./dist/src/index.d.ts` [@package-json] |
| TypeScript dev dependency | `^5.7.0` [@package-json] |
| Node type definitions | `@types/node` `^24` [@package-json] |
| Published build directory | `dist` is included in the package `files` list [@package-json] |

For the architecture-level explanation of this package boundary, see [package baseline](../../architecture/tooling/package-baseline). For the npm command surface, see [package scripts](package-scripts).

## Base Compiler Options

`tsconfig.json` is the shared compiler baseline [@tsconfig].

| Option | Value |
| --- | --- |
| `target` | `ES2023` [@tsconfig] |
| `module` | `NodeNext` [@tsconfig] |
| `moduleResolution` | `NodeNext` [@tsconfig] |
| `allowImportingTsExtensions` | `true` [@tsconfig] |
| `rewriteRelativeImportExtensions` | `true` [@tsconfig] |
| `verbatimModuleSyntax` | `true` [@tsconfig] |
| `noEmit` | `true` [@tsconfig] |
| `strict` | `true` [@tsconfig] |
| `skipLibCheck` | `true` [@tsconfig] |
| `types` | `["node"]` [@tsconfig] |
| `lib` | `["ES2023"]` [@tsconfig] |

The NodeNext settings make the compiler follow Node's ESM-aware module rules, while `allowImportingTsExtensions` and `rewriteRelativeImportExtensions` allow TypeScript source imports to name `.ts` files and rewrite relative import extensions during emit [@tsconfig]. `verbatimModuleSyntax` keeps the written import and export syntax as the source of truth for module form [@tsconfig].

## Build Overlay

`tsconfig.build.json` extends `./tsconfig.json`, keeps the same source include globs, and overrides only emit-related compiler options [@tsconfig-build].

| Option | Value |
| --- | --- |
| `noEmit` | `false` [@tsconfig-build] |
| `outDir` | `dist` [@tsconfig-build] |
| `rootDir` | `.` [@tsconfig-build] |
| `declaration` | `true` [@tsconfig-build] |
| `sourceMap` | `false` [@tsconfig-build] |

The overlay means `npm run build` compiles from the same TypeScript rules used by the no-emit baseline, but produces JavaScript and declaration output under `dist` without source maps [@tsconfig-build] [@package-json].

## Included Sources

Both TypeScript configs include the same source globs [@tsconfig] [@tsconfig-build].

| Glob | Included by |
| --- | --- |
| `bin/**/*.ts` | `tsconfig.json`, `tsconfig.build.json` [@tsconfig] [@tsconfig-build] |
| `src/**/*.ts` | `tsconfig.json`, `tsconfig.build.json` [@tsconfig] [@tsconfig-build] |

No test glob is included in either TypeScript config, so package typechecking and build compilation are scoped to `bin` and `src` TypeScript sources [@tsconfig] [@tsconfig-build].

## Consuming Scripts

`typecheck` runs `tsc --noEmit`, matching the base config's no-emit intent [@package-json] [@tsconfig]. `build` removes `dist`, runs `tsc -p tsconfig.build.json`, and copies `drizzle/` into `dist/drizzle`, so build output is regenerated from the overlay and includes runtime migration files [@package-json] [@tsconfig-build]. `prepublishOnly` runs `npm run typecheck && npm test && npm run build`, so package publication depends on the no-emit check, tests, the emitting build, and the migration copy step [@package-json].
