import { and, asc, eq, isNull } from 'drizzle-orm';
import { promptTags, prompts, rudderDb, type PromptRow } from './db/index.ts';
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
  return rudderDb()
    .select({
      id: prompts.id,
      ts: prompts.ts,
      day: prompts.day,
      source: prompts.source,
      session_id: prompts.session_id,
      cwd: prompts.cwd,
      project: prompts.project,
      prompt: prompts.prompt,
      model: prompts.model,
      raw: prompts.raw,
    })
    .from(prompts)
    .leftJoin(
      promptTags,
      and(eq(promptTags.prompt_id, prompts.id), eq(promptTags.tagger_version, TAGGER_VERSION))
    )
    .where(and(eq(prompts.day, day), isNull(promptTags.prompt_id)))
    .orderBy(asc(prompts.ts))
    .all() as PromptRow[];
}

/** Insert or replace the tag for a prompt. */
export function upsertTag(
  promptId: number,
  category: Category,
  reaction: Reaction,
  tagger: string,
  taggerVersion: number = TAGGER_VERSION
): void {
  const ts = new Date().toISOString();
  rudderDb()
    .insert(promptTags)
    .values({
      prompt_id: promptId,
      category,
      reaction,
      tagger,
      tagger_version: taggerVersion,
      ts,
    })
    .onConflictDoUpdate({
      target: promptTags.prompt_id,
      set: { category, reaction, tagger, tagger_version: taggerVersion, ts },
    })
    .run();
}

function round(n: number): number {
  return Math.round(n);
}

/**
 * Aggregate a day's prompts into the dashboard and CLI stats. Untagged prompts
 * count as `ignored` (not yet classified), so they're excluded from the
 * percentages rather than skewing a work category.
 */
export function statsForDay(day: string): DayStats {
  const rows = rudderDb()
    .select({
      id: prompts.id,
      category: promptTags.category,
      reaction: promptTags.reaction,
    })
    .from(prompts)
    .leftJoin(
      promptTags,
      and(eq(promptTags.prompt_id, prompts.id), eq(promptTags.tagger_version, TAGGER_VERSION))
    )
    .where(eq(prompts.day, day))
    .all() as Array<{
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
    const category: Category = r.category ? normCategory(r.category) : 'ignored';
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
  const rows = rudderDb()
    .select({ id: promptTags.prompt_id, category: promptTags.category })
    .from(promptTags)
    .innerJoin(prompts, eq(prompts.id, promptTags.prompt_id))
    .where(and(eq(prompts.day, day), eq(promptTags.tagger_version, TAGGER_VERSION)))
    .all() as Array<{ id: number; category: string }>;
  return new Map(rows.map((r) => [r.id, normCategory(r.category)]));
}
