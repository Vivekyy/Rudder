import { test } from 'node:test';
import assert from 'node:assert/strict';

test('svgIcon reads the supplied SVG asset', async () => {
  const { svgIcon } = await import('../src/icon.ts');
  const svg = svgIcon();
  assert.match(svg, /viewBox="0 0 700 620"/);
  assert.match(svg, /shape-rendering="crispEdges"/);
  assert.match(svg, /<!-- Mount -->/);
  assert.match(svg, /M43 65H168V85H158V95H53V85H43V65Z/);
  assert.match(svg, /M113 205H153V215H183V225/);
});

test('pngIcon generates memoized PNG buffers at requested sizes', async () => {
  const { pngIcon } = await import('../src/icon.ts');
  const icon192 = pngIcon(192);
  const icon512 = pngIcon(512);

  assert.equal(icon192, pngIcon(192));
  assert.notEqual(icon192, icon512);
  assert.deepEqual([...icon192.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(icon192.readUInt32BE(16), 192);
  assert.equal(icon192.readUInt32BE(20), 192);
  assert.equal(icon512.readUInt32BE(16), 512);
  assert.equal(icon512.readUInt32BE(20), 512);
});
