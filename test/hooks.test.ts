import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { useTempHome, withStdin, type TempHome } from './helpers.ts';

let home: TempHome;

before(() => {
  home = useTempHome('rudder-hooks-test-');
});

after(() => {
  home.restore();
});

test('claude hook parses stdin JSON into a row', async () => {
  const { promptsForDay, localDay } = await import('../src/db/index.ts');
  const { claudeHook } = await import('../src/hooks.ts');

  const payload = JSON.stringify({
    session_id: 's1',
    cwd: '/repos/archerdb',
    prompt: 'Add an index',
  });

  await withStdin(payload, () => claudeHook());

  const rows = promptsForDay(localDay());
  const found = rows.find((r) => r.prompt === 'Add an index');
  assert.ok(found, 'claude hook should have recorded the prompt');
  assert.equal(found.project, 'archerdb');
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

  await withStdin(payload, () => codexHook());

  const rows = promptsForDay(localDay());
  const found = rows.find((r) => r.source === 'codex' && r.prompt.includes('Refactor auth'));
  assert.ok(found, 'codex hook should record UserPromptSubmit prompts');
  assert.equal(found.prompt, 'Refactor auth and add tests');
});

test('hook aliases honor the disabled environment guard', async () => {
  const { claudePromptHook, codexPromptHook, claudeStopHook, codexStopHook } = await import(
    '../src/hooks.ts'
  );
  const previous = process.env.RUDDER_DISABLE;
  process.env.RUDDER_DISABLE = '1';
  try {
    await withStdin('{malformed', () => claudePromptHook());
    await withStdin('{}', () => codexPromptHook());
    await withStdin('{}', () => claudeStopHook());
    await withStdin('{}', () => codexStopHook());
  } finally {
    if (previous === undefined) delete process.env.RUDDER_DISABLE;
    else process.env.RUDDER_DISABLE = previous;
  }
});
