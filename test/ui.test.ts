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
  assert.ok(
    manifest.icons.some(
      (icon: { src: string; sizes: string; type: string }) =>
        icon.src === '/icon.svg' && icon.sizes === 'any' && icon.type === 'image/svg+xml'
    )
  );
  const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'), 'needs 192 + 512 icons');
  assert.match(serviceWorker, /addEventListener\("fetch"/);
});
