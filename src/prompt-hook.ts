import {
  reconcilePromptBranch,
  recordPromptBranch,
  type PromptBranchRow,
} from './prompt-tagger.ts';
import { promptCaptureDisabled } from './prompt-control.ts';
import { readPreviousAgentOutput } from './transcript.ts';

export const agentPromptSources = ['claude-code', 'codex', 'cursor'] as const;

export type AgentPromptSource = (typeof agentPromptSources)[number];
export type PromptHookEvent = 'submit' | 'reconcile';

export interface NormalizedPromptHookPayload {
  source: AgentPromptSource;
  event: PromptHookEvent;
  sessionId: string;
  promptId: string | null;
  promptText: string | null;
  transcriptPath: string | null;
  cwd: string;
}

export class PromptHookPayloadError extends TypeError {
  constructor(message: string) {
    super(`Invalid coding-agent hook payload: ${message}`);
    this.name = 'PromptHookPayloadError';
  }
}

function recordPayload(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new PromptHookPayloadError('expected a JSON object');
  }
  return payload as Record<string, unknown>;
}

function optionalNonblankString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new PromptHookPayloadError(`${field} must be a string`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new PromptHookPayloadError(`${field} must not be blank`);
  }
  return normalized;
}

function sessionId(payload: Record<string, unknown>): string {
  const hookSessionId = optionalNonblankString(payload.session_id, 'session_id');
  const conversationId = optionalNonblankString(payload.conversation_id, 'conversation_id');

  if (hookSessionId && conversationId && hookSessionId !== conversationId) {
    throw new PromptHookPayloadError('session_id and conversation_id do not match');
  }

  const resolved = hookSessionId ?? conversationId;
  if (!resolved) {
    throw new PromptHookPayloadError('session_id or conversation_id is required');
  }
  return resolved;
}

function promptId(
  source: AgentPromptSource,
  payload: Record<string, unknown>
): string | null {
  const field = {
    'claude-code': 'prompt_id',
    codex: 'turn_id',
    cursor: 'generation_id',
  }[source];
  return optionalNonblankString(payload[field], field);
}

function firstWorkspaceRoot(payload: Record<string, unknown>): string | null {
  if (payload.workspace_roots === undefined || payload.workspace_roots === null) return null;
  if (!Array.isArray(payload.workspace_roots)) {
    throw new PromptHookPayloadError('workspace_roots must be an array');
  }

  for (const root of payload.workspace_roots) {
    const normalized = optionalNonblankString(root, 'workspace_roots entry');
    if (normalized) return normalized;
  }
  return null;
}

function hookEvent(payload: Record<string, unknown>): PromptHookEvent {
  const name = optionalNonblankString(payload.hook_event_name, 'hook_event_name');
  if (!name) throw new PromptHookPayloadError('hook_event_name is required');

  switch (name.toLowerCase()) {
    case 'userpromptsubmit':
    case 'beforesubmitprompt':
      return 'submit';
    case 'stop':
      return 'reconcile';
    default:
      throw new PromptHookPayloadError(`unsupported hook event: ${name}`);
  }
}

export function parseAgentPromptSource(value: string): AgentPromptSource {
  if ((agentPromptSources as readonly string[]).includes(value)) {
    return value as AgentPromptSource;
  }
  throw new TypeError(`source must be one of: ${agentPromptSources.join(', ')}`);
}

/** Normalize prompt-submit and stop hook fields from Claude Code, Codex, or Cursor. */
export function normalizePromptHookPayload(
  source: AgentPromptSource,
  input: unknown,
  fallbackCwd: string = process.cwd()
): NormalizedPromptHookPayload {
  const payload = recordPayload(input);
  const event = hookEvent(payload);
  const text = event === 'submit' ? optionalNonblankString(payload.prompt, 'prompt') : null;
  if (event === 'submit' && text === null) {
    throw new PromptHookPayloadError('prompt is required for prompt submission');
  }

  return {
    source,
    event,
    sessionId: sessionId(payload),
    promptId: promptId(source, payload),
    promptText: event === 'submit' ? (payload.prompt as string) : null,
    transcriptPath: optionalNonblankString(
      payload.transcript_path,
      'transcript_path'
    ),
    cwd:
      optionalNonblankString(payload.cwd, 'cwd') ??
      firstWorkspaceRoot(payload) ??
      fallbackCwd,
  };
}

/** Apply one prompt lifecycle hook to the prompt/branch store. */
export function recordPromptHookEvent(
  source: AgentPromptSource,
  payload: unknown,
  fallbackCwd?: string
): PromptBranchRow | null {
  if (promptCaptureDisabled()) return null;

  const hook = normalizePromptHookPayload(source, payload, fallbackCwd);
  if (hook.event === 'submit') {
    return recordPromptBranch({
      source: hook.source,
      sessionId: hook.sessionId,
      promptId: hook.promptId ?? undefined,
      promptText: hook.promptText!,
      previousAgentOutput: hook.transcriptPath
        ? readPreviousAgentOutput(hook.transcriptPath)
        : null,
      cwd: hook.cwd,
    });
  }

  const branchInput = {
    source: hook.source,
    sessionId: hook.sessionId,
    promptId: hook.promptId,
    cwd: hook.cwd,
  };
  return reconcilePromptBranch(branchInput);
}
