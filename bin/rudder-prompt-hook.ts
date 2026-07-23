#!/usr/bin/env node

import { closeDb } from '../src/db/client.ts';
import { parseAgentPromptSource, recordPromptHookEvent } from '../src/prompt-hook.ts';

function sourceArgument(args: string[]): string {
  if (args.length === 2 && args[0] === '--source') return args[1]!;
  throw new TypeError('usage: rudder-prompt-hook --source <claude-code|codex|cursor>');
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

try {
  const source = parseAgentPromptSource(sourceArgument(process.argv.slice(2)));
  const input = await readStdin();
  const payload: unknown = JSON.parse(input);
  recordPromptHookEvent(source, payload);
} catch {
  // Prompt capture is optional metadata. A hook failure must not interrupt the host agent.
} finally {
  closeDb();
}
