import { type Agent, resolveAgent, runAgent } from './agent.ts';
import {
  type Category,
  CLASSIFICATION_RUBRIC,
  normCategory,
  normReaction,
  type Reaction,
} from './classify.ts';
import { type PromptRow, promptsForDay } from './db.ts';
import { TAGGER_VERSION, untaggedPromptsForDay, upsertTag } from './tags.ts';

export interface ParsedTag {
  id: number;
  category: Category;
  reaction: Reaction;
}

function renderForTagging(all: PromptRow[]): string {
  return all
    .map((r) => {
      const time = new Date(r.ts).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const text = r.prompt.replace(/\s+/g, ' ').trim();
      return `[id=${r.id}] [${time}] (${r.source}${r.project ? `, ${r.project}` : ''}) ${text}`;
    })
    .join('\n');
}

function buildTagInstruction(all: PromptRow[], toTag: PromptRow[]): string {
  const ids = toTag.map((r) => r.id).join(', ');
  return `You are a classifier for an AI-coding activity tracker. Below is a chronological list of prompts a software engineer sent their AI coding assistants. Each line is prefixed with its [id=N].

${CLASSIFICATION_RUBRIC}

The full chronological list is given for context (a prompt's REACTION depends on what came before it), but classify ONLY these prompt ids: ${ids}

Respond with ONLY a JSON array (no prose, no markdown fences) of objects, one per id you classify, each exactly:
{"id": <number>, "category": "architecting"|"tuning"|"bugfixing"|"housekeeping"|"ignored", "reaction": "agree"|"disagree"|"none"}

PROMPTS:
${renderForTagging(all)}`;
}

/**
 * Extract the tag objects from the agent's stdout. Tolerates the model wrapping
 * the JSON in prose or ```json fences by scanning for the outermost array.
 */
export function parseTags(out: string): ParsedTag[] {
  const start = out.indexOf('[');
  const end = out.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(out.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const tags: ParsedTag[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const id = Number(o.id);
    if (!Number.isInteger(id)) continue;
    tags.push({ id, category: normCategory(o.category), reaction: normReaction(o.reaction) });
  }
  return tags;
}

/**
 * Classify every still-untagged prompt for `day` in one batched agent call and
 * persist the tags. Returns the number of prompts tagged. Throws if the agent
 * errors (callers that must not fail use {@link ensureTagged}).
 */
export function tagDay(day: string, agent: Agent): number {
  const toTag = untaggedPromptsForDay(day);
  if (toTag.length === 0) return 0;

  const all = promptsForDay(day); // full chronology for reaction context
  const instruction = buildTagInstruction(all, toTag);
  const out = runAgent(agent, instruction);

  const valid = new Set(toTag.map((r) => r.id));
  let n = 0;
  for (const t of parseTags(out)) {
    if (!valid.has(t.id)) continue; // ignore ids outside the requested set
    upsertTag(t.id, t.category, t.reaction, agent, TAGGER_VERSION);
    n++;
  }
  return n;
}

/**
 * Best-effort tagging for the dashboard/digest paths: never throws. If no agent
 * is available or the call fails, prompts are left untagged (counted as
 * `ignored` by {@link statsForDay} until a later pass tags them). Returns the
 * count of prompts still untagged afterward.
 */
export function ensureTagged(day: string, preferred?: Agent): number {
  let agent: Agent;
  try {
    agent = resolveAgent(preferred);
  } catch {
    return untaggedPromptsForDay(day).length; // no claude/codex on PATH
  }
  try {
    tagDay(day, agent);
  } catch (err) {
    process.stderr.write(`rudder: tagging failed (ignored): ${(err as Error).message}\n`);
  }
  return untaggedPromptsForDay(day).length;
}
