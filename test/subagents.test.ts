import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MemoryRule, TraceEvent } from '../src/rules.ts';

function memoryRule(overrides: Partial<MemoryRule> = {}): MemoryRule {
  return {
    id: 1,
    atomic_id: 'rule-1',
    version: 1,
    kind: 'preference',
    scope: 'project',
    project: 'project-a',
    rule_text: 'Preserve the public API.',
    applies_when: 'changing public interfaces',
    does_not_apply_when: 'the user asks for a breaking change',
    enforced: true,
    status: 'active',
    source_prompt_id: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    replaced_by_id: null,
    ...overrides,
  };
}

function traceEvent(overrides: Partial<TraceEvent> = {}): TraceEvent {
  return {
    id: 1,
    ts: '2026-01-01T00:00:00.000Z',
    day: '2026-01-01',
    source: 'claude',
    session_id: 'session-1',
    cwd: '/repos/project-a',
    project: 'project-a',
    prompt: 'Keep the endpoint stable.',
    model: null,
    raw: null,
    turn_id: 'turn-1',
    hook_prompt_id: 'prompt-1',
    transcript_path: null,
    task_text: 'Refactor the endpoint implementation.',
    behavior_text: 'Renamed the endpoint.',
    applicable_atomic_ids: null,
    applicability_reason: null,
    applicability_agent: null,
    applicability_version: null,
    applicability_ts: null,
    lease_until: null,
    claim_token: null,
    attempts: 0,
    ...overrides,
  };
}

test('applicability parser deduplicates known rules and rejects unknown ids', async () => {
  const { parseApplicability, applicabilityInstruction, runApplicability } = await import(
    '../src/subagents/applicability.ts'
  );
  const active = [memoryRule()];
  assert.deepEqual(
    parseApplicability(
      '{"applicable_atomic_ids":["rule-1","rule-1"],"reason":" relevant "}',
      active
    ),
    { applicableAtomicIds: ['rule-1'], reason: 'relevant' }
  );
  assert.throws(
    () => parseApplicability('{"applicable_atomic_ids":["missing"]}', active),
    /unknown rule/
  );
  assert.throws(
    () => parseApplicability('{"applicable_atomic_ids":false}', active),
    /no applicable_atomic_ids array/
  );

  const event = traceEvent();
  assert.match(applicabilityInstruction(event, active), /ACTIVE RULES/);
  const result = runApplicability('codex', event, active, (agent, role, instruction) => {
    assert.equal(agent, 'codex');
    assert.equal(role, 'applicability');
    assert.match(instruction, /CURRENT USER MESSAGE/);
    return '{"applicable_atomic_ids":["rule-1"],"reason":"matches"}';
  });
  assert.deepEqual(result, { applicableAtomicIds: ['rule-1'], reason: 'matches' });
});

test('verifier parser validates one verdict per applicable rule', async () => {
  const {
    parseVerification,
    verificationInstruction,
    runVerification,
    renderVerifierFeedback,
  } = await import('../src/subagents/verifier.ts');
  const rule = memoryRule();
  const event = traceEvent();

  const result = parseVerification(
    JSON.stringify({
      enforced: false,
      reason: 'endpoint was renamed',
      verdicts: [
        {
          atomic_id: 'rule-1',
          compliant: false,
          reason: 'assistant renamed the endpoint',
        },
      ],
    }),
    ['rule-1']
  );
  assert.equal(result.enforced, false);
  assert.equal(result.verdicts[0].atomicId, 'rule-1');

  assert.throws(
    () => parseVerification('{"enforced":true,"verdicts":[]}', ['rule-1']),
    /exactly one verdict/
  );
  assert.throws(
    () =>
      parseVerification(
        '{"enforced":true,"verdicts":[{"atomic_id":"missing","compliant":true,"reason":"ok"}]}',
        ['rule-1']
      ),
    /non-applicable rule/
  );
  assert.throws(
    () =>
      parseVerification(
        '{"enforced":true,"verdicts":[{"atomic_id":"rule-1","compliant":false,"reason":"no"}]}',
        ['rule-1']
      ),
    /conflicts/
  );

  assert.match(verificationInstruction(event, [rule], 'Kept the endpoint stable.'), /ASSISTANT BEHAVIOR/);
  const passed = runVerification('claude', event, [rule], 'Kept the endpoint stable.', (agent, role) => {
    assert.equal(agent, 'claude');
    assert.equal(role, 'verifier');
    return '{"enforced":true,"reason":"ok","verdicts":[{"atomic_id":"rule-1","compliant":true,"reason":"kept"}]}';
  });
  assert.equal(passed.enforced, true);
  assert.match(renderVerifierFeedback(result, 2, 3), /Retry 2 of 3/);
  assert.match(renderVerifierFeedback({ enforced: false, reason: 'missing tests', verdicts: [] }, 1, 3), /missing tests/);
});

test('resolveAgent returns the preferred agent without probing PATH', async () => {
  const { resolveAgent } = await import('../src/subagents/runner.ts');

  assert.equal(resolveAgent('codex'), 'codex');
});
