#!/usr/bin/env node

import { join } from 'node:path';

type AgentSource = 'claude-code' | 'codex';

function pluginContext(): { root: string; source: AgentSource } | null {
  if (process.env.PLUGIN_ROOT) {
    return { root: process.env.PLUGIN_ROOT, source: 'codex' };
  }
  if (process.env.CLAUDE_PLUGIN_ROOT) {
    return { root: process.env.CLAUDE_PLUGIN_ROOT, source: 'claude-code' };
  }
  return null;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

try {
  const context = pluginContext();
  if (context) {
    process.env.RUDDER_MIGRATIONS_PATH ||= join(context.root, 'dist', 'drizzle');
    const [{ closeDb }, { recordPromptHookEvent }] = await Promise.all([
      import('../../../src/db/client.ts'),
      import('../../../src/prompt-hook.ts'),
    ]);
    try {
      recordPromptHookEvent(context.source, JSON.parse(await readStdin()));
    } finally {
      closeDb();
    }
  }
} catch {
  // Prompt capture is optional metadata. A hook failure must not interrupt the host agent.
}
