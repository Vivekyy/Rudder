import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpDir } from './helpers.ts';

let home: string;
// Loaded after RUDDER_HOME is set so the db opens under the temp home.
let db: typeof import('../src/db.ts');

before(async () => {
  home = tmpDir();
  process.env.RUDDER_HOME = home;
  db = await import('../src/db.ts');
});

after(() => {
  rmSync(home, { recursive: true, force: true });
});

// Each test starts from an empty table so row counts are deterministic.
beforeEach(() => {
  db.openDb().exec('DELETE FROM prompts;');
});

test('rudderHome honors RUDDER_HOME and dbPath nests rudder.db under it', () => {
  assert.equal(db.rudderHome(), home);
  assert.equal(db.dbPath(), join(home, 'rudder.db'));
});

test('openDb creates the home dir, the db file, and is a cached singleton', () => {
  const a = db.openDb();
  const b = db.openDb();
  assert.equal(a, b, 'openDb should return the same cached instance');
  assert.ok(existsSync(db.dbPath()), 'db file should exist on disk');
});

test('localDay zero-pads month and day from local time', () => {
  // Build the date in local time so the formatting (not the TZ) is under test.
  assert.equal(db.localDay(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(db.localDay(new Date(2026, 11, 31)), '2026-12-31');
});

test('insertPrompt trims, returns a positive id, and stores all fields', () => {
  const id = db.insertPrompt({
    source: 'claude',
    prompt: '  Fix the deploy  ',
    session_id: 's1',
    cwd: '/repos/archer',
    project: 'archer',
    model: 'opus',
    raw: '{"k":1}',
  });
  assert.ok(id && id > 0);

  const rows = db.promptsForDay(db.localDay());
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.prompt, 'Fix the deploy'); // trimmed
  assert.equal(r.source, 'claude');
  assert.equal(r.session_id, 's1');
  assert.equal(r.cwd, '/repos/archer');
  assert.equal(r.project, 'archer');
  assert.equal(r.model, 'opus');
  assert.equal(r.raw, '{"k":1}');
  assert.match(r.ts, /^\d{4}-\d{2}-\d{2}T/); // ISO timestamp
});

test('insertPrompt defaults optional columns to null', () => {
  const id = db.insertPrompt({ source: 'codex', prompt: 'hello' });
  assert.ok(id);
  const r = db.promptsForDay(db.localDay())[0];
  assert.equal(r.session_id, null);
  assert.equal(r.cwd, null);
  assert.equal(r.project, null);
  assert.equal(r.model, null);
  assert.equal(r.raw, null);
});

test('insertPrompt skips blank, whitespace-only, null, and undefined prompts', () => {
  assert.equal(db.insertPrompt({ source: 'codex', prompt: '   ' }), null);
  assert.equal(db.insertPrompt({ source: 'codex', prompt: '' }), null);
  assert.equal(db.insertPrompt({ source: 'codex', prompt: null }), null);
  assert.equal(db.insertPrompt({ source: 'codex', prompt: undefined }), null);
  assert.equal(db.promptsForDay(db.localDay()).length, 0);
});

test('insertPrompt derives day from an explicit ts (string or Date)', () => {
  const when = new Date(2025, 2, 9, 13, 30); // local time
  const expectedDay = db.localDay(when);

  db.insertPrompt({ source: 'claude', prompt: 'from Date', ts: when });
  db.insertPrompt({ source: 'claude', prompt: 'from string', ts: when.toISOString() });

  const rows = db.promptsForDay(expectedDay);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].day, expectedDay);
  assert.equal(rows[0].ts, when.toISOString());
  // Today's bucket should not contain these backdated rows.
  assert.equal(db.promptsForDay(db.localDay()).length, 0);
});

test('promptsForDay filters by day and orders by ts ascending', () => {
  const day = new Date(2024, 5, 1);
  db.insertPrompt({ source: 'claude', prompt: 'second', ts: new Date(2024, 5, 1, 10) });
  db.insertPrompt({ source: 'claude', prompt: 'first', ts: new Date(2024, 5, 1, 8) });
  db.insertPrompt({ source: 'claude', prompt: 'third', ts: new Date(2024, 5, 1, 23) });
  // A row on a different day must be excluded.
  db.insertPrompt({ source: 'claude', prompt: 'other day', ts: new Date(2024, 5, 2, 9) });

  const rows = db.promptsForDay(db.localDay(day));
  assert.deepEqual(
    rows.map((r) => r.prompt),
    ['first', 'second', 'third']
  );
});

test('promptsForDay returns an empty array for a day with no prompts', () => {
  assert.deepEqual(db.promptsForDay('1999-01-01'), []);
});
