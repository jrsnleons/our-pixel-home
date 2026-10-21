// Pixel painters for Maple Street: the ground, building fronts, sides and roofs, trees and the
// little props. Everything is drawn in code at 16 px per tile, like the furniture.

import { mix, ramp, shade } from '../../core/color';
import { AVENUE, ELM_ST, G, groundAt, MARKET_ST, SQUARE, TOWN, type Place } from '../../data/town';
import { drawText, textWidth } from './font';
import { bevel, disc, ellipse, hash, line, px, rng, type Ctx } from './pixel';

// ---------- Ground ----------

const T = 16;

/**
 * The whole map as one texture, painted tile by tile from the ground plan: grass, asphalt with
 * lane lines and crossings, sidewalks with curbs, cobbled plazas, water with foam at the banks,
 * planked bridge and pier, dirt paths, flower beds.
 */
export function paintGround(g: Ctx, w: number, h: number) {
  const r = rng(11);
  const grass = ['#6FA85A', '#7DB866', '#5E9650', '#86C06C'];
  px(g, grass[0], 0, 0, w, h);
  for (let i = 0; i < w * h * 0.12; i++) px(g, grass[1 + ((r() * 3) | 0)], (r() * w) | 0, (r() * h) | 0);
  for (let i = 0; i < (w * h) / 260; i++) { const x = (r() * w) | 0, y = (r() * h) | 0; px(g, '#4E8446', x, y, 1, 2); px(g, '#9ACB7E', x + 1, y); }
  const bloom = ['#FFFFFF', '#F2C14E', '#E8506A', '#B09AE8'];
  const is = (x: number, y: number, k: G) => groundAt(x, y) === k;
  const paved = (k: G) => k === G.Walk || k === G.Plaza || k === G.Road || k === G.Bridge || k === G.Deck;

  for (let ty = 0; ty < TOWN.d; ty++) for (let tx = 0; tx < TOWN.w; tx++) {
    const k = groundAt(tx, ty);
    const x0 = tx * T, y0 = ty * T;
    const seed = tx * 31 + ty * 17;
    switch (k) {
      case G.Grass: case G.Yard: {
        if (k === G.Yard) px(g, 'rgba(255,255,220,0.08)', x0, y0, T, T);
        if (seed % 9 === 0) px(g, bloom[seed % 4], x0 + (seed % 13), y0 + ((seed >> 3) % 13), 1, 1);
        break;
      }
      case G.Road: {
        px(g, '#4E4A56', x0, y0, T, T);
        for (let i = 0; i < 14; i++) px(g, r() < 0.6 ? '#5C5866' : '#3E3A46', x0 + ((r() * T) | 0), y0 + ((r() * T) | 0));
        // Lane lines: dashed down the middle of the east-west streets and the avenue.
        if ((ty === MARKET_ST.y + 1 || ty === ELM_ST.y + 1) && tx % 2 === 0) px(g, '#E8C860', x0 + 2, y0 + 7, 10, 2);
        if (tx === AVENUE.x + 2 && (ty < MARKET_ST.y || ty > ELM_ST.y + 2) && ty % 2 === 0) px(g, '#E8C860', x0 - 1, y0 + 2, 2, 10);
        // Zebra crossings where the avenue's sidewalks cross the streets.
        const street = (ty >= MARKET_ST.y && ty < MARKET_ST.y + 3) || (ty >= ELM_ST.y && ty < ELM_ST.y + 3);
        if (street && (tx === 20 || tx === 21 || tx === 26 || tx === 27 || tx === 6 || tx === 40)) for (let i = 1; i < T; i += 5) px(g, '#EDEDED', x0 + 2, y0 + i, 12, 3);
        break;
      }
      case G.Walk: {
        px(g, '#D8CDB8', x0, y0, T, T);
        px(g, '#B9AE98', x0, y0 + 7, T, 1); px(g, '#B9AE98', x0, y0 + 15, T, 1);
        px(g, '#B9AE98', x0 + ((ty % 2) ? 4 : 12), y0, 1, 7); px(g, '#B9AE98', x0 + ((ty % 2) ? 12 : 4), y0 + 8, 1, 7);
        for (let i = 0; i < 4; i++) px(g, '#E8DFCB', x0 + ((r() * T) | 0), y0 + ((r() * T) | 0));
        break;
      }
      case G.Plaza: {
        // Cobbles: small rounded stones in staggered rows, warmer toward the fountain.
        const warm = Math.hypot(tx - 23.5, ty - 38) < 6.5 && tx >= SQUARE.x && ty >= SQUARE.y && tx < SQUARE.x + SQUARE.w && ty < SQUARE.y + SQUARE.d;
        const base = warm ? '#D6C6AC' : '#CFC6B4', seam = warm ? '#B0A086' : '#ACA290', hi = warm ? '#E6D8C2' : '#E2DACA';
        px(g, base, x0, y0, T, T);
        for (let row = 0; row < 4; row++) {
          px(g, seam, x0, y0 + row * 4 + 3, T, 1);
          for (let c = ((row + ty) % 2) * 2; c < T; c += 4) { px(g, seam, x0 + c, y0 + row * 4, 1, 3); px(g, hi, x0 + c + 1, y0 + row * 4, 2, 1); }
        }
        break;
      }
      case G.Water: {
        px(g, '#5EAAD6', x0, y0, T, T);
        for (let i = 0; i < 3; i++) px(g, '#82C4EA', x0 + ((seed * (i + 3)) % 12), y0 + ((seed >> i) % 14), 4, 1);
        // Foam and a darker bank where water meets land.
        if (!is(tx, ty - 1, G.Water)) { px(g, '#3E7A5A', x0, y0, T, 2); px(g, '#CDEBF8', x0, y0 + 2, T, 1); }
        if (!is(tx, ty + 1, G.Water)) { px(g, '#CDEBF8', x0, y0 + T - 2, T, 1); px(g, '#7A6A4A', x0, y0 + T - 1, T, 1); }
        if (!is(tx - 1, ty, G.Water)) px(g, '#CDEBF8', x0, y0, 1, T);
        if (!is(tx + 1, ty, G.Water)) px(g, '#CDEBF8', x0 + T - 1, y0, 1, T);
        break;
      }
      case G.Bridge: case G.Deck: {
        const wood = k === G.Bridge ? '#A8805A' : '#9A7450';
        px(g, wood, x0, y0, T, T);
        for (let y = 0; y < T; y += 4) { px(g, shade(wood, -0.25), x0, y0 + y + 3, T, 1); px(g, shade(wood, 0.12), x0, y0 + y, T, 1); }
        px(g, shade(wood, -0.3), x0 + ((ty * 5) % T), y0, 1, 3);
        break;
      }
      case G.Path: {
        px(g, '#C8A878', x0, y0, T, T);
        for (let i = 0; i < 10; i++) px(g, r() < 0.5 ? '#B8966A' : '#D8BC90', x0 + ((r() * T) | 0), y0 + ((r() * T) | 0));
        for (let i = 0; i < 3; i++) px(g, '#9A8A70', x0 + ((r() * 14) | 0), y0 + ((r() * 14) | 0), 2, 1);
        // Grass creeping onto the edges.
        if (!paved(groundAt(tx, ty - 1)) && !is(tx, ty - 1, G.Path)) for (let i = 0; i < T; i += 3) px(g, '#6FA85A', x0 + i, y0, 2, 1 + (i % 2));
        if (!paved(groundAt(tx, ty + 1)) && !is(tx, ty + 1, G.Path)) for (let i = 1; i < T; i += 3) px(g, '#6FA85A', x0 + i, y0 + T - 1 - (i % 2), 2, 1 + (i % 2));
        break;
      }
      case G.Bed: {
        px(g, '#5E4630', x0, y0, T, T);
        for (let i = 0; i < 6; i++) { const fx = x0 + 1 + ((seed * (i + 2)) % 13), fy = y0 + 1 + ((seed * (i + 5)) % 13); px(g, '#4E8446', fx, fy + 1, 2, 2); px(g, bloom[(seed + i) % 4], fx, fy, 2, 2); }
        px(g, '#8A6A4A', x0, y0 + T - 1, T, 1);
        break;
      }
      case G.Hedge: px(g, '#3E6A3A', x0, y0, T, T); break;
    }
    // Curbs: a light edge on the sidewalk side and a dark lip on the road side.
    if (k === G.Walk || k === G.Plaza) {
      if (is(tx, ty + 1, G.Road)) { px(g, '#EEE6D6', x0, y0 + T - 2, T, 1); px(g, '#8A8494', x0, y0 + T - 1, T, 1); }
      if (is(tx, ty - 1, G.Road)) { px(g, '#8A8494', x0, y0, T, 1); px(g, '#EEE6D6', x0, y0 + 1, T, 1); }
      if (is(tx + 1, ty, G.Road)) px(g, '#8A8494', x0 + T - 1, y0, 1, T);
      if (is(tx - 1, ty, G.Road)) px(g, '#8A8494', x0, y0, 1, T);
    }
  }
  // Pebbles where paving meets grass, so edges don't look cut with scissors.
  for (let ty = 0; ty < TOWN.d; ty++) for (let tx = 0; tx < TOWN.w; tx++) {
    const k = groundAt(tx, ty);
    if (k !== G.Grass && k !== G.Yard) continue;
    const x0 = tx * T, y0 = ty * T;
    if (paved(groundAt(tx, ty - 1))) for (let i = 0; i < 5; i++) px(g, '#BDB2A0', x0 + ((tx * 7 + i * 5) % 15), y0 + (i % 2), 1, 1);
    if (paved(groundAt(tx, ty + 1))) { px(g, '#4E8446', x0, y0 + T - 1, T, 1); }
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

const wallKind = (p: Place) => (p.style === 'labs' ? 'glass' : p.style === 'chapel' ? 'stone' : p.style === 'realty' || p.style === 'cafe' ? 'brick' : p.style === 'furniture' || p.style === 'house' ? 'siding' : 'plaster');

/** Paints a building's front (the +z face): returns the color layer and the night-light layer. */
export function paintFacade(color: Ctx, glow: Ctx, p: Place, W: number, H: number) {
  const k: Ink = { c: color, glow, w: W, h: H };
  const pal = p.palette;
  const cx = Math.round((p.door.x - p.x + 0.5) * 16);
  const ground = H - 3;
  wallSurface(color, W, H, pal.wall, wallKind(p));
  px(glow, '#000000', 0, 0, W, H);
  // Plinth.
  px(color, shade(pal.trim, -0.1), 0, ground, W, 3);
  px(color, shade(pal.trim, 0.1), 0, ground, W, 1);
  // Corner posts.
  px(color, pal.trim, 0, 0, 2, ground); px(color, pal.trim, W - 2, 0, 2, ground);
  px(color, shade(pal.trim, 0.15), 0, 0, 1, ground); px(color, shade(pal.trim, -0.15), W - 1, 0, 1, ground);
  const door_ = shade(pal.trim, -0.05);
  const leftX = 8, rightX = W - 8 - 20;
  // Shopfronts are drawn for a one-storey front; a taller building gets that front at street
  // level and a row of upstairs windows above a cornice.
  const shop = p.style !== 'home' && p.style !== 'house';
  const off = shop ? Math.max(0, H - 46) : 0;
  if (off >= 14) {
    const wh = Math.min(10, off - 6);
    for (let bx = 10; bx + 10 <= W - 10; bx += 22) windowPane(k, bx, 3, 10, wh, pal.trim, { cross: true });
  }
  if (off > 0) {
    px(color, shade(pal.trim, -0.1), 2, off - 2, W - 4, 2); px(color, shade(pal.trim, 0.15), 2, off - 2, W - 4, 1);
    color.save(); glow.save(); color.translate(0, off); glow.translate(0, off);
  }
  const baseY = H - 3 - off;

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
      // Rows of windows across the whole front. The one nearest the door is yours, so it glows
      // warmest at night.
      const rows = H >= 64 ? [9, 31] : [9];
      const xs: number[] = [];
      for (let bx = 10; bx + 12 <= W - 10; bx += 18) if (bx + 12 < cx - 14 || bx > cx + 14) xs.push(bx);
      const mine = xs.reduce((a, b) => (Math.abs(b + 6 - cx) < Math.abs(a + 6 - cx) ? b : a), xs[0]);
      rows.forEach((wy, row) => {
        for (const bx of xs) {
          const lit = row === 0 && bx === mine;
          windowPane(k, bx, wy, 12, 12, pal.trim, { cross: true });
          if (lit) px(glow, '#FFB860', bx, wy, 12, 12);
          px(color, lit ? '#E8506A' : '#E8D8C0', bx, wy, 2, 12); px(color, lit ? '#E8506A' : '#E8D8C0', bx + 10, wy, 2, 12);
        }
      });
      // Balconies on the upper row.
      if (rows.length > 1) for (const bx of xs) { px(color, shade(pal.trim, -0.25), bx - 2, 22, 16, 2); for (let i = 0; i < 16; i += 3) px(color, shade(pal.trim, -0.25), bx - 2 + i, 18, 1, 4); px(color, shade(pal.trim, -0.25), bx - 2, 18, 16, 1); }
      px(color, shade(pal.trim, -0.1), cx - 16, baseY - 28, 32, 3);
      drawText(color, 'HOME', cx - Math.round(textWidth('HOME') / 2), baseY - 26, pal.accent);
      door(k, cx, baseY, '#7A5A42', pal.trim);
      px(color, pal.accent, cx - 9, baseY - 24, 18, 1);
      // A little canopy over the entrance.
      striped(color, cx - 12, baseY - 31, 24, 3, [pal.accent, '#FFF2D0']);
      break;
    }
    case 'house': {
      // A neighbour's cottage: shuttered windows with flower boxes and a porch light.
      for (const bx of [10, W - 26]) {
        windowPane(k, bx, 14, 16, 12, pal.trim, { cross: true });
        px(color, pal.accent === '#FFFFFF' ? shade(pal.trim, -0.1) : pal.accent, bx - 5, 13, 4, 14); px(color, pal.accent === '#FFFFFF' ? shade(pal.trim, -0.1) : pal.accent, bx + 17, 13, 4, 14);
        px(color, shade(pal.accent, -0.3), bx - 4, 16, 2, 1); px(color, shade(pal.accent, -0.3), bx + 18, 16, 2, 1);
        px(color, '#7A5A3A', bx - 1, 27, 18, 3);
        for (let i = 0; i < 18; i += 2) { px(color, '#5E9650', bx - 1 + i, 25, 1, 2); px(color, ['#E8506A', '#F2C14E', '#FFFFFF', '#B09AE8'][(i / 2 + bx) % 4 | 0], bx - 1 + i, 24 + (i % 4 ? 0 : 1), 2, 2); }
      }
      door(k, cx, baseY, shade(pal.trim, -0.15), pal.trim);
      px(color, '#3A3A46', cx + 8, baseY - 20, 3, 4); px(color, '#FFE9B0', cx + 8, baseY - 19, 3, 2); px(glow, '#FFD98A', cx + 7, baseY - 21, 5, 6);
      px(color, '#E8DCC0', cx - 4, baseY - 26, 8, 3); px(color, shade(pal.trim, -0.3), cx - 2, baseY - 25, 4, 1);
      break;
    }
    case 'cart': case 'park': break;
  }
  if (off > 0) { color.restore(); glow.restore(); }
  bevel(color, 0, 0, W, H, shade(pal.wall, 0.08), shade(pal.wall, -0.2));
}

/** The +x face (visible from the camera): a plain wall with a window or two. */
export function paintSide(color: Ctx, glow: Ctx, p: Place, W: number, H: number) {
  const pal = p.palette;
  wallSurface(color, W, H, pal.wall, wallKind(p));
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

/** A tall evergreen: stacked tiers of needles, darker underneath. */
export function paintPine(g: Ctx, w: number, h: number, seed: number) {
  const r = rng(seed + 50);
  const hue = [['#2A5A3E', '#3A7A4E', '#5A9E62'], ['#244E3A', '#34704A', '#4E925A']][seed % 2];
  px(g, '#5A3E2A', (w >> 1) - 1, h - 7, 3, 7); px(g, '#7A5638', (w >> 1) - 1, h - 7, 1, 7);
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const top = 2 + i * ((h - 10) / tiers), bot = top + (h - 10) / tiers + 4, half = 3 + i * ((w / 2 - 4) / (tiers - 1));
    for (let y = Math.round(top); y < bot; y++) {
      const t = (y - top) / (bot - top), hw = Math.round(1 + t * half);
      px(g, hue[0], (w >> 1) - hw, y, hw * 2 + 1, 1);
      px(g, hue[1], (w >> 1) - hw, y, Math.max(1, hw), 1);
      if (y === Math.round(bot) - 1) px(g, '#1E3E2C', (w >> 1) - hw + 1, y, hw * 2 - 1, 1);
    }
  }
  for (let i = 0; i < 14; i++) px(g, hue[2], (w >> 1) - 4 + ((r() * 7) | 0), 4 + ((r() * (h - 14)) | 0));
  px(g, '#E8F0F0', (w >> 1), 1, 1, 1);
}

/** A weeping willow: a round crown with long strands hanging to the ground. */
export function paintWillow(g: Ctx, w: number, h: number, seed: number) {
  const r = rng(seed + 90);
  px(g, '#6A4A32', (w >> 1) - 1, h - 12, 3, 12); px(g, '#8A6244', (w >> 1) - 1, h - 12, 1, 12);
  ellipse(g, '#4E8A3A', w >> 1, 11, (w >> 1) - 2, 9);
  ellipse(g, '#6EAE4C', (w >> 1) - 1, 9, (w >> 1) - 5, 6);
  for (let x = 3; x < w - 3; x += 2) {
    const len = 10 + ((r() * (h - 26)) | 0);
    px(g, x % 4 ? '#5E9E44' : '#4E8A3A', x, 14, 1, len);
    px(g, '#96D26C', x, 14 + ((r() * len) | 0), 1, 1);
  }
}

/** A round shrub, sometimes in flower. */
export function paintBush(g: Ctx, w: number, h: number, seed: number) {
  const r = rng(seed + 7);
  ellipse(g, '#3E7A3E', w >> 1, h - 6, (w >> 1) - 1, 5);
  ellipse(g, '#58A04E', (w >> 1) - 1, h - 7, (w >> 1) - 3, 3);
  const bloom = seed % 3 === 0 ? '#F29AB8' : seed % 3 === 1 ? '#FFFFFF' : null;
  for (let i = 0; i < 10; i++) px(g, bloom && i % 2 ? bloom : '#7FC468', 2 + ((r() * (w - 4)) | 0), h - 10 + ((r() * 7) | 0));
}

/** A little round sign on a post: a street name, a bus stop, a direction. */
export function paintSign(g: Ctx, w: number, h: number, text: string, bg = '#3E6A4A', fg = '#F2E8D0') {
  const tw = textWidth(text);
  const sw = Math.min(w, tw + 6);
  const x = (w - sw) >> 1;
  px(g, shade(bg, -0.35), x, 0, sw, 9);
  px(g, bg, x + 1, 1, sw - 2, 7);
  drawText(g, text, x + ((sw - tw) >> 1), 2, fg);
  px(g, '#3A3A46', (w >> 1) - 1, 9, 2, h - 9);
}

/** The notice board in the square: pinned notes. */
export function paintBoard(g: Ctx, w: number, h: number) {
  px(g, '#5E4630', 0, 0, w, h);
  px(g, '#B8946A', 2, 2, w - 4, h - 4);
  const r = rng(4);
  const notes = ['#FFF2D0', '#F2C6D0', '#C8E0F0', '#E8F0C0'];
  for (let i = 0; i < 6; i++) {
    const nx = 4 + ((i % 3) * ((w - 8) / 3)) | 0, ny = 4 + (i > 2 ? (h - 8) / 2 : 0) | 0;
    px(g, notes[i % 4], nx, ny, 7, 6);
    for (let l = 0; l < 2; l++) px(g, '#8A7A6A', nx + 1, ny + 2 + l * 2, 3 + ((r() * 3) | 0), 1);
    px(g, '#E8506A', nx + 3, ny, 1, 1);
  }
}

/** A clock face with the given time. */
export function paintClock(g: Ctx, w: number, h: number, hour: number, minute: number) {
  const c = w / 2;
  disc(g, '#3A2A22', c, c, c);
  disc(g, '#FFF6E0', c, c, c - 2);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; px(g, '#6A5A4A', Math.round(c + Math.sin(a) * (c - 4)) - (i % 3 ? 0 : 0), Math.round(c - Math.cos(a) * (c - 4)), 1, 1); }
  const hand = (a: number, len: number, col: string) => line(g, col, Math.round(c), Math.round(c), Math.round(c + Math.sin(a) * len), Math.round(c - Math.cos(a) * len));
  hand(((hour % 12) + minute / 60) / 12 * Math.PI * 2, c * 0.45, '#2A2A36');
  hand((minute / 60) * Math.PI * 2, c * 0.7, '#2A2A36');
  px(g, '#C8553D', Math.round(c), Math.round(c), 1, 1);
  void h;
}

/** Pennant flags on a string, for the square. */
export function paintBunting(g: Ctx, w: number, h: number, seed: number) {
  const cols = ['#E8506A', '#F2C14E', '#7FB070', '#6CB8E0', '#B09AE8', '#FFF2D0'];
  for (let x = 0; x < w; x++) px(g, '#6A5A4A', x, Math.round(1 + Math.sin((x / w) * Math.PI) * 3), 1, 1);
  for (let x = 2, i = seed; x < w - 6; x += 9, i++) {
    const y0 = Math.round(2 + Math.sin(((x + 3) / w) * Math.PI) * 3);
    for (let j = 0; j < 6; j++) px(g, cols[i % cols.length], x + (j >> 1), y0 + j, 6 - (j >> 1) * 2, 1);
  }
  void h;
}

/** A duck seen from the front-ish side. */
export function paintDuck(g: Ctx, w: number, h: number) {
  ellipse(g, '#F2F0E8', 6, h - 4, 5, 3);
  disc(g, '#3E7A4E', 9, h - 9, 2);
  px(g, '#F2C14E', 11, h - 9, 2, 1);
  px(g, '#1E1E2A', 9, h - 10, 1, 1);
  px(g, '#C8C4B8', 2, h - 3, 7, 1);
  void w;
}

/** Fruit, bread, flowers or crafts heaped on a market stall's counter. */
export function paintGoods(g: Ctx, w: number, h: number, kind: string) {
  const r = rng(hash(kind));
  const sets: Record<string, string[]> = {
    fruit: ['#E8506A', '#F2C14E', '#7FB070', '#F28A3A'],
    bread: ['#D8A060', '#C08040', '#E8C890', '#A86A3A'],
    flowers: ['#F29AB8', '#FFFFFF', '#B09AE8', '#F2C14E'],
    crafts: ['#6CB8E0', '#C8553D', '#E8D8B0', '#7A5A9A'],
  };
  const cols = sets[kind] ?? sets.crafts;
  for (let i = 0; i < 4; i++) {
    const bx = 1 + i * ((w - 2) / 4);
    px(g, '#8A6A4A', bx, h - 4, (w - 2) / 4 - 1, 4);
    for (let j = 0; j < 7; j++) px(g, cols[(i + j) % cols.length], bx + ((r() * ((w - 2) / 4 - 3)) | 0), h - 4 - ((r() * 4) | 0), 2, 2);
  }
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


export { mix };
