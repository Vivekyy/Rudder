import {
  claudePromptHook,
  claudeStopHook,
  codexPromptHook,
  codexStopHook,
} from './hooks.ts';
import { init } from './install.ts';
import { serve } from './serve.ts';
import { type Agent } from './agent.ts';
import { shutdown } from './telemetry.ts';

const HELP = `rudder — learn durable rules from your AI coding sessions.

Usage:
  rudder init                 Create the database and install Claude Code + Codex hooks
  rudder start [options]      Run rule compilation and open the learned-rules dashboard

start options:
  --agent claude|codex        Which LLM runs rule sub-agents (default: claude, else codex)
  --no-open                   Don't open the app/installer (just run the server)
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

/** Hooks must never break the calling tool: log to stderr and still exit 0. */
async function runHookSafely(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    process.stderr.write(`rudder hook error (ignored): ${(err as Error).message}\n`);
  }
  try {
    await shutdown();
  } catch {
    /* telemetry teardown must not make a capture hook fail */
  }
  process.exit(0);
}

export async function main(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;

  switch (cmd) {
    case 'init':
      init();
      await shutdown();
      return;

    case 'hook': {
      const which = rest[0];
      const event = rest[1] ?? 'prompt';
      if (which === 'claude' && event === 'prompt') return runHookSafely(() => claudePromptHook());
      if (which === 'claude' && event === 'stop') return runHookSafely(() => claudeStopHook());
      if (which === 'codex' && event === 'prompt') return runHookSafely(() => codexPromptHook());
      if (which === 'codex' && event === 'stop') return runHookSafely(() => codexStopHook());
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
