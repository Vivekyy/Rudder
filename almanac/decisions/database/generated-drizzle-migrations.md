---
title: "Generated Drizzle Migrations"
summary: "Rudder uses committed Drizzle migrations as the runtime database creation path, so package builds must ship the migration files with compiled code."
topics: [database, runtime, decisions, sqlite, session-branch-tracking]
sources:
  - id: db-client
    type: file
    path: src/db/client.ts
  - id: schema
    type: file
    path: src/db/schema.ts
  - id: migration
    type: file
    path: drizzle/20260722173002_ambiguous_overlord/migration.sql
  - id: drizzle-config
    type: file
    path: drizzle.config.ts
  - id: package-json
    type: file
    path: package.json
  - id: migration-tests
    type: file
    path: test/migrations.test.ts
---

# Generated Drizzle Migrations

Rudder's database schema decision is that generated Drizzle migrations are part of runtime startup. `openDb()` creates the local SQLite database, wraps it with Drizzle, and calls the Drizzle migrator against the committed `drizzle/` folder before exposing the cached database handles [@db-client]. The first generated migration creates `session_branches`, and the package build copies the `drizzle/` directory into `dist/drizzle` so the compiled database client can resolve migrations beside emitted JavaScript [@migration] [@package-json].

## Status

Accepted for the current session-branch database. The active schema surface is split by role: `src/db/schema.ts` declares the Drizzle table, `drizzle.config.ts` tells Drizzle Kit to generate SQLite migrations into `./drizzle`, the generated SQL creates the live table, and `openDb()` applies those migrations during runtime database initialization [@schema] [@drizzle-config] [@migration] [@db-client].

## Context

The runtime database must be usable as soon as a local process asks for it, but schema creation now needs to survive packaging. `openDb()` derives `migrationsFolder` with `fileURLToPath(new URL('../../drizzle', import.meta.url))`, so source execution reads the repository `drizzle/` directory and compiled execution reads `dist/drizzle` [@db-client]. `package.json` therefore makes `build` run `tsc -p tsconfig.build.json` and then `cp -R drizzle dist/drizzle` after clearing `dist` [@package-json].

The generated migration creates the `session_branches` table and its repository/branch index [@migration]. `test/migrations.test.ts` verifies the runtime behavior instead of only checking the schema declaration: it opens a new database through `openDb()`, confirms the table exists, and confirms Drizzle recorded one migration row [@migration-tests].

## Decision

Rudder will create runtime database schema from committed Drizzle migrations. Maintainers should update the Drizzle schema, generate a migration with `npm run db:generate`, commit the generated migration files, and keep the package build copying `drizzle/` into `dist/drizzle` while compiled code resolves migrations relative to `import.meta.url` [@schema] [@drizzle-config] [@package-json] [@db-client].

## Consequences

Schema changes now have one runtime creation path. The live database is not created by hand-written `CREATE TABLE IF NOT EXISTS` SQL in `src/db/client.ts`; it is created by the generated migration files that Drizzle's migrator applies [@db-client] [@migration]. This removes schema duplication between embedded bootstrap SQL and Drizzle declarations, but it makes missing migration files a runtime packaging failure rather than a developer-only generation mistake.

The package build is part of the database decision. Removing `cp -R drizzle dist/drizzle` would leave compiled code without the folder that `migrationsFolder` points to after TypeScript emit [@db-client] [@package-json]. Future database work should update [Session Branches Schema](../../reference/database/session-branches-schema), the migration tests, and any runtime guide that depends on the table.
