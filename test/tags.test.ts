import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { tmpDir } from './helpers.ts';

let home: string;
// Loaded after RUDDER_HOME is set so the db opens under the temp home.
let db: typeof import('../src/db.ts');
let tags: typeof import('../src/tags.ts');

before(async () => {
  home = tmpDir();
  process.env.RUDDER_HOME = home;
  db = await import('../src/db.ts');
  tags = await import('../src/tags.ts');
});

after(() => {
  rmSync(home, { recursive: true, force: true });
});

// Each test starts from empty prompts + tags so counts are deterministic.
beforeEach(() => {
  const handle = db.openDb();
  handle.exec('DELETE FROM prompt_tags;');
  handle.exec('DELETE FROM prompts;');
});

test('statsForDay counts untagged prompts as ignored, then reflects tags', () => {
  const when = new Date('2020-03-04T12:00:00'); // local noon → stable local day
  const day = db.localDay(when);
  const ids = ['arch', 'tune', 'bug', 'house', 'chore'].map(
    (p) => db.insertPrompt({ source: 'claude', prompt: p, ts: when })!
  );

  // Before tagging: everything is untagged → counted as ignored, not a category.
  assert.equal(tags.untaggedPromptsForDay(day).length, 5);
  let s = tags.statsForDay(day);
  assert.equal(s.total, 5);
  assert.equal(s.ignored, 5);
  assert.equal(s.counted, 0);
  assert.equal(s.byCategory.housekeeping.pct, 0);
  assert.equal(s.correctionPct, null);

  tags.upsertTag(ids[0], 'architecting', 'none', 'claude');
  tags.upsertTag(ids[1], 'tuning', 'none', 'claude');
  tags.upsertTag(ids[2], 'bugfixing', 'disagree', 'claude');
  tags.upsertTag(ids[3], 'housekeeping', 'agree', 'claude');
  tags.upsertTag(ids[4], 'ignored', 'none', 'claude');

  assert.equal(tags.untaggedPromptsForDay(day).length, 0);
  s = tags.statsForDay(day);
  assert.equal(s.total, 5);
  assert.equal(s.ignored, 1);
  assert.equal(s.counted, 4);
  assert.equal(s.byCategory.architecting.pct, 25);
  assert.equal(s.byCategory.bugfixing.count, 1);
  assert.equal(s.agree, 1);
  assert.equal(s.disagree, 1);
  assert.equal(s.correctionPct, 50); // 1 disagree of 2 reactions

  // Re-tagging the same prompt replaces, not duplicates.
  tags.upsertTag(ids[0], 'bugfixing', 'none', 'claude');
  s = tags.statsForDay(day);
  assert.equal(s.total, 5, 'upsert must not create a second tag row');
  assert.equal(s.byCategory.architecting.count, 0);
  assert.equal(s.byCategory.bugfixing.count, 2);
});

test('untaggedPromptsForDay treats a tag from another version as untagged', () => {
  const when = new Date('2020-05-06T12:00:00');
  const day = db.localDay(when);
  const id = db.insertPrompt({ source: 'codex', prompt: 'stale tag', ts: when })!;

  tags.upsertTag(id, 'tuning', 'none', 'codex', tags.TAGGER_VERSION - 1); // older version
  assert.ok(
    tags.untaggedPromptsForDay(day).some((r) => r.id === id),
    'a tag at an older version should count as untagged'
  );

  tags.upsertTag(id, 'tuning', 'none', 'codex', tags.TAGGER_VERSION); // current version
  assert.ok(!tags.untaggedPromptsForDay(day).some((r) => r.id === id));
});
