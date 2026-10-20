// A tiny pixel-painting toolkit. Every texture in the game is painted here at 16 pixels per
// world unit, then shown with nearest-neighbor filtering so pixels stay crisp under the
// HD-2D lighting.

import * as THREE from 'three';
import { mix, shade } from '../../core/color';

export type Ctx = CanvasRenderingContext2D;

export const PPU = 16; // pixels per world unit (one floor tile)

export function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** read: the pixels will be read back (outlines, Scale2x), so keep the canvas off the GPU. */
export function canvas(w: number, h: number, read = false): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const g = c.getContext('2d', { willReadFrequently: read })!;
  g.imageSmoothingEnabled = false;
  return [c, g];
}

export function px(g: Ctx, c: string, x: number, y: number, w = 1, h = 1) {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
}

/** Ordered 2x2 dither between two colors over a rect; t is the share of color b (0..1). */
export function dither(g: Ctx, a: string, b: string, x: number, y: number, w: number, h: number, t = 0.5) {
  const m = [0, 2, 3, 1];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const th = (m[((y + j) & 1) * 2 + ((x + i) & 1)] + 0.5) / 4;
    px(g, t > th ? b : a, x + i, y + j);
  }
}

/** Vertical gradient quantized into bands with a dithered seam, the classic pixel way. */
export function bands(g: Ctx, colors: string[], x: number, y: number, w: number, h: number) {
  const n = colors.length;
  for (let j = 0; j < h; j++) {
    const f = (j / Math.max(1, h - 1)) * (n - 1);
    const i0 = Math.floor(f), i1 = Math.min(n - 1, i0 + 1);
    const t = f - i0;
    for (let i = 0; i < w; i++) {
      const pick = t > 0.33 && t < 0.67 ? (((x + i + y + j) & 1) ? colors[i1] : colors[i0]) : t >= 0.67 ? colors[i1] : colors[i0];
      px(g, pick, x + i, y + j);
    }
  }
}

/** A bevel: light top/left edge, dark bottom/right edge. */
export function bevel(g: Ctx, x: number, y: number, w: number, h: number, light: string, dark: string) {
  px(g, light, x, y, w, 1);
  px(g, light, x, y, 1, h);
  px(g, dark, x, y + h - 1, w, 1);
  px(g, dark, x + w - 1, y, 1, h);
}

export function frame(g: Ctx, x: number, y: number, w: number, h: number, c: string) {
  px(g, c, x, y, w, 1);
  px(g, c, x, y + h - 1, w, 1);
  px(g, c, x, y, 1, h);
  px(g, c, x + w - 1, y, 1, h);
}

export function line(g: Ctx, c: string, x0: number, y0: number, x1: number, y1: number, thick = 1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    px(g, c, x0, y0, thick, thick);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

export function disc(g: Ctx, c: string, cx: number, cy: number, r: number) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    if (x * x + y * y <= r * r + r * 0.8) px(g, c, cx + x, cy + y);
  }
}

export function ellipse(g: Ctx, c: string, cx: number, cy: number, rx: number, ry: number) {
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
    if ((x * x) / (rx * rx + 0.6) + (y * y) / (ry * ry + 0.6) <= 1) px(g, c, Math.round(cx + x), Math.round(cy + y));
  }
}

/** Paint a string-map sprite. Each char maps to a color in `pal`; '.' and ' ' are transparent. */
export function sprite(g: Ctx, rows: string[], pal: Record<string, string | undefined>, ox = 0, oy = 0, flip = false) {
  const w = rows[0]?.length ?? 0;
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) {
      const c = pal[r[x]];
      if (c) px(g, c, ox + (flip ? w - 1 - x : x), oy + y);
    }
  });
}

/** Mirror the left half of each row onto the right, for symmetric sprites. */
export const mirrored = (rows: string[]) => rows.map((r) => r + [...r].reverse().join(''));

/**
 * Selective outline: every transparent pixel touching an opaque one becomes a darkened
 * version of its neighbor (or `color` if given). Gives the soft, colored outlines of
 * hand-made pixel sprites instead of flat black ones.
 */
export function outline(g: Ctx, w: number, h: number, color?: string, strength = 0.42) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const out = new Uint8ClampedArray(d);
  const alpha = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[(y * w + x) * 4 + 3]);
  const fixed = color ? hexRgb(color) : null;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (alpha(x, y) > 0) continue;
    let nb = -1;
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
      if (alpha(x + dx, y + dy) > 0) { nb = ((y + dy) * w + (x + dx)) * 4; break; }
    }
    if (nb < 0) continue;
    const i = (y * w + x) * 4;
    if (fixed) { out[i] = fixed[0]; out[i + 1] = fixed[1]; out[i + 2] = fixed[2]; }
    else {
      const hex = '#' + [d[nb], d[nb + 1], d[nb + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
      // Pull the outline toward a neutral dark so warm fills (skin) don't get red rims.
      const [r, gg, b] = hexRgb(mix(shade(hex, -strength), '#24161A', 0.5));
      out[i] = r; out[i + 1] = gg; out[i + 2] = b;
    }
    out[i + 3] = 255;
  }
  img.data.set(out);
  g.putImageData(img, 0, 0);
}

function hexRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function texture(c: HTMLCanvasElement, repeat?: [number, number]): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** Paint a w×h texture with a callback. Sizes are in pixels. */
export function paint(w: number, h: number, draw: (g: Ctx, w: number, h: number) => void, repeat?: [number, number]) {
  const [c, g] = canvas(w, h);
  draw(g, w, h);
  return texture(c, repeat);
}

// ---------- Material helpers ----------

/** Wood planks running horizontally, with grain lines, knots and plank seams. */
export function woodFace(g: Ctx, x: number, y: number, w: number, h: number, base: string, seed = 1, plank = 4, vertical = false) {
  const r = rng(seed);
  const dark = shade(base, -0.1), deep = shade(base, -0.2), light = shade(base, 0.07);
  px(g, base, x, y, w, h);
  if (!vertical) {
    for (let j = 0; j < h; j += plank) {
      const ph = Math.min(plank, h - j);
      if (((j / plank) | 0) % 2) px(g, mix(base, dark, 0.35), x, y + j, w, ph);
      for (let i = 0; i < w; i++) if (r() < 0.18) px(g, light, x + i, y + j);
      for (let i = 0; i < w; i++) if (r() < 0.12) px(g, dark, x + i, y + j + Math.min(ph - 1, 1 + ((r() * (ph - 1)) | 0)));
      if (j > 0) px(g, deep, x, y + j - 1, w, 1);
      if (r() < 0.5 && w > 6) { const kx = x + 2 + ((r() * (w - 4)) | 0); px(g, deep, kx, y + j + ((ph / 2) | 0)); px(g, dark, kx + 1, y + j + ((ph / 2) | 0)); }
    }
  } else {
    for (let i = 0; i < w; i += plank) {
      const pw = Math.min(plank, w - i);
      if (((i / plank) | 0) % 2) px(g, mix(base, dark, 0.35), x + i, y, pw, h);
      for (let j = 0; j < h; j++) if (r() < 0.16) px(g, light, x + i, y + j);
      for (let j = 0; j < h; j++) if (r() < 0.1) px(g, dark, x + i + Math.min(pw - 1, 1 + ((r() * (pw - 1)) | 0)), y + j);
      if (i > 0) px(g, deep, x + i - 1, y, 1, h);
    }
  }
}

/** A fabric fill: soft noise plus an optional weave or pattern. */
export type FabricPattern = 'plain' | 'knit' | 'quilt' | 'plaid' | 'stripe' | 'gingham' | 'hearts' | 'stars' | 'velvet';

export function fabricFace(g: Ctx, x: number, y: number, w: number, h: number, base: string, pattern: FabricPattern = 'plain', seed = 3, accent?: string) {
  const r = rng(seed);
  const dark = shade(base, -0.09), light = shade(base, 0.07), acc = accent ?? shade(base, 0.18);
  px(g, base, x, y, w, h);
  switch (pattern) {
    case 'knit':
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if ((i + (j >> 1)) % 3 === 0) px(g, dark, x + i, y + j);
      break;
    case 'quilt':
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const cell = ((i >> 3) + (j >> 3)) & 1;
        if (cell) px(g, mix(base, acc, 0.55), x + i, y + j);
        if ((i & 7) === 0 && (j & 1) === 0) px(g, dark, x + i, y + j);
        if ((j & 7) === 0 && (i & 1) === 0) px(g, dark, x + i, y + j);
      }
      break;
    case 'plaid':
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const a = (i % 8) < 2, b = (j % 8) < 2;
        if (a && b) px(g, shade(base, -0.2), x + i, y + j);
        else if (a || b) px(g, dark, x + i, y + j);
        if (i % 8 === 5 || j % 8 === 5) px(g, acc, x + i, y + j);
      }
      break;
    case 'gingham':
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const a = (i >> 2) & 1, b = (j >> 2) & 1;
        if (a && b) px(g, shade(base, -0.14), x + i, y + j);
        else if (a || b) px(g, mix(base, shade(base, -0.14), 0.5), x + i, y + j);
        else px(g, light, x + i, y + j);
      }
      break;
    case 'stripe':
      for (let i = 0; i < w; i++) if (i % 4 < 1) px(g, acc, x + i, y, 1, h);
      break;
    case 'hearts':
      for (let j = 2; j < h - 3; j += 7) for (let i = 2 + ((j / 7) & 1) * 3; i < w - 4; i += 7) heart(g, acc, x + i, y + j);
      break;
    case 'stars':
      for (let j = 2; j < h - 2; j += 6) for (let i = 2 + ((j / 6) & 1) * 3; i < w - 2; i += 6) star(g, acc, x + i, y + j);
      break;
    case 'velvet':
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (r() < 0.22) px(g, r() < 0.5 ? dark : light, x + i, y + j);
      break;
    default:
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (r() < 0.08) px(g, r() < 0.5 ? dark : light, x + i, y + j);
  }
}

export function heart(g: Ctx, c: string, x: number, y: number) {
  px(g, c, x, y, 1, 1); px(g, c, x + 2, y, 1, 1);
  px(g, c, x - 0, y + 1, 3, 1);
  px(g, c, x + 1, y + 2, 1, 1);
}

export function star(g: Ctx, c: string, x: number, y: number) {
  px(g, c, x, y - 1); px(g, c, x - 1, y); px(g, c, x, y); px(g, c, x + 1, y); px(g, c, x, y + 1);
}

/** 7x6 heart used in UI and effects. */
export const HEART_MAP = ['.hh.hh.', 'hHhhhhh', 'hhhhhhh', '.hhhhh.', '..hhh..', '...h...'];

/**
 * Scale2x (EPX): doubles pixel art, rounding off stair-steps without inventing new colors.
 * `rows` gives the output height of each source row (2, or 3 to stretch that row), so a body
 * can come out taller than twice its height.
 */
export function scale2x(src: HTMLCanvasElement, rows?: number[]): HTMLCanvasElement {
  const w = src.width, h = src.height;
  const s = new Uint32Array(src.getContext('2d')!.getImageData(0, 0, w, h).data.buffer);
  const at = (x: number, y: number) => s[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))];
  const W = w * 2;
  const heights = rows ?? new Array(h).fill(2);
  const H = heights.reduce((a, b) => a + b, 0);
  const [c, g] = canvas(W, H, true);
  const img = g.createImageData(W, H);
  const o = new Uint32Array(img.data.buffer);
  let oy = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
      const e0 = C === A && C !== D && A !== B ? A : P;
      const e1 = A === B && A !== C && B !== D ? B : P;
      const e2 = D === C && D !== B && C !== A ? C : P;
      const e3 = B === D && B !== A && D !== C ? D : P;
      const i = oy * W + x * 2;
      o[i] = e0; o[i + 1] = e1;
      o[i + W] = e2; o[i + W + 1] = e3;
      // A stretched row repeats its lower half.
      for (let k = 2; k < heights[y]; k++) { o[i + W * k] = e2; o[i + W * k + 1] = e3; }
    }
    oy += heights[y];
  }
  g.putImageData(img, 0, 0);
  return c;
}
