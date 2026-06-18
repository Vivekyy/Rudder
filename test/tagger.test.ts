import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTags } from '../src/tagger.ts';

test('parseTags tolerates fences/prose and normalizes categories', () => {
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
