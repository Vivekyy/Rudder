import { claudeHook, codexHook } from './hooks.ts';
import { init } from './install.ts';
import { digest, type Agent } from './digest.ts';
import { serve } from './serve.ts';
import { ensureTagged } from './tagger.ts';
import { statsForDay, untaggedPromptsForDay, type DayStats } from './tags.ts';
import { localDay } from './db.ts';

const HELP = `rudder — record your AI coding prompts and digest your day.

Usage:
  rudder init                 Create the database and install Claude Code + Codex hooks
  rudder start [options]      Open a live dashboard of today's stats (updates as you work)
  rudder stats [options]      Print today's correction rate and category breakdown
  rudder digest [options]     Summarize a day's work into a Markdown digest
  rudder tag [options]        Classify untagged prompts and print the day's stats
  rudder hook claude          (internal) Record a Claude Code prompt from stdin
  rudder hook codex           (internal) Record a Codex turn from the notify payload
  rudder help                 Show this help

start options:
  --agent claude|codex        Which LLM tags prompts (default: claude, else codex)
  --no-open                   Don't open the app/installer (just run the server)

stats options:
  --date YYYY-MM-DD           Day to report (default: today, local time)
  --agent claude|codex        Which LLM classifies any untagged prompts first
  --no-tag                    Show current tags only; skip classifying (instant)

digest options:
  --date YYYY-MM-DD           Day to summarize (default: today, local time)
  --agent claude|codex        Which LLM to summarize with (default: claude, else codex)
  --out PATH                  Output file (default: ./digest.md)

tag options:
  --date YYYY-MM-DD           Day to tag (default: today, local time)
  --agent claude|codex        Which LLM classifies prompts (default: claude, else codex)
`;

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = 'true';
      }
    }
  }
  return flags;
}

function parseAgentFlag(value: string | undefined): Agent | undefined {
  if (value === undefined) return undefined;
  if (value !== 'claude' && value !== 'codex') {
    console.error("rudder: --agent must be 'claude' or 'codex'");
    process.exit(1);
  }
  return value;
}

const CATEGORY_LABELS: Array<[keyof DayStats['byCategory'], string]> = [
  ['architecting', 'Architecting'],
  ['tuning', 'Tuning'],
  ['bugfixing', 'Bugfixing'],
  ['housekeeping', 'Housekeeping'],
];

/** Render a day's stats as a compact terminal report with little bar charts. */
function formatStats(day: string, s: DayStats, untagged: number): string {
  const lines: string[] = [];
  lines.push(`rudder — ${day}`);
  // Untagged prompts count as ignored; show them separately from real git chores.
  const chores = s.ignored - untagged;
  lines.push(
    `${s.total} prompts · ${chores} git chores skipped · ${s.counted} counted` +
      (untagged > 0 ? ` · ${untagged} not yet classified` : '')
  );
  const reacted = s.agree + s.disagree;
  lines.push(
    s.correctionPct === null
      ? 'You never said no to your AI today.'
      : `You said no to your AI ${s.correctionPct}% of the time  (${s.disagree} of ${reacted} yes/no reactions)`
  );
  lines.push('');
  for (const [key, label] of CATEGORY_LABELS) {
    const { pct, count } = s.byCategory[key];
    const filled = Math.round((pct / 100) * 16);
    const bar = '█'.repeat(filled) + '░'.repeat(16 - filled);
    lines.push(`  ${label.padEnd(13)} ${String(pct).padStart(3)}%  ${bar}  ${count}`);
  }
  return lines.join('\n');
}

/** Hooks must never break the calling tool: log to stderr and still exit 0. */
async function runHookSafely(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    process.stderr.write(`rudder hook error (ignored): ${(err as Error).message}\n`);
  }
  process.exit(0);
}

export async function main(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;

  switch (cmd) {
    case 'init':
      init();
      return;

    case 'hook': {
      const which = rest[0];
      if (which === 'claude') return runHookSafely(() => claudeHook());
      if (which === 'codex') return runHookSafely(() => codexHook(rest.slice(1)));
      process.stderr.write("rudder: hook requires 'claude' or 'codex'\n");
      process.exit(0);
      return;
    }

    case 'start': {
      const flags = parseFlags(rest);
      const agent = parseAgentFlag(flags.agent);
      serve({ agent, noOpen: flags['no-open'] === 'true' });
      return;
    }

    case 'stats':
    case 'tag': {
      const flags = parseFlags(rest);
      const agent = parseAgentFlag(flags.agent);
      const day = flags.date || localDay();
      try {
        // `tag` always classifies; `stats` classifies unless --no-tag.
        const remaining =
          cmd === 'tag' || flags['no-tag'] !== 'true'
            ? ensureTagged(day, agent)
            : untaggedPromptsForDay(day).length;
        process.stdout.write(formatStats(day, statsForDay(day), remaining) + '\n');
      } catch (err) {
        console.error(`rudder: ${(err as Error).message}`);
        process.exit(1);
      }
      return;
    }

    case 'digest': {
      const flags = parseFlags(rest);
      const agent = parseAgentFlag(flags.agent);
      try {
        digest({ day: flags.date, agent, out: flags.out });
      } catch (err) {
        console.error(`rudder: ${(err as Error).message}`);
        process.exit(1);
      }
      return;
    }

    case undefined:
    case 'help':
    case '--help':
    case '-h':
      process.stdout.write(HELP);
      return;

    default:
      process.stderr.write(`rudder: unknown command '${cmd}'\n\n${HELP}`);
      process.exit(1);
  }
}
