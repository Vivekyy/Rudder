#!/usr/bin/env node

import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/node-sqlite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';

function usage() {
  return `Usage: validate-migrations.mjs [options]

Validate committed Drizzle migrations against disposable SQLite databases.

Options:
  --source PATH       Snapshot this database for representative-data validation.
                      Defaults to RUDDER_HOME/rudder.db or ~/.rudder/rudder.db
                      when that file exists.
  --fresh-only        Skip representative-data validation.
  --migrations PATH   Migration folder (default: ./drizzle).
  --keep              Keep the disposable databases after validation.
  --help              Show this help.`;
}

function parseArgs(argv) {
  const options = {
    freshOnly: false,
    keep: false,
    migrationsFolder: resolve('drizzle'),
    sourcePath: undefined,
    sourceWasExplicit: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--fresh-only') {
      options.freshOnly = true;
    } else if (argument === '--keep') {
      options.keep = true;
    } else if (argument === '--help') {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    } else if (argument === '--source' || argument === '--migrations') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${argument} requires a path`);
      }
      index += 1;
      if (argument === '--source') {
        options.sourcePath = resolve(value);
        options.sourceWasExplicit = true;
      } else {
        options.migrationsFolder = resolve(value);
      }
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }

  if (options.freshOnly && options.sourceWasExplicit) {
    throw new Error('--fresh-only cannot be combined with --source');
  }

  if (!options.freshOnly && !options.sourcePath) {
    const stateRoot = process.env.RUDDER_HOME || join(homedir(), '.rudder');
    options.sourcePath = join(stateRoot, 'rudder.db');
  }

  return options;
}

function migrationNames(migrationsFolder) {
  if (!existsSync(migrationsFolder) || !statSync(migrationsFolder).isDirectory()) {
    throw new Error(`migration folder does not exist: ${migrationsFolder}`);
  }

  return readdirSync(migrationsFolder, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(join(migrationsFolder, entry.name, 'migration.sql'))
    )
    .map((entry) => entry.name)
    .sort();
}

function snapshotDatabase(sourcePath, destinationPath) {
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  try {
    // VACUUM INTO uses SQLite's own snapshot machinery, so WAL-backed databases
    // are copied consistently without mutating the source.
    source.prepare('VACUUM INTO ?').run(destinationPath);
  } finally {
    source.close();
  }
}

function readSingleValue(database, sql, key) {
  const row = database.prepare(sql).get();
  return row?.[key];
}

function validateDatabase(kind, databasePath, migrationsFolder, expectedMigrationCount) {
  const database = new DatabaseSync(databasePath);
  try {
    database.exec('PRAGMA journal_mode = WAL;');
    database.exec('PRAGMA busy_timeout = 5000;');

    const orm = drizzle({ client: database });
    migrate(orm, { migrationsFolder });

    const countAfterFirstRun = Number(
      readSingleValue(
        database,
        'SELECT count(*) AS count FROM __drizzle_migrations',
        'count'
      )
    );

    // Re-running startup migrations must not apply a migration twice.
    migrate(orm, { migrationsFolder });
    const countAfterSecondRun = Number(
      readSingleValue(
        database,
        'SELECT count(*) AS count FROM __drizzle_migrations',
        'count'
      )
    );

    const quickCheckRows = database.prepare('PRAGMA quick_check').all();
    const quickCheck = quickCheckRows.map((row) => row.quick_check);
    const foreignKeyViolations = database.prepare('PRAGMA foreign_key_check').all();

    if (countAfterFirstRun !== expectedMigrationCount) {
      throw new Error(
        `${kind}: expected ${expectedMigrationCount} applied migrations, found ${countAfterFirstRun}`
      );
    }
    if (countAfterSecondRun !== countAfterFirstRun) {
      throw new Error(`${kind}: rerunning the migrator changed the migration count`);
    }
    if (quickCheck.length !== 1 || quickCheck[0] !== 'ok') {
      throw new Error(`${kind}: PRAGMA quick_check failed: ${JSON.stringify(quickCheck)}`);
    }
    if (foreignKeyViolations.length > 0) {
      throw new Error(
        `${kind}: PRAGMA foreign_key_check found ${foreignKeyViolations.length} violation(s)`
      );
    }

    return {
      kind,
      database: databasePath,
      appliedMigrations: countAfterFirstRun,
      rerunWasIdempotent: true,
      quickCheck: 'ok',
      foreignKeyViolations: 0,
    };
  } finally {
    database.close();
  }
}

let sandboxRoot;
let options;

try {
  options = parseArgs(process.argv.slice(2));
  const migrations = migrationNames(options.migrationsFolder);
  if (migrations.length === 0) {
    throw new Error(`no migration.sql files found under ${options.migrationsFolder}`);
  }

  sandboxRoot = mkdtempSync(join(tmpdir(), 'rudder-migration-validation-'));
  const results = [];

  const freshPath = join(sandboxRoot, 'fresh.db');
  results.push(
    validateDatabase('fresh', freshPath, options.migrationsFolder, migrations.length)
  );

  let representativeSource = null;
  let representativeSkipped = null;
  if (!options.freshOnly && options.sourcePath && existsSync(options.sourcePath)) {
    if (!statSync(options.sourcePath).isFile()) {
      throw new Error(`source database is not a file: ${options.sourcePath}`);
    }
    representativeSource = options.sourcePath;
    const representativePath = join(sandboxRoot, 'representative.db');
    snapshotDatabase(representativeSource, representativePath);
    results.push(
      validateDatabase(
        'representative',
        representativePath,
        options.migrationsFolder,
        migrations.length
      )
    );
  } else if (!options.freshOnly && options.sourcePath) {
    if (options.sourceWasExplicit) {
      throw new Error(`source database does not exist: ${options.sourcePath}`);
    }
    representativeSkipped = `default source not found: ${options.sourcePath}`;
  } else {
    representativeSkipped = 'disabled by --fresh-only';
  }

  const output = {
    ok: true,
    migrationsFolder: options.migrationsFolder,
    migrations: migrations.map((name) => basename(name)),
    representativeSource,
    representativeSkipped,
    sandboxes: results,
    keptAt: options.keep ? sandboxRoot : null,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: false,
        error: message,
        keptAt: options?.keep && sandboxRoot ? sandboxRoot : null,
      },
      null,
      2
    )}\n`
  );
  process.exitCode = 1;
} finally {
  if (sandboxRoot && !options?.keep) {
    rmSync(sandboxRoot, { recursive: true, force: true });
  }
}
