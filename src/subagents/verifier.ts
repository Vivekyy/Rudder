import type { MemoryRule, TraceEvent } from '../rules.ts';
import { clipped, parseObject, requiredString, serializedRules } from './common.ts';
import { runSubagent, type Agent, type SubagentRunner } from './runner.ts';

export const VERIFIER_VERSION = 1;

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

export function verificationInstruction(
  event: TraceEvent,
  applicable: readonly MemoryRule[],
  assistantBehavior: string | null | undefined = event.behavior_text
): string {
  return `Verify whether the ASSISTANT BEHAVIOR enforced every applicable learned rule.

Judge only the supplied rules. "enforced" is true only when every verdict is compliant; it is true when there are no applicable rules. Do not write or update rules.

Return ONLY one JSON object:
{"enforced":boolean,"reason":"brief","verdicts":[{"atomic_id":"existing-id","compliant":boolean,"reason":"brief evidence"}]}

PRIOR TASK:
${clipped(event.task_text)}

CURRENT USER MESSAGE:
${clipped(event.prompt)}

ASSISTANT BEHAVIOR:
${clipped(assistantBehavior)}

APPLICABLE ENFORCED RULES:
${JSON.stringify(serializedRules(applicable))}`;
}

export function runVerification(
  agent: Agent,
  event: TraceEvent,
  applicable: readonly MemoryRule[],
  assistantBehavior: string | null | undefined,
  run: SubagentRunner = runSubagent
): VerificationResult {
  return parseVerification(
    run(agent, 'verifier', verificationInstruction(event, applicable, assistantBehavior)),
    applicable.map((rule) => rule.atomic_id)
  );
}

export function renderVerifierFeedback(
  result: VerificationResult,
  attempt: number,
  maxRetries: number
): string {
  const violations = result.verdicts.filter((verdict) => !verdict.compliant);
  const rendered = violations.length
    ? violations
        .map((verdict) => `- [${verdict.atomicId}] ${verdict.reason}`)
        .join('\n')
    : `- ${result.reason || 'The verifier found a learned-rule violation.'}`;
  return [
    'Rudder verifier found learned-rule violations. Continue working before stopping.',
    '',
    `Retry ${attempt} of ${maxRetries}.`,
    '',
    'Violations:',
    rendered,
    '',
    'Revise the work to satisfy these rules, then attempt to stop again.',
  ].join('\n');
}
