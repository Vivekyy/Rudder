#!/usr/bin/env node

import { join } from 'node:path';
import { closeDb } from '../src/db/client.ts';
import { parseAgentPromptSource, recordPromptHookEvent } from '../src/prompt-hook.ts';
import { captureException, shutdown } from '../src/telemetry.ts';

type AgentSource = 'claude-code' | 'codex' | 'cursor';

interface HookContext {
  root?: string;
  source: AgentSource;
}

function sourceArgument(args: string[]): string {
  if (args.length === 2 && args[0] === '--source') return args[1]!;
  throw new TypeError('usage: rudder-prompt-hook --source <claude-code|codex|cursor>');
}

function hookContext(args: string[]): HookContext {
  if (process.env.PLUGIN_ROOT) {
    return { root: process.env.PLUGIN_ROOT, source: 'codex' };
  }
  if (process.env.CLAUDE_PLUGIN_ROOT) {
    return { root: process.env.CLAUDE_PLUGIN_ROOT, source: 'claude-code' };
  }
  return { source: parseAgentPromptSource(sourceArgument(args)) };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

try {
  const context = hookContext(process.argv.slice(2));
  if (context.root) {
    process.env.RUDDER_MIGRATIONS_PATH ||= join(context.root, 'dist', 'drizzle');
  }
  const input = await readStdin();
  const payload: unknown = JSON.parse(input);
  recordPromptHookEvent(context.source, payload);
} catch (error) {
  // Prompt capture is optional metadata. A hook failure must not interrupt the host agent.
  try {
    captureException(error, { component: 'prompt-hook' });
  } catch {
    // Telemetry is best-effort and must not change hook behavior.
  }
} finally {
  try {
    closeDb();
  } catch {
    // Database teardown must not interrupt the host agent.
  }
  try {
    await shutdown();
  } catch {
    // Telemetry teardown is best-effort and must remain silent.
  }
}
