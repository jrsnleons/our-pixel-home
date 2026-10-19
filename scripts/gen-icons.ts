// Draws the app icons as pixel art and writes them to public/icons. Run with `npm run gen:icons`
// after changing the art; the PNGs are committed so builds don't need to run this.
//
// The scene is a little house with a glowing heart window on a hill at night, the same
// motif as the title screen. It is drawn on a small grid and scaled up with hard edges.

import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

const C = {
  sky0: hex('#141A33'), sky1: hex('#1D2547'), sky2: hex('#2A2F5C'), sky3: hex('#3C3768'),
  star: hex('#FFF2C8'), moon: hex('#FFE9B0'), moonShade: hex('#E8C987'),
  hill: hex('#2F4A3A'), hillLit: hex('#4D6E4F'),
  line: hex('#1B1420'),
  roof: hex('#C0564A'), roofLit: hex('#E07A5F'), roofDark: hex('#8E3B3B'),
  wall: hex('#F2D7A6'), wallShade: hex('#D9B27F'),
  chimney: hex('#6E4A3A'),
  glow: hex('#FFD27A'), heart: hex('#F06A84'), heartLit: hex('#FFC2CE'),
  door: hex('#7A4A2E'),
};

const HEART = ['.hh.hh.', 'hHhhhhh', 'hhhhhhh', '.hhhhh.', '..hhh..', '...h...'];

class Grid {
  n: number;
  px: RGB[];
  constructor(n: number) { this.n = n; this.px = new Array(n * n).fill(C.sky0); }
  set(x: number, y: number, c: RGB) { if (x >= 0 && y >= 0 && x < this.n && y < this.n) this.px[y * this.n + x] = c; }
  rect(x: number, y: number, w: number, h: number, c: RGB) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
}

// `n` is the grid size and `o` shifts everything right and down by that many cells.
function scene(n: number, o: number): Grid {
  const g = new Grid(n);
  // Sky in bands with a checker seam between each, so it reads as pixel art, not a gradient.
  const bands: [number, RGB][] = [[0, C.sky0], [Math.round(n * 0.28), C.sky1], [Math.round(n * 0.5), C.sky2], [Math.round(n * 0.68), C.sky3]];
  for (let b = 0; b < bands.length; b++) {
    const [y0, c] = bands[b];
    const y1 = bands[b + 1]?.[0] ?? n;
    g.rect(0, y0, n, y1 - y0, c);
    if (b > 0) for (let x = 0; x < n; x++) {
      if (x % 2 === 1) g.set(x, y0, bands[b - 1][1]);
      if (x % 4 === 0) g.set(x, y0 - 1, c);
    }
  }
  for (const [x, y] of [[3, 3], [7, 7], [13, 2], [28, 9], [4, 13], [26, 15], [18, 5], [30, 3]]) g.set(x + o, y + o, C.star);
  g.set(9 + o, 4 + o, C.star); // a brighter twinkle: plus shape
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) g.set(9 + o + dx, 4 + o + dy, C.sky2);
  // Moon, shaded on one side.
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (i * i + j * j <= 5) g.set(25 + o + i, 4 + o + j, i + j > 1 ? C.moonShade : C.moon);

  // Hill: a gentle curve with a lit rim.
  for (let x = 0; x < n; x++) {
    const top = Math.round(25 + o + ((x - n / 2) ** 2) / (n * 3));
    g.rect(x, top, 1, n - top, C.hill);
    g.set(x, top, C.hillLit);
  }

  const X = 9 + o, Y = 8 + o; // roof peak sits at X + 6.5
  // Outline silhouette first, one pixel larger than the house.
  for (let i = 0; i < 8; i++) g.rect(X + 6 - i - 1, Y + i - 1, 2 * i + 4, 1, C.line);
  g.rect(X - 1, Y + 7, 16, 12, C.line);
  g.rect(X + 10, Y - 1, 4, 5, C.line);
  // Chimney.
  g.rect(X + 11, Y, 2, 4, C.chimney);
  // Roof: lit left slope, dark eave.
  for (let i = 0; i < 8; i++) {
    const x0 = X + 6 - i, w = 2 * i + 2;
    g.rect(x0, Y + i, w, 1, C.roof);
    g.set(x0, Y + i, C.roofLit);
    if (i > 0) g.set(x0 + 1, Y + i, C.roofLit);
  }
  g.rect(X - 1, Y + 7, 16, 1, C.roofDark);
  // Walls with a shaded right side.
  g.rect(X, Y + 8, 14, 10, C.wall);
  g.rect(X + 11, Y + 8, 3, 10, C.wallShade);
  g.rect(X, Y + 8, 14, 1, C.wallShade); // shadow under the eave
  // Glowing heart window.
  g.rect(X + 1, Y + 9, 9, 8, C.glow);
  g.rect(X + 1, Y + 9, 1, 1, C.wall); g.rect(X + 9, Y + 9, 1, 1, C.wall);
  g.rect(X + 1, Y + 16, 1, 1, C.wall); g.rect(X + 9, Y + 16, 1, 1, C.wall);
  HEART.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === 'h') g.set(X + 2 + i, Y + 10 + j, C.heart);
    if (ch === 'H') g.set(X + 2 + i, Y + 10 + j, C.heartLit);
  }));
  // Door.
  g.rect(X + 11, Y + 12, 2, 6, C.door);
  g.set(X + 11, Y + 15, C.glow);
  // Light spilling onto the hill.
  for (let i = 0; i < 9; i += 2) g.set(X + 1 + i, Y + 19, C.hillLit);
  return g;
}

function png(g: Grid, size: number, pad = 0): Buffer {
  const scale = (size - 2 * pad) / g.n;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const gx = Math.min(g.n - 1, Math.max(0, Math.floor((x - pad) / scale)));
      const gy = Math.min(g.n - 1, Math.max(0, Math.floor((y - pad) / scale)));
      const [r, gg, b] = g.px[gy * g.n + gx];
      raw.set([r, gg, b, 255], y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const out = 'public/icons';
mkdirSync(out, { recursive: true });
const full = scene(32, 0);
writeFileSync(`${out}/icon-192.png`, png(full, 192));
writeFileSync(`${out}/icon-512.png`, png(full, 512));
writeFileSync(`${out}/apple-touch-icon.png`, png(full, 180, 10));
// Maskable icons get cropped to a circle as small as 80% of the width, so the art sits inside a
// margin that just continues the edge pixels (sky above, hill below).
writeFileSync(`${out}/icon-maskable-512.png`, png(full, 512, 64));
console.log('wrote', out);
