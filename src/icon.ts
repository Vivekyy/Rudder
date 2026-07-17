import { deflateSync, crc32 } from 'node:zlib';

/**
 * Generate the app icon from the SVG mark, with zero dependencies (built-in
 * zlib only). PNGs are still served for PWA/Apple install surfaces, and the SVG
 * is served directly for browsers that support it as a favicon.
 *
 * Icons are tiny and deterministic, so we memoize them per size.
 */
const cache = new Map<number, Buffer>();

const SVG_WIDTH = 700;
const SVG_HEIGHT = 620;
const BG = [14, 17, 22, 255] as const; // #0e1116 — app background
const FG = [255, 255, 255, 255] as const;

type FillRule = 'nonzero' | 'evenodd';
type Point = { x: number; y: number };
type IconPath = { d: string; fillRule: FillRule };

const ICON_PATHS: IconPath[] = [
  {
    fillRule: 'nonzero',
    d: [
      'M43 65H168V85H158V95H53V85H43V65Z',
      'M88 105H113V215H103V335H88V105Z',
    ].join(' '),
  },
  {
    fillRule: 'nonzero',
    d: 'M113 205H153V215H183V225H208V235H228V245H248V255H263V270H278V290H293V320H303V355H313V400H323V485H313V505H303V515H253V505H228V495H208V485H193V475H178V465H163V450H148V430H138V410H128V385H118V350H113V205Z',
  },
  {
    fillRule: 'evenodd',
    d: [
      'M398 42H408V52H418V62H408V72H398V62H388V52H398V42Z',
      'M500 105H530V115H540V145H530V155H500V145H490V115H500V105Z',
      'M505 115V145H525V115H505Z',
      'M438 230H448V240H458V250H448V260H438V250H428V240H438V230Z',
      'M575 315H585V325H575V315Z',
      'M490 425H520V435H530V465H520V475H490V465H480V435H490V425Z',
      'M495 435V465H515V435H495Z',
      'M455 535H465V545H475V555H465V565H455V555H445V545H455V535Z',
    ].join(' '),
  },
];

const pathCache = new Map<string, Point[][]>();

function chunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'latin1');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function pathElement(path: IconPath): string {
  const fillRule = path.fillRule === 'evenodd' ? ' fill-rule="evenodd"' : '';
  return `  <path fill="#fff"${fillRule} d="${path.d}" />`;
}

export function svgIcon(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" fill="none" shape-rendering="crispEdges">
  <rect width="${SVG_WIDTH}" height="${SVG_HEIGHT}" fill="#0e1116" />
${ICON_PATHS.map(pathElement).join('\n')}
</svg>
`;
}

function parsePath(d: string): Point[][] {
  const cached = pathCache.get(d);
  if (cached) return cached;

  const tokens = d.match(/[MHVZ]|-?\d+(?:\.\d+)?/g);
  if (!tokens) return [];

  const paths: Point[][] = [];
  let current: Point[] = [];
  let x = 0;
  let y = 0;

  for (let i = 0; i < tokens.length; ) {
    const token = tokens[i++];
    switch (token) {
      case 'M':
        if (current.length) paths.push(current);
        x = Number(tokens[i++]);
        y = Number(tokens[i++]);
        current = [{ x, y }];
        break;
      case 'H':
        x = Number(tokens[i++]);
        current.push({ x, y });
        break;
      case 'V':
        y = Number(tokens[i++]);
        current.push({ x, y });
        break;
      case 'Z':
        if (current.length) paths.push(current);
        current = [];
        break;
      default:
        throw new Error(`Unsupported SVG path token: ${token}`);
    }
  }
  if (current.length) paths.push(current);

  pathCache.set(d, paths);
  return paths;
}

function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    const crosses = a.y > point.y !== b.y > point.y;
    if (crosses && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function pathContains(path: IconPath, point: Point): boolean {
  const hits = parsePath(path.d).filter((polygon) => pointInPolygon(point, polygon)).length;
  return path.fillRule === 'evenodd' ? hits % 2 === 1 : hits > 0;
}

function markContains(point: Point): boolean {
  return ICON_PATHS.some((path) => pathContains(path, point));
}

export function pngIcon(size: number): Buffer {
  const hit = cache.get(size);
  if (hit) return hit;

  const scale = size / Math.max(SVG_WIDTH, SVG_HEIGHT);
  const xOffset = (size - SVG_WIDTH * scale) / 2;
  const yOffset = (size - SVG_HEIGHT * scale) / 2;

  // Raw image: each row is a filter byte (0 = none) followed by RGBA pixels.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0;
    for (let x = 0; x < size; x++) {
      const source = {
        x: (x + 0.5 - xOffset) / scale,
        y: (y + 0.5 - yOffset) / scale,
      };
      const c = markContains(source) ? FG : BG;
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
