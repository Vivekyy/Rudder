import { test } from 'node:test';
import assert from 'node:assert/strict';

test('PWA manifest is installable and the service worker has a fetch handler', async () => {
  const { MANIFEST, PAGE_HTML, SERVICE_WORKER } = await import('../src/ui.ts');
  const manifest = JSON.parse(MANIFEST);
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.start_url);
  const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'), 'needs 192 + 512 icons');
  assert.match(PAGE_HTML, /href="\/icon\.svg" type="image\/svg\+xml"/);
  assert.match(SERVICE_WORKER, /addEventListener\("fetch"/);
});
