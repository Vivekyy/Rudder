import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { useTempHome, type TempHome } from './helpers.ts';

let home: TempHome;

before(() => {
  home = useTempHome('rudder-compiler-test-');
});

after(() => {
  home.restore();
});

test('compiler parser rejects malformed lifecycle output', async () => {
  const { parseCompilation } = await import('../src/compiler.ts');
  const parsed = parseCompilation(
    JSON.stringify({
      signal: true,
      reason: 'explicit preference',
      candidates: [
        {
          action: 'NEW',
          existing_atomic_id: null,
          kind: 'preference',
          scope: 'global',
          enforced: false,
          rule_text: 'Keep responses concise.',
          applies_when: 'answering routine questions',
          does_not_apply_when: 'detail is requested',
        },
      ],
    })
  );
  assert.equal(parsed.candidates.length, 1);
  assert.equal(parsed.candidates[0].ruleText, 'Keep responses concise.');
  assert.equal(parsed.candidates[0].enforced, false);
  assert.throws(
    () =>
      parseCompilation(
        '{"signal":true,"candidates":[{"action":"DELETE","kind":"preference","scope":"global"}]}'
      ),
    /unknown lifecycle action/
  );
  assert.throws(
    () =>
      parseCompilation(
        JSON.stringify({
          signal: true,
          candidates: [
            {
              action: 'NEW',
              existing_atomic_id: null,
              kind: 'friction',
              scope: 'global',
              rule_text: 'Avoid workflow friction.',
              applies_when: 'using tools',
              does_not_apply_when: 'never',
            },
          ],
        })
      ),
    /unknown rule kind 'friction'/
  );
  assert.deepEqual(parseCompilation('{"signal":false,"reason":"ordinary task","candidates":[]}'), {
    signal: false,
    reason: 'ordinary task',
    candidates: [],
  });
});

test('compiler delegates writing with runtime applicability and verification context', async () => {
  const { insertPrompt, openDb } = await import('../src/db/index.ts');
  const {
    queueTraceEvent,
    pendingTraceEvents,
    applyRuleCandidate,
    markTraceEvent,
    markTraceApplicability,
    recordTraceVerification,
  } = await import('../src/rules.ts');
  const { compileEvent, parseApplicability } = await import('../src/compiler.ts');

  const seedId = insertPrompt({
    source: 'claude',
    prompt: 'Always preserve the public API',
    cwd: '/repos/subagent-pipeline',
    project: 'subagent-pipeline',
  })!;
  queueTraceEvent(seedId, null, 'change the API', 'renamed an endpoint');
  const seedEvent = pendingTraceEvents().find((row) => row.id === seedId)!;
  const rule = applyRuleCandidate(
    seedEvent,
    {
      action: 'NEW',
      existingAtomicId: null,
      kind: 'pitfall',
      scope: 'project',
      enforced: false,
      ruleText: 'Preserve the public API.',
      appliesWhen: 'changing public interfaces',
      doesNotApplyWhen: 'the user explicitly requests a breaking change',
    },
    0
  )!;
  const now = new Date().toISOString();
  openDb()
    .prepare(
      `INSERT INTO memory_rules (
        atomic_id, version, status, kind, scope, enforced, project, rule_text,
        applies_when, does_not_apply_when, source_prompt_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      'inactive-rule',
      1,
      'inactive',
      'preference',
      'project',
      0,
      'subagent-pipeline',
      'Do not recreate retired CLI flags.',
      'changing CLI behavior',
      'the user explicitly asks to restore the flag',
      seedId,
      now,
      now
    );
  markTraceEvent(seedId, 'skipped', 'claude', 1);

  assert.throws(
    () =>
      parseApplicability(
        '{"applicable_atomic_ids":["unknown-rule"],"reason":"relevant"}',
        [rule]
      ),
    /unknown rule/
  );

  const promptId = insertPrompt({
    source: 'claude',
    prompt: 'Do not rename the endpoint; keep the API stable',
    cwd: '/repos/subagent-pipeline',
    project: 'subagent-pipeline',
  })!;
  queueTraceEvent(promptId, null, 'refactor the endpoint implementation', 'renamed the endpoint');
  markTraceApplicability(
    promptId,
    [rule.atomic_id],
    'the task changes a public interface',
    'claude',
    1
  );
  const eventWithApplicability = pendingTraceEvents().find((row) => row.id === promptId)!;
  recordTraceVerification(
    promptId,
    {
      enforced: false,
      reason: 'the endpoint was renamed',
      verdicts: [
        {
          atomicId: rule.atomic_id,
          compliant: false,
          reason: 'assistant renamed the endpoint',
        },
      ],
    },
    true,
    'claude',
    1
  );
  const roles: string[] = [];
  const runner = (
    _agent: 'claude' | 'codex',
    role: 'applicability' | 'writer' | 'verifier',
    instruction: string
  ): string => {
    roles.push(role);
    assert.match(instruction, /"enforced":false/);
    assert.match(instruction, /"kind":"preference\|pitfall"/);
    assert.doesNotMatch(instruction, /preference\|pitfall\|friction/);
    assert.match(instruction, /INACTIVE RULES/);
    assert.match(instruction, /Do not recreate retired CLI flags/);
    assert.match(instruction, /Do not UPDATE or NOOP an inactive rule/);
    assert.doesNotMatch(instruction, /abort that NEW candidate/);
    assert.doesNotMatch(instruction, /inactive rule already retired this behavior/);
    return JSON.stringify({
      signal: true,
      reason: 'the user reinforced an existing rule',
      candidates: [
        {
          action: 'NOOP',
          existing_atomic_id: rule.atomic_id,
          kind: 'pitfall',
          scope: 'project',
          enforced: rule.enforced,
          rule_text: rule.rule_text,
          applies_when: rule.applies_when,
          does_not_apply_when: rule.does_not_apply_when,
        },
      ],
    });
  };

  const result = compileEvent(eventWithApplicability, 'claude', runner);
  assert.deepEqual(roles, ['writer']);
  assert.equal(result.candidates[0].action, 'NOOP');
  const trace = openDb()
    .prepare('SELECT status FROM trace_events WHERE prompt_id = ?')
    .get(promptId) as { status: string };
  assert.equal(trace.status, 'compiled');
});

test('ensureCompiled returns immediately when no trace events are pending', async () => {
  const { ensureCompiled } = await import('../src/compiler.ts');

  assert.equal(ensureCompiled('claude'), 0);
});
