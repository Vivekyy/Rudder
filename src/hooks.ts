import { basename } from 'node:path';
import { insertPrompt, rudderPort } from './db.ts';
import { capture } from './telemetry.ts';

/**
 * Best-effort ping to the `rudder start` dashboard so it tags the new prompt and
 * refreshes live. Fire-and-forget: if the daemon isn't running the connection is
 * refused instantly, and we never let it slow or break the hook.
 */
async function notifyDashboard(): Promise<void> {
  if (process.env.RUDDER_DISABLE) return;
  try {
    await fetch(`http://127.0.0.1:${rudderPort()}/notify`, {
      method: 'POST',
      signal: AbortSignal.timeout(300),
    });
  } catch {
    /* daemon not running, or slow — ignore */
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    if (process.stdin.isTTY) return resolve('');
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
    // Safety: don't hang a hook forever if stdin never closes.
    setTimeout(() => resolve(data), 2000).unref();
  });
}

function projectFromCwd(cwd: string | null | undefined): string | null {
  if (!cwd) return null;
  return basename(cwd) || null;
}

function safeParse(str: string): Record<string, unknown> | null {
  if (!str) return null;
  try {
    return JSON.parse(str) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Claude Code `UserPromptSubmit` hook. Receives a JSON payload on stdin:
 *   { session_id, transcript_path, cwd, hook_event_name, prompt }
 */
export async function claudeHook(): Promise<void> {
  if (process.env.RUDDER_DISABLE) return; // skip our own `rudder digest` agent call
  const raw = await readStdin();
  const payload = safeParse(raw) ?? {};
  const cwd =
    (payload.cwd as string) || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const project = projectFromCwd(cwd);
  const model = (payload.model as string) ?? null;
  const id = insertPrompt({
    source: 'claude',
    prompt: payload.prompt as string,
    session_id: payload.session_id as string,
    cwd,
    project,
    model,
    raw,
  });
  if (id !== null) {
    await notifyDashboard();
    capture('prompt recorded', {
      source: 'claude',
      has_project: project !== null,
      has_model: model !== null,
    });
  }
}

/**
 * Codex `notify` program. Codex passes a JSON string as the final CLI argument
 * (older builds pipe it on stdin). We care about `agent-turn-complete`, whose
 * `input-messages` array holds the user's prompt(s) for the turn.
 */
export async function codexHook(argv: string[]): Promise<void> {
  if (process.env.RUDDER_DISABLE) return; // skip our own `rudder digest` agent call
  let raw = argv.find((a) => a && a.trim().startsWith('{'));
  if (!raw) raw = await readStdin();
  const payload = safeParse(raw ?? '') ?? {};

  const type = payload.type as string | undefined;
  if (type && type !== 'agent-turn-complete') return; // only record user turns

  const messages =
    (payload['input-messages'] as unknown) ?? (payload.input_messages as unknown) ?? [];
  const prompt = Array.isArray(messages)
    ? messages.join('\n').trim()
    : String(messages || '');
  const cwd =
    (payload.cwd as string) || process.env.CODEX_WORKSPACE_ROOT || null;

  const project = projectFromCwd(cwd);
  const model = (payload.model as string) ?? null;
  const id = insertPrompt({
    source: 'codex',
    prompt,
    session_id:
      (payload['turn-id'] as string) ??
      (payload.turn_id as string) ??
      (payload.session_id as string) ??
      null,
    cwd,
    project,
    model,
    raw,
  });
  if (id !== null) {
    await notifyDashboard();
    capture('prompt recorded', {
      source: 'codex',
      has_project: project !== null,
      has_model: model !== null,
    });
  }
}
