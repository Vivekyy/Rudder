import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { tmpDir, withFakeStdin, withTtyStdin } from './helpers.ts';

let home: string;
let db: typeof import('../src/db.ts');
let hooks: typeof import('../src/hooks.ts');

before(async () => {
  home = tmpDir();
  process.env.RUDDER_HOME = home;
  db = await import('../src/db.ts');
  hooks = await import('../src/hooks.ts');
});

after(() => {
  rmSync(home, { recursive: true, force: true });
});

beforeEach(() => {
  db.openDb().exec('DELETE FROM prompts;');
  delete process.env.RUDDER_DISABLE;
  delete process.env.CLAUDE_PROJECT_DIR;
  delete process.env.CODEX_WORKSPACE_ROOT;
});

afterEach(() => {
  delete process.env.RUDDER_DISABLE;
  delete process.env.CLAUDE_PROJECT_DIR;
  delete process.env.CODEX_WORKSPACE_ROOT;
});

function today() {
  return db.promptsForDay(db.localDay());
}

// ---- claudeHook -------------------------------------------------------------

test('claudeHook parses stdin JSON into a row with project from cwd basename', async () => {
  const raw = JSON.stringify({
    session_id: 's1',
    cwd: '/repos/archerdb',
    prompt: 'Add an index',
    model: 'opus',
  });
  await withFakeStdin(raw, () => hooks.claudeHook());

  const rows = today();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].prompt, 'Add an index');
  assert.equal(rows[0].source, 'claude');
  assert.equal(rows[0].session_id, 's1');
  assert.equal(rows[0].project, 'archerdb');
  assert.equal(rows[0].model, 'opus');
  assert.equal(rows[0].raw, raw);
});

test('claudeHook falls back to CLAUDE_PROJECT_DIR when payload has no cwd', async () => {
  process.env.CLAUDE_PROJECT_DIR = '/repos/fallback';
  await withFakeStdin(JSON.stringify({ prompt: 'no cwd here' }), () => hooks.claudeHook());

  const r = today()[0];
  assert.equal(r.cwd, '/repos/fallback');
  assert.equal(r.project, 'fallback');
});

test('claudeHook records nothing when RUDDER_DISABLE is set', async () => {
  process.env.RUDDER_DISABLE = '1';
  await withFakeStdin(JSON.stringify({ prompt: 'should be skipped' }), () => hooks.claudeHook());
  assert.equal(today().length, 0);
});

test('claudeHook ignores unparseable stdin (no prompt -> nothing stored)', async () => {
  await withFakeStdin('not json at all', () => hooks.claudeHook());
  assert.equal(today().length, 0);
});

test('claudeHook with a TTY stdin (empty input) stores nothing', async () => {
  await withTtyStdin(() => hooks.claudeHook());
  assert.equal(today().length, 0);
});

// ---- codexHook --------------------------------------------------------------

test('codexHook records agent-turn-complete, joining input-messages with newlines', async () => {
  await hooks.codexHook([
    JSON.stringify({
      type: 'agent-turn-complete',
      'turn-id': 't9',
      'input-messages': ['Refactor auth', 'and add tests'],
      cwd: '/repos/archer',
      model: 'gpt-x',
    }),
  ]);

  const rows = today().filter((r) => r.source === 'codex');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].prompt, 'Refactor auth\nand add tests');
  assert.equal(rows[0].session_id, 't9');
  assert.equal(rows[0].project, 'archer');
  assert.equal(rows[0].model, 'gpt-x');
});

test('codexHook ignores non-turn events', async () => {
  await hooks.codexHook([JSON.stringify({ type: 'session-start' })]);
  assert.equal(today().length, 0);
});

test('codexHook records a payload with no type field', async () => {
  await hooks.codexHook([
    JSON.stringify({ 'input-messages': ['typeless turn'], cwd: '/x/y' }),
  ]);
  const r = today()[0];
  assert.equal(r.prompt, 'typeless turn');
  assert.equal(r.project, 'y');
});

test('codexHook accepts snake_case keys (input_messages, turn_id)', async () => {
  await hooks.codexHook([
    JSON.stringify({
      type: 'agent-turn-complete',
      turn_id: 'snake-1',
      input_messages: ['snake case works'],
    }),
  ]);
  const r = today()[0];
  assert.equal(r.prompt, 'snake case works');
  assert.equal(r.session_id, 'snake-1');
});

test('codexHook falls back to session_id and CODEX_WORKSPACE_ROOT', async () => {
  process.env.CODEX_WORKSPACE_ROOT = '/ws/proj';
  await hooks.codexHook([
    JSON.stringify({
      type: 'agent-turn-complete',
      session_id: 'sess-7',
      'input-messages': ['env cwd fallback'],
    }),
  ]);
  const r = today()[0];
  assert.equal(r.session_id, 'sess-7');
  assert.equal(r.cwd, '/ws/proj');
  assert.equal(r.project, 'proj');
});

test('codexHook coerces a non-array input-messages to a string', async () => {
  await hooks.codexHook([
    JSON.stringify({ type: 'agent-turn-complete', 'input-messages': 'just a string' }),
  ]);
  assert.equal(today()[0].prompt, 'just a string');
});

test('codexHook with empty messages stores nothing (blank prompt skipped)', async () => {
  await hooks.codexHook([
    JSON.stringify({ type: 'agent-turn-complete', 'input-messages': [] }),
  ]);
  assert.equal(today().length, 0);
});

test('codexHook reads the JSON from a later argv arg, ignoring leading flags', async () => {
  await hooks.codexHook([
    '--some-flag',
    JSON.stringify({ type: 'agent-turn-complete', 'input-messages': ['from argv'] }),
  ]);
  assert.equal(today()[0].prompt, 'from argv');
});

test('codexHook reads the notify JSON from stdin when no argv arg carries it', async () => {
  const payload = JSON.stringify({
    type: 'agent-turn-complete',
    'input-messages': ['from stdin'],
  });
  await withFakeStdin(payload, () => hooks.codexHook([]));
  assert.equal(today()[0].prompt, 'from stdin');
});

test('codexHook records nothing when RUDDER_DISABLE is set', async () => {
  process.env.RUDDER_DISABLE = '1';
  await hooks.codexHook([
    JSON.stringify({ type: 'agent-turn-complete', 'input-messages': ['skip me'] }),
  ]);
  assert.equal(today().length, 0);
});
