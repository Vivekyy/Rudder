import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promptsForDay, localDay, type PromptRow } from './db.ts';

export type Agent = 'claude' | 'codex';

export interface DigestOptions {
  day?: string;
  agent?: Agent;
  out?: string;
}

function renderPrompts(rows: PromptRow[]): string {
  const byProject = new Map<string, PromptRow[]>();
  for (const r of rows) {
    const key = r.project || '(unknown)';
    (byProject.get(key) ?? byProject.set(key, []).get(key)!).push(r);
  }

  const blocks: string[] = [];
  for (const [project, list] of byProject) {
    const lines = list.map((r) => {
      const time = new Date(r.ts).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const text = r.prompt.replace(/\s+/g, ' ').trim();
      return `- [${time}] (${r.source}) ${text}`;
    });
    blocks.push(`## Project: ${project} (${list.length} prompts)\n${lines.join('\n')}`);
  }
  return blocks.join('\n\n');
}

function buildInstruction(day: string, rendered: string): string {
  return `You are writing a concise end-of-day work digest for a software engineer, based on the prompts they gave their AI coding assistants (Claude Code and Codex) on ${day}.

Below is the chronological list of every prompt they sent, grouped by project. Use it to infer what they actually worked on. Prompts are noisy and overlapping — synthesize, do not just restate them.

Address the engineer directly in the second person throughout — write "You designed…", "You refined…", "You tracked down…", never "the engineer did X" or "they did X". This emphasizes their sense of agency over the day's work.

Produce a Markdown digest with these sections:
1. A one-paragraph **Summary** of the day at a high level. End this section with a single italicized line on its own, exactly in this form:

   > *You said no to your AI x% of the time today.*

   To compute x: among the prompts, consider only those that are a direct reaction to something the AI just produced — i.e. the prompt either agrees with / accepts the AI's work (e.g. "yes", "perfect", "looks good, now…", "ship it") or disagrees with / rejects / corrects it (e.g. "no", "that's wrong", "revert that", "don't do it that way", "undo"). Ignore every prompt that is neither — fresh instructions, questions, and open-ended requests do not count either way. Let x be the percentage of those agree-or-disagree prompts that were disagreements, rounded to the nearest whole number. If there are no agree-or-disagree prompts at all, write the line as "*You never said no to your AI today.*" instead.
2. **Highlights** — notable accomplishments, hard problems, or decisions, if any are evident, written in the second person. This section should be in line with the next three.
3. **Architecting** — designing new systems, structure, APIs, or overall approach.
4. **Tuning** — refining the output of the coding agent: iterating on its responses, correcting or steering what it produced, re-prompting to get a better result, adjusting tone/format/scope of what the agent gives back. This is about tuning the agent's behavior and output, NOT tuning the codebase itself (changes to code structure or performance belong under Architecting or Bugfixing). Also fold in questions and investigation here — prompts asking the agent to explain, understand, or look into something.
5. **Bugfixing** — diagnosing and fixing defects, errors, or failing tests. Also fold in review work here — triaging and remediating PR review feedback.
6. **Housekeeping** — everything else that doesn't fit the three above: process and coordination (running checks, release chores), documentation and config edits, syncing conventions between repos, scope-trimming, and other routine upkeep.

For each of those four core sections (Architecting, Tuning, Bugfixing, Housekeeping), use exactly this format:
- A lead line: \`x% of prompts, focused on {summary of the types of things you were doing}\`
- Then a numbered list of up to the top 3 specific things, each written in the second person ("You …").

For example:
> 40% of prompts, focused on designing the digest pipeline and its data model
> 1. You designed the SQLite schema for storing captured prompts
> 2. You defined how prompts are grouped by project for the digest
> 3. You sketched the agent-spawning flow for Claude and Codex

7. **Open threads** — anything that looks unfinished or like a next step.

First, ignore entirely any prompt that is just a simple git or version-control chore — "make a PR", "open/merge the PR", "resolve the merge conflicts", "rebase onto main", "push", "commit this", "create a branch", and the like. These do not reflect substantive work, so drop them: do not classify them and do not count them toward the percentages below. (This is only for routine mechanics — a prompt that asks to fix something surfaced in review, debug a failing merge, or change what gets committed is real work and still belongs in Bugfixing/Housekeeping/etc.)

For Architecting, Tuning, Bugfixing, and Housekeeping, classify each of the remaining prompts into exactly one of the four categories. Housekeeping is the catch-all for everything that survives the filter above, so every non-ignored prompt lands somewhere and the four percentages (computed over the non-ignored prompts) should sum to ~100% (allowing for rounding). Be specific and grounded in the prompts. Do not invent work that isn't supported by the data. Output ONLY the Markdown digest, with no preamble.

---
PROMPTS FOR ${day}:

${rendered}`;
}

function runAgent(agent: Agent, instruction: string): string {
  const cmd =
    agent === 'claude'
      ? { bin: 'claude', args: ['-p'] }
      : { bin: 'codex', args: ['exec', '-'] };

  const res = spawnSync(cmd.bin, cmd.args, {
    input: instruction,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    // Prevent the agent we spawn from re-triggering rudder's own hooks and
    // recording this digest instruction as a prompt for the day.
    env: { ...process.env, RUDDER_DISABLE: '1' },
  });

  if (res.error) {
    const e = res.error as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      throw new Error(`'${cmd.bin}' was not found on your PATH.`);
    }
    throw res.error;
  }
  if (res.status !== 0) {
    throw new Error(`'${cmd.bin}' exited with code ${res.status}:\n${res.stderr}`);
  }
  return (res.stdout || '').trim();
}

function resolveAgent(preferred?: Agent): Agent {
  if (preferred) return preferred;
  const has = (bin: string) => spawnSync(bin, ['--version'], { encoding: 'utf8' }).status === 0;
  if (has('claude')) return 'claude';
  if (has('codex')) return 'codex';
  throw new Error('Neither `claude` nor `codex` was found on your PATH.');
}

export function digest(opts: DigestOptions = {}): string {
  const day = opts.day || localDay();
  const rows = promptsForDay(day);
  if (rows.length === 0) {
    throw new Error(`No prompts recorded for ${day}. Nothing to digest.`);
  }

  const agent = resolveAgent(opts.agent);
  const outPath = resolve(opts.out || 'digest.md');

  console.log(`rudder: ${rows.length} prompts on ${day}; summarizing with ${agent}...`);

  const instruction = buildInstruction(day, renderPrompts(rows));
  const body = runAgent(agent, instruction);

  const header = `# Work Digest — ${day}\n\n> Generated by rudder from ${rows.length} prompts across Claude Code & Codex.\n\n`;
  writeFileSync(outPath, header + body + '\n');
  console.log(`rudder: wrote ${outPath}`);
  return outPath;
}
