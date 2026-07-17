import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { useTempHome, type TempHome } from './helpers.ts';

let home: TempHome;

before(() => {
  home = useTempHome('rudder-transcript-test-');
});

after(() => {
  home.restore();
});

test('transcript reader extracts the latest user and assistant text', async () => {
  const { readTranscriptContext } = await import('../src/transcript.ts');
  const path = join(home.path, 'session.jsonl');
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
  assert.deepEqual(readTranscriptContext(join(home.path, 'missing.jsonl')), {
    lastUserText: '',
    lastAssistantText: '',
  });
});
