import type { MemoryRule, TraceEvent } from '../rules.ts';
import { clipped, parseObject, requiredString, serializedRules } from './common.ts';
import { runSubagent, type Agent, type SubagentRunner } from './runner.ts';

export const APPLICABILITY_VERSION = 1;

export interface ApplicabilityResult {
  applicableAtomicIds: string[];
  reason: string;
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

export function applicabilityInstruction(event: TraceEvent, active: MemoryRule[]): string {
  return `Determine which existing learned rules are relevant to this turn.

A rule is applicable when its positive condition matches the CURRENT USER MESSAGE or the surrounding task evidence. Respect every rule's exception. Do not write rules and do not judge compliance.

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

export function runApplicability(
  agent: Agent,
  event: TraceEvent,
  active: MemoryRule[],
  run: SubagentRunner = runSubagent
): ApplicabilityResult {
  return parseApplicability(
    run(agent, 'applicability', applicabilityInstruction(event, active)),
    active
  );
}
