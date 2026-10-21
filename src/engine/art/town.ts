// Pixel painters for Maple Street: the ground, building fronts, sides and roofs, trees and the
// little props. Everything is drawn in code at 16 px per tile, like the furniture.

import { mix, ramp, shade } from '../../core/color';
import { LAMPS, rowY, TOWN, type Place } from '../../data/town';
import { drawText, textWidth } from './font';
import { bevel, ellipse, hash, px, rng, type Ctx } from './pixel';

// ---------- Ground ----------

/** The whole map as one texture: grass, asphalt lane, paved walkways, crossings and flowers. */
export function paintGround(g: Ctx, w: number, h: number) {
  const r = rng(11);
  const grass = ['#6FA85A', '#7DB866', '#5E9650', '#86C06C'];
  px(g, grass[0], 0, 0, w, h);
  for (let i = 0; i < w * h * 0.12; i++) px(g, grass[1 + ((r() * 3) | 0)], (r() * w) | 0, (r() * h) | 0);
  // Tufts.
  for (let i = 0; i < 90; i++) { const x = (r() * w) | 0, y = (r() * h) | 0; px(g, '#4E8446', x, y, 1, 2); px(g, '#9ACB7E', x + 1, y); }
  // Flower flecks.
  const bloom = ['#FFFFFF', '#F2C14E', '#E8506A', '#B09AE8'];
  for (let i = 0; i < 70; i++) { const x = (r() * w) | 0, y = (r() * h) | 0; px(g, bloom[(r() * 4) | 0], x, y); }

  // Paved walkways between the rows (and in front of Your building).
  const paved = (x0: number, y0: number, x1: number, y1: number) => {
    const base = '#D8CDB8', seam = '#B9AE98', light = '#E8DFCB';
    px(g, base, x0 * 16, y0 * 16, (x1 - x0) * 16, (y1 - y0) * 16);
    for (let y = y0 * 16; y < y1 * 16; y += 8) px(g, seam, x0 * 16, y, (x1 - x0) * 16, 1);
    for (let y = y0 * 16, row = 0; y < y1 * 16; y += 8, row++) for (let x = x0 * 16 + (row % 2) * 8; x < x1 * 16; x += 16) px(g, seam, x, y, 1, 8);
    for (let i = 0; i < (x1 - x0) * (y1 - y0) * 6; i++) px(g, light, x0 * 16 + ((r() * (x1 - x0) * 16) | 0), y0 * 16 + ((r() * (y1 - y0) * 16) | 0));
    // Curb edge.
    px(g, '#A89E88', x0 * 16, y1 * 16 - 1, (x1 - x0) * 16, 1);
  };
  for (let row = 0; row < 6; row++) paved(1, rowY(row) + 3, 13, rowY(row) + 6);
  paved(1, 41, 13, 43);
  paved(3, 37, 11, 38);

  // The lane: asphalt with a dashed center line, running the whole street.
  const [l0, l1] = TOWN.lane;
  const lx = l0 * 16, lw = (l1 - l0 + 1) * 16;
  px(g, '#4E4A56', lx, 16, lw, h - 32);
  for (let i = 0; i < lw * (h - 32) * 0.05; i++) px(g, '#5C5866', lx + ((r() * lw) | 0), 16 + ((r() * (h - 32)) | 0));
  for (let i = 0; i < lw * (h - 32) * 0.02; i++) px(g, '#3E3A46', lx + ((r() * lw) | 0), 16 + ((r() * (h - 32)) | 0));
  for (let y = 24; y < h - 40; y += 12) px(g, '#E8C860', lx + lw / 2 - 1, y, 2, 6);
  px(g, '#8A8494', lx, 16, 1, h - 32);
  px(g, '#8A8494', lx + lw - 1, 16, 1, h - 32);
  // Crosswalks where the lane meets each walkway.
  for (let row = 0; row < 6; row++) {
    for (let k = 0; k < 4; k++) px(g, '#EDEDED', lx + 2 + k * 8, (rowY(row) + 3) * 16 + 2, 5, 40);
  }
  // Pebble path from the far end of the lane to the margin.
  for (let x = lx; x < lx + lw; x += 4) px(g, '#5C5866', x, 14, 2, 2);

  // Front-yard flower strips just below each building body (a little color along the facades).
  for (let row = 0; row < 6; row++) for (const bx of [1, 8]) {
    const y = (rowY(row) + 3) * 16 - 3;
    for (let x = bx * 16 + 2; x < (bx + 5) * 16 - 2; x += 5) {
      px(g, '#4E8446', x, y, 1, 3);
      px(g, bloom[(hash(`${row}${bx}${x}`) % 3) + 1], x, y - 1, 2, 2);
    }
  }
}

// ---------- Buildings ----------

const BRICK_LIGHT = 0.07;

function wallSurface(g: Ctx, w: number, h: number, base: string, style: 'brick' | 'siding' | 'plaster' | 'stone' | 'glass') {
  const r = rng(hash(base));
  const dark = shade(base, -0.12), light = shade(base, BRICK_LIGHT), deep = shade(base, -0.22);
  px(g, base, 0, 0, w, h);
  if (style === 'brick') {
    for (let y = 0; y < h; y += 4) {
      px(g, dark, 0, y + 3, w, 1);
      for (let x = (y / 4) % 2 ? 4 : 0; x < w; x += 8) px(g, dark, x, y, 1, 3);
    }
    for (let i = 0; i < w * h * 0.1; i++) px(g, r() < 0.5 ? light : deep, (r() * w) | 0, (r() * h) | 0);
  } else if (style === 'siding') {
    for (let y = 0; y < h; y += 4) { px(g, dark, 0, y + 3, w, 1); px(g, light, 0, y, w, 1); }
  } else if (style === 'stone') {
    for (let y = 0; y < h; y += 6) {
      px(g, dark, 0, y + 5, w, 1);
      for (let x = ((y / 6) % 2) * 6; x < w; x += 12) px(g, dark, x, y, 1, 5);
    }
    for (let i = 0; i < w * h * 0.08; i++) px(g, r() < 0.5 ? light : deep, (r() * w) | 0, (r() * h) | 0);
  } else if (style === 'plaster') {
    for (let i = 0; i < w * h * 0.12; i++) px(g, r() < 0.5 ? light : dark, (r() * w) | 0, (r() * h) | 0);
  } else {
    for (let x = 0; x < w; x += 20) px(g, dark, x, 0, 1, h);
  }
}

/** Painter handed to each facade: draws into the color canvas and (lit) into the night glow canvas. */
interface Ink { c: Ctx; glow: Ctx; w: number; h: number }

const GLASS = ['#9CCBE0', '#BFE3EC', '#7FB0CC'];
const LIGHT = '#FFD98A';

function windowPane(k: Ink, x: number, y: number, w: number, h: number, trim: string, opts: { cross?: boolean; lit?: boolean; shade?: string } = {}) {
  const { c, glow } = k;
  px(c, shade(trim, -0.3), x - 1, y - 1, w + 2, h + 2);
  px(c, opts.shade ?? GLASS[0], x, y, w, h);
  px(c, GLASS[1], x, y, w, 1);
  for (let i = 0; i < Math.min(w, h) - 2; i += 3) { px(c, GLASS[1], x + 1 + i, y + 1 + i, 2, 1); }
  px(c, GLASS[2], x, y + h - 1, w, 1);
  if (opts.cross) { px(c, trim, x + (w >> 1), y, 1, h); px(c, trim, x, y + (h >> 1), w, 1); }
  px(c, shade(trim, 0.15), x - 1, y + h + 1, w + 2, 1);
  px(glow, LIGHT, x, y, w, h);
  if (opts.cross) { px(glow, '#B88A40', x + (w >> 1), y, 1, h); px(glow, '#B88A40', x, y + (h >> 1), w, 1); }
}

function door(k: Ink, cx: number, base: number, color: string, trim: string, arched = false) {
  const { c, glow } = k;
  const w = 12, h = 22, x = cx - 6, y = base - h;
  px(c, shade(trim, -0.2), x - 1, y - 1, w + 2, h + 1);
  px(c, color, x, y, w, h);
  const d = ramp(color);
  for (const [ax, ay, aw, ah] of [[x + 2, y + 2, 3, 8], [x + 7, y + 2, 3, 8], [x + 2, y + 12, 3, 8], [x + 7, y + 12, 3, 8]]) { px(c, d[1], ax, ay, aw, ah); px(c, d[3], ax, ay, aw, 1); }
  if (arched) { px(c, shade(trim, -0.2), x - 1, y - 2, w + 2, 1); px(c, 'rgba(0,0,0,0)', x - 1, y - 1, 1, 1); }
  px(c, '#E8C060', x + w - 3, y + 11, 2, 2);
  px(c, shade(trim, 0.2), x - 2, base - 1, w + 4, 1);
  // Light spilling out of the door at night.
  px(glow, '#FFC870', x + 1, y + 1, w - 2, 2);
  px(glow, '#FFC870', x + 1, base - 2, w - 2, 1);
}

function striped(c: Ctx, x: number, y: number, w: number, h: number, [a, b]: [string, string]) {
  for (let i = 0; i < w; i++) px(c, ((i >> 2) & 1) ? b : a, x + i, y, 1, h);
  // Scalloped hem.
  for (let i = 0; i < w; i += 4) { px(c, ((i >> 2) & 1) ? b : a, x + i + 1, y + h, 2, 1); }
  px(c, shade(a, -0.3), x, y, w, 1);
}

function signBoard(k: Ink, text: string, y: number, bg: string, fg: string, edge: string) {
  const { c, glow, w } = k;
  const tw = textWidth(text);
  const sw = Math.min(w - 6, tw + 8);
  const x = Math.round((w - sw) / 2);
  px(c, shade(edge, -0.25), x - 1, y - 1, sw + 2, 11);
  px(c, bg, x, y, sw, 9);
  px(c, shade(bg, 0.12), x, y, sw, 1);
  px(c, shade(edge, 0.2), x + 1, y + 1, sw - 2, 1);
  drawText(c, text, x + Math.round((sw - tw) / 2), y + 2, fg);
  px(glow, shade(bg, 0.1), x, y, sw, 9);
  drawText(glow, text, x + Math.round((sw - tw) / 2), y + 2, fg);
}

/** Paints a building's front (the +z face): returns the color layer and the night-light layer. */
export function paintFacade(color: Ctx, glow: Ctx, p: Place, W: number, H: number) {
  const k: Ink = { c: color, glow, w: W, h: H };
  const pal = p.palette;
  const cx = Math.round((p.door.x - p.x + 0.5) * 16);
  const baseY = H - 3;
  const kind = p.style === 'labs' ? 'glass' : p.style === 'chapel' ? 'stone' : p.style === 'realty' || p.style === 'cafe' ? 'brick' : p.style === 'furniture' ? 'siding' : 'plaster';
  wallSurface(color, W, H, pal.wall, kind);
  px(glow, '#000000', 0, 0, W, H);
  // Plinth.
  px(color, shade(pal.trim, -0.1), 0, baseY, W, 3);
  px(color, shade(pal.trim, 0.1), 0, baseY, W, 1);
  // Corner posts.
  px(color, pal.trim, 0, 0, 2, baseY); px(color, pal.trim, W - 2, 0, 2, baseY);
  px(color, shade(pal.trim, 0.15), 0, 0, 1, baseY); px(color, shade(pal.trim, -0.15), W - 1, 0, 1, baseY);
  const door_ = shade(pal.trim, -0.05);
  const leftX = 8, rightX = W - 8 - 20;

  switch (p.style) {
    case 'cafe': {
      signBoard(k, p.sign, 3, '#3A2A22', '#FFF2D0', '#8A5A3A');
      windowPane(k, leftX, 17, 20, 14, pal.trim, { cross: true });
      windowPane(k, rightX, 17, 20, 14, pal.trim, { cross: true });
      striped(color, leftX - 3, 14, 26, 4, pal.awning!);
      striped(color, rightX - 3, 14, 26, 4, pal.awning!);
      door(k, cx, baseY, door_, pal.trim);
      // Chalkboard and a steaming cup in the window.
      px(color, '#2E3A34', leftX + 6, 24, 8, 6); px(color, '#E8E0D0', leftX + 7, 25, 6, 1); px(color, '#E8E0D0', leftX + 7, 27, 4, 1);
      px(color, '#FFF2D0', rightX + 8, 26, 5, 4); px(color, '#C8553D', rightX + 8, 26, 5, 1); px(color, '#FFF2D0', rightX + 13, 27, 1, 2);
      px(color, 'rgba(255,255,255,0.6)', rightX + 9, 23, 1, 2); px(color, 'rgba(255,255,255,0.6)', rightX + 11, 22, 1, 3);
      break;
    }
    case 'flowers': {
      signBoard(k, p.sign, 3, '#FFF2E8', '#B8607A', pal.trim);
      windowPane(k, leftX, 17, 20, 12, pal.trim);
      windowPane(k, rightX, 17, 20, 12, pal.trim);
      striped(color, leftX - 3, 14, 26, 4, pal.awning!);
      striped(color, rightX - 3, 14, 26, 4, pal.awning!);
      door(k, cx, baseY, '#9A5A6E', pal.trim);
      // Window boxes spilling over with blooms.
      const blooms = ['#E8506A', '#F2C14E', '#FFFFFF', '#B09AE8', '#F29AB8'];
      for (const bx of [leftX - 1, rightX - 1]) {
        px(color, '#7A5A3A', bx, 30, 22, 4); px(color, '#5E4630', bx, 33, 22, 1);
        for (let i = 0; i < 22; i += 2) { px(color, '#5E9650', bx + i, 28 + (i % 4 ? 0 : 1), 1, 3); px(color, blooms[(i / 2 + bx) % blooms.length | 0], bx + i, 27 + (i % 4 ? 0 : 1), 2, 2); }
      }
      break;
    }
    case 'parcel': {
      signBoard(k, p.sign, 3, '#F2C14E', '#3E4E78', pal.trim);
      windowPane(k, leftX, 17, 20, 14, pal.trim, { cross: true });
      windowPane(k, rightX, 17, 20, 14, pal.trim, { cross: true });
      door(k, cx, baseY, '#E8E0D0', pal.trim);
      // Parcels stacked in a window, a bike on the other.
      for (const [bx, by, bw, bh, bc] of [[leftX + 2, 26, 8, 5, '#C8A06E'], [leftX + 9, 24, 8, 7, '#B8895A'], [leftX + 5, 21, 7, 5, '#D8B888']] as const) { px(color, bc, bx, by, bw, bh); px(color, '#F2E0C0', bx + (bw >> 1), by, 1, bh); px(color, shade(bc, -0.2), bx, by + bh - 1, bw, 1); }
      ellipse(color, '#2A2A36', rightX + 5, 28, 3, 3); ellipse(color, '#2A2A36', rightX + 15, 28, 3, 3);
      px(color, '#E8506A', rightX + 5, 24, 10, 1); px(color, '#E8506A', rightX + 8, 22, 1, 3);
      break;
    }
    case 'labs': {
      signBoard(k, p.sign, 3, '#27323C', '#5BC8D8', '#5E7A8C');
      windowPane(k, 6, 16, 26, 16, pal.trim, { shade: '#8FC4DA' });
      windowPane(k, W - 32, 16, 26, 16, pal.trim, { shade: '#8FC4DA' });
      door(k, cx, baseY, '#5E7A8C', pal.trim);
      // Monitors glowing in the windows.
      for (const bx of [10, 20, W - 28, W - 18]) { px(color, '#1E2A32', bx, 22, 8, 6); px(color, '#5BC8D8', bx + 1, 23, 6, 4); px(color, '#9FE8F0', bx + 1, 23, 6, 1); px(glow, '#5BC8D8', bx + 1, 23, 6, 4); }
      break;
    }
    case 'furniture': {
      signBoard(k, p.sign, 3, '#5E4630', '#F2E0C0', pal.trim);
      windowPane(k, 6, 15, 26, 17, pal.trim, { shade: '#C8DCE0' });
      windowPane(k, W - 32, 15, 26, 17, pal.trim, { shade: '#C8DCE0' });
      door(k, cx, baseY, '#8A5A3A', pal.trim);
      // A lamp and a sofa on display.
      px(color, '#5E4630', 17, 20, 1, 8); px(color, '#E8C060', 14, 17, 7, 4); px(color, '#5E4630', 15, 28, 5, 1);
      px(color, '#B0453A', W - 28, 24, 18, 6); px(color, '#8A3A30', W - 28, 22, 18, 3); px(color, '#8A3A30', W - 28, 24, 2, 6); px(color, '#8A3A30', W - 12, 24, 2, 6);
      break;
    }
    case 'boutique': {
      signBoard(k, p.sign, 3, '#2E2440', '#FFE08A', '#8A6AB8');
      windowPane(k, leftX - 2, 15, 22, 17, pal.trim, { shade: '#E4D8F4' });
      windowPane(k, rightX + 0, 15, 22, 17, pal.trim, { shade: '#E4D8F4' });
      door(k, cx, baseY, '#6E5A98', pal.trim);
      // Mannequins: a dress and a coat.
      px(color, '#F2D6C0', leftX + 8, 18, 3, 3); px(color, '#E8506A', leftX + 7, 21, 5, 4); px(color, '#E8506A', leftX + 5, 25, 9, 6);
      px(color, '#F2D6C0', rightX + 10, 18, 3, 3); px(color, '#3E4E78', rightX + 8, 21, 7, 9); px(color, '#FFE08A', rightX + 11, 22, 1, 8);
      break;
    }
    case 'realty': {
      signBoard(k, p.sign, 3, '#F2E0C0', '#6A3A30', '#8A4E3A');
      windowPane(k, leftX, 16, 20, 15, pal.trim, { cross: true });
      windowPane(k, rightX, 16, 20, 15, pal.trim, { cross: true });
      door(k, cx, baseY, '#6A3A30', pal.trim);
      // Little house cards pinned in the windows.
      for (const bx of [leftX + 3, leftX + 11, rightX + 3, rightX + 11]) { px(color, '#F2E0C0', bx, 20, 6, 7); px(color, '#C8553D', bx + 1, 21, 4, 2); px(color, '#8A4E3A', bx + 1, 24, 4, 2); }
      break;
    }
    case 'chapel': {
      signBoard(k, p.sign, 3, '#6E5A4A', '#F2E8D0', '#B5A58A');
      // Rose window above the door, tall arched windows either side.
      ellipse(color, shade(pal.trim, -0.3), cx, 19, 6, 6); ellipse(color, '#C8A0E8', cx, 19, 5, 5); px(color, pal.trim, cx, 14, 1, 11); px(color, pal.trim, cx - 5, 19, 11, 1);
      ellipse(glow, '#FFD98A', cx, 19, 5, 5);
      for (const bx of [10, W - 18]) { windowPane(k, bx, 18, 8, 14, pal.trim, { shade: '#A8C0E0' }); px(color, shade(pal.trim, -0.3), bx, 17, 8, 1); }
      door(k, cx, baseY, '#7A5A42', pal.trim, true);
      break;
    }
    case 'boarded': {
      signBoard(k, p.sign, 3, '#6E655E', '#E8E0D0', '#4A4440');
      for (const bx of [leftX, rightX]) {
        px(color, '#3A352F', bx, 17, 20, 14);
        for (let i = 0; i < 3; i++) { px(color, '#8A6A4A', bx, 18 + i * 5, 20, 3); px(color, '#6A4E34', bx, 20 + i * 5, 20, 1); }
      }
      door(k, cx, baseY, '#5A4A3A', pal.trim);
      px(color, '#8A6A4A', cx - 6, baseY - 14, 12, 3); px(color, '#8A6A4A', cx - 6, baseY - 8, 12, 3);
      break;
    }
    case 'home': {
      // Two floors of windows. The one over the door is yours, so it glows warmest at night.
      for (let row = 0; row < 2; row++) for (const bx of [8, 24, 54, 70]) {
        const lit = row === 0 && bx === 24;
        windowPane(k, bx, 9 + row * 22, 12, 12, pal.trim, { cross: true });
        if (lit) px(glow, '#FFB860', bx, 9, 12, 12);
        // Curtains.
        px(color, lit ? '#E8506A' : '#E8D8C0', bx, 9 + row * 22, 2, 12); px(color, lit ? '#E8506A' : '#E8D8C0', bx + 10, 9 + row * 22, 2, 12);
      }
      px(color, shade(pal.trim, -0.1), cx - 16, baseY - 28, 32, 3);
      drawText(color, 'HOME', cx - Math.round(textWidth('HOME') / 2), baseY - 26, pal.accent);
      door(k, cx, baseY, '#7A5A42', pal.trim);
      px(color, pal.accent, cx - 9, baseY - 24, 18, 1);
      break;
    }
    case 'cart': case 'park': break;
  }
  bevel(color, 0, 0, W, H, shade(pal.wall, 0.08), shade(pal.wall, -0.2));
}

/** The +x face (visible from the camera): a plain wall with a window or two. */
export function paintSide(color: Ctx, glow: Ctx, p: Place, W: number, H: number) {
  const pal = p.palette;
  const kind = p.style === 'labs' ? 'glass' : p.style === 'chapel' ? 'stone' : p.style === 'realty' || p.style === 'cafe' ? 'brick' : p.style === 'furniture' ? 'siding' : 'plaster';
  wallSurface(color, W, H, pal.wall, kind);
  px(glow, '#000000', 0, 0, W, H);
  px(color, shade(pal.trim, -0.1), 0, H - 3, W, 3);
  px(color, pal.trim, 0, 0, 2, H - 3); px(color, pal.trim, W - 2, 0, 2, H - 3);
  const k: Ink = { c: color, glow, w: W, h: H };
  const mid = (W >> 1) - 6;
  if (p.style !== 'boarded') windowPane(k, mid, 12, 12, 14, pal.trim, { cross: true });
  else { px(color, '#3A352F', mid, 12, 12, 14); px(color, '#8A6A4A', mid, 14, 12, 3); px(color, '#8A6A4A', mid, 20, 12, 3); }
  // Everything is a bit darker on the shaded side.
  px(color, 'rgba(30,20,50,0.14)', 0, 0, W, H);
}

export function paintRoof(g: Ctx, w: number, h: number, base: string, flatRoof: boolean) {
  const r = rng(hash(base));
  px(g, base, 0, 0, w, h);
  if (flatRoof) {
    for (let i = 0; i < w * h * 0.1; i++) px(g, r() < 0.5 ? shade(base, 0.08) : shade(base, -0.08), (r() * w) | 0, (r() * h) | 0);
    px(g, shade(base, 0.15), 0, 0, w, 1); px(g, shade(base, -0.15), 0, h - 1, w, 1);
    return;
  }
  // Rows of tiles.
  for (let y = 0; y < h; y += 3) {
    px(g, shade(base, -0.18), 0, y + 2, w, 1);
    for (let x = ((y / 3) % 2) * 3; x < w; x += 6) px(g, shade(base, -0.1), x, y, 1, 2);
    for (let x = 0; x < w; x++) if (r() < 0.1) px(g, shade(base, 0.1), x, y);
  }
}

// ---------- Trees, lamps and props ----------

export function paintTree(g: Ctx, w: number, h: number, seed: number) {
  const r = rng(seed);
  const hue = [['#3E7A3E', '#58A04E', '#7FC468'], ['#2E6E4A', '#46906A', '#6CB88A'], ['#4E8A3A', '#6EAE4C', '#96D26C']][seed % 3];
  // Trunk.
  px(g, '#6A4A32', (w >> 1) - 1, h - 9, 3, 9); px(g, '#8A6244', (w >> 1) - 1, h - 9, 1, 9); px(g, '#4A3222', (w >> 1) + 1, h - 9, 1, 9);
  // Crown made of overlapping blobs, lit from the top-left.
  const blobs: [number, number, number][] = [[w / 2, 9, 8], [w / 2 - 6, 14, 6], [w / 2 + 6, 14, 6], [w / 2, 18, 7]];
  for (const [bx, by, br] of blobs) ellipse(g, hue[0], Math.round(bx), by, br, br - 1);
  for (const [bx, by, br] of blobs) ellipse(g, hue[1], Math.round(bx) - 1, by - 1, br - 2, br - 3);
  for (let i = 0; i < 26; i++) { const x = 4 + ((r() * (w - 8)) | 0), y = 3 + ((r() * 18) | 0); px(g, hue[2], x, y, 2, 1); }
  px(g, '#2A5A34', (w >> 1) - 6, 22, 12, 1);
}

export function paintGlow(g: Ctx, w: number, h: number) {
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot((x + 0.5 - w / 2) / (w / 2), (y + 0.5 - h / 2) / (h / 2));
    const a = Math.max(0, 1 - d);
    const q = Math.floor(a * 4 + bayer[(y % 4) * 4 + (x % 4)] / 16) / 4;
    if (q > 0) px(g, `rgba(255,214,140,${(q * 0.9).toFixed(2)})`, x, y);
  }
}

export function paintWater(g: Ctx, w: number, h: number) {
  px(g, '#6CB8E0', 0, 0, w, h);
  for (let y = 0; y < h; y += 3) px(g, '#8ED0F0', (y * 5) % w, y, 4, 1);
  px(g, '#4E98C8', 0, h - 1, w, 1);
}

export function paintStone(g: Ctx, w: number, h: number) {
  const base = '#B8B0A4';
  px(g, base, 0, 0, w, h);
  for (let y = 0; y < h; y += 4) px(g, shade(base, -0.15), 0, y + 3, w, 1);
  for (let x = 0; x < w; x += 6) px(g, shade(base, -0.1), x, 0, 1, h);
  px(g, shade(base, 0.12), 0, 0, w, 1);
}

export function lampPositions() { return LAMPS; }

export { mix };
