import { claudeHook, codexHook } from './hooks.ts';
import { init } from './install.ts';
import { serve } from './serve.ts';
import { ensureCompiled } from './compiler.ts';
import { allActiveRules } from './rules.ts';
import { type Agent } from './agent.ts';
import { captureException, shutdown } from './telemetry.ts';

const HELP = `rudder — learn durable rules from your AI coding sessions.

Usage:
  rudder init                 Create the database and install Claude Code + Codex hooks
  rudder start [options]      Run rule compilation and open the learned-rules dashboard
  rudder rules [options]      Compile pending corrections and list active rules

start options:
  --agent claude|codex        Which LLM runs rule sub-agents (default: claude, else codex)
  --no-open                   Don't open the app/installer (just run the server)

rules options:
  --agent claude|codex        Which LLM runs rule sub-agents
  --no-compile                List stored rules without compiling pending prompts
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
      if (which === 'claude') return runHookSafely(() => claudeHook());
      if (which === 'codex') return runHookSafely(() => codexHook());
      process.stderr.write("rudder: hook requires 'claude' or 'codex'\n");
      process.exit(0);
      return;
    }

    case 'rules': {
      const flags = parseFlags(rest);
      const agent = parseAgentFlag(flags.agent);
      try {
        const pending =
          flags['no-compile'] === 'true' ? undefined : ensureCompiled(agent);
        const rules = allActiveRules();
        const lines = [
          `rudder — ${rules.length} active learned rule${rules.length === 1 ? '' : 's'}`,
          ...(pending === undefined ? [] : [`${pending} prompt${pending === 1 ? '' : 's'} pending compilation`]),
          ...rules.map(
            (rule) =>
              `- [${rule.atomic_id} v${rule.version}] (${rule.scope}${rule.project ? `:${rule.project}` : ''}) ` +
              `${rule.rule_text} — when ${rule.applies_when}`
          ),
        ];
        process.stdout.write(lines.join('\n') + '\n');
        await shutdown();
      } catch (err) {
        captureException(err);
        await shutdown();
        console.error(`rudder: ${(err as Error).message}`);
        process.exit(1);
      }
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
