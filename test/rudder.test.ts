import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let home: string;

before(() => {
  home = mkdtempSync(join(tmpdir(), 'rudder-test-'));
  process.env.RUDDER_HOME = home;
});

after(() => {
  rmSync(home, { recursive: true, force: true });
});

test('insertPrompt stores and queries by local day; blanks are skipped', async () => {
  const { insertPrompt, promptsForDay, localDay } = await import('../src/db/index.ts');

  const id = insertPrompt({
    source: 'claude',
    prompt: '  Fix the deploy  ',
    cwd: '/repos/archer',
    project: 'archer',
  });
  assert.ok(id && id > 0);

  // Blank prompts are not recorded.
  assert.equal(insertPrompt({ source: 'codex', prompt: '   ' }), null);

  const rows = promptsForDay(localDay());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].prompt, 'Fix the deploy'); // trimmed
  assert.equal(rows[0].source, 'claude');
  assert.equal(rows[0].project, 'archer');
});

test('rudderArgv points at a bin file that actually exists', async () => {
  const { existsSync } = await import('node:fs');
  const { rudderArgv } = await import('../src/install.ts');

  const argv = rudderArgv(['hook', 'claude']);
  assert.equal(argv[0], process.execPath);
  assert.equal(argv[2], 'hook');
  assert.equal(argv[3], 'claude');
  // This test runs from the `.ts` source tree, so it only guards the dev path:
  // the bin must resolve to a real file on disk. The published `.js` build is
  // covered separately below, since it can't be exercised without a build.
  assert.ok(existsSync(argv[1]), `rudder bin should exist at ${argv[1]}`);
});

test('rudderBinPath matches the bin extension to the loading module', async () => {
  const { rudderBinPath } = await import('../src/install.ts');
  const { pathToFileURL } = await import('node:url');
  const { join } = await import('node:path');

  // Dev `.ts` checkout: src/install.ts ↔ bin/rudder.ts.
  const tsUrl = pathToFileURL(join('/repo', 'src', 'install.ts')).href;
  assert.equal(rudderBinPath(tsUrl), join('/repo', 'bin', 'rudder.ts'));

  // Published `.js` build: dist/src/install.js ↔ dist/bin/rudder.js — the path
  // that had the original "hook points at a nonexistent file" bug.
  const jsUrl = pathToFileURL(join('/repo', 'dist', 'src', 'install.js')).href;
  assert.equal(rudderBinPath(jsUrl), join('/repo', 'dist', 'bin', 'rudder.js'));
});

test('migrationsFolder resolves from source and published layouts', async () => {
  const { migrationsFolder } = await import('../src/db/client.ts');
  const { pathToFileURL } = await import('node:url');
  const { join } = await import('node:path');

  const tsUrl = pathToFileURL(join('/repo', 'src', 'db', 'client.ts')).href;
  assert.equal(migrationsFolder(tsUrl), join('/repo', 'drizzle'));

  const jsUrl = pathToFileURL(join('/repo', 'dist', 'src', 'db', 'client.js')).href;
  assert.equal(migrationsFolder(jsUrl), join('/repo', 'drizzle'));
});

test('claude hook parses stdin JSON into a row', async () => {
  const { promptsForDay, localDay } = await import('../src/db/index.ts');
  const { claudeHook } = await import('../src/hooks.ts');

  const payload = JSON.stringify({
    session_id: 's1',
    cwd: '/repos/archerdb',
    prompt: 'Add an index',
  });

  // Feed the payload via a fake stdin stream.
  const { Readable } = await import('node:stream');
  const fake = Readable.from([payload]) as unknown as NodeJS.ReadStream;
  fake.isTTY = false;
  const orig = process.stdin;
  Object.defineProperty(process, 'stdin', { value: fake, configurable: true });
  try {
    await claudeHook();
  } finally {
    Object.defineProperty(process, 'stdin', { value: orig, configurable: true });
  }

  const rows = promptsForDay(localDay());
  const found = rows.find((r) => r.prompt === 'Add an index');
  assert.ok(found, 'claude hook should have recorded the prompt');
  assert.equal(found!.project, 'archerdb');
});

test('statsForDay counts untagged prompts as ignored, then reflects tags', async () => {
  const { insertPrompt, localDay } = await import('../src/db/index.ts');
  const { upsertTag, statsForDay, untaggedPromptsForDay } = await import('../src/tags.ts');

  const when = new Date('2020-03-04T12:00:00'); // local noon → stable local day
  const day = localDay(when);
  const ids = ['arch', 'tune', 'bug', 'house', 'chore'].map((p) =>
    insertPrompt({ source: 'claude', prompt: p, ts: when })!
  );

  // Before tagging: everything is untagged → counted as ignored, not a category.
  assert.equal(untaggedPromptsForDay(day).length, 5);
  let s = statsForDay(day);
  assert.equal(s.total, 5);
  assert.equal(s.ignored, 5);
  assert.equal(s.counted, 0);
  assert.equal(s.byCategory.housekeeping.pct, 0);
  assert.equal(s.correctionPct, null);

  upsertTag(ids[0], 'architecting', 'none', 'claude');
  upsertTag(ids[1], 'tuning', 'none', 'claude');
  upsertTag(ids[2], 'bugfixing', 'disagree', 'claude');
  upsertTag(ids[3], 'housekeeping', 'agree', 'claude');
  upsertTag(ids[4], 'ignored', 'none', 'claude');

  assert.equal(untaggedPromptsForDay(day).length, 0);
  s = statsForDay(day);
  assert.equal(s.total, 5);
  assert.equal(s.ignored, 1);
  assert.equal(s.counted, 4);
  assert.equal(s.byCategory.architecting.pct, 25);
  assert.equal(s.byCategory.bugfixing.count, 1);
  assert.equal(s.agree, 1);
  assert.equal(s.disagree, 1);
  assert.equal(s.correctionPct, 50); // 1 disagree of 2 reactions

  // Re-tagging the same prompt replaces, not duplicates.
  upsertTag(ids[0], 'bugfixing', 'none', 'claude');
  s = statsForDay(day);
  assert.equal(s.total, 5, 'upsert must not create a second tag row');
  assert.equal(s.byCategory.architecting.count, 0);
  assert.equal(s.byCategory.bugfixing.count, 2);
});

test('untaggedPromptsForDay treats a tag from another version as untagged', async () => {
  const { insertPrompt, localDay } = await import('../src/db/index.ts');
  const { upsertTag, untaggedPromptsForDay, TAGGER_VERSION } = await import('../src/tags.ts');

  const when = new Date('2020-05-06T12:00:00');
  const day = localDay(when);
  const id = insertPrompt({ source: 'codex', prompt: 'stale tag', ts: when })!;

  upsertTag(id, 'tuning', 'none', 'codex', TAGGER_VERSION - 1); // older version
  assert.ok(
    untaggedPromptsForDay(day).some((r) => r.id === id),
    'a tag at an older version should count as untagged'
  );

  upsertTag(id, 'tuning', 'none', 'codex', TAGGER_VERSION); // current version
  assert.ok(!untaggedPromptsForDay(day).some((r) => r.id === id));
});

test('parseTags tolerates fences/prose and normalizes categories', async () => {
  const { parseTags } = await import('../src/tagger.ts');

  const out =
    'Sure, here are the tags:\n```json\n' +
    '[{"id":1,"category":"Architecting","reaction":"none"},' +
    '{"id":2,"category":"bogus","reaction":"disagree"},' +
    '{"id":"x","category":"tuning","reaction":"agree"}]\n```\nDone.';
  const tags = parseTags(out);

  assert.equal(tags.length, 2, 'non-integer id is dropped');
  assert.equal(tags[0].category, 'architecting'); // lowercased
  assert.equal(tags[0].reaction, 'none');
  assert.equal(tags[1].category, 'ignored'); // unknown → fallback
  assert.equal(tags[1].reaction, 'disagree');
  assert.deepEqual(parseTags('no array here'), []);
});

test('telemetryDisabled honors DO_NOT_TRACK=1 opt-out', async () => {
  const { telemetryDisabled } = await import('../src/telemetry.ts');

  assert.equal(telemetryDisabled({}), false);
  assert.equal(telemetryDisabled({ DO_NOT_TRACK: '1' }), true);
  assert.equal(telemetryDisabled({ DO_NOT_TRACK: 'yes' }), false);
  assert.equal(telemetryDisabled({ DO_NOT_TRACK: '0' }), false);
});

test('pngIcon emits a valid PNG of the requested size', async () => {
  const { pngIcon } = await import('../src/icon.ts');
  const png = pngIcon(192);
  // PNG signature.
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  // IHDR width/height live at byte offset 16/20.
  assert.equal(png.readUInt32BE(16), 192);
  assert.equal(png.readUInt32BE(20), 192);
  // Memoized: same buffer instance on a second call.
  assert.equal(pngIcon(192), png);
});

test('PWA manifest is installable and the service worker has a fetch handler', async () => {
  const { MANIFEST, SERVICE_WORKER } = await import('../src/ui.ts');
  const m = JSON.parse(MANIFEST);
  assert.equal(m.display, 'standalone');
  assert.ok(m.start_url);
  const sizes = m.icons.map((i: { sizes: string }) => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'), 'needs 192 + 512 icons');
  assert.match(SERVICE_WORKER, /addEventListener\("fetch"/);
});

test('transcript reader extracts the latest user and assistant text', async () => {
  const { readTranscriptContext } = await import('../src/transcript.ts');
  const path = join(home, 'session.jsonl');
  writeFileSync(
    path,
    [
      JSON.stringify({ type: 'user', message: { content: 'Use pnpm here' } }),
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'I used npm.' }] },
      }),
      '{malformed',
    ].join('\n')
  );

  assert.deepEqual(readTranscriptContext(path), {
    lastUserText: 'Use pnpm here',
    lastAssistantText: 'I used npm.',
  });
  writeFileSync(
    path,
    [
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Keep the API stable' }],
        },
      }),
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'I renamed the endpoint.' }],
        },
      }),
    ].join('\n')
  );
  assert.deepEqual(readTranscriptContext(path), {
    lastUserText: 'Keep the API stable',
    lastAssistantText: 'I renamed the endpoint.',
  });
  assert.deepEqual(readTranscriptContext(join(home, 'missing.jsonl')), {
    lastUserText: '',
    lastAssistantText: '',
  });
});

test('rule lifecycle stores versions and renders project-aware context', async () => {
  const { insertPrompt, localDay } = await import('../src/db/index.ts');
  const {
    queueTraceEvent,
    pendingTraceEvents,
    applyRuleCandidate,
    activeRules,
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
      ruleText: 'Use pnpm instead of npm.',
      appliesWhen: 'installing dependencies',
      doesNotApplyWhen: 'the project explicitly requires another package manager',
    },
    0
  )!;
  assert.equal(first.version, 1);
  assert.match(renderRuleContext('/repos/rule-project'), /Use pnpm instead of npm/);
  assert.doesNotMatch(renderRuleContext('other-project'), /Use pnpm instead of npm/);

  const updated = applyRuleCandidate(
    event,
    {
      action: 'UPDATE',
      existingAtomicId: first.atomic_id,
      kind: 'preference',
      scope: 'project',
      ruleText: 'Use pnpm and preserve the lockfile.',
      appliesWhen: 'installing or updating dependencies',
      doesNotApplyWhen: 'the repository uses a different lockfile',
    },
    1
  )!;
  assert.equal(updated.version, 2);
  assert.equal(
    activeRules('/repos/rule-project').filter((rule) => rule.atomic_id === first.atomic_id).length,
    1
  );
  assert.equal(localDay().length, 10);
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
          rule_text: 'Keep responses concise.',
          applies_when: 'answering routine questions',
          does_not_apply_when: 'detail is requested',
        },
      ],
    })
  );
  assert.equal(parsed.candidates.length, 1);
  assert.equal(parsed.candidates[0].ruleText, 'Keep responses concise.');
  assert.throws(
    () =>
      parseCompilation(
        '{"signal":true,"candidates":[{"action":"DELETE","kind":"preference","scope":"global"}]}'
      ),
    /unknown lifecycle action/
  );
  assert.deepEqual(parseCompilation('{"signal":false,"reason":"ordinary task","candidates":[]}'), {
    signal: false,
    reason: 'ordinary task',
    candidates: [],
  });
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
        action: 'SUPERSEDE',
        existingAtomicId: first.atomic_id,
        kind: 'preference',
        scope: 'project',
        ruleText: 'Use yarn scripts.',
        appliesWhen: 'running package scripts',
        doesNotApplyWhen: 'another tool is explicitly requested',
      },
      {
        action: 'SUPERSEDE',
        existingAtomicId: first.atomic_id,
        kind: 'preference',
        scope: 'project',
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
  assert.ok(activeRules('/repos/repeated-target').some((rule) => rule.rule_text === 'Use pnpm scripts.'));
  const superseded = openDb()
    .prepare('SELECT status FROM memory_rules WHERE id = ?')
    .get(first.id) as { status: string };
  assert.equal(superseded.status, 'superseded');
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
            action: 'SUPERSEDE',
            existingAtomicId: first.atomic_id,
            kind: 'preference',
            scope: 'project',
            ruleText: 'Replace the rule ID.',
            appliesWhen: 'updating learned rules',
            doesNotApplyWhen: 'creating unrelated rules',
          },
          {
            action: 'NOOP',
            existingAtomicId: first.atomic_id,
            kind: 'preference',
            scope: 'project',
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

test('codex native UserPromptSubmit hook records stdin payload', async () => {
  const { promptsForDay, localDay } = await import('../src/db/index.ts');
  const { codexHook } = await import('../src/hooks.ts');
  const payload = JSON.stringify({
    session_id: 's-codex',
    turn_id: 't9',
    prompt: 'Refactor auth and add tests',
    cwd: '/repos/archer',
  });
  const { Readable } = await import('node:stream');
  const fake = Readable.from([payload]) as unknown as NodeJS.ReadStream;
  fake.isTTY = false;
  const orig = process.stdin;
  Object.defineProperty(process, 'stdin', { value: fake, configurable: true });
  try {
    await codexHook();
  } finally {
    Object.defineProperty(process, 'stdin', { value: orig, configurable: true });
  }

  const rows = promptsForDay(localDay());
  const found = rows.find((r) => r.source === 'codex' && r.prompt.includes('Refactor auth'));
  assert.ok(found, 'codex hook should record UserPromptSubmit prompts');
  assert.equal(found!.prompt, 'Refactor auth and add tests');
});
