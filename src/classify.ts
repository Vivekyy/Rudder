/**
 * Shared classification vocabulary and rubric.
 *
 * This is the single source of truth for how a prompt is categorized and whether
 * it counts as agreeing with / disagreeing with the AI. The tagger (`tagger.ts`)
 * uses it to label each prompt; the digest (`digest.ts`) consumes those stored
 * labels rather than re-deriving them, so the dashboard's numbers and the
 * digest's numbers can never disagree.
 */

/** The four work categories, plus `ignored` for routine git/VC chores. */
export type Category = 'architecting' | 'tuning' | 'bugfixing' | 'housekeeping' | 'ignored';

/** Whether a prompt reacts to what the AI just produced. */
export type Reaction = 'agree' | 'disagree' | 'none';

export const CATEGORIES: readonly Category[] = [
  'architecting',
  'tuning',
  'bugfixing',
  'housekeeping',
] as const;

const CATEGORY_SET = new Set<Category>([...CATEGORIES, 'ignored']);
const REACTION_SET = new Set<Reaction>(['agree', 'disagree', 'none']);

export function normCategory(value: unknown): Category {
  const v = String(value ?? '').trim().toLowerCase();
  return CATEGORY_SET.has(v as Category) ? (v as Category) : 'ignored';
}

export function normReaction(value: unknown): Reaction {
  const v = String(value ?? '').trim().toLowerCase();
  return REACTION_SET.has(v as Reaction) ? (v as Reaction) : 'none';
}

export const CLASSIFICATION_RUBRIC = `Classify each prompt along two axes: a work CATEGORY and a REACTION.

REACTION — does the prompt directly react to something the AI just produced?
- "agree": it accepts / approves the AI's work (e.g. "yes", "perfect", "looks good, now…", "ship it").
- "disagree": it rejects / corrects / reverses the AI's work (e.g. "no", "that's wrong", "revert that", "don't do it that way", "undo").
- "none": everything else — fresh instructions, questions, and open-ended requests are neither agreement nor disagreement.

CATEGORY — first, mark as "ignored" any prompt that is just a simple git or version-control chore: "make a PR", "open/merge the PR", "resolve the merge conflicts", "rebase onto main", "push", "commit this", "create a branch", and the like. These do not reflect substantive work. (This is only for routine mechanics — a prompt that asks to fix something surfaced in review, debug a failing merge, or change what gets committed is real work and is NOT ignored.)
Classify every remaining (non-ignored) prompt into exactly one of:
- "architecting": designing new systems, structure, APIs, or overall approach. Changes to code structure or performance belong here.
- "tuning": refining the output of the coding agent — iterating on its responses, correcting or steering what it produced, re-prompting for a better result, adjusting tone/format/scope of what the agent gives back. This is about tuning the agent's behavior and output, NOT the codebase itself. Also fold in questions and investigation — prompts asking the agent to explain, understand, or look into something.
- "bugfixing": diagnosing and fixing defects, errors, or failing tests. Also fold in review work — triaging and remediating PR review feedback.
- "housekeeping": the catch-all for everything else that survives the ignored filter — process and coordination (running checks, release chores), documentation and config edits, syncing conventions between repos, scope-trimming, and other routine upkeep.`;
