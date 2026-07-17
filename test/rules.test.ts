import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { useTempHome, type TempHome } from './helpers.ts';

let home: TempHome;

before(() => {
  home = useTempHome('rudder-rules-test-');
});

after(() => {
  home.restore();
});

test('rule lifecycle stores versions and renders project-aware context', async () => {
  const { insertPrompt, localDay } = await import('../src/db/index.ts');
  const {
    queueTraceEvent,
    pendingTraceEvents,
    applyRuleCandidate,
    activeRules,
    applicableRulesForEvent,
    markTraceApplicability,
    renderRuleContext,
  } = await import('../src/rules.ts');
  const promptId = insertPrompt({
    source: 'claude',
    prompt: 'Always use pnpm in this repository',
    cwd: '/repos/rule-project',
    project: 'rule-project',
  })!;
  queueTraceEvent(promptId, null, 'install a dependency', 'used npm');
  const event = pendingTraceEvents().find((row) => row.id === promptId)!;
  assert.ok(event);

  const first = applyRuleCandidate(
    event,
    {
      action: 'NEW',
      existingAtomicId: null,
      kind: 'preference',
      scope: 'project',
      enforced: false,
      ruleText: 'Use pnpm instead of npm.',
      appliesWhen: 'installing dependencies',
      doesNotApplyWhen: 'the project explicitly requires another package manager',
    },
    0
  )!;
  assert.equal(first.version, 1);
  assert.match(first.atomic_id, /^rule_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(first.project, 'rule-project');
  assert.match(renderRuleContext('/repos/rule-project'), /Use pnpm instead of npm/);
  assert.match(renderRuleContext('/tmp/worktrees/rule-project'), /Use pnpm instead of npm/);
  assert.doesNotMatch(renderRuleContext('other-project'), /Use pnpm instead of npm/);
  markTraceApplicability(promptId, [first.atomic_id], 'applies to dependencies', 'claude', 1);
  const eventWithApplicability = pendingTraceEvents().find((row) => row.id === promptId)!;
  assert.ok(
    applicableRulesForEvent({
      ...eventWithApplicability,
      cwd: '/tmp/worktrees/rule-project',
      project: 'rule-project',
    }).some((rule) => rule.atomic_id === first.atomic_id),
    'applicable rule lookup should survive checkout/worktree path changes'
  );

  const updated = applyRuleCandidate(
    event,
    {
      action: 'UPDATE',
      existingAtomicId: first.atomic_id,
      kind: 'preference',
      scope: 'project',
      enforced: false,
      ruleText: 'Use pnpm and preserve the lockfile.',
      appliesWhen: 'installing or updating dependencies',
      doesNotApplyWhen: 'the repository uses a different lockfile',
    },
    1
  )!;
  assert.equal(updated.version, 2);
  assert.equal(updated.project, 'rule-project');
  assert.equal(
    activeRules('/tmp/worktrees/rule-project').filter((rule) => rule.atomic_id === first.atomic_id).length,
    1
  );
  assert.equal(localDay().length, 10);
});

test('compilation rolls back all candidates when one lifecycle action fails', async () => {
  const { insertPrompt, openDb } = await import('../src/db/index.ts');
  const { queueTraceEvent, pendingTraceEvents, applyCompilation } = await import('../src/rules.ts');
  const promptId = insertPrompt({
    source: 'claude',
    prompt: 'Remember two independent preferences',
    cwd: '/repos/atomic-project',
    project: 'atomic-project',
  })!;
  queueTraceEvent(promptId, null, '', '');
  const event = pendingTraceEvents().find((row) => row.id === promptId)!;
  const base = {
    kind: 'preference' as const,
    scope: 'project' as const,
    enforced: false,
    ruleText: 'Use the repository package manager.',
    appliesWhen: 'installing dependencies',
    doesNotApplyWhen: 'no package manager exists',
  };
  assert.throws(
    () =>
      applyCompilation(
        event,
        [
          { ...base, action: 'NEW', existingAtomicId: null },
          { ...base, action: 'UPDATE', existingAtomicId: 'not-in-snapshot' },
        ],
        new Map(),
        'claude',
        1
      ),
    /was not found/
  );
  const row = openDb()
    .prepare('SELECT COUNT(*) AS n FROM memory_rules WHERE source_prompt_id = ?')
    .get(promptId) as { n: number };
  assert.equal(row.n, 0, 'the first candidate must roll back with the failed second candidate');
});

test('compilation applies only the last candidate for a repeated existing rule target', async () => {
  const { insertPrompt, openDb } = await import('../src/db/index.ts');
  const { queueTraceEvent, pendingTraceEvents, applyRuleCandidate, applyCompilation, activeRules } =
    await import('../src/rules.ts');
  const firstPromptId = insertPrompt({
    source: 'claude',
    prompt: 'Prefer npm scripts in this repository',
    cwd: '/repos/repeated-target',
    project: 'repeated-target',
  })!;
  queueTraceEvent(firstPromptId, null, '', '');
  const firstEvent = pendingTraceEvents().find((row) => row.id === firstPromptId)!;
  const first = applyRuleCandidate(
    firstEvent,
    {
      action: 'NEW',
      existingAtomicId: null,
      kind: 'preference',
      scope: 'project',
      enforced: false,
      ruleText: 'Use npm scripts.',
      appliesWhen: 'running package scripts',
      doesNotApplyWhen: 'another tool is explicitly requested',
    },
    0
  )!;
  const secondPromptId = insertPrompt({
    source: 'claude',
    prompt: 'Actually prefer pnpm scripts in this repository',
    cwd: '/repos/repeated-target',
    project: 'repeated-target',
  })!;
  queueTraceEvent(secondPromptId, null, '', '');
  const secondEvent = pendingTraceEvents().find((row) => row.id === secondPromptId)!;

  const rules = applyCompilation(
    secondEvent,
    [
      {
        action: 'UPDATE',
        existingAtomicId: first.atomic_id,
        kind: 'preference',
        scope: 'project',
        enforced: false,
        ruleText: 'Use yarn scripts.',
        appliesWhen: 'running package scripts',
        doesNotApplyWhen: 'another tool is explicitly requested',
      },
      {
        action: 'UPDATE',
        existingAtomicId: first.atomic_id,
        kind: 'preference',
        scope: 'project',
        enforced: false,
        ruleText: 'Use pnpm scripts.',
        appliesWhen: 'running package scripts',
        doesNotApplyWhen: 'another tool is explicitly requested',
      },
    ],
    new Map([[first.atomic_id, first.version]]),
    'claude',
    1
  );

  assert.equal(rules.length, 1);
  assert.equal(rules[0].rule_text, 'Use pnpm scripts.');
  assert.equal(rules[0].atomic_id, first.atomic_id);
  assert.equal(rules[0].version, 2);
  assert.ok(activeRules('/repos/repeated-target').some((rule) => rule.rule_text === 'Use pnpm scripts.'));
  const inactive = openDb()
    .prepare('SELECT status FROM memory_rules WHERE id = ?')
    .get(first.id) as { status: string };
  assert.equal(inactive.status, 'inactive');
});

test('compilation rejects mixed actions for a repeated existing rule target', async () => {
  const { insertPrompt, openDb } = await import('../src/db/index.ts');
  const { queueTraceEvent, pendingTraceEvents, applyRuleCandidate, applyCompilation, activeRules } =
    await import('../src/rules.ts');
  const firstPromptId = insertPrompt({
    source: 'claude',
    prompt: 'Prefer stable rule IDs',
    cwd: '/repos/mixed-target',
    project: 'mixed-target',
  })!;
  queueTraceEvent(firstPromptId, null, '', '');
  const firstEvent = pendingTraceEvents().find((row) => row.id === firstPromptId)!;
  const first = applyRuleCandidate(
    firstEvent,
    {
      action: 'NEW',
      existingAtomicId: null,
      kind: 'preference',
      scope: 'project',
      enforced: false,
      ruleText: 'Keep rule IDs stable.',
      appliesWhen: 'updating learned rules',
      doesNotApplyWhen: 'creating unrelated rules',
    },
    0
  )!;
  const secondPromptId = insertPrompt({
    source: 'claude',
    prompt: 'Conflicting repeated target',
    cwd: '/repos/mixed-target',
    project: 'mixed-target',
  })!;
  queueTraceEvent(secondPromptId, null, '', '');
  const secondEvent = pendingTraceEvents().find((row) => row.id === secondPromptId)!;

  assert.throws(
    () =>
      applyCompilation(
        secondEvent,
        [
          {
            action: 'UPDATE',
            existingAtomicId: first.atomic_id,
            kind: 'preference',
            scope: 'project',
            enforced: false,
            ruleText: 'Replace the rule ID.',
            appliesWhen: 'updating learned rules',
            doesNotApplyWhen: 'creating unrelated rules',
          },
          {
            action: 'NOOP',
            existingAtomicId: first.atomic_id,
            kind: 'preference',
            scope: 'project',
            enforced: false,
            ruleText: 'Keep rule IDs stable.',
            appliesWhen: 'updating learned rules',
            doesNotApplyWhen: 'creating unrelated rules',
          },
        ],
        new Map([[first.atomic_id, first.version]]),
        'claude',
        1
      ),
    /conflicting lifecycle actions/
  );

  assert.deepEqual(
    activeRules('/repos/mixed-target').map((rule) => rule.rule_text),
    ['Keep rule IDs stable.']
  );
  const trace = openDb()
    .prepare('SELECT status FROM trace_events WHERE prompt_id = ?')
    .get(secondPromptId) as { status: string };
  assert.equal(trace.status, 'pending');
});

test('completed trace events are not reprocessed by stale workers', async () => {
  const { insertPrompt, openDb } = await import('../src/db/index.ts');
  const { queueTraceEvent, pendingTraceEvents, claimTraceEvent, markTraceEvent, applyCompilation } =
    await import('../src/rules.ts');
  const promptId = insertPrompt({
    source: 'claude',
    prompt: 'Remember not to reprocess compiled events',
    cwd: '/repos/completed-events',
    project: 'completed-events',
  })!;
  queueTraceEvent(promptId, null, '', '');
  const event = pendingTraceEvents().find((row) => row.id === promptId)!;
  const db = openDb();
  const firstToken = claimTraceEvent(promptId, 'claude', 1)!;
  assert.equal(typeof firstToken, 'string');
  assert.equal(claimTraceEvent(promptId, 'codex', 1), null);
  assert.ok(!pendingTraceEvents().some((row) => row.id === promptId));
  db.prepare('UPDATE trace_events SET lease_until = ? WHERE prompt_id = ?').run(
    new Date(Date.now() - 1_000).toISOString(),
    promptId
  );
  const secondToken = claimTraceEvent(promptId, 'codex', 1)!;
  assert.equal(typeof secondToken, 'string');
  assert.notEqual(secondToken, firstToken);

  markTraceEvent(promptId, 'skipped', 'claude', 1, undefined, firstToken);
  const leased = db
    .prepare('SELECT status, claim_token FROM trace_events WHERE prompt_id = ?')
    .get(promptId) as { status: string; claim_token: string | null };
  assert.equal(leased.status, 'compiling');
  assert.equal(leased.claim_token, secondToken);

  assert.equal(
    applyCompilation(
      event,
      [
        {
          action: 'NEW',
          existingAtomicId: null,
          kind: 'preference',
          scope: 'project',
          enforced: false,
          ruleText: 'Ignore stale trace event owners.',
          appliesWhen: 'processing trace events',
          doesNotApplyWhen: 'the same worker still owns the lease',
        },
      ],
      new Map(),
      'claude',
      1,
      firstToken
    ).length,
    0
  );
  const rules = applyCompilation(
    event,
    [
      {
        action: 'NEW',
        existingAtomicId: null,
        kind: 'preference',
        scope: 'project',
        enforced: false,
        ruleText: 'Do not duplicate compiled events.',
        appliesWhen: 'processing trace events',
        doesNotApplyWhen: 'the event is still pending',
      },
    ],
    new Map(),
    'codex',
    1,
    secondToken
  );
  assert.equal(rules.length, 1);
  db.prepare(
    `UPDATE trace_events
     SET status = 'compiled', compiler = 'claude', compiler_version = 1, error = NULL
     WHERE prompt_id = ?`
  ).run(promptId);

  markTraceEvent(promptId, 'error', 'codex', 1, 'stale worker failure', firstToken);
  const trace = db
    .prepare('SELECT status, attempts, error FROM trace_events WHERE prompt_id = ?')
    .get(promptId) as { status: string; attempts: number; error: string | null };
  assert.equal(trace.status, 'compiled');
  assert.equal(trace.attempts, 0);
  assert.equal(trace.error, null);

  const inserted = db
    .prepare('SELECT COUNT(*) AS n FROM memory_rules WHERE source_prompt_id = ?')
    .get(promptId) as { n: number };
  assert.equal(inserted.n, 1);
});
