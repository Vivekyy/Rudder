import { DatabaseSync } from 'node:sqlite';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

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
  _db = db;
  return db;
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
  const db = openDb();
  const when = p.ts ? new Date(p.ts) : new Date();
  const row = db
    .prepare(
      `INSERT INTO prompts (ts, day, source, session_id, cwd, project, prompt, model, raw)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      when.toISOString(),
      localDay(when),
      p.source,
      p.session_id ?? null,
      p.cwd ?? null,
      p.project ?? null,
      text,
      p.model ?? null,
      p.raw ?? null
    );
  return Number(row.lastInsertRowid);
}

export function promptsForDay(day: string): PromptRow[] {
  const db = openDb();
  return db
    .prepare('SELECT * FROM prompts WHERE day = ? ORDER BY ts ASC')
    .all(day) as unknown as PromptRow[];
}
