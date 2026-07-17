import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('PWA manifest is installable and the service worker has a fetch handler', async () => {
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), 'frontend', 'public', 'manifest.webmanifest'), 'utf8')
  );
  const serviceWorker = readFileSync(join(process.cwd(), 'frontend', 'public', 'sw.js'), 'utf8');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.start_url);
  assert.deepEqual(manifest.icons, [
    { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
  ]);
  assert.match(serviceWorker, /addEventListener\("fetch"/);
});
