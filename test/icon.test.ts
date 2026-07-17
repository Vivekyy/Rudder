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
