import { openDb, promptsForDay, type PromptRow } from './db.ts';
import {
  CATEGORIES,
  normCategory,
  normReaction,
  type Category,
  type Reaction,
} from './classify.ts';

/**
 * Bump when the rubric or prompt rendering changes in a way that should
 * invalidate existing tags. Rows tagged at an older version are treated as
 * untagged and get reclassified on the next pass.
 */
export const TAGGER_VERSION = 1;

export interface CategoryStat {
  count: number;
  /** Share of *counted* (non-ignored) prompts, rounded to a whole percent. */
  pct: number;
}

export interface DayStats {
  day: string;
  /** All prompts recorded for the day. */
  total: number;
  /** Prompts dropped as routine git/VC chores (not counted toward percentages). */
  ignored: number;
  /** Non-ignored prompts — the denominator for the category percentages. */
  counted: number;
  byCategory: Record<Exclude<Category, 'ignored'>, CategoryStat>;
  agree: number;
  disagree: number;
  /**
   * Disagreements as a share of agree+disagree prompts, rounded — the "you said
   * no to your AI x%" stat. `null` when there are no agree/disagree prompts.
   */
  correctionPct: number | null;
}

/** Prompts for `day` that have no tag at the current tagger version yet. */
export function untaggedPromptsForDay(day: string): PromptRow[] {
  const db = openDb();
  return db
    .prepare(
      `SELECT p.* FROM prompts p
       LEFT JOIN prompt_tags t
         ON t.prompt_id = p.id AND t.tagger_version = ?
       WHERE p.day = ? AND t.prompt_id IS NULL
       ORDER BY p.ts ASC`
    )
    .all(TAGGER_VERSION, day) as unknown as PromptRow[];
}

/** Insert or replace the tag for a prompt. */
export function upsertTag(
  promptId: number,
  category: Category,
  reaction: Reaction,
  tagger: string,
  taggerVersion: number = TAGGER_VERSION
): void {
  const db = openDb();
  db.prepare(
    `INSERT INTO prompt_tags (prompt_id, category, reaction, tagger, tagger_version, ts)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(prompt_id) DO UPDATE SET
       category = excluded.category,
       reaction = excluded.reaction,
       tagger = excluded.tagger,
       tagger_version = excluded.tagger_version,
       ts = excluded.ts`
  ).run(promptId, category, reaction, tagger, taggerVersion, new Date().toISOString());
}

function round(n: number): number {
  return Math.round(n);
}

/**
 * Aggregate a day's prompts into the dashboard/digest stats. Pure: reads the DB
 * and returns plain numbers. Prompts with no current-version tag are folded into
 * `housekeeping` (reaction `none`) so the percentages always cover every prompt
 * and sum to ~100% even mid-tagging.
 */
export function statsForDay(day: string): DayStats {
  const db = openDb();
  const rows = db
    .prepare(
      `SELECT p.id AS id, t.category AS category, t.reaction AS reaction
       FROM prompts p
       LEFT JOIN prompt_tags t
         ON t.prompt_id = p.id AND t.tagger_version = ?
       WHERE p.day = ?`
    )
    .all(TAGGER_VERSION, day) as unknown as Array<{
    id: number;
    category: string | null;
    reaction: string | null;
  }>;

  const counts: Record<Exclude<Category, 'ignored'>, number> = {
    architecting: 0,
    tuning: 0,
    bugfixing: 0,
    housekeeping: 0,
  };
  let ignored = 0;
  let agree = 0;
  let disagree = 0;

  for (const r of rows) {
    // Untagged rows fall back to housekeeping (the catch-all) until tagged.
    const category: Category = r.category ? normCategory(r.category) : 'housekeeping';
    const reaction: Reaction = r.reaction ? normReaction(r.reaction) : 'none';
    if (category === 'ignored') ignored++;
    else counts[category]++;
    if (reaction === 'agree') agree++;
    else if (reaction === 'disagree') disagree++;
  }

  const total = rows.length;
  const counted = total - ignored;
  const byCategory = {} as Record<Exclude<Category, 'ignored'>, CategoryStat>;
  for (const c of CATEGORIES) {
    if (c === 'ignored') continue;
    const cat = c as Exclude<Category, 'ignored'>;
    byCategory[cat] = {
      count: counts[cat],
      pct: counted > 0 ? round((counts[cat] / counted) * 100) : 0,
    };
  }

  const reacted = agree + disagree;
  const correctionPct = reacted > 0 ? round((disagree / reacted) * 100) : null;

  return { day, total, ignored, counted, byCategory, agree, disagree, correctionPct };
}

/** Map each tagged prompt on `day` to its stored category (at the current version). */
export function categoryMapForDay(day: string): Map<number, Category> {
  const db = openDb();
  const rows = db
    .prepare(
      `SELECT t.prompt_id AS id, t.category AS category
       FROM prompt_tags t JOIN prompts p ON p.id = t.prompt_id
       WHERE p.day = ? AND t.tagger_version = ?`
    )
    .all(day, TAGGER_VERSION) as unknown as Array<{ id: number; category: string }>;
  return new Map(rows.map((r) => [r.id, normCategory(r.category)]));
}

/** Re-export so callers don't need to reach into db.ts for the prompt list. */
export { promptsForDay };
