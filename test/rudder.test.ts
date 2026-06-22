import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

test('statsForDay counts untagged prompts as ignored, then reflects tags', async () => {
  const { insertPrompt, localDay } = await import('../src/db.ts');
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
  const { insertPrompt, localDay } = await import('../src/db.ts');
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

test('legacy database migration copies the db and only runs once', async () => {
  const { migrateLegacyDb } = await import('../src/db.ts');
  const legacy = mkdtempSync(join(tmpdir(), 'rudder-legacy-'));
  const target = mkdtempSync(join(tmpdir(), 'rudder-target-'));
  try {
    writeFileSync(join(legacy, 'rudder.db'), 'legacy-db');
    writeFileSync(join(legacy, 'rudder.db-wal'), 'legacy-wal');

    const first = migrateLegacyDb(target, legacy);
    assert.equal(first.migrated, true);
    assert.ok(existsSync(join(target, 'rudder.db')));
    assert.ok(existsSync(join(target, 'rudder.db-wal')));

    const second = migrateLegacyDb(target, legacy);
    assert.equal(second.migrated, false);
    assert.equal(second.reason, 'already-initialized');
  } finally {
    rmSync(legacy, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
});

test('electron hook argv uses the app executable in hook mode', async () => {
  const { electronHookArgv } = await import('../src/install.ts');
  assert.deepEqual(electronHookArgv('/Applications/Rudder.app/Contents/MacOS/Rudder', ['hook', 'claude']), [
    '/Applications/Rudder.app/Contents/MacOS/Rudder',
    '--rudder-hook',
    'claude',
  ]);
  assert.deepEqual(electronHookArgv('/repo/node_modules/.bin/electron', ['hook', 'codex'], '/repo/dist/electron/main.js'), [
    '/repo/node_modules/.bin/electron',
    '/repo/dist/electron/main.js',
    '--rudder-hook',
    'codex',
  ]);
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
