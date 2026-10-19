// Reusable face painters for furniture: wood, fabric, metal, marble, glass. Each returns a
// Painter so boxes can be dressed in one line.

import { mix, ramp, shade } from '../../core/color';
import type { Theme } from '../../data/themes';
import type { Painter } from './kit';
import { bevel, fabricFace, px, rng, woodFace, type FabricPattern } from './pixel';

export interface Pal {
  T: Theme;
  wood: string[]; dark: string[]; blanket: string[]; sheet: string[]; cushion: string[]; curtain: string[];
  accent: string[]; metal: string[]; gold: string[]; marble: string[]; plant: string[]; pot: string[]; outline: string;
}

export function palette(T: Theme): Pal {
  return {
    T,
    wood: ramp(T.wood), dark: ramp(T.darkWood), blanket: ramp(T.blanket), sheet: ramp(T.sheet), cushion: ramp(T.cushion),
    curtain: ramp(T.curtain), accent: ramp(T.accent), metal: ramp(T.metal), gold: ramp('#D9A93A'), marble: ramp('#ECE8E2'),
    plant: ramp(T.plant), pot: ramp(T.pot), outline: T.outline,
  };
}

/** Planked wood with beveled edges and a dark outline on the bottom. */
export const wood = (base: string, o: { seed?: number; plank?: number; vertical?: boolean; edge?: boolean } = {}): Painter => (g, w, h) => {
  woodFace(g, 0, 0, w, h, base, o.seed ?? (w * 31 + h), o.plank ?? 4, o.vertical);
  if (o.edge !== false) bevel(g, 0, 0, w, h, shade(base, 0.12), shade(base, -0.2));
};

/** A flat color with a pixel bevel: good for painted wood, plastic, metal. */
export const solid = (base: string, o: { noise?: number; seed?: number } = {}): Painter => (g, w, h) => {
  px(g, base, 0, 0, w, h);
  if (o.noise) {
    const r = rng(o.seed ?? 5);
    for (let i = 0; i < w * h * o.noise; i++) px(g, r() < 0.5 ? shade(base, 0.05) : shade(base, -0.05), (r() * w) | 0, (r() * h) | 0);
  }
  bevel(g, 0, 0, w, h, shade(base, 0.12), shade(base, -0.18));
};

export const fabric = (base: string, pattern: FabricPattern = 'plain', accent?: string, seed = 3): Painter => (g, w, h) => {
  fabricFace(g, 0, 0, w, h, base, pattern, seed, accent);
  bevel(g, 0, 0, w, h, shade(base, 0.08), shade(base, -0.14));
};

export const metal = (base: string): Painter => (g, w, h) => {
  const [d2, d1, b, l1, l2] = ramp(base);
  px(g, b, 0, 0, w, h);
  for (let y = 0; y < h; y++) px(g, y % 3 === 0 ? l1 : y % 3 === 1 ? b : d1, 0, y, w, 1);
  px(g, l2, 0, 0, w, 1);
  px(g, d2, 0, h - 1, w, 1);
};

export const marble = (seed = 9): Painter => (g, w, h) => {
  const [d2, d1, b, l1, l2] = ramp('#ECE8E2');
  const r = rng(seed);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = Math.sin(x * 0.3 + Math.sin(y * 0.2) * 2) + Math.sin(y * 0.25 + x * 0.07);
    px(g, n > 1 ? l2 : n > 0 ? b : n > -1 ? l1 : mix(b, d1, 0.4), x, y);
  }
  for (let v = 0; v < Math.max(2, (w * h) / 200); v++) {
    let x = (r() * w) | 0, y = (r() * h) | 0;
    for (let i = 0; i < 30; i++) { px(g, i % 7 < 5 ? d1 : d2, x, y); x += r() < 0.6 ? 1 : -1; y += r() < 0.4 ? 1 : r() < 0.5 ? -1 : 0; }
  }
  bevel(g, 0, 0, w, h, '#FFFFFF', d1);
};

/** Glass: pale tint, a diagonal glint, darker frame line. */
export const glass = (tint = '#BFE3EC'): Painter => (g, w, h) => {
  const [, d1, b, l1] = ramp(tint);
  px(g, b, 0, 0, w, h);
  for (let i = 0; i < w + h; i += 9) for (let k = 0; k < 3; k++) { const x = i - k; for (let y = 0; y < h; y++) { const xx = x - y; if (xx >= 0 && xx < w) px(g, l1, xx, y); } }
  bevel(g, 0, 0, w, h, '#FFFFFF', d1);
};

/** Paperback spines on a shelf row from y0..y1. */
export function books(g: Parameters<Painter>[0], x0: number, x1: number, y1: number, colors: string[], seed: number, maxH = 7) {
  const r = rng(seed);
  let x = x0;
  while (x < x1) {
    if (r() < 0.1) { x += 2; continue; }
    const bw = Math.min(1 + ((r() * 3) | 0), x1 - x), bh = Math.max(3, maxH - ((r() * 3) | 0));
    const c = colors[(r() * colors.length) | 0];
    if (r() < 0.12 && bw > 1) {
      // A book lying down.
      px(g, c, x, y1 - 1, Math.min(4, x1 - x), 2); px(g, shade(c, 0.15), x, y1 - 1, Math.min(4, x1 - x), 1);
      x += Math.min(4, x1 - x) + 1; continue;
    }
    px(g, c, x, y1 - bh + 1, bw, bh);
    px(g, shade(c, 0.18), x, y1 - bh + 1, 1, bh);
    px(g, shade(c, -0.2), x, y1 - bh + 3, bw, 1);
    if (bh > 5) px(g, '#F2E6C8', x + (bw > 1 ? 1 : 0), y1 - bh + 5, 1, 1);
    x += bw;
  }
}
