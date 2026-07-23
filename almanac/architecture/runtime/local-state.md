---
title: "Local State"
summary: "Rudder keeps runtime state in a user-scoped home directory that owns the SQLite database, prompt-capture preference, telemetry identity file, and dashboard port defaults."
topics: [architecture, runtime, local-state, sqlite, prompt-capture]
sources:
  - id: db-client
    type: file
    path: src/db/client.ts
  - id: prompt-control
    type: file
    path: src/prompt-control.ts
  - id: telemetry
    type: file
    path: src/telemetry.ts
  - id: gitignore
    type: file
    path: .gitignore
---

Rudder local state is the small persistent runtime surface that exists outside the source tree. The database client resolves a Rudder home directory from `RUDDER_HOME` or `~/.rudder`, stores the SQLite database at `rudder.db`, opens that database through a process-wide singleton, enables WAL journaling, applies generated Drizzle migrations, and then exposes Drizzle access [@db-client]. The same home directory stores the prompt-capture disable marker and anonymous telemetry identity file, so [Prompt Branch Store](prompt-branch-store), prompt controls, and [Telemetry](telemetry) share one local state root [@prompt-control] [@telemetry]. Runtime artifacts live under the selected Rudder home instead of a repository-local state directory, while the source tree keeps only the code and configuration that derive those paths [@db-client] [@gitignore].

## State Root

`rudderHome()` is the owner of the local state path. It returns `process.env.RUDDER_HOME` when that value is present, and otherwise joins the operating-system home directory with `.rudder` [@db-client]. `dbPath()` derives the database location by joining that root with `rudder.db`, and `promptCaptureDisabledPath()` derives the persistent capture preference as `<rudderHome()>/prompt-capture-disabled` [@db-client] [@prompt-control].

The source tree does not carry a repo-local state directory convention. The repository ignore file covers dependencies, build output, generated backups, logs, environment files, coverage, and editor files, but it does not define a `.rudder/` workspace cache [@gitignore]. The runtime code instead creates the selected Rudder home directory directly, so changing the state location is an environment-variable choice rather than a working-tree layout change [@db-client].

## Database Open Flow

`openDb()` is the entrypoint that turns the path contract into a live SQLite connection. It returns the existing `_sqlite` handle when one has already been opened, creates the Rudder home directory recursively on the first open, restricts the state directory to mode `0700` when possible, constructs `DatabaseSync` at `dbPath()`, restricts the database file to mode `0600` when possible, enables `PRAGMA journal_mode = WAL`, sets `PRAGMA busy_timeout = 5000`, enables `PRAGMA secure_delete = ON`, initializes Drizzle, and applies migrations from the configured `drizzle/` folder [@db-client]. The singleton matters because the Drizzle wrapper and the raw SQLite handle are initialized together and reused through module-level state [@db-client].

Migration application is deliberately part of the open flow. `openDb()` derives the migration directory from `RUDDER_MIGRATIONS_PATH` when that variable is set, otherwise it resolves the repository `drizzle/` directory relative to `src/db/client.ts`; it closes the raw SQLite handle if migration application fails [@db-client]. That means code using the [Prompt Branch Store](prompt-branch-store) can call `rudderDb()` without running a separate migration command first; `rudderDb()` opens the database if the Drizzle singleton is still missing [@db-client].

## Dashboard Port

`rudderPort()` is a small local-state helper for the dashboard daemon. It converts `RUDDER_PORT` with `Number()`, accepts only integer ports greater than zero and less than `65536`, and falls back to `41789` for unset, non-numeric, fractional, zero, negative, or out-of-range values [@db-client]. The exact environment contract is listed in [Environment Variables](../../reference/configuration/environment-variables).

## Shared Boundary

Local state currently covers the SQLite database path, the prompt-capture preference marker, the telemetry identity file, and the dashboard port default. Telemetry builds `identity.json` under `rudderHome()`, reads an existing `{ id }` value when present, and writes a generated UUID there on a best-effort basis when it needs a new anonymous installation identity [@telemetry]. The important invariant is that runtime code should derive persistent paths from `rudderHome()` instead of inventing new repository-local locations. That keeps [Telemetry](telemetry), [Prompt Branch Store](prompt-branch-store), prompt controls, and the environment-variable reference aligned around the same state root [@db-client] [@prompt-control].
