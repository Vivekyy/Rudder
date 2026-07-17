import { test } from 'node:test';
import assert from 'node:assert/strict';

test('PWA manifest is installable and the service worker has a fetch handler', async () => {
  const { MANIFEST, PAGE_HTML, SERVICE_WORKER } = await import('../src/ui.ts');
  const manifest = JSON.parse(MANIFEST);
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.start_url);
  assert.deepEqual(manifest.icons, [
    { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
  ]);
  assert.match(PAGE_HTML, /href="\/icon\.svg" type="image\/svg\+xml"/);
  assert.match(SERVICE_WORKER, /addEventListener\("fetch"/);
});
