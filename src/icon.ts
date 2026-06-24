import { crc32, deflateSync } from 'node:zlib';

/**
 * Generate the app icon as a PNG, with zero dependencies (built-in zlib only).
 * A maskable full-bleed dark square with an accent ring/hub — the OS rounds the
 * canvas for us, so it reads as a proper app icon in the dock / Launchpad.
 *
 * Icons are tiny and deterministic, so we memoize them per size.
 */
const cache = new Map<number, Buffer>();

function chunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'latin1');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

export function pngIcon(size: number): Buffer {
  const hit = cache.get(size);
  if (hit) return hit;

  const bg = [14, 17, 22, 255]; // #0e1116 — app background
  const fg = [88, 166, 255, 255]; // #58a6ff — accent
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size * 0.34;
  const rInner = size * 0.13;

  // Raw image: each row is a filter byte (0 = none) followed by RGBA pixels.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0;
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx + 0.5, y - cy + 0.5);
      const c = d > rInner && d <= rOuter ? fg : bg;
      raw[p++] = c[0];
      raw[p++] = c[1];
      raw[p++] = c[2];
      raw[p++] = c[3];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  // [10] compression, [11] filter, [12] interlace all 0

  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  cache.set(size, png);
  return png;
}
