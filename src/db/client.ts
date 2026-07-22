import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-sqlite';
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

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

export function openDb(): DatabaseSync {
  if (_sqlite) return _sqlite;
  mkdirSync(rudderHome(), { recursive: true });
  const db = new DatabaseSync(dbPath());
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  const orm = drizzle({ client: db });
  try {
    migrate(orm, { migrationsFolder });
  } catch (error) {
    db.close();
    throw error;
  }
  _drizzle = orm;
  _sqlite = db;
  return db;
}

export function rudderDb(): RudderDb {
  if (!_drizzle) {
    openDb();
  }
  return _drizzle!;
}

/** Close cached database handles. Primarily useful for short-lived processes and tests. */
export function closeDb(): void {
  _sqlite?.close();
  _sqlite = null;
  _drizzle = null;
}

/** TCP port the `rudder start` dashboard daemon listens on (override with RUDDER_PORT). */
export function rudderPort(): number {
  const p = Number(process.env.RUDDER_PORT);
  return Number.isInteger(p) && p > 0 && p < 65536 ? p : 41789;
}
