import type {
  MemoryRule,
  RuleAction,
  RuleCandidate,
  RuleKind,
  RuleScope,
  TraceEvent,
  TraceVerification,
} from '../rules.ts';
import { clipped, parseObject, requiredString, serializedRules } from './common.ts';

export interface CompilationResult {
  signal: boolean;
  reason: string;
  candidates: RuleCandidate[];
}

const ACTIONS = new Set<RuleAction>(['NEW', 'NOOP', 'UPDATE']);
const KINDS = new Set<RuleKind>(['preference', 'pitfall']);
const SCOPES = new Set<RuleScope>(['global', 'project']);

/** Parse and validate the writer sub-agent's strict JSON object. */
export function parseCompilation(output: string): CompilationResult {
  const root = parseObject(output, 'writer sub-agent');
  if (typeof root.signal !== 'boolean') {
    throw new Error('writer sub-agent output has no boolean signal');
  }
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
      enforced: typeof candidate.enforced === 'boolean' ? candidate.enforced : true,
      ruleText: requiredString(candidate.rule_text, 'rule_text'),
      appliesWhen: requiredString(candidate.applies_when, 'applies_when'),
      doesNotApplyWhen: requiredString(candidate.does_not_apply_when, 'does_not_apply_when'),
    };
  });
  return { signal: true, reason, candidates };
}

function serializedVerifications(verifications: readonly TraceVerification[]): object[] {
  return verifications.map((verification) => ({
    attempt: verification.attempt,
    enforced: verification.enforced,
    reason: verification.reason,
    blocked: verification.blocked,
    verdicts: verification.verdicts,
  }));
}

export function writerInstruction(
  event: TraceEvent,
  applicable: readonly MemoryRule[],
  inactive: readonly MemoryRule[],
  verifications: readonly TraceVerification[]
): string {
  return `Write durable user corrections as atomic rules for an AI coding assistant.

Decide whether CURRENT USER MESSAGE contains a durable preference or a repeated pitfall/correction. Ordinary task requests, one-off implementation details, questions, and acknowledgements are not signals.

For each atomic signal, resolve it against APPLICABLE RULES selected at runtime:
- NEW: no existing rule covers it.
- NOOP: an active rule already expresses the same behavior.
- UPDATE: refine or replace an existing rule while keeping its atomic id.
Inactive rules are intentionally retired. Do not UPDATE or NOOP an inactive rule, and do not emit a NEW candidate that restates or semantically recreates an inactive rule. If every candidate would recreate inactive behavior, return {"signal":false,"reason":"inactive rules already retired this behavior","candidates":[]}.
Split a message with multiple independent signals into multiple candidates.

Rules must be concise directives. "applies_when" must be a positive condition. "does_not_apply_when" must state clear exceptions. "enforced" is true when Stop-hook verification should block/retry on violations; set it false for advisory context that should not block completion.

Return ONLY one JSON object:
{"signal":boolean,"reason":"brief","candidates":[{"action":"NEW|NOOP|UPDATE","existing_atomic_id":"id or null","kind":"preference|pitfall","scope":"global|project","enforced":boolean,"rule_text":"directive","applies_when":"positive condition","does_not_apply_when":"exceptions"}]}

PROJECT: ${event.project ?? '(unknown)'}
PRIOR TASK:
${clipped(event.task_text)}

PRIOR ASSISTANT BEHAVIOR:
${clipped(event.behavior_text)}

CURRENT USER MESSAGE:
${clipped(event.prompt)}

RUNTIME APPLICABLE RULES:
${JSON.stringify(serializedRules(applicable))}

INACTIVE RULES:
${JSON.stringify(serializedRules(inactive))}

RUNTIME VERIFIER ATTEMPTS:
${JSON.stringify(serializedVerifications(verifications))}`;
}
