---
title: "Generated Drizzle Migrations"
summary: "Rudder uses committed Drizzle migrations as the runtime database creation path, so plugin builds must ship the migration files with the bundled hook."
topics: [database, runtime, decisions, sqlite, prompt-capture, plugin]
sources:
  - id: db-client
    type: file
    path: src/db/client.ts
  - id: schema
    type: file
    path: src/db/schema.ts
  - id: initial-migration
    type: file
    path: drizzle/20260722173002_ambiguous_overlord/migration.sql
  - id: prompt-migration
    type: file
    path: drizzle/20260722200723_prompt-branch-links/migration.sql
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

Rudder's database schema decision is that generated Drizzle migrations are part of runtime startup. `openDb()` creates the local SQLite database, wraps it with Drizzle, and calls the Drizzle migrator against the configured migrations folder before exposing the cached database handles [@db-client]. The current migration sequence creates `prompt_branches` after the initial session-branch migration and drops the older `session_branches` table, while the plugin build copies `drizzle/` into `dist/drizzle` so the installed prompt hook can run the same migrations [@initial-migration] [@prompt-migration] [@package-json].

## Status

Accepted for the current prompt-capture database. The active schema surface is split by role: `src/db/schema.ts` declares `prompt_branches`, `drizzle.config.ts` tells Drizzle Kit to generate SQLite migrations into `./drizzle`, the generated SQL creates the live prompt table, and `openDb()` applies those migrations during runtime database initialization [@schema] [@drizzle-config] [@prompt-migration] [@db-client].

## Context

The runtime database must be usable as soon as a local process asks for it, but schema creation also needs to survive plugin packaging. `openDb()` reads `RUDDER_MIGRATIONS_PATH` when it is set and otherwise falls back to the repository `drizzle/` directory relative to `src/db/client.ts` [@db-client]. `package.json` therefore makes `build` bundle `bin/rudder-prompt-hook.ts` into `dist/rudder-prompt-hook.mjs` and copy `drizzle/` into `dist/drizzle` after clearing `dist` [@package-json].

The prompt migration creates `prompt_branches`, adds repository/branch and session indexes, and drops `session_branches` [@prompt-migration]. `test/migrations.test.ts` verifies runtime behavior instead of only checking the schema declaration: it opens a new database through `openDb()`, confirms `prompt_branches` is present, confirms `session_branches` is absent, and confirms Drizzle recorded two migration rows [@migration-tests].

## Decision

Rudder will create runtime database schema from committed Drizzle migrations. Maintainers should update the Drizzle schema, generate a migration with `npm run db:generate`, commit the generated migration files, and keep the plugin build copying `drizzle/` into `dist/drizzle` while installed hook code uses `RUDDER_MIGRATIONS_PATH` to find those files [@schema] [@drizzle-config] [@package-json] [@db-client].

## Consequences

Schema changes now have one runtime creation path. The live database is not created by hand-written `CREATE TABLE IF NOT EXISTS` SQL in `src/db/client.ts`; it is created by the generated migration files that Drizzle's migrator applies [@db-client] [@prompt-migration]. This removes schema duplication between embedded bootstrap SQL and Drizzle declarations, but it makes missing migration files a runtime packaging failure rather than a developer-only generation mistake.

The plugin build is part of the database decision. Removing `cp -R drizzle dist/drizzle` would leave installed hook code without the migration folder assigned to `RUDDER_MIGRATIONS_PATH` [@db-client] [@package-json]. Future database work should update [Prompt Branches Schema](../../reference/database/prompt-branches-schema), the migration tests, and any runtime guide that depends on the table.
