---
name: manage-sqlite-migrations
description: Create and validate Rudder's Drizzle-backed local SQLite migrations. Use when changing src/db/schema.ts, generating or reviewing files under drizzle/, adding or altering database tables, columns, constraints, or indexes, writing data backfills, or troubleshooting migration failures in rudder.db.
---

# Manage SQLite Migrations

Produce a committed Drizzle migration that succeeds both from an empty database and from a representative snapshot without modifying the user's real `rudder.db`.

## Preserve the safety boundary

- Treat `src/db/schema.ts` as the declarative schema and committed folders under `drizzle/` as the runtime history.
- Never run migration experiments against the real database. `openDb()` applies pending migrations automatically, so do not point application code at the real `RUDDER_HOME` while authoring a migration.
- Never use `drizzle-kit push`; generate a migration file and review its SQL.
- Treat migrations already present on `origin/main` as immutable.
  Add a forward migration instead of rewriting published history.
- Do not delete data, drop schema objects, or replace the real database unless the user explicitly authorized that destructive outcome.
- Do not edit `almanac/` during ordinary migration work.
  Use it as read-only context unless the user invokes a CodeAlmanac maintenance workflow.

## Follow the workflow

1. Inspect `.agentsignore`, `git status`, `src/db/schema.ts`, `src/db/client.ts`, `drizzle.config.ts`, the current `drizzle/` history, and migration tests.
   Search CodeAlmanac for the affected database files or concept when architectural context is relevant.
2. Before changing shared database infrastructure, run the repository baseline:

   ```bash
   npm run typecheck
   npm test
   npm run build
   ```

   Install dependencies first when `node_modules/` is absent.
   Report pre-existing failures before continuing.

3. State the intended schema and data invariants.
   Classify the change as additive, data-transforming, or destructive.
   For a destructive change, preserve required data in a new shape before removing the old shape; stop for user approval when data loss was not explicitly requested.
4. Edit `src/db/schema.ts`, then generate a named migration:

   ```bash
   npm run db:generate -- --name <short-kebab-name>
   ```

   Resolve Drizzle rename prompts from the requested data semantics.
   Do not guess that a drop/add pair is a rename.

5. Review every generated `migration.sql` and `snapshot.json`.
   Check especially for:

   - table rebuilds that fail to copy every retained column or recreate indexes, constraints, and triggers;
   - `NOT NULL` additions without a valid value for existing rows;
   - unique constraints or primary keys that existing duplicate rows can violate;
   - foreign-key violations and unsafe operation ordering;
   - unintended `DROP TABLE`, `DROP COLUMN`, or `DELETE` statements;
   - schema/data transformations whose result is not represented in `src/db/schema.ts`.

   Use a custom generated migration when a data backfill cannot be expressed by the schema diff.
   Keep statement breakpoints intact so the runtime migrator reads the file correctly.

6. Run the bundled validator from the repository root:

   ```bash
   node .agents/skills/manage-sqlite-migrations/scripts/validate-migrations.mjs
   ```

   The validator always applies the complete migration history to a fresh database.
   When `RUDDER_HOME/rudder.db` or `~/.rudder/rudder.db` exists, it also creates a consistent `VACUUM INTO` snapshot and applies only pending migrations to that disposable copy.
   It then reruns the migrator, checks the migration count, runs `PRAGMA quick_check`, and runs `PRAGMA foreign_key_check`.

   Useful options:

   ```bash
   # Validate only the empty-database path.
   node .agents/skills/manage-sqlite-migrations/scripts/validate-migrations.mjs --fresh-only

   # Validate a specific representative database without changing it.
   node .agents/skills/manage-sqlite-migrations/scripts/validate-migrations.mjs --source /path/to/rudder.db

   # Retain disposable databases for targeted queries or app checks.
   node .agents/skills/manage-sqlite-migrations/scripts/validate-migrations.mjs --keep
   ```

7. Add or update tests for the new schema and its data invariants.
   Update `test/migrations.test.ts` when its expected table set or migration count changes.
   A successful empty-database migration is necessary but not sufficient for a data-changing migration; exercise representative pre-migration rows and assert their post-migration values.
8. Run `npm run typecheck`, `npm test`, and `npm run build`.
   Confirm the build still copies `drizzle/` to `dist/drizzle`, because compiled runtime startup resolves migrations there.
9. Review `git diff origin/main...` plus local changes.
   Expect the schema declaration, a new generated migration folder, relevant tests, and any directly affected runtime code.
   Do not commit generated `dist/` output.

## Recover safely

- Prefer a new forward migration for a migration that may already have run.
- Restore a known-good database copy only together with application code that understands that schema.
- Never fake a rollback by deleting rows from `__drizzle_migrations` or by editing a live database manually.
- Remove retained sandbox directories after investigation; they can contain copies of user data.

## Report the result

Name the generated migration, summarize schema and data effects, identify any destructive SQL, report fresh and representative-snapshot validation separately, list targeted invariant tests, and state the final typecheck/test/build results.
