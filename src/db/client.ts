import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { readMigrationFiles, type MigrationConfig, type MigrationMeta } from 'drizzle-orm/migrator';
import { drizzleNodeSqlite } from './node-sqlite.ts';
import { schema } from './schema.ts';

/** Root directory for all rudder state. Override with RUDDER_HOME (used by tests). */
export function rudderHome(): string {
  return process.env.RUDDER_HOME || join(homedir(), '.rudder');
}

export function dbPath(): string {
  return join(rudderHome(), 'rudder.db');
}

let _sqlite: DatabaseSync | null = null;
let _drizzle: ReturnType<typeof drizzleNodeSqlite<typeof schema>> | null = null;

type MigratableDrizzleDb = ReturnType<typeof drizzleNodeSqlite<typeof schema>> & {
  dialect: {
    migrate(migrations: MigrationMeta[], session: unknown, config: MigrationConfig): void;
  };
  session: unknown;
};

function packageRoot(moduleUrl = import.meta.url): string {
  const modulePath = fileURLToPath(moduleUrl);
  const moduleDir = dirname(modulePath);
  return modulePath.endsWith('.js') ? resolve(moduleDir, '..', '..', '..') : resolve(moduleDir, '..', '..');
}

export function migrationsFolder(moduleUrl = import.meta.url): string {
  return join(packageRoot(moduleUrl), 'drizzle');
}

function applyMigrations(db: DatabaseSync): void {
  const config = { migrationsFolder: migrationsFolder() };
  const migrations = readMigrationFiles(config);
  const migrator = drizzleNodeSqlite(db, { schema }) as MigratableDrizzleDb;
  migrator.dialect.migrate(migrations, migrator.session, config);
}

export function openDb(): DatabaseSync {
  if (_sqlite) return _sqlite;
  mkdirSync(rudderHome(), { recursive: true });
  const db = new DatabaseSync(dbPath());
  db.exec('PRAGMA journal_mode = WAL;');
  applyMigrations(db);
  _sqlite = db;
  return db;
}

export function rudderDb(): ReturnType<typeof drizzleNodeSqlite<typeof schema>> {
  if (!_drizzle) {
    _drizzle = drizzleNodeSqlite(openDb(), { schema });
  }
  return _drizzle;
}

/** TCP port the `rudder start` dashboard daemon listens on (override with RUDDER_PORT). */
export function rudderPort(): number {
  const p = Number(process.env.RUDDER_PORT);
  return Number.isInteger(p) && p > 0 && p < 65536 ? p : 41789;
}

