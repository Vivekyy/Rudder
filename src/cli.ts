import { claudeHook, codexHook } from './hooks.ts';
import { init } from './install.ts';
import { digest, type Agent } from './digest.ts';

const HELP = `rudder — record your AI coding prompts and digest your day.

Usage:
  rudder init                 Create the database and install Claude Code + Codex hooks
  rudder digest [options]     Summarize a day's work into a Markdown digest
  rudder hook claude          (internal) Record a Claude Code prompt from stdin
  rudder hook codex           (internal) Record a Codex turn from the notify payload
  rudder help                 Show this help

digest options:
  --date YYYY-MM-DD           Day to summarize (default: today, local time)
  --agent claude|codex        Which LLM to summarize with (default: claude, else codex)
  --out PATH                  Output file (default: ./digest.md)
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

    case 'digest': {
      const flags = parseFlags(rest);
      const agent = flags.agent as Agent | undefined;
      if (agent && agent !== 'claude' && agent !== 'codex') {
        console.error("rudder: --agent must be 'claude' or 'codex'");
        process.exit(1);
      }
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
