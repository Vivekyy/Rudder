import { runSubagent, resolveAgent, type Agent, type SubagentRunner } from './agent.ts';
import {
  activeRules,
  applyCompilation,
  claimTraceEvent,
  markTraceEvent,
  pendingTraceEvents,
  traceApplicability,
  traceVerificationsForPrompt,
  type TraceEvent,
} from './rules.ts';
import { parseCompilation, writerInstruction } from './subagents/writer.ts';
import type { CompilationResult } from './subagents/writer.ts';
import { capture } from './telemetry.ts';

export const COMPILER_VERSION = 4;

export type { CompilationResult } from './subagents/writer.ts';
export { parseCompilation } from './subagents/writer.ts';
export {
  APPLICABILITY_VERSION,
  parseApplicability,
  type ApplicabilityResult,
} from './subagents/applicability.ts';
export {
  VERIFIER_VERSION,
  parseVerification,
  type EnforcementVerdict,
  type VerificationResult,
} from './subagents/verifier.ts';

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
    const active = activeRules(event.project ?? event.cwd);
    const applicability = traceApplicability(event);
    const applicableIds = new Set(applicability?.applicableAtomicIds ?? []);
    const applicable = active.filter((rule) => applicableIds.has(rule.atomic_id));
    const verifications = traceVerificationsForPrompt(event.id);
    const result = parseCompilation(
      run(agent, 'writer', writerInstruction(event, applicable, verifications))
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
