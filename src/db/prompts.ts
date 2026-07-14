import { asc, eq } from 'drizzle-orm';
import { rudderDb } from './client.ts';
import { prompts } from './schema.ts';

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

