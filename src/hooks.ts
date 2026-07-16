import { basename } from 'node:path';
import { insertPrompt, rudderPort, type Source } from './db/index.ts';
import { queueTraceEvent, renderRuleContext } from './rules.ts';
import { readTranscriptContext } from './transcript.ts';
import { capture } from './telemetry.ts';

/**
 * Best-effort ping to the `rudder start` daemon so it compiles queued rule
 * evidence and refreshes the rules dashboard. Fire-and-forget: if the daemon
 * isn't running the connection is refused instantly.
 */
async function notifyDaemon(): Promise<void> {
  if (process.env.RUDDER_DISABLE || process.env.RUDDER_CHILD_SESSION) return;
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

/** Shared Claude Code/Codex `UserPromptSubmit` capture and context hook. */
async function promptHook(source: Source): Promise<void> {
  if (process.env.RUDDER_DISABLE || process.env.RUDDER_CHILD_SESSION) return;
  const raw = await readStdin();
  const payload = safeParse(raw) ?? {};
  const cwd =
    (payload.cwd as string) ||
    (source === 'claude' ? process.env.CLAUDE_PROJECT_DIR : process.env.CODEX_WORKSPACE_ROOT) ||
    process.cwd();
  const project = projectFromCwd(cwd);
  const model = (payload.model as string) ?? null;
  const prompt = payload.prompt as string;
  const id = insertPrompt({
    source,
    prompt,
    session_id: payload.session_id as string,
    cwd,
    project,
    model,
    raw,
  });
  if (id !== null) {
    const transcriptPath = (payload.transcript_path as string) ?? null;
    const transcript = readTranscriptContext(transcriptPath);
    queueTraceEvent(
      id,
      transcriptPath,
      transcript.lastUserText,
      transcript.lastAssistantText
    );
    await notifyDaemon();
    capture('prompt recorded', {
      source,
      has_project: project !== null,
      has_model: model !== null,
      has_transcript: transcriptPath !== null,
    });
  }
  const additionalContext = renderRuleContext(cwd);
  if (additionalContext) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext,
        },
      })
    );
  }
}

/** Claude Code `UserPromptSubmit` hook. */
export function claudeHook(): Promise<void> {
  return promptHook('claude');
}

/** Codex native `UserPromptSubmit` hook. */
export function codexHook(): Promise<void> {
  return promptHook('codex');
}
