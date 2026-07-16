import { runAgent, resolveAgent, type Agent } from './agent.ts';
import {
  activeRules,
  applyCompilation,
  claimTraceEvent,
  markTraceEvent,
  pendingTraceEvents,
  type MemoryRule,
  type RuleAction,
  type RuleCandidate,
  type RuleKind,
  type RuleScope,
  type TraceEvent,
} from './rules.ts';
import { capture } from './telemetry.ts';

export const COMPILER_VERSION = 1;

export interface CompilationResult {
  signal: boolean;
  reason: string;
  candidates: RuleCandidate[];
}

const ACTIONS = new Set<RuleAction>(['NEW', 'NOOP', 'UPDATE']);
const KINDS = new Set<RuleKind>(['preference', 'pitfall', 'friction']);
const SCOPES = new Set<RuleScope>(['global', 'project']);

function requiredString(value: unknown, field: string, max = 2_000): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`compiler output has no ${field}`);
  }
  return value.trim().slice(0, max);
}

/** Parse and validate the compiler's strict JSON object. Invalid output is never persisted. */
export function parseCompilation(output: string): CompilationResult {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start === -1 || end < start) throw new Error('compiler returned no JSON object');

  let parsed: unknown;
  try {
    parsed = JSON.parse(output.slice(start, end + 1));
  } catch {
    throw new Error('compiler returned invalid JSON');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('compiler output must be an object');
  const root = parsed as Record<string, unknown>;
  if (typeof root.signal !== 'boolean') throw new Error('compiler output has no boolean signal');
  const reason = typeof root.reason === 'string' ? root.reason.trim().slice(0, 2_000) : '';
  if (!root.signal) return { signal: false, reason, candidates: [] };
  if (!Array.isArray(root.candidates) || root.candidates.length === 0) {
    throw new Error('signal output has no rule candidates');
  }

  const candidates = root.candidates.map((item): RuleCandidate => {
    if (!item || typeof item !== 'object') throw new Error('rule candidate must be an object');
    const candidate = item as Record<string, unknown>;
    const action = candidate.action as RuleAction;
    const kind = candidate.kind as RuleKind;
    const scope = candidate.scope as RuleScope;
    if (!ACTIONS.has(action)) throw new Error(`unknown lifecycle action '${String(action)}'`);
    if (!KINDS.has(kind)) throw new Error(`unknown rule kind '${String(kind)}'`);
    if (!SCOPES.has(scope)) throw new Error(`unknown rule scope '${String(scope)}'`);
    const existingAtomicId =
      candidate.existing_atomic_id === null || candidate.existing_atomic_id === undefined
        ? null
        : requiredString(candidate.existing_atomic_id, 'existing_atomic_id', 200);
    if (action !== 'NEW' && !existingAtomicId) {
      throw new Error(`${action} candidate requires existing_atomic_id`);
    }
    if (action === 'NEW' && existingAtomicId) {
      throw new Error('NEW candidate cannot reference existing_atomic_id');
    }
    return {
      action,
      existingAtomicId,
      kind,
      scope,
      ruleText: requiredString(candidate.rule_text, 'rule_text'),
      appliesWhen: requiredString(candidate.applies_when, 'applies_when'),
      doesNotApplyWhen: requiredString(candidate.does_not_apply_when, 'does_not_apply_when'),
    };
  });
  return { signal: true, reason, candidates };
}

function clipped(text: string | null | undefined, max = 8_000): string {
  return (text ?? '').slice(0, max);
}

function compilationInstruction(event: TraceEvent, active: MemoryRule[]): string {
  const existing = active.map((rule) => ({
    atomic_id: rule.atomic_id,
    version: rule.version,
    kind: rule.kind,
    scope: rule.scope,
    project: rule.project,
    rule_text: rule.rule_text,
    applies_when: rule.applies_when,
    does_not_apply_when: rule.does_not_apply_when,
  }));
  return `You compile durable user corrections into atomic rules for an AI coding assistant.

Decide whether CURRENT USER MESSAGE contains a durable preference, a repeated pitfall/correction, or workflow friction. Ordinary task requests, one-off implementation details, questions, and acknowledgements are not signals.

For each atomic signal, resolve it against ACTIVE RULES:
- NEW: no existing rule covers it.
- NOOP: an active rule already expresses the same behavior.
- UPDATE: refine or replace an existing rule while keeping its atomic id.
Split a message with multiple independent signals into multiple candidates.

Rules must be concise directives. "applies_when" must be a positive condition. "does_not_apply_when" must state clear exceptions. Use project scope for repository-specific instructions and global only for preferences that clearly span projects.

Return ONLY one JSON object:
{"signal":boolean,"reason":"brief","candidates":[{"action":"NEW|NOOP|UPDATE","existing_atomic_id":"id or null","kind":"preference|pitfall|friction","scope":"global|project","rule_text":"directive","applies_when":"positive condition","does_not_apply_when":"exceptions"}]}

PROJECT: ${event.project ?? '(unknown)'}
PRIOR TASK:
${clipped(event.task_text)}

PRIOR ASSISTANT BEHAVIOR:
${clipped(event.behavior_text)}

CURRENT USER MESSAGE:
${clipped(event.prompt)}

ACTIVE RULES:
${JSON.stringify(existing)}`;
}

export function compileEvent(event: TraceEvent, agent: Agent): CompilationResult {
  const claimToken = claimTraceEvent(event.id, agent, COMPILER_VERSION);
  if (!claimToken) {
    return { signal: false, reason: 'trace event is already claimed or completed', candidates: [] };
  }
  try {
    const active = activeRules(event.cwd ?? event.project);
    const result = parseCompilation(runAgent(agent, compilationInstruction(event, active)));
    if (!result.signal) {
      markTraceEvent(event.id, 'skipped', agent, COMPILER_VERSION, undefined, claimToken);
      return result;
    }
    const expectedVersions = new Map(active.map((rule) => [rule.atomic_id, rule.version]));
    for (const candidate of result.candidates) {
      if (
        candidate.existingAtomicId &&
        !expectedVersions.has(candidate.existingAtomicId)
      ) {
        throw new Error(
          `compiler referenced rule '${candidate.existingAtomicId}' outside the active project scope`
        );
      }
    }
    applyCompilation(event, result.candidates, expectedVersions, agent, COMPILER_VERSION, claimToken);
    return result;
  } catch (err) {
    markTraceEvent(event.id, 'error', agent, COMPILER_VERSION, (err as Error).message, claimToken);
    throw err;
  }
}

/** Compile queued prompt evidence out-of-band. Returns the number still pending. */
export function ensureCompiled(preferred?: Agent): number {
  const events = pendingTraceEvents();
  if (events.length === 0) return 0;
  let agent: Agent;
  try {
    agent = resolveAgent(preferred);
  } catch {
    return events.length;
  }

  let compiled = 0;
  for (const event of events) {
    try {
      compileEvent(event, agent);
      compiled++;
    } catch (err) {
      process.stderr.write(`rudder: rule compilation failed for prompt ${event.id}: ${(err as Error).message}\n`);
    }
  }
  capture('trace events compiled', { requested: events.length, compiled, agent });
  return pendingTraceEvents().length;
}
