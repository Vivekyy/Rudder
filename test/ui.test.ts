import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MANIFEST, SERVICE_WORKER } from '../src/ui.ts';

test('PWA manifest is installable and the service worker has a fetch handler', () => {
  const m = JSON.parse(MANIFEST);
  assert.equal(m.display, 'standalone');
  assert.ok(m.start_url);
  const sizes = m.icons.map((i: { sizes: string }) => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'), 'needs 192 + 512 icons');
  assert.match(SERVICE_WORKER, /addEventListener\("fetch"/);
});
