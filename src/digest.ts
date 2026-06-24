import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Agent, resolveAgent, runAgent } from './agent.ts';
import { CATEGORIES, type Category } from './classify.ts';
import { localDay, type PromptRow, promptsForDay } from './db.ts';
import { ensureTagged } from './tagger.ts';
import { categoryMapForDay, type DayStats, statsForDay } from './tags.ts';

export type { Agent };

export interface DigestOptions {
  day?: string;
  agent?: Agent;
  out?: string;
}

export interface DigestResult {
  day: string;
  promptCount: number;
  markdown: string;
  outPath?: string;
}

const SECTION_TITLE: Record<Exclude<Category, 'ignored'>, string> = {
  architecting: 'Architecting',
  tuning: 'Tuning',
  bugfixing: 'Bugfixing',
  housekeeping: 'Housekeeping',
};

const SECTION_BLURB: Record<Exclude<Category, 'ignored'>, string> = {
  architecting:
    'designing new systems, structure, APIs, or overall approach (including code structure and performance changes)',
  tuning:
    "refining the agent's output — iterating, correcting, re-prompting, adjusting tone/format/scope — plus questions and investigation",
  bugfixing:
    'diagnosing and fixing defects, errors, or failing tests, plus triaging and remediating PR review feedback',
  housekeeping:
    'routine upkeep — checks and release chores, docs and config edits, syncing conventions, scope-trimming, and everything else',
};

/** Group the day's prompts by their stored category for the digest prompt. */
function renderByCategory(rows: PromptRow[], categoryOf: Map<number, Category>): string {
  const blocks: string[] = [];
  for (const c of CATEGORIES) {
    if (c === 'ignored') continue;
    const cat = c as Exclude<Category, 'ignored'>;
    const list = rows.filter((r) => categoryOf.get(r.id) === cat);
    const lines = list.map((r) => {
      const time = new Date(r.ts).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const text = r.prompt.replace(/\s+/g, ' ').trim();
      const project = r.project ? `, ${r.project}` : '';
      return `- [${time}] (${r.source}${project}) ${text}`;
    });
    const body = lines.length ? lines.join('\n') : '(no prompts in this category today)';
    blocks.push(`### ${SECTION_TITLE[cat]} (${list.length} prompts)\n${body}`);
  }
  return blocks.join('\n\n');
}

function buildInstruction(day: string, rendered: string): string {
  return `You are writing a concise end-of-day work digest for a software engineer, based on the prompts they gave their AI coding assistants (Claude Code and Codex) on ${day}.

The prompts have ALREADY been classified into Architecting, Tuning, Bugfixing, and Housekeeping (routine git/version-control chores were dropped). Do NOT reclassify, recount, or recompute anything — use the groupings exactly as given. Your job is purely to synthesize readable prose. Prompts are noisy and overlapping — synthesize, do not just restate them.

Address the engineer directly in the second person throughout — write "You designed…", "You refined…", "You tracked down…", never "the engineer did X" or "they did X". This emphasizes their sense of agency over the day's work.

Produce a Markdown digest with these sections:
1. A one-paragraph **Summary** of the day at a high level. End this section with a line that is EXACTLY the token {{CORRECTION_LINE}} on its own line — reproduce it verbatim, do not alter or remove it (it is replaced with a computed stat).
2. **Highlights** — notable accomplishments, hard problems, or decisions, if any are evident, written in the second person.
3. **Architecting** — ${SECTION_BLURB.architecting}.
4. **Tuning** — ${SECTION_BLURB.tuning}.
5. **Bugfixing** — ${SECTION_BLURB.bugfixing}.
6. **Housekeeping** — ${SECTION_BLURB.housekeeping}.
7. **Open threads** — anything that looks unfinished or like a next step.

For each of the four core sections (Architecting, Tuning, Bugfixing, Housekeeping), use exactly this format:
- A lead line that BEGINS with the matching token verbatim — {{PCT_architecting}}, {{PCT_tuning}}, {{PCT_bugfixing}}, or {{PCT_housekeeping}} — followed by \` of prompts, focused on {summary of the types of things you were doing}\`. Each token is replaced with that category's computed percentage.
- Then a numbered list of up to the top 3 specific things, each written in the second person ("You …"). If the category has no prompts, write a single line: "Nothing in this category today."

For example:
> {{PCT_architecting}} of prompts, focused on designing the digest pipeline and its data model
> 1. You designed the SQLite schema for storing captured prompts
> 2. You defined how prompts are grouped by project for the digest
> 3. You sketched the agent-spawning flow for Claude and Codex

Output ONLY the Markdown digest, with no preamble.

---
PROMPTS FOR ${day}:

${rendered}`;
}

/** Replace the {{...}} tokens with the authoritative numbers computed from tags. */
function fillStats(body: string, stats: DayStats): string {
  const correctionLine =
    stats.correctionPct === null
      ? '> *You never said no to your AI today.*'
      : `> *You said no to your AI ${stats.correctionPct}% of the time today.*`;
  let out = body.replaceAll('{{CORRECTION_LINE}}', correctionLine);
  for (const c of CATEGORIES) {
    if (c === 'ignored') continue;
    const cat = c as Exclude<Category, 'ignored'>;
    out = out.replaceAll(`{{PCT_${cat}}}`, `${stats.byCategory[cat].pct}%`);
  }
  return out;
}

export function generateDigest(opts: DigestOptions = {}): DigestResult {
  const day = opts.day || localDay();
  const rows = promptsForDay(day);
  if (rows.length === 0) {
    throw new Error(`No prompts recorded for ${day}. Nothing to digest.`);
  }

  const agent = resolveAgent(opts.agent);
  const outPath = opts.out ? resolve(opts.out) : undefined;

  ensureTagged(day, agent);
  const stats = statsForDay(day);

  // Map each prompt to its stored category for grouping (untagged → ignored).
  const tags = categoryMapForDay(day);
  const categoryOf = new Map<number, Category>(
    rows.map((r) => [r.id, tags.get(r.id) ?? 'ignored'])
  );

  const instruction = buildInstruction(day, renderByCategory(rows, categoryOf));
  const body = fillStats(runAgent(agent, instruction), stats);

  const header = `# Work Digest — ${day}\n\n> Generated by rudder from ${rows.length} prompts across Claude Code & Codex.\n\n`;
  const markdown = `${header}${body}\n`;
  if (outPath) writeFileSync(outPath, markdown);
  return { day, promptCount: rows.length, markdown, outPath };
}

export function digest(opts: DigestOptions = {}): string {
  const out = opts.out || 'digest.md';
  const day = opts.day || localDay();
  console.log(`rudder: classifying prompts for ${day}...`);
  const result = generateDigest({ ...opts, out });
  console.log(`rudder: wrote ${result.outPath}`);
  const outPath = result.outPath || resolve(out);
  return outPath;
}
