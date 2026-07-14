import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
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

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((row) => row.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }
}

function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS prompts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ts          TEXT NOT NULL,
      day         TEXT NOT NULL,
      source      TEXT NOT NULL,
      session_id  TEXT,
      cwd         TEXT,
      project     TEXT,
      prompt      TEXT NOT NULL,
      model       TEXT,
      raw         TEXT
    );

    CREATE TABLE IF NOT EXISTS prompt_tags (
      prompt_id      INTEGER PRIMARY KEY,
      category       TEXT NOT NULL,
      reaction       TEXT NOT NULL,
      tagger         TEXT NOT NULL,
      tagger_version INTEGER NOT NULL,
      ts             TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trace_events (
      prompt_id        INTEGER PRIMARY KEY REFERENCES prompts(id),
      transcript_path  TEXT,
      task_text        TEXT,
      behavior_text    TEXT,
      status           TEXT NOT NULL DEFAULT 'pending',
      compiler         TEXT,
      compiler_version INTEGER,
      error            TEXT,
      lease_until      TEXT,
      claim_token      TEXT,
      attempts         INTEGER NOT NULL DEFAULT 0,
      ts               TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_rules (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      atomic_id             TEXT NOT NULL,
      version               INTEGER NOT NULL,
      status                TEXT NOT NULL,
      kind                  TEXT NOT NULL,
      scope                 TEXT NOT NULL,
      project               TEXT,
      rule_text             TEXT NOT NULL,
      applies_when          TEXT NOT NULL,
      does_not_apply_when   TEXT NOT NULL,
      source_prompt_id      INTEGER REFERENCES prompts(id),
      supersedes_rule_id    INTEGER REFERENCES memory_rules(id),
      created_at            TEXT NOT NULL,
      updated_at            TEXT NOT NULL,
      UNIQUE (atomic_id, version)
    );

    CREATE TABLE IF NOT EXISTS rule_evidence (
      rule_id    INTEGER NOT NULL REFERENCES memory_rules(id),
      prompt_id  INTEGER NOT NULL REFERENCES prompts(id),
      action     TEXT NOT NULL,
      ts         TEXT NOT NULL,
      PRIMARY KEY (rule_id, prompt_id)
    );
  `);
  ensureColumn(db, 'trace_events', 'lease_until', 'TEXT');
  ensureColumn(db, 'trace_events', 'claim_token', 'TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_prompts_day ON prompts(day);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_prompts_source ON prompts(source);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_trace_events_status ON trace_events(status);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_memory_rules_status ON memory_rules(status);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_memory_rules_project ON memory_rules(project);');
}

export function openDb(): DatabaseSync {
  if (_sqlite) return _sqlite;
  mkdirSync(rudderHome(), { recursive: true });
  const db = new DatabaseSync(dbPath());
  db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
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

