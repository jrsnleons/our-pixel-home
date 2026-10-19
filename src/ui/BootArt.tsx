// Title-screen illustration: two little homes far apart, one under the night and one at
// dusk, joined by a dotted line of light. Painted at 1x and scaled up crisp.

import { useEffect, useRef } from 'preact/hooks';
import { canvas, disc, dither, HEART_MAP, px, rng, sprite, type Ctx } from '../engine/art/pixel';

const W = 120;
const H = 84;

// Each band is [top row, color]; dithered seams between them keep it from looking like a CSS gradient.
const NIGHT = [[0, '#141A33'], [18, '#1D2547'], [34, '#2A2F5C'], [48, '#3C3768'], [60, '#4E3F6E']] as const;
const DUSK = [[0, '#3A3466'], [16, '#6A4777'], [30, '#B05F78'], [44, '#E08A6E'], [56, '#F2B880']] as const;

function sky(g: Ctx, x0: number, w: number, bands: readonly (readonly [number, string])[]) {
  for (let i = 0; i < bands.length; i++) {
    const [y, c] = bands[i];
    const next = bands[i + 1]?.[0] ?? H;
    px(g, c, x0, y, w, next - y);
    if (bands[i + 1]) dither(g, c, bands[i + 1][1], x0, next - 2, w, 2, 0.5);
  }
}

function house(g: Ctx, x: number, y: number, wall: string, roof: string, lit: boolean, flip: boolean) {
  const dark = '#1B1420';
  // Body
  px(g, dark, x - 1, y - 1, 20, 15);
  px(g, wall, x, y, 18, 13);
  px(g, 'rgba(0,0,0,.18)', flip ? x : x + 12, y, 6, 13);
  // Roof: stepped, with a chimney on the far side.
  for (let i = 0; i < 7; i++) {
    px(g, dark, x - 3 + i, y - 2 - i, 24 - i * 2, 1);
    px(g, roof, x - 2 + i, y - 2 - i, 22 - i * 2, 1);
  }
  px(g, 'rgba(255,255,255,.18)', x - 2, y - 2, 22, 1);
  const cx = flip ? x + 2 : x + 13;
  px(g, dark, cx - 1, y - 9, 5, 6);
  px(g, '#8A4A3C', cx, y - 8, 3, 5);
  // Door and window
  const dx = flip ? x + 11 : x + 3;
  px(g, dark, dx - 1, y + 5, 6, 8);
  px(g, '#6B4330', dx, y + 6, 4, 7);
  px(g, '#E8B860', dx + 3, y + 9);
  const wx = flip ? x + 3 : x + 10;
  px(g, dark, wx - 1, y + 3, 7, 7);
  px(g, lit ? '#FFD98A' : '#2A3050', wx, y + 4, 5, 5);
  if (lit) { px(g, '#FFF2C8', wx, y + 4, 2, 2); px(g, '#E89A50', wx, y + 8, 5, 1); }
  px(g, dark, wx + 2, y + 4, 1, 5);
  px(g, dark, wx, y + 6, 5, 1);
}

function hill(g: Ctx, cx: number, top: number, r: number, c: string, rim: string) {
  for (let x = cx - r; x <= cx + r; x++) {
    const d = (x - cx) / r;
    const y = Math.round(top + r * 0.35 * d * d);
    px(g, c, x, y, 1, H - y);
    px(g, rim, x, y, 1, 1);
  }
}

function paintFrame(g: Ctx, t: number) {
  // Split the sky on a diagonal: night on the left, dusk on the right.
  sky(g, 0, W, NIGHT);
  const [d, dg] = canvas(W, H);
  sky(dg, 0, W, DUSK);
  for (let y = 0; y < H; y++) {
    const edge = Math.round(64 - y * 0.32);
    g.drawImage(d, edge, y, W - edge, 1, edge, y, W - edge, 1);
    if (y % 2 === 0) g.drawImage(d, edge - 1, y, 1, 1, edge - 1, y, 1, 1);
  }

  // Stars twinkle on the night side.
  const r = rng(7);
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(r() * 62), y = Math.floor(r() * 44);
    if (x > 64 - y * 0.32 - 2) continue;
    const on = Math.sin(t * 2 + i * 1.7) > -0.4;
    if (!on) continue;
    px(g, i % 5 === 0 ? '#FFFFFF' : '#C9C6F0', x, y);
    if (i % 7 === 0 && Math.sin(t * 2 + i) > 0.6) { px(g, '#8E8BD0', x - 1, y); px(g, '#8E8BD0', x + 1, y); px(g, '#8E8BD0', x, y - 1); px(g, '#8E8BD0', x, y + 1); }
  }
  // Moon and sun.
  disc(g, '#F5EBC8', 14, 12, 5);
  disc(g, '#141A33', 16, 10, 4);
  disc(g, '#FFE3A0', 104, 50, 7);
  disc(g, '#FFF4D2', 104, 50, 4);

  // Hills, back to front.
  hill(g, 22, 62, 34, '#2B2E52', '#3A3C66');
  hill(g, 98, 60, 34, '#8C5A6A', '#B07A7E');
  px(g, '#22243F', 0, 74, W, H - 74);
  dither(g, '#22243F', '#6E4858', 0, 72, W, 2, 0.5);

  house(g, 12, 50, '#C7B39A', '#7D4A55', true, false);
  house(g, 88, 48, '#E8CDA6', '#B4533F', true, true);

  // A dotted thread of light from window to window, travelling, with a heart at the top.
  const ax = 26, ay = 56, bx = 93, by = 54;
  const n = 60;
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const x = Math.round(ax + (bx - ax) * s);
    const y = Math.round(ay + (by - ay) * s - Math.sin(s * Math.PI) * 30);
    // A bright pulse runs from your window to theirs.
    const lit = ((i - Math.floor(t * 14)) % 12 + 12) % 12;
    if (i % 3 !== 2) px(g, lit === 0 ? '#FFFFFF' : lit < 3 ? '#FFE7A8' : 'rgba(255,217,138,.55)', x, y);
  }
  const beat = Math.sin(t * 3) > 0.7 ? 1 : 0;
  const hx = 57 - beat, hy = 20 - beat;
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) sprite(g, HEART_MAP, { h: '#1B1420', H: '#1B1420' }, hx + ox, hy + oy);
  sprite(g, HEART_MAP, { h: '#F06A84', H: '#FFC2CE' }, hx, hy);
}

export function BootArt() {
  const host = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = host.current!;
    const g = c.getContext('2d')!;
    let raf = 0, last = 0;
    const loop = (ms: number) => {
      raf = requestAnimationFrame(loop);
      if (ms - last < 120) return; // ~8 fps is plenty for twinkles, and gentle on battery
      last = ms;
      paintFrame(g, ms / 1000);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={host} width={W} height={H} class="boot-art" aria-hidden="true" />;
}
