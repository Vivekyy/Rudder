import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/node-sqlite';

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

function ensureBaseSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS prompts (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      ts text NOT NULL,
      day text NOT NULL,
      source text NOT NULL,
      session_id text,
      cwd text,
      project text,
      prompt text NOT NULL,
      model text,
      raw text
    );
    CREATE INDEX IF NOT EXISTS idx_prompts_day ON prompts (day);
    CREATE INDEX IF NOT EXISTS idx_prompts_source ON prompts (source);
  `);
}

export function openDb(): DatabaseSync {
  if (_sqlite) return _sqlite;
  mkdirSync(rudderHome(), { recursive: true });
  const db = new DatabaseSync(dbPath());
  db.exec('PRAGMA journal_mode = WAL;');
  ensureBaseSchema(db);
  _drizzle = drizzle({ client: db });
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
