import { basename } from 'node:path';
import { insertPrompt, rudderPort, type Source } from './db/index.ts';
import {
  activeRules,
  applicableRulesForEvent,
  findTraceEventForHook,
  markTraceApplicability,
  queueTraceEvent,
  recordTraceVerification,
  renderRulesContext,
  traceVerificationsForPrompt,
} from './rules.ts';
import { APPLICABILITY_VERSION, runApplicability } from './subagents/applicability.ts';
import {
  renderVerifierFeedback,
  runVerification,
  VERIFIER_VERSION,
  type VerificationResult,
} from './subagents/verifier.ts';
import { readTranscriptContext } from './transcript.ts';
import { capture } from './telemetry.ts';

const CONTEXT_RULE_LIMIT = 12;
const MAX_VERIFIER_RETRIES = 3;

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

function payloadString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function hookLookup(source: Source, payload: Record<string, unknown>) {
  return {
    source,
    sessionId: payloadString(payload, 'session_id'),
    turnId: payloadString(payload, 'turn_id'),
    hookPromptId: payloadString(payload, 'prompt_id'),
    cwd: payloadString(payload, 'cwd') ??
      (source === 'claude' ? process.env.CLAUDE_PROJECT_DIR : process.env.CODEX_WORKSPACE_ROOT) ??
      process.cwd(),
  };
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
    session_id: payloadString(payload, 'session_id'),
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
      transcript.lastAssistantText,
      {
        turnId: payloadString(payload, 'turn_id'),
        hookPromptId: payloadString(payload, 'prompt_id'),
      }
    );
    capture('prompt recorded', {
      source,
      has_project: project !== null,
      has_model: model !== null,
      has_transcript: transcriptPath !== null,
    });
  }
  let additionalContext = '';
  if (id !== null) {
    const event = findTraceEventForHook({
      ...hookLookup(source, payload),
      sessionId: payloadString(payload, 'session_id'),
    });
    if (event) {
      const active = activeRules(cwd);
      try {
        if (active.length === 0) {
          markTraceApplicability(
            event.id,
            [],
            'no active rules for this prompt',
            source,
            APPLICABILITY_VERSION
          );
        } else {
          const applicability = runApplicability(source, event, active);
          markTraceApplicability(
            event.id,
            applicability.applicableAtomicIds,
            applicability.reason,
            source,
            APPLICABILITY_VERSION
          );
          const applicableIds = new Set(applicability.applicableAtomicIds);
          const applicable = active
            .filter((rule) => applicableIds.has(rule.atomic_id))
            .slice(0, CONTEXT_RULE_LIMIT);
          additionalContext = renderRulesContext(
            applicable,
            Math.max(0, applicability.applicableAtomicIds.length - applicable.length)
          );
        }
      } catch (err) {
        capture('runtime applicability failed', {
          source,
          error: (err as Error).message,
        });
      }
    }
  }
  if (id !== null) await notifyDaemon();
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

/** Shared Claude Code/Codex `Stop` hook verifier. */
async function stopHook(source: Source): Promise<void> {
  if (process.env.RUDDER_DISABLE || process.env.RUDDER_CHILD_SESSION) return;
  const raw = await readStdin();
  const payload = safeParse(raw) ?? {};
  const event = findTraceEventForHook(hookLookup(source, payload));
  if (!event) return;

  const applicable = applicableRulesForEvent(event, CONTEXT_RULE_LIMIT).filter(
    (rule) => rule.enforced
  );
  if (applicable.length === 0) return;

  const attempts = traceVerificationsForPrompt(event.id);
  const latest = attempts.at(-1);
  if (latest?.enforced || (latest && !latest.enforced && !latest.blocked)) return;

  const blockedFailures = attempts.filter((attempt) => !attempt.enforced && attempt.blocked).length;
  const assistantBehavior =
    payloadString(payload, 'last_assistant_message') ??
    readTranscriptContext(payloadString(payload, 'transcript_path')).lastAssistantText;
  let verification: VerificationResult;
  try {
    verification = runVerification(source, event, applicable, assistantBehavior);
  } catch (err) {
    capture('runtime verification failed', {
      source,
      error: (err as Error).message,
    });
    return;
  }
  const shouldBlock = !verification.enforced && blockedFailures < MAX_VERIFIER_RETRIES;
  const stored = recordTraceVerification(
    event.id,
    verification,
    shouldBlock,
    source,
    VERIFIER_VERSION
  );

  if (shouldBlock) {
    process.stdout.write(
      JSON.stringify({
        decision: 'block',
        reason: renderVerifierFeedback(verification, stored.attempt, MAX_VERIFIER_RETRIES),
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

export function claudePromptHook(): Promise<void> {
  return promptHook('claude');
}

export function codexPromptHook(): Promise<void> {
  return promptHook('codex');
}

export function claudeStopHook(): Promise<void> {
  return stopHook('claude');
}

export function codexStopHook(): Promise<void> {
  return stopHook('codex');
}
