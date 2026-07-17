import { test } from 'node:test';
import assert from 'node:assert/strict';

test('pngIcon emits a valid PNG of the requested size', async () => {
  const { pngIcon } = await import('../src/icon.ts');
  const png = pngIcon(192);
  // PNG signature.
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  // IHDR width/height live at byte offset 16/20.
  assert.equal(png.readUInt32BE(16), 192);
  assert.equal(png.readUInt32BE(20), 192);
  // Memoized: same buffer instance on a second call.
  assert.equal(pngIcon(192), png);
});

test('svgIcon emits the supplied SVG mark', async () => {
  const { svgIcon } = await import('../src/icon.ts');
  const svg = svgIcon();
  assert.match(svg, /viewBox="0 0 700 620"/);
  assert.match(svg, /shape-rendering="crispEdges"/);
  assert.match(svg, /M43 65H168V85H158V95H53V85H43V65Z/);
  assert.match(svg, /M113 205H153V215H183V225/);
});
