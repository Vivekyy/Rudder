import { DatabaseSync } from 'node:sqlite';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { asc, eq } from 'drizzle-orm';
import { drizzleNodeSqlite } from './drizzle-node-sqlite.ts';
import { prompts, schema } from './schema.ts';

export type Source = 'claude' | 'codex';

export interface PromptRow {
  id: number;
  ts: string;
  day: string;
  source: Source;
  session_id: string | null;
  cwd: string | null;
  project: string | null;
  prompt: string;
  model: string | null;
  raw: string | null;
}

export interface NewPrompt {
  source: Source;
  prompt: string | null | undefined;
  session_id?: string | null;
  cwd?: string | null;
  project?: string | null;
  model?: string | null;
  raw?: string | null;
  ts?: string | Date;
}

/** Root directory for all rudder state. Override with RUDDER_HOME (used by tests). */
export function rudderHome(): string {
  return process.env.RUDDER_HOME || join(homedir(), '.rudder');
}

export function dbPath(): string {
  return join(rudderHome(), 'rudder.db');
}

let _db: DatabaseSync | null = null;
let _drizzle: ReturnType<typeof drizzleNodeSqlite<typeof schema>> | null = null;

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((row) => row.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }
}

export function openDb(): DatabaseSync {
  if (_db) return _db;
  mkdirSync(rudderHome(), { recursive: true });
  const db = new DatabaseSync(dbPath());
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS prompts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ts          TEXT NOT NULL,          -- ISO 8601 UTC timestamp
      day         TEXT NOT NULL,          -- local date YYYY-MM-DD
      source      TEXT NOT NULL,          -- 'claude' | 'codex'
      session_id  TEXT,
      cwd         TEXT,
      project     TEXT,                   -- basename of cwd / git repo
      prompt      TEXT NOT NULL,
      model       TEXT,
      raw         TEXT                    -- original hook payload (JSON)
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_prompts_day ON prompts(day);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_prompts_source ON prompts(source);');
  db.exec(`
    CREATE TABLE IF NOT EXISTS prompt_tags (
      prompt_id      INTEGER PRIMARY KEY,    -- one tag per prompt (REFERENCES prompts(id))
      category       TEXT NOT NULL,          -- architecting|tuning|bugfixing|housekeeping|ignored
      reaction       TEXT NOT NULL,          -- agree|disagree|none
      tagger         TEXT NOT NULL,          -- which agent classified it (claude|codex)
      tagger_version INTEGER NOT NULL,       -- bump to invalidate & re-tag
      ts             TEXT NOT NULL           -- when it was tagged (ISO 8601 UTC)
    );
  `);
  db.exec(`
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
  db.exec('CREATE INDEX IF NOT EXISTS idx_trace_events_status ON trace_events(status);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_memory_rules_status ON memory_rules(status);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_memory_rules_project ON memory_rules(project);');
  _db = db;
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

export function localDay(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function insertPrompt(p: NewPrompt): number | null {
  const text = (p.prompt || '').trim();
  // Silently skip blank prompts so hooks never store noise.
  if (!text) return null;
  const when = p.ts ? new Date(p.ts) : new Date();
  const row = rudderDb()
    .insert(prompts)
    .values({
      ts: when.toISOString(),
      day: localDay(when),
      source: p.source,
      session_id: p.session_id ?? null,
      cwd: p.cwd ?? null,
      project: p.project ?? null,
      prompt: text,
      model: p.model ?? null,
      raw: p.raw ?? null,
    })
    .run();
  return Number(row.lastInsertRowid);
}

export function promptsForDay(day: string): PromptRow[] {
  return rudderDb()
    .select()
    .from(prompts)
    .where(eq(prompts.day, day))
    .orderBy(asc(prompts.ts))
    .all() as PromptRow[];
}
