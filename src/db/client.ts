import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { drizzle, type NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';

/** Root directory for all rudder state. Override with RUDDER_HOME (used by tests). */
export function rudderHome(): string {
  return process.env.RUDDER_HOME || join(homedir(), '.rudder');
}

export function dbPath(): string {
  return join(rudderHome(), 'rudder.db');
}

let _sqlite: DatabaseSync | null = null;
let _drizzle: RudderDb | null = null;

type RudderDb = ReturnType<typeof drizzle>;

function packageRoot(moduleUrl = import.meta.url): string {
  const modulePath = fileURLToPath(moduleUrl);
  const moduleDir = dirname(modulePath);
  return modulePath.endsWith('.js') ? resolve(moduleDir, '..', '..', '..') : resolve(moduleDir, '..', '..');
}

export function migrationsFolder(moduleUrl = import.meta.url): string {
  return join(packageRoot(moduleUrl), 'drizzle');
}

function applyMigrations(db: NodeSQLiteDatabase): void {
  migrate(db, { migrationsFolder: migrationsFolder() });
}

export function openDb(): DatabaseSync {
  if (_sqlite) return _sqlite;
  mkdirSync(rudderHome(), { recursive: true });
  const db = new DatabaseSync(dbPath());
  db.exec('PRAGMA journal_mode = WAL;');
  _drizzle = drizzle({ client: db });
  applyMigrations(_drizzle);
  _sqlite = db;
  return db;
}

export function rudderDb(): RudderDb {
  if (!_drizzle) {
    openDb();
  }
  return _drizzle!;
}

/** TCP port the `rudder start` dashboard daemon listens on (override with RUDDER_PORT). */
export function rudderPort(): number {
  const p = Number(process.env.RUDDER_PORT);
  return Number.isInteger(p) && p > 0 && p < 65536 ? p : 41789;
}

