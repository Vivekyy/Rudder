import {
  runSubagent,
  resolveAgent,
  type Agent,
  type SubagentRunner,
} from './agent.ts';
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

export const COMPILER_VERSION = 2;

export interface CompilationResult {
  signal: boolean;
  reason: string;
  candidates: RuleCandidate[];
}

export interface ApplicabilityResult {
  applicableAtomicIds: string[];
  reason: string;
}

export interface EnforcementVerdict {
  atomicId: string;
  compliant: boolean;
  reason: string;
}

export interface VerificationResult {
  enforced: boolean;
  reason: string;
  verdicts: EnforcementVerdict[];
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

function parseObject(output: string, role: string): Record<string, unknown> {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start === -1 || end < start) throw new Error(`${role} returned no JSON object`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(output.slice(start, end + 1));
  } catch {
    throw new Error(`${role} returned invalid JSON`);
  }
  if (!parsed || typeof parsed !== 'object') throw new Error(`${role} output must be an object`);
  return parsed as Record<string, unknown>;
}

/** Parse the applicability sub-agent's selected active-rule ids. */
export function parseApplicability(
  output: string,
  active: readonly MemoryRule[]
): ApplicabilityResult {
  const root = parseObject(output, 'applicability sub-agent');
  if (!Array.isArray(root.applicable_atomic_ids)) {
    throw new Error('applicability sub-agent output has no applicable_atomic_ids array');
  }
  const known = new Set(active.map((rule) => rule.atomic_id));
  const applicableAtomicIds: string[] = [];
  for (const value of root.applicable_atomic_ids) {
    const atomicId = requiredString(value, 'applicable_atomic_id', 200);
    if (!known.has(atomicId)) {
      throw new Error(`applicability sub-agent referenced unknown rule '${atomicId}'`);
    }
    if (!applicableAtomicIds.includes(atomicId)) applicableAtomicIds.push(atomicId);
  }
  return {
    applicableAtomicIds,
    reason: typeof root.reason === 'string' ? root.reason.trim().slice(0, 2_000) : '',
  };
}

/** Parse the verifier sub-agent's enforcement assessment. */
export function parseVerification(
  output: string,
  applicableAtomicIds: readonly string[]
): VerificationResult {
  const root = parseObject(output, 'verifier sub-agent');
  if (typeof root.enforced !== 'boolean') {
    throw new Error('verifier sub-agent output has no boolean enforced');
  }
  if (!Array.isArray(root.verdicts)) {
    throw new Error('verifier sub-agent output has no verdicts array');
  }
  const applicable = new Set(applicableAtomicIds);
  const verdicts = root.verdicts.map((item): EnforcementVerdict => {
    if (!item || typeof item !== 'object') {
      throw new Error('verifier verdict must be an object');
    }
    const verdict = item as Record<string, unknown>;
    const atomicId = requiredString(verdict.atomic_id, 'atomic_id', 200);
    if (!applicable.has(atomicId)) {
      throw new Error(`verifier sub-agent referenced non-applicable rule '${atomicId}'`);
    }
    if (typeof verdict.compliant !== 'boolean') {
      throw new Error(`verifier verdict for '${atomicId}' has no boolean compliant`);
    }
    return {
      atomicId,
      compliant: verdict.compliant,
      reason: requiredString(verdict.reason, 'reason'),
    };
  });
  const judged = new Set(verdicts.map((verdict) => verdict.atomicId));
  if (judged.size !== verdicts.length || judged.size !== applicable.size) {
    throw new Error('verifier sub-agent must return exactly one verdict per applicable rule');
  }
  const enforced = verdicts.every((verdict) => verdict.compliant);
  if (root.enforced !== enforced) {
    throw new Error('verifier sub-agent enforced result conflicts with its verdicts');
  }
  return {
    enforced,
    reason: typeof root.reason === 'string' ? root.reason.trim().slice(0, 2_000) : '',
    verdicts,
  };
}

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

function serializedRules(active: readonly MemoryRule[]): object[] {
  return active.map((rule) => ({
    atomic_id: rule.atomic_id,
    version: rule.version,
    kind: rule.kind,
    scope: rule.scope,
    project: rule.project,
    rule_text: rule.rule_text,
    applies_when: rule.applies_when,
    does_not_apply_when: rule.does_not_apply_when,
  }));
}

function applicabilityInstruction(event: TraceEvent, active: MemoryRule[]): string {
  return `Determine which existing learned rules are relevant to this turn's evidence.

A rule is applicable when its positive condition matches the PRIOR TASK, or when the CURRENT USER MESSAGE corrects, confirms, or refines that rule. Respect every rule's exception. Do not write rules and do not judge compliance.

Return ONLY one JSON object:
{"applicable_atomic_ids":["existing-id"],"reason":"brief"}

PROJECT: ${event.project ?? '(unknown)'}
PRIOR TASK:
${clipped(event.task_text)}

PRIOR ASSISTANT BEHAVIOR:
${clipped(event.behavior_text)}

CURRENT USER MESSAGE:
${clipped(event.prompt)}

ACTIVE RULES:
${JSON.stringify(serializedRules(active))}`;
}

function verificationInstruction(
  event: TraceEvent,
  applicable: readonly MemoryRule[]
): string {
  return `Verify whether the PRIOR ASSISTANT BEHAVIOR enforced every applicable learned rule.

Judge only the supplied rules. Use the CURRENT USER MESSAGE as evidence when it explicitly identifies a violation, but do not write or update rules. "enforced" is true only when every verdict is compliant; it is true when there are no applicable rules.

Return ONLY one JSON object:
{"enforced":boolean,"reason":"brief","verdicts":[{"atomic_id":"existing-id","compliant":boolean,"reason":"brief evidence"}]}

PRIOR TASK:
${clipped(event.task_text)}

PRIOR ASSISTANT BEHAVIOR:
${clipped(event.behavior_text)}

CURRENT USER MESSAGE:
${clipped(event.prompt)}

APPLICABLE RULES:
${JSON.stringify(serializedRules(applicable))}`;
}

function writerInstruction(
  event: TraceEvent,
  applicable: readonly MemoryRule[],
  verification: VerificationResult
): string {
  return `Write durable user corrections as atomic rules for an AI coding assistant.

Decide whether CURRENT USER MESSAGE contains a durable preference, a repeated pitfall/correction, or workflow friction. Ordinary task requests, one-off implementation details, questions, and acknowledgements are not signals.

For each atomic signal, resolve it against APPLICABLE RULES selected by a separate sub-agent:
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

APPLICABLE RULES:
${JSON.stringify(serializedRules(applicable))}

ENFORCEMENT VERIFICATION:
${JSON.stringify(verification)}`;
}

export function compileEvent(
  event: TraceEvent,
  agent: Agent,
  run: SubagentRunner = runSubagent
): CompilationResult {
  const claimToken = claimTraceEvent(event.id, agent, COMPILER_VERSION);
  if (!claimToken) {
    return { signal: false, reason: 'trace event is already claimed or completed', candidates: [] };
  }
  try {
    const active = activeRules(event.cwd ?? event.project);
    const applicability = parseApplicability(
      run(agent, 'applicability', applicabilityInstruction(event, active)),
      active
    );
    const applicableIds = new Set(applicability.applicableAtomicIds);
    const applicable = active.filter((rule) => applicableIds.has(rule.atomic_id));
    const verification = parseVerification(
      run(agent, 'verifier', verificationInstruction(event, applicable)),
      applicability.applicableAtomicIds
    );
    const result = parseCompilation(
      run(agent, 'writer', writerInstruction(event, applicable, verification))
    );
    if (!result.signal) {
      markTraceEvent(event.id, 'skipped', agent, COMPILER_VERSION, undefined, claimToken);
      return result;
    }
    const expectedVersions = new Map(active.map((rule) => [rule.atomic_id, rule.version]));
    for (const candidate of result.candidates) {
      if (
        candidate.existingAtomicId &&
        !applicableIds.has(candidate.existingAtomicId)
      ) {
        throw new Error(
          `writer sub-agent referenced rule '${candidate.existingAtomicId}' that the applicability sub-agent did not select`
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
