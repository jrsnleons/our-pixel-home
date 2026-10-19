// Floor and wallpaper textures. Floors are 64x64 px (4x4 tiles) and wallpapers 32x32 px,
// both seamless so they repeat across the room without visible joins.

import { mix, ramp, shade } from '../../core/color';
import { bands, dither, px, rng, type Ctx } from './pixel';

export interface FloorStyle { key: string; tint?: string | null }

const FLOOR_BASE: Record<string, string> = {
  fl_plywood: '#C8A47A', fl_pine: '#D9A766', fl_parquet: '#A8693C', fl_checker: '#EDE3CF', fl_marble: '#E9E4DC', fl_marble_gold: '#ECE6DA',
};

export function floorBase(key: string, tint?: string | null): string {
  const b = FLOOR_BASE[key] ?? FLOOR_BASE.fl_plywood;
  return tint ? mix(b, tint, 0.55) : b;
}

export function paintFloor(g: Ctx, key: string, tint?: string | null) {
  const S = 64;
  const base = floorBase(key, tint);
  const [d2, d1, b, l1, l2] = ramp(base);
  const r = rng(7);
  switch (key) {
    case 'fl_pine': {
      // Planks 4 px tall, staggered seams, grain streaks and the odd knot.
      for (let row = 0; row < S / 4; row++) {
        const y = row * 4;
        const tone = [b, mix(b, l1, 0.5), mix(b, d1, 0.35)][row % 3];
        px(g, tone, 0, y, S, 4);
        for (let x = 0; x < S; x++) if (r() < 0.22) px(g, l1, x, y);
        for (let x = 0; x < S; x++) if (r() < 0.16) px(g, mix(tone, d1, 0.6), x, y + 1 + ((r() * 2) | 0));
        px(g, d2, 0, y + 3, S, 1);
        const off = (row * 23) % 32;
        for (const sx of [off, off + 32]) { px(g, d2, sx % S, y, 1, 3); px(g, l2, (sx + 1) % S, y, 1, 3); }
        if (r() < 0.5) { const kx = (r() * 60) | 0; px(g, d1, kx, y + 1, 2, 1); px(g, d2, kx, y + 2); }
      }
      break;
    }
    case 'fl_parquet': {
      // Chevron strips (a pixel-friendly herringbone): strips 2 px wide zig-zagging every 8 px.
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const xm = x % 16;
        const zig = xm < 8 ? xm : 15 - xm;
        const strip = Math.floor((y + zig) / 3);
        const side = xm < 8 ? 0 : 1;
        const tones = side ? [b, l1, mix(b, d1, 0.5)] : [mix(b, d1, 0.3), b, l1];
        let c = tones[((strip % 3) + 3) % 3];
        if ((y + zig) % 3 === 0) c = d1;
        if (xm === 0 || xm === 8) c = d2;
        px(g, c, x, y);
      }
      for (let i = 0; i < 90; i++) px(g, l2, (r() * S) | 0, (r() * S) | 0);
      break;
    }
    case 'fl_checker': {
      const dark = tint ? shade(tint, -0.05) : '#C25B4E';
      const [dd, , , dl] = ramp(dark);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const on = ((x >> 3) + (y >> 3)) & 1;
        let c = on ? dark : b;
        if ((x & 7) === 7 || (y & 7) === 7) c = on ? dd : d1;
        else if ((x & 7) === 0 || (y & 7) === 0) c = on ? dl : l2;
        px(g, c, x, y);
      }
      for (let i = 0; i < 40; i++) { const x = (r() * S) | 0, y = (r() * S) | 0; if ((x & 7) > 1 && (y & 7) > 1) px(g, '#FFFFFF', x, y); }
      break;
    }
    case 'fl_marble':
    case 'fl_marble_gold': {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const n = Math.sin(x * 0.21 + Math.sin(y * 0.13) * 2.4) + Math.sin(y * 0.17 + x * 0.05);
        px(g, n > 1.1 ? l2 : n > 0.2 ? b : n > -0.9 ? mix(b, l1, 0.5) : mix(b, d1, 0.3), x, y);
      }
      // Veins: a few random walks that wrap around the edges.
      for (let v = 0; v < 6; v++) {
        let x = (r() * S) | 0, y = (r() * S) | 0;
        for (let i = 0; i < 70; i++) {
          px(g, i % 9 < 6 ? d1 : d2, ((x % S) + S) % S, ((y % S) + S) % S);
          x += r() < 0.6 ? 1 : -1; y += r() < 0.35 ? 1 : r() < 0.5 ? -1 : 0;
        }
      }
      // Slab joints every 16 px.
      for (let i = 0; i < S; i += 16) { px(g, d1, i, 0, 1, S); px(g, d1, 0, i, S, 1); px(g, l2, i + 1, 0, 1, S); px(g, l2, 0, i + 1, S, 1); }
      if (key === 'fl_marble_gold') {
        const gold = '#D9A93A', goldL = '#F6D77A', goldD = '#A87A1E';
        for (let i = 0; i < S; i += 32) {
          px(g, gold, i, 0, 1, S); px(g, gold, 0, i, S, 1);
        }
        for (let cx = 0; cx < S; cx += 32) for (let cy = 0; cy < S; cy += 32) {
          for (let k = -3; k <= 3; k++) { const w = 3 - Math.abs(k); px(g, gold, (cx - w + S) % S, (cy + k + S) % S, 2 * w + 1, 1); }
          px(g, goldL, cx, (cy - 2 + S) % S); px(g, goldD, cx, (cy + 2) % S);
        }
      }
      break;
    }
    default: {
      // Worn plywood: 32x16 sheets, screw heads, scuffs.
      px(g, b, 0, 0, S, S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const v = r();
        if (v < 0.1) px(g, l1, x, y); else if (v < 0.17) px(g, d1, x, y);
      }
      for (let y = 0; y < S; y += 16) {
        const off = (y / 16) % 2 ? 16 : 0;
        px(g, d2, 0, y, S, 1);
        px(g, l2, 0, y + 1, S, 1);
        for (let x = off; x < S + off; x += 32) {
          px(g, d2, x % S, y, 1, 16);
          for (const [sx, sy] of [[2, 2], [29, 2], [2, 13], [29, 13]]) px(g, d2, (x + sx) % S, y + sy);
        }
      }
      for (let i = 0; i < 9; i++) { const x = (r() * 56) | 0, y = (r() * 60) | 0; px(g, d1, x, y, 3 + ((r() * 4) | 0), 1); }
    }
  }
}

export const WALL_PATTERNS = ['wp_plain', 'wp_stripes', 'wp_flowers', 'wp_stars', 'wp_hearts', 'wp_planks', 'wp_brick', 'wp_checker', 'wp_scallop', 'wp_gingham'];

/** 32x32 wallpaper tile. `trim` is the accent used for motifs. */
export function paintWallpaper(g: Ctx, key: string, tint: string, accent: string) {
  const S = 32;
  const [d2, d1, b, l1, l2] = ramp(tint);
  const acc = mix(accent, tint, 0.25);
  const r = rng(11);
  px(g, b, 0, 0, S, S);
  // Paper grain, subtle.
  for (let i = 0; i < 40; i++) px(g, r() < 0.5 ? l1 : mix(b, d1, 0.5), (r() * S) | 0, (r() * S) | 0);
  const flower = (x: number, y: number) => {
    px(g, acc, x - 1, y); px(g, acc, x + 1, y); px(g, acc, x, y - 1); px(g, acc, x, y + 1);
    px(g, l2, x, y);
    px(g, shade(acc, -0.15), x + 1, y + 1);
  };
  switch (key) {
    case 'wp_stripes':
      for (let x = 0; x < S; x += 8) { px(g, d1, x, 0, 2, S); px(g, l1, x + 5, 0, 1, S); }
      break;
    case 'wp_flowers':
      flower(8, 8); flower(24, 24);
      px(g, mix(b, '#6E8B3D', 0.5), 9, 10); px(g, mix(b, '#6E8B3D', 0.5), 25, 26);
      break;
    case 'wp_stars':
      for (const [x, y] of [[6, 6], [22, 20]]) { px(g, l2, x, y - 1); px(g, l2, x - 1, y); px(g, l2, x + 1, y); px(g, l2, x, y + 1); px(g, '#FFFFFF', x, y); }
      for (const [x, y] of [[16, 10], [27, 4], [3, 25], [12, 28]]) px(g, l2, x, y);
      break;
    case 'wp_hearts':
      for (const [x, y] of [[7, 7], [23, 23]]) {
        px(g, acc, x - 2, y); px(g, acc, x - 1, y - 1); px(g, acc, x + 1, y - 1); px(g, acc, x + 2, y);
        px(g, acc, x - 2, y); px(g, acc, x - 1, y, 3, 1); px(g, acc, x - 2, y, 5, 1); px(g, acc, x - 1, y + 1, 3, 1); px(g, acc, x, y + 2);
        px(g, l2, x - 1, y);
      }
      break;
    case 'wp_planks': {
      for (let x = 0; x < S; x += 8) {
        const tone = (x / 8) % 2 ? b : mix(b, d1, 0.4);
        px(g, tone, x, 0, 8, S);
        px(g, d2, x, 0, 1, S); px(g, l1, x + 1, 0, 1, S);
        for (let y = 0; y < S; y++) if (r() < 0.15) px(g, d1, x + 2 + ((r() * 5) | 0), y);
      }
      px(g, d2, 4, 12, 2, 1); px(g, d1, 4, 13); px(g, d2, 20, 25, 2, 1);
      break;
    }
    case 'wp_brick':
      for (let y = 0; y < S; y += 8) {
        const off = (y / 8) % 2 ? 8 : 0;
        for (let x = 0; x < S; x += 16) {
          const bx = (x + off) % S;
          const tone = [b, l1, mix(b, d1, 0.4)][((x + y) / 8) % 3];
          px(g, tone, bx, y, 15, 7);
          if (bx + 15 > S) px(g, tone, 0, y, (bx + 15) - S, 7);
          px(g, l2, bx, y, 14, 1);
        }
        px(g, d1, 0, y + 7, S, 1);
        for (let x = 0; x < S; x += 16) px(g, d1, (x + off + 15) % S, y, 1, 7);
      }
      break;
    case 'wp_checker':
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (((x >> 3) + (y >> 3)) & 1) px(g, mix(b, d1, 0.55), x, y);
      break;
    case 'wp_scallop':
      for (let row = 0; row < 4; row++) {
        const y0 = row * 8, off = row % 2 ? 4 : 0;
        for (let cx = off; cx < S + 8; cx += 8) {
          for (let i = -3; i <= 3; i++) {
            const yy = y0 + 4 + Math.round(Math.sqrt(Math.max(0, 9 - i * i)) * 0.9);
            px(g, d1, ((cx + i) % S + S) % S, yy % S);
          }
          px(g, l2, (cx + S) % S, (y0 + 2) % S);
        }
      }
      break;
    case 'wp_gingham':
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const a = (x >> 2) & 1, c = (y >> 2) & 1;
        if (a && c) px(g, d1, x, y); else if (a || c) px(g, mix(b, d1, 0.5), x, y);
      }
      break;
    default:
      dither(g, b, l1, 0, 0, S, 1, 0.5);
  }
  void d2;
}

/** Wainscot panel strip (1 unit tall = 16 px) under the wallpaper. */
export function paintWainscot(g: Ctx, w: number, trim: string, outline: string) {
  const [d2, d1, b, l1, l2] = ramp(trim);
  px(g, b, 0, 0, w, 16);
  px(g, l2, 0, 0, w, 1); px(g, l1, 0, 1, w, 1); px(g, outline, 0, 2, w, 1);
  for (let x = 0; x < w; x += 16) {
    px(g, d1, x + 2, 5, 12, 1); px(g, d1, x + 2, 5, 1, 7);
    px(g, l1, x + 2, 11, 12, 1); px(g, l1, x + 13, 5, 1, 7);
    px(g, mix(b, l1, 0.4), x + 3, 6, 10, 5);
  }
  px(g, d1, 0, 13, w, 1); px(g, d2, 0, 14, w, 2);
}

/** The cut edge of the diorama slab under the floor. */
export function paintSlab(g: Ctx, w: number, h: number, base: string) {
  const [d2, d1, b, l1] = ramp(base);
  bands(g, [l1, b, d1], 0, 0, w, h);
  for (let x = 0; x < w; x += 8) px(g, d2, x + ((x / 8) % 2) * 3, 2, 1, h - 2);
  px(g, d2, 0, (h / 2) | 0, w, 1);
  px(g, mix(l1, '#FFFFFF', 0.3), 0, 0, w, 1);
}
