import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
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
  const { insertPrompt, promptsForDay, localDay } = await import('../src/db.ts');

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
  // The whole point of init's hook: the bin path must resolve to a real file,
  // in both the dev `.ts` checkout and the published `.js` build.
  assert.ok(existsSync(argv[1]), `rudder bin should exist at ${argv[1]}`);
});

test('claude hook parses stdin JSON into a row', async () => {
  const { promptsForDay, localDay } = await import('../src/db.ts');
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

test('codex hook reads the notify JSON arg (agent-turn-complete only)', async () => {
  const { promptsForDay, localDay } = await import('../src/db.ts');
  const { codexHook } = await import('../src/hooks.ts');

  // Non-turn events are ignored.
  await codexHook([JSON.stringify({ type: 'session-start' })]);

  await codexHook([
    JSON.stringify({
      type: 'agent-turn-complete',
      'turn-id': 't9',
      'input-messages': ['Refactor auth', 'and add tests'],
      cwd: '/repos/archer',
    }),
  ]);

  const rows = promptsForDay(localDay());
  const found = rows.find((r) => r.source === 'codex' && r.prompt.includes('Refactor auth'));
  assert.ok(found, 'codex hook should record agent-turn-complete prompts');
  assert.equal(found!.prompt, 'Refactor auth\nand add tests');
  assert.equal(rows.filter((r) => r.source === 'codex').length, 1, 'non-turn event ignored');
});
