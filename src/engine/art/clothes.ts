// Painters for every clothing piece, on the 20x26 avatar frame. The body layer (torso, legs,
// shoes and anything strapped across the chest) is painted first so the girl body can narrow
// it; head things (glasses, hats) and hand-held bags go on after.
//
// Layout (guy): collar row 13 at x 7-12, torso rows 14-18 at x 6-13, hips rows 19-20, legs rows
// 21-23 at x 6-8 and 11-13, shoes on row 24. Seated: hips x 5-14, knees row 21, shoes row 22.

import { hexToRgb, luminance, mix, ramp, type RGB } from '../../core/color';
import { parseWorn, wearOf, type Piece, type Wear } from '../../data/clothes';
import { px, type Ctx } from './pixel';

type R = string[];
type View = 'front' | 'back';
type SkirtLen = 'mini' | 'short' | 'midi' | 'maxi';
export type Legs = 'stand' | 'stepA' | 'stepB' | 'sit';

interface Fit { girl: boolean; skin: R; legs: Legs }

interface TopArt {
  sleeves: 'none' | 'short' | 'long';
  /** Sleeve color when it isn't the piece's (a shirt under a vest). */
  sleeve?: string;
  /** Torso color when the piece sits over something (an apron over a shirt). */
  base?: string;
  neck?: 'crew' | 'v' | 'scoop' | 'strap' | 'closed';
  /** Dresses and long coats draw their own skirt and have no bottoms. */
  skirt?: SkirtLen;
  detail?: (g: Ctx, v: View, C: R, f: Fit) => void;
  /** Weave or finish for the HD texture pass (cotton when unset). */
  fabric?: Fabric;
  /** Drawn after the head: high collars and hoods that sit over the neck. */
  collar?: (g: Ctx, v: View, C: R, dy: number) => void;
}

interface BottomArt {
  kind: 'pants' | 'wide' | 'shorts' | SkirtLen;
  fabric?: Fabric;
  detail?: (g: Ctx, v: View, C: R, k: LegSpan) => void;
  /** Painted over the top (overall bibs). */
  over?: (g: Ctx, v: View, C: R) => void;
}

/** The weave the HD pass draws over a piece: ribs, twill, fuzz, sheen and so on. */
export type Fabric = 'cotton' | 'knit' | 'denim' | 'fleece' | 'silk' | 'wool' | 'gloss' | 'quilt' | 'check';

/** The two standing legs: left x, right x, and how much shorter each is mid-step. */
interface LegSpan { l: number; r: number; offL: number; offR: number }

const WHITE = '#F6F2EA';
const isLight = (c: string) => luminance(c) > 0.45;

// ---------- Tops ----------

const TOPS: Record<string, TopArt> = {
  tee: {
    sleeves: 'short',
    detail: (g, v, C) => { if (v === 'front') { px(g, C[1], 8, 13); px(g, C[1], 11, 13); px(g, C[1], 10, 16); } },
  },
  hoodie: {
    fabric: 'fleece', sleeves: 'long',
    detail: (g, v, C) => {
      if (v === 'front') {
        px(g, C[1], 7, 13, 6, 1); px(g, '#F2EEE4', 8, 14, 1, 2); px(g, '#F2EEE4', 11, 14, 1, 2);
        px(g, C[1], 7, 17, 6, 1); px(g, C[0], 7, 18, 6, 1);
      } else { px(g, C[1], 6, 13, 8, 2); px(g, C[0], 7, 15, 6, 1); }
    },
  },
  heart_tee: {
    sleeves: 'short',
    detail: (g, v, C) => {
      if (v !== 'front') return;
      const h = C[2] === '#F2A7C3' ? '#C83A5A' : '#E5566F';
      px(g, h, 8, 15); px(g, h, 10, 15); px(g, h, 8, 16, 3, 1); px(g, h, 9, 17);
    },
  },
  couple_tee: {
    sleeves: 'short',
    // Half a heart each in the deep color: stand side by side and the deep halves meet.
    detail: (g, v, _C, f) => {
      if (v !== 'front') return;
      const [a, b] = f.girl ? ['#F2A7C3', '#D8405A'] : ['#D8405A', '#F2A7C3'];
      px(g, a, 8, 15, 1, 2); px(g, b, 10, 15, 1, 2); px(g, a, 9, 16); px(g, f.girl ? b : a, 9, 17);
    },
  },
  tank: {
    sleeves: 'none', neck: 'strap',
    detail: (g, _v, C) => { for (let x = 6; x < 14; x += 2) px(g, C[1], x, 18); },
  },
  cardigan: {
    fabric: 'knit', sleeves: 'long',
    detail: (g, v, C) => {
      if (v === 'front') {
        px(g, WHITE, 9, 13, 2, 5); px(g, C[1], 8, 13, 1, 5); px(g, '#FFFFFF', 8, 14); px(g, '#FFFFFF', 8, 16);
      }
      px(g, C[1], 6, 17, 8, 1); px(g, WHITE, 7, 18, 6, 1);
    },
  },
  knit: {
    fabric: 'knit', sleeves: 'long',
    detail: (g, _v, C) => {
      for (const x of [7, 10, 12]) for (let y = 14; y < 18; y++) px(g, (y + x) % 2 ? C[1] : C[3], x, y);
      px(g, C[1], 6, 18, 8, 1);
    },
  },
  turtleneck: {
    fabric: 'knit', sleeves: 'long', neck: 'closed',
    detail: (g, _v, C) => { px(g, C[1], 10, 16, 1, 2); },
    collar: (g, _v, C, dy) => { px(g, C[2], 8, 12 + dy, 4, 1); px(g, C[3], 8, 12 + dy); px(g, C[1], 11, 12 + dy); },
  },
  flannel: {
    fabric: 'check', sleeves: 'long',
    detail: (g, v, C) => {
      for (let y = 13; y < 19; y++) for (let x = 6; x < 14; x++) {
        if (x % 3 === 0 && y % 3 === 0) px(g, C[0], x, y);
        else if (x % 3 === 0 || y % 3 === 0) px(g, C[1], x, y);
      }
      if (v === 'front') { px(g, WHITE, 9, 13, 2, 1); for (let y = 14; y < 19; y += 2) px(g, WHITE, 10, y); }
    },
  },
  varsity: {
    fabric: 'wool', sleeves: 'long', sleeve: '#F2EEE4',
    detail: (g, v, C) => {
      px(g, '#F2EEE4', 6, 18, 8, 1); px(g, C[0], 6, 17, 8, 1);
      if (v === 'front') {
        px(g, C[0], 7, 13, 6, 1); px(g, WHITE, 9, 13, 2, 1);
        for (let y = 14; y < 18; y += 2) px(g, '#F2EEE4', 10, y);
        px(g, '#F2EEE4', 7, 15, 2, 2); px(g, C[0], 7, 15);
      } else { px(g, '#F2EEE4', 8, 14, 4, 3); px(g, C[1], 9, 15, 2, 1); }
    },
  },
  denim_jacket: {
    fabric: 'denim', sleeves: 'long',
    detail: (g, v, C) => {
      px(g, C[1], 6, 18, 8, 1);
      if (v === 'front') {
        px(g, WHITE, 9, 13, 2, 5); px(g, C[3], 8, 13); px(g, C[3], 11, 13);
        px(g, C[1], 7, 15, 2, 1); px(g, C[1], 11, 15, 2, 1); px(g, '#C8A040', 8, 16); px(g, '#C8A040', 11, 16);
      } else { px(g, C[1], 6, 15, 8, 1); px(g, C[3], 7, 14, 6, 1); }
    },
  },
  puffer: {
    fabric: 'quilt', sleeves: 'long', neck: 'closed',
    detail: (g, v, C) => {
      for (const y of [14, 16]) px(g, C[3], 6, y, 8, 1);
      for (const y of [15, 17]) px(g, C[1], 6, y, 8, 1);
      if (v === 'front') px(g, C[0], 10, 13, 1, 6);
    },
    collar: (g, _v, C, dy) => { px(g, C[2], 7, 12 + dy, 6, 1); px(g, C[3], 7, 12 + dy, 2, 1); px(g, C[1], 12, 12 + dy); },
  },
  blouse: {
    fabric: 'silk', sleeves: 'long',
    detail: (g, v, C) => {
      if (v === 'front') {
        for (let x = 7; x < 13; x++) px(g, x % 2 ? C[3] : C[1], x, 13);
        px(g, '#E5566F', 9, 14, 2, 1);
        px(g, C[1], 8, 15, 1, 3); px(g, C[1], 11, 15, 1, 3);
      } else px(g, C[1], 7, 13, 6, 1);
    },
  },
  rugby: {
    sleeves: 'long',
    detail: (g, v) => {
      for (const y of [15, 17]) px(g, '#F2EEE4', 6, y, 8, 1);
      if (v === 'front') { px(g, '#FFFFFF', 8, 13); px(g, '#FFFFFF', 11, 13); px(g, '#FFFFFF', 9, 14, 2, 1); }
      else px(g, '#FFFFFF', 7, 13, 6, 1);
    },
  },
  vest: {
    fabric: 'knit', sleeves: 'long', sleeve: '#FAF6EE',
    detail: (g, v, C) => {
      for (let y = 14; y < 18; y++) for (let x = 6; x < 14; x++) {
        if ((x + y) % 4 === 0) px(g, C[1], x, y);
        else if ((x - y + 40) % 4 === 0) px(g, C[3], x, y);
      }
      px(g, C[1], 6, 18, 8, 1);
      if (v === 'front') { px(g, '#FAF6EE', 7, 13); px(g, '#FAF6EE', 12, 13); px(g, C[0], 9, 14, 2, 1); }
    },
  },
  shirt: {
    sleeves: 'long',
    detail: (g, v, C) => {
      if (v === 'front') { px(g, C[3], 8, 13); px(g, C[3], 11, 13); px(g, C[1], 9, 14, 1, 5); px(g, C[4], 9, 15); px(g, C[4], 9, 17); }
      else px(g, C[1], 7, 13, 6, 1);
    },
  },
  blazer: {
    fabric: 'wool', sleeves: 'long',
    detail: (g, v, C) => {
      if (v === 'front') {
        px(g, '#FAF6EE', 9, 13, 2, 3); px(g, C[0], 8, 13, 1, 3); px(g, C[0], 11, 13, 1, 3);
        px(g, C[3], 7, 14); px(g, C[1], 10, 17); px(g, C[0], 9, 16, 1, 3);
      } else { px(g, C[1], 9, 17, 1, 2); px(g, C[3], 7, 13, 6, 1); }
    },
  },
  pj_top: {
    sleeves: 'long',
    detail: (g, v, C) => {
      if (v === 'front') { px(g, '#FFFFFF', 8, 13, 1, 6); px(g, '#FFFFFF', 11, 13, 1, 1); px(g, C[1], 9, 15); px(g, C[1], 9, 17); }
      for (let y = 14; y < 19; y += 3) for (let x = 7; x < 14; x += 4) px(g, '#FFF2B0', x, y);
    },
  },
  apron: {
    sleeves: 'long', base: '#F2EEE4',
    detail: (g, v, C) => {
      if (v === 'front') { px(g, C[2], 7, 14, 6, 7); px(g, C[1], 7, 14, 6, 1); px(g, C[2], 8, 13, 4, 1); px(g, '#E8C878', 9, 17, 2, 1); px(g, C[3], 7, 15, 1, 5); }
      else { px(g, C[2], 6, 18, 8, 1); px(g, C[2], 9, 19, 2, 1); px(g, C[2], 7, 13, 1, 5); px(g, C[2], 12, 13, 1, 5); }
    },
  },
  // Dresses and coats
  sundress: {
    sleeves: 'short', skirt: 'short',
    detail: (g, v, C) => {
      if (v === 'front') { px(g, '#FFFFFF', 8, 13, 4, 1); px(g, C[3], 9, 15); px(g, C[3], 9, 17); }
      px(g, C[1], 6, 18, 8, 1);
      for (let x = 5; x < 15; x += 2) px(g, C[4], x, 21);
    },
  },
  pinafore: {
    sleeves: 'short', sleeve: WHITE, base: WHITE, skirt: 'short',
    detail: (g, v, C) => {
      if (v === 'front') { px(g, C[2], 7, 15, 6, 4); px(g, C[3], 7, 15, 1, 3); px(g, C[2], 7, 13, 1, 2); px(g, C[2], 12, 13, 1, 2); px(g, C[4], 8, 15); px(g, C[4], 11, 15); px(g, C[1], 9, 17, 2, 1); }
      else { px(g, C[2], 7, 13, 1, 6); px(g, C[2], 12, 13, 1, 6); px(g, C[2], 6, 17, 8, 2); }
    },
  },
  maxi: {
    fabric: 'silk', sleeves: 'short', skirt: 'maxi',
    detail: (g, v, C) => {
      const fl = isLight(C[2]) ? ['#E5869A', '#F2C230'] : ['#FFFFFF', '#F2C230'];
      for (let y = 14; y < 24; y++) for (let x = 4; x < 16; x++) if ((x * 3 + y * 5) % 7 === 0 && y !== 18) px(g, fl[(x + y) % 2], x, y);
      px(g, C[1], 6, 18, 8, 1);
      if (v === 'front') px(g, '#FFFFFF', 9, 13, 2, 1);
    },
  },
  slip_dress: {
    fabric: 'silk', sleeves: 'none', neck: 'strap', skirt: 'midi',
    detail: (g, _v, C) => { px(g, C[4], 7, 15, 1, 7); px(g, C[3], 8, 19, 1, 3); px(g, C[1], 6, 18, 8, 1); },
  },
  raincoat: {
    fabric: 'gloss', sleeves: 'long', skirt: 'short',
    detail: (g, v, C) => {
      if (v === 'front') { for (let y = 14; y < 21; y += 2) px(g, C[0], 10, y); px(g, C[1], 9, 13, 1, 9); px(g, C[3], 6, 17, 2, 1); px(g, C[3], 12, 17, 2, 1); }
      else px(g, C[1], 6, 13, 8, 2);
    },
  },
};

// ---------- Bottoms ----------

const BOTTOMS: Record<string, BottomArt> = {
  jeans: { fabric: 'denim', kind: 'pants', detail: (g, v, C, k) => { px(g, C[3], k.l, 23 + k.offL, 3, 1); px(g, C[3], k.r, 23 + k.offR, 3, 1); if (v === 'front') px(g, C[1], 9, 19, 1, 2); } },
  joggers: { fabric: 'fleece', kind: 'pants', detail: (g, v, C, k) => { px(g, C[1], k.l, 23 + k.offL, 3, 1); px(g, C[1], k.r, 23 + k.offR, 3, 1); px(g, C[1], 6, 19, 8, 1); if (v === 'front') { px(g, '#FFFFFF', 9, 19); px(g, '#FFFFFF', 10, 20); } } },
  wide_jeans: { fabric: 'denim', kind: 'wide', detail: (g, _v, C) => { px(g, C[3], 7, 19, 1, 2); } },
  cargo: { kind: 'pants', detail: (g, _v, C, k) => { px(g, C[1], k.l, 21, 1, 2); px(g, C[3], k.l, 21); px(g, C[0], k.r + 2, 21, 1, 2); px(g, C[1], 6, 19, 8, 1); } },
  slacks: { fabric: 'wool', kind: 'pants', detail: (g, v, C, k) => { px(g, C[3], k.l + 1, 21, 1, 3 + k.offL); px(g, C[3], k.r + 1, 21, 1, 3 + k.offR); px(g, C[0], 6, 19, 8, 1); if (v === 'front') px(g, '#C8A040', 9, 19); } },
  shorts: { fabric: 'denim', kind: 'shorts', detail: (g, _v, C, k) => { px(g, C[3], k.l, 21, 3, 1); px(g, C[3], k.r, 21, 3, 1); } },
  mini_skirt: { fabric: 'wool', kind: 'mini', detail: (g, _v, C) => { for (const x of [6, 8, 10, 12]) px(g, C[1], x, 20, 1, 2); px(g, C[1], 6, 19, 8, 1); } },
  midi_skirt: { fabric: 'silk', kind: 'midi', detail: (g, _v, C) => { px(g, C[1], 8, 20, 1, 2); px(g, C[1], 11, 20, 1, 2); } },
  overalls: {
    fabric: 'denim', kind: 'pants',
    detail: (g, v, C) => { if (v === 'front') px(g, C[1], 6, 20, 2, 1); },
    over: (g, v, C) => {
      if (v === 'front') { px(g, C[2], 8, 15, 4, 4); px(g, C[2], 7, 13, 1, 2); px(g, C[2], 12, 13, 1, 2); px(g, '#F2D56A', 7, 15); px(g, '#F2D56A', 12, 15); px(g, C[1], 9, 16, 2, 1); px(g, C[3], 8, 15); }
      else { px(g, C[2], 7, 13, 1, 6); px(g, C[2], 12, 13, 1, 6); px(g, C[2], 6, 18, 8, 1); }
    },
  },
  pj_pants: { kind: 'pants', detail: (g, _v, _C, k) => { px(g, '#FFFFFF', k.l, 23 + k.offL, 3, 1); px(g, '#FFFFFF', k.r, 23 + k.offR, 3, 1); px(g, '#FFF2B0', 7, 20); px(g, '#FFF2B0', 12, 22); } },
};

// ---------- Painting ----------

export interface Dressed {
  top: { art: TopArt; C: R; piece: Piece };
  bottom: { art: BottomArt; C: R } | null;
  shoes: { key: string; C: R };
  hat: { key: string; C: R } | null;
  face: { key: string; C: R } | null;
  bag: { key: string; C: R } | null;
}

export function dress(look: { wear?: Wear; outfit?: string; accessory?: string }): Dressed {
  const w = wearOf(look);
  const get = (s: keyof Wear) => { const p = parseWorn(w[s]); return p ? { key: p.piece.key, C: ramp(p.piece.colors[p.color]), piece: p.piece } : null; };
  const t = get('top')!, b = get('bottom');
  return {
    top: { art: TOPS[t.key] ?? TOPS.tee, C: t.C, piece: t.piece },
    bottom: b ? { art: BOTTOMS[b.key] ?? BOTTOMS.jeans, C: b.C } : null,
    shoes: get('shoes')!, hat: get('hat'), face: get('face'), bag: get('bag'),
  };
}

/** Sleeve colors and where along the arm skin starts (1 = full sleeve). */
export function sleeveOf(d: Dressed): { C: R; bare: number } {
  const a = d.top.art;
  return { C: a.sleeve ? ramp(a.sleeve) : d.top.C, bare: a.sleeves === 'long' ? 1 : a.sleeves === 'short' ? 0.42 : 0 };
}

function skirtShape(g: Ctx, C: R, len: SkirtLen, skin: R, k: LegSpan) {
  const hem = { mini: 21, short: 21, midi: 22, maxi: 23 }[len];
  px(g, C[2], 6, 19, 8, 1);
  px(g, C[2], 5, 20, 10, hem - 19);
  if (len === 'maxi') { px(g, C[2], 4, 22, 12, 2); px(g, C[3], 4, 22, 1, 2); }
  px(g, C[1], len === 'maxi' ? 4 : 5, hem, len === 'maxi' ? 12 : 10, 1);
  px(g, C[3], 6, 19, 2, Math.min(2, hem - 19));
  px(g, C[1], 14, 20, 1, hem - 20);
  // Bare legs below the hem.
  for (const [x, off] of [[k.l + 1, k.offL], [k.r, k.offR]] as const) {
    const h = 23 + off - hem;
    if (h > 0) { px(g, skin[2], x, hem + 1, 2, h); px(g, skin[1], x + 1, hem + 1, 1, h); }
  }
}

function pants(g: Ctx, C: R, kind: BottomArt['kind'], skin: R, k: LegSpan) {
  px(g, C[2], 6, 19, 8, 2);
  px(g, C[3], 6, 19, 2, 1);
  px(g, C[1], 13, 19, 1, 2);
  if (kind === 'wide') {
    for (const [x, off, dir] of [[k.l, k.offL, -1], [k.r, k.offR, 1]] as const) {
      px(g, C[2], x, 21, 4, 3 + off);
      px(g, C[2], dir < 0 ? x - 1 : x + 3, 23 + off, 2, 1);
    }
    px(g, C[1], 9, 21, 1, 3); px(g, C[3], 6, 21, 1, 2); px(g, C[1], 13, 21, 1, 3);
    return;
  }
  for (const [x, off] of [[k.l, k.offL], [k.r, k.offR]] as const) {
    px(g, C[2], x, 21, 3, 3 + off);
    px(g, C[1], x + 2, 21, 1, 3 + off);
    if (kind === 'shorts') { px(g, skin[2], x, 22, 3, 2 + off); px(g, skin[1], x + 2, 22, 1, 2 + off); }
  }
}

function shoe(g: Ctx, key: string, C: R, v: View, x: number, y: number, bareLeg: boolean) {
  const dark = !isLight(C[2]);
  if (v === 'back') {
    if (key === 'boots' || key === 'rainboots') px(g, C[1], x + 1, y - (key === 'rainboots' ? 3 : 2), 3, key === 'rainboots' ? 3 : 2);
    px(g, C[1], x + 1, y, 3, 1); px(g, C[2], x + 1, y);
    if (key === 'chunky') px(g, '#D8D4DC', x + 1, y, 3, 1);
    return;
  }
  switch (key) {
    case 'chunky':
      px(g, C[2], x, y - 1, 4, 1); px(g, C[3], x, y - 1);
      px(g, dark ? '#E8E4EA' : '#C8C4CE', x, y, 4, 1);
      break;
    case 'boots':
      px(g, C[2], x + 1, y - 2, 3, 2); px(g, C[1], x + 3, y - 2, 1, 2); px(g, C[4], x + 2, y - 2);
      px(g, C[2], x, y, 4, 1); px(g, C[3], x, y); px(g, C[0], x + 3, y);
      break;
    case 'rainboots':
      px(g, C[2], x + 1, y - 3, 3, 3); px(g, C[4], x + 1, y - 3, 1, 3); px(g, C[1], x + 3, y - 3, 1, 3);
      px(g, C[2], x, y, 4, 1); px(g, C[1], x + 3, y);
      break;
    case 'maryjanes':
      if (bareLeg) px(g, '#FAF6EE', x + 1, y - 1, 2, 1);
      px(g, C[2], x, y, 4, 1); px(g, C[4], x + 1, y); px(g, C[1], x + 1, y - 1);
      break;
    case 'loafers':
      px(g, C[2], x, y, 4, 1); px(g, C[4], x + 1, y); px(g, C[0], x + 3, y);
      break;
    case 'slippers':
      px(g, C[2], x - 1, y, 5, 1); px(g, C[4], x - 1, y); px(g, C[3], x, y - 1, 2, 1);
      break;
    default: // sneakers
      px(g, C[2], x, y, 4, 1); px(g, C[3], x, y); px(g, dark ? '#F2EEE4' : C[0], x + 3, y);
  }
}

/** Torso, skirt or legs, shoes, and everything on the chest: the layer the girl body narrows. */
export function paintBody(g: Ctx, d: Dressed, f: Fit, v: View) {
  const t = d.top.art;
  const T = t.base ? ramp(t.base) : d.top.C;
  const skin = f.skin;
  // Torso: rows 13-18.
  px(g, T[2], 7, 13, 6, 1);
  px(g, T[2], 6, 14, 8, 5);
  px(g, T[3], 6, 14, 1, 3);
  px(g, T[1], 13, 14, 1, 5);
  px(g, T[1], 6, 18, 8, 1);
  const neck = t.neck ?? 'crew';
  if (neck === 'strap') { px(g, skin[2], 7, 13, 6, 1); px(g, T[2], 8, 13); px(g, T[2], 11, 13); if (v === 'front') px(g, skin[1], 9, 14, 2, 1); }
  else if (v === 'front' && neck !== 'closed') px(g, skin[2], 9, 13, 2, 1);

  const sitting = f.legs === 'sit';
  const k: LegSpan = { l: 6, r: 11, offL: f.legs === 'stepA' ? -1 : 0, offR: f.legs === 'stepB' ? -1 : 0 };
  const skirt = t.skirt ?? (d.bottom && d.bottom.art.kind !== 'pants' && d.bottom.art.kind !== 'wide' && d.bottom.art.kind !== 'shorts' ? d.bottom.art.kind as SkirtLen : null);
  const L = t.skirt ? d.top.C : d.bottom?.C ?? T;
  const S = d.shoes;
  if (sitting) {
    px(g, L[2], 5, 19, 10, 2);
    px(g, L[1], 5, 20, 10, 1);
    px(g, L[3], 6, 19, 3, 1);
    const bare = (skirt && skirt !== 'maxi') || d.bottom?.art.kind === 'shorts';
    const knee = bare ? skin : L;
    px(g, knee[2], 6, 21, 3, 1); px(g, knee[2], 11, 21, 3, 1);
    if (S.key === 'boots' || S.key === 'rainboots') { px(g, S.C[1], 6, 21, 3, 1); px(g, S.C[1], 11, 21, 3, 1); }
    px(g, S.C[2], 5, 22, 4, 1); px(g, S.C[2], 11, 22, 4, 1);
    px(g, S.C[3], 5, 22); px(g, S.C[3], 11, 22);
  } else {
    if (skirt) skirtShape(g, L, skirt, skin, k);
    else if (d.bottom) pants(g, L, d.bottom.art.kind, skin, k);
    // Prints and pockets on the legs, then shoes over the hems (boots cover the cuffs).
    if (d.bottom && !t.skirt) d.bottom.art.detail?.(g, v, d.bottom.C, k);
    const bare = !!skirt && skirt !== 'maxi';
    for (const [x, off] of [[5, k.offL], [10, k.offR]] as const) shoe(g, S.key, S.C, v, x, 24 + off, bare);
  }
  t.detail?.(g, v, d.top.C, f);
  if (d.bottom && !t.skirt) d.bottom.art.over?.(g, v, d.bottom.C);
  // Straps across the chest.
  if (d.bag?.key === 'backpack' && v === 'front') { px(g, d.bag.C[1], 8, 13, 1, 4); px(g, d.bag.C[1], 11, 13, 1, 4); }
  if (d.bag?.key === 'crossbody') {
    const s = d.bag.C[0];
    for (let i = 0; i < 6; i++) px(g, s, v === 'front' ? 11 - i : 8 + i, 13 + i);
  }
}

/** Bags hang beside the body, under the arms. */
export function paintBag(g: Ctx, d: Dressed, v: View) {
  if (!d.bag) return;
  const C = d.bag.C;
  switch (d.bag.key) {
    case 'tote':
      px(g, C[0], 3, 16, 1, 2); px(g, C[0], 5, 16, 1, 1);
      px(g, C[2], 2, 18, 4, 4); px(g, C[3], 2, 18, 1, 4); px(g, C[1], 2, 21, 4, 1); px(g, C[1], 3, 19, 2, 1);
      break;
    case 'crossbody':
      if (v === 'front') { px(g, C[2], 4, 18, 3, 3); px(g, C[1], 4, 18, 3, 1); px(g, C[3], 4, 19, 1, 2); px(g, '#D9B04A', 5, 19); }
      break;
    case 'backpack':
      if (v === 'back') {
        px(g, C[2], 7, 14, 6, 6); px(g, C[3], 7, 14, 6, 2); px(g, C[4], 8, 14, 2, 1);
        px(g, C[1], 8, 17, 4, 2); px(g, C[0], 7, 19, 6, 1); px(g, '#D9B04A', 10, 16);
      }
      break;
  }
}

/** Drawn after the head (high collars). */
export function paintCollar(g: Ctx, d: Dressed, v: View, dy: number) {
  d.top.art.collar?.(g, v, d.top.C, dy);
}

/** Glasses, then hats, over the hair. */
export function paintHeadwear(g: Ctx, d: Dressed, v: View, dy: number) {
  if (d.face && v === 'front') {
    const C = d.face.C;
    const fr = d.face.key === 'glasses' ? C[1] : C[0];
    switch (d.face.key) {
      case 'glasses':
        for (const x of [5, 9]) { px(g, fr, x, 7 + dy, 3, 1); px(g, fr, x, 10 + dy, 3, 1); px(g, fr, x, 8 + dy, 1, 2); px(g, fr, x + 2, 8 + dy, 1, 2); }
        px(g, fr, 8, 8 + dy); px(g, fr, 12, 8 + dy, 3, 1);
        break;
      case 'sunglasses': {
        const lens = d.face.C[2] === '#2E2A33' ? '#2A2430' : mix(C[2], '#2A2430', 0.55);
        for (const x of [5, 9]) { px(g, lens, x, 8 + dy, 3, 2); px(g, mix(lens, '#FFFFFF', 0.35), x, 8 + dy); }
        px(g, C[1], 5, 7 + dy, 7, 1); px(g, C[1], 8, 8 + dy); px(g, C[1], 12, 8 + dy, 3, 1);
        break;
      }
      case 'heart_glasses':
        for (const x of [5, 9]) { px(g, C[2], x, 8 + dy); px(g, C[2], x + 2, 8 + dy); px(g, C[2], x, 9 + dy, 3, 1); px(g, C[2], x + 1, 10 + dy); px(g, C[4], x, 8 + dy); }
        px(g, C[0], 8, 9 + dy); px(g, C[0], 12, 8 + dy, 3, 1);
        break;
    }
  }
  if (!d.hat) return;
  const C = d.hat.C;
  switch (d.hat.key) {
    case 'beanie':
      px(g, C[2], 3, 2 + dy, 14, 4); px(g, C[3], 4, 1 + dy, 12, 1); px(g, C[1], 3, 5 + dy, 14, 1);
      for (let x = 3; x < 17; x += 2) px(g, C[1], x, 3 + dy, 1, 2);
      px(g, mix(C[2], '#FFFFFF', 0.7), 8, dy, 4, 2); px(g, '#FFFFFF', 8, dy);
      break;
    case 'cap':
      px(g, C[2], 3, 2 + dy, 13, 3); px(g, C[3], 5, 1 + dy, 9, 1); px(g, C[1], 3, 4 + dy, 13, 1);
      if (v === 'front') { px(g, C[1], 0, 5 + dy, 7, 1); px(g, C[2], 1, 4 + dy, 5, 1); }
      else px(g, C[1], 7, 5 + dy, 6, 1);
      px(g, isLight(C[2]) ? '#4A6A9A' : '#F2EEE4', 9, 2 + dy, 2, 1);
      break;
    case 'bucket':
      px(g, C[2], 4, 1 + dy, 12, 4); px(g, C[3], 5, 1 + dy, 5, 1); px(g, C[1], 4, 4 + dy, 12, 1);
      px(g, C[2], 2, 5 + dy, 16, 1); px(g, C[3], 2, 5 + dy, 4, 1); px(g, C[1], 2, 6 + dy, 2, 1); px(g, C[1], 16, 6 + dy, 2, 1);
      break;
    case 'beret':
      px(g, C[2], 4, 1 + dy, 12, 3); px(g, C[3], 5, 1 + dy, 5, 1); px(g, C[1], 4, 3 + dy, 12, 1);
      px(g, C[2], 15, 2 + dy, 2, 2); px(g, C[1], 16, 3 + dy); px(g, C[0], 9, dy);
      break;
    case 'sunhat': {
      const ribbon = C[2] === '#F2A7C3' ? '#C83A5A' : '#E5869A';
      px(g, C[2], 5, dy, 10, 4); px(g, C[3], 6, dy, 4, 1);
      for (let x = 6; x < 14; x += 3) px(g, C[1], x, 1 + dy);
      px(g, ribbon, 5, 3 + dy, 10, 1);
      px(g, C[2], 0, 4 + dy, 20, 1); px(g, C[3], 1, 4 + dy, 6, 1); px(g, C[1], 0, 5 + dy, 3, 1); px(g, C[1], 17, 5 + dy, 3, 1);
      break;
    }
    case 'bow':
      px(g, C[2], 11, dy, 3, 3); px(g, C[2], 15, dy, 3, 3); px(g, C[1], 14, 1 + dy); px(g, C[3], 11, dy); px(g, C[3], 15, dy);
      px(g, C[1], 13, 3 + dy); px(g, C[1], 15, 3 + dy);
      break;
    case 'flower': {
      const mid = C[2] === '#F2D98A' ? '#E8804A' : '#F2C230';
      px(g, C[2], 13, 4 + dy, 3, 3); px(g, C[2], 14, 3 + dy); px(g, C[4], 13, 4 + dy); px(g, mid, 14, 5 + dy); px(g, C[1], 15, 6 + dy);
      break;
    }
    case 'claw_clip':
      if (v === 'back') { px(g, C[2], 7, 3 + dy, 6, 3); px(g, C[3], 7, 3 + dy, 6, 1); for (let x = 7; x < 13; x += 2) px(g, C[0], x, 5 + dy); }
      else { px(g, C[2], 13, 1 + dy, 3, 2); px(g, C[3], 13, 1 + dy); }
      break;
    case 'headphones':
      px(g, C[2], 4, 1 + dy, 12, 1); px(g, C[3], 6, 1 + dy, 4, 1); px(g, C[2], 3, 2 + dy, 1, 4); px(g, C[2], 16, 2 + dy, 1, 4);
      px(g, C[1], 2, 6 + dy, 2, 4); px(g, C[1], 16, 6 + dy, 2, 4); px(g, C[3], 2, 6 + dy); px(g, C[3], 16, 6 + dy);
      break;
    case 'cat_ears':
      for (const x of [4, 13]) { px(g, C[2], x, 1 + dy, 3, 2); px(g, C[2], x + 1, dy); px(g, C[3], x, 1 + dy); px(g, '#F2A7C3', x + 1, 2 + dy); }
      px(g, C[0], 4, 3 + dy, 12, 1);
      break;
  }
}

// ---------- HD detail ----------
// After the body layer is doubled to the HD frame (40 wide, x = 2 * small x), this pass adds
// what the small frame has no room for: the weave of each fabric, seams, stitching, buttons,
// pockets, pleats and soles. Every mark is only drawn over the piece's own colors, so skin,
// bags and prints underneath are never painted over.

/** Small-to-HD row mapping for this frame (includes the body's bob). */
type RowMap = (smallY: number) => number;

const noise = (x: number, y: number) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 997;

export function paintFabricHD(g: Ctx, d: Dressed, f: Fit, v: View, Y: RowMap) {
  const W = 40, H = 60;
  const img = g.getImageData(0, 0, W, H);
  const data = img.data;
  const t = d.top.art;
  const T = t.base ? ramp(t.base) : d.top.C;
  const L = t.skirt ? d.top.C : d.bottom?.C ?? T;
  const S = d.shoes.C;
  const rgb = (r: R) => r.map(hexToRgb);
  const Trgb = rgb(T), Crgb = rgb(d.top.C), Lrgb = rgb(L), Srgb = rgb(S);
  /** Which tone of ramp r the pixel at (x, y) is, or -1. */
  const tone = (x: number, y: number, r: RGB[]) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return -1;
    const i = (y * W + x) * 4;
    if (data[i + 3] === 0) return -1;
    for (let k = 0; k < r.length; k++) if (data[i] === r[k][0] && data[i + 1] === r[k][1] && data[i + 2] === r[k][2]) return k;
    return -1;
  };
  const put = (x: number, y: number, c: string) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4, [r, gg, b] = hexToRgb(c);
    data[i] = r; data[i + 1] = gg; data[i + 2] = b;
  };
  /** Paint c at (x, y) only where the pixel is one of ramp r's tones. */
  const on = (r: RGB[], x: number, y: number, c: string) => { if (tone(x, y, r) >= 0) put(x, y, c); };
  const sitting = f.legs === 'sit';
  const waist = Y(19);
  const dressed = !!t.skirt;

  // 1. Weave, over the base and lit tones of each piece.
  const weave = (fab: Fabric, C: R, r: RGB[], y0: number, y1: number) => {
    for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
      const k = tone(x, y, r);
      if (k < 1 || k > 3) continue;
      const n = noise(x, y);
      const up = C[Math.min(4, k + 1)], down = C[k - 1];
      switch (fab) {
        case 'knit':
          if (x % 3 === 1) put(x, y, mix(C[k], down, 0.45));
          else if (x % 3 === 2 && y % 2 === 0) put(x, y, mix(C[k], up, 0.3));
          break;
        case 'denim':
          if ((x + y) % 4 === 0) put(x, y, mix(C[k], luminance(C[2]) > 0.6 ? down : up, 0.35));
          break;
        case 'fleece':
          if (n % 7 === 0) put(x, y, mix(C[k], up, 0.4));
          break;
        case 'silk':
          if ((x * 2 + y) % 13 < 2 && k >= 2) put(x, y, mix(C[k], C[4], 0.45));
          break;
        case 'wool':
          if (n % 5 === 0) put(x, y, mix(C[k], down, 0.3));
          else if (n % 5 === 1) put(x, y, mix(C[k], up, 0.25));
          break;
        case 'gloss':
          if (k >= 2 && (x === 14 || x === 15) && y % 7 < 4) put(x, y, mix(C[k], '#FFFFFF', 0.4));
          break;
        case 'quilt':
          if (k === 3 && x % 6 === 2) put(x, y, C[4]);
          break;
        case 'check':
          if ((x + y) % 2 === 0) put(x, y, mix(C[k], up, 0.18));
          break;
      }
    }
  };
  const topEnd = dressed ? H : waist;
  weave(t.fabric ?? 'cotton', T, Trgb, 0, topEnd);
  if (t.base) weave(t.fabric ?? 'cotton', d.top.C, Crgb, 0, topEnd);
  if (!dressed && d.bottom) weave(d.bottom.art.fabric ?? 'cotton', L, Lrgb, waist, H);

  const key = d.top.piece.key;
  const crease = mix(T[2], T[1], 0.6);
  if (v === 'front') {
    // 2. Folds where the sleeves meet the body, and a soft drape under the chest.
    const c0 = Y(14);
    for (const [x, dx] of [[13, 1], [26, -1]] as const) { on(Trgb, x, c0 + 2, crease); on(Trgb, x + dx, c0 + 3, crease); on(Trgb, x + dx * 2, c0 + 5, crease); }
    // 3. Fronts: plackets and buttons, pockets, zips.
    const button = (x: number, y: number, c: string) => { on(Trgb, x, y, c); on(Crgb, x, y, c); on(Trgb, x, y + 1, mix(c, '#24161A', 0.5)); on(Crgb, x, y + 1, mix(c, '#24161A', 0.5)); };
    if (['shirt', 'flannel', 'pj_top', 'blouse', 'raincoat'].includes(key)) {
      for (let y = Y(14); y < (dressed ? Y(21) : Y(18) + 1); y++) { on(Trgb, 19, y, mix(T[2], T[1], 0.5)); on(Crgb, 19, y, mix(d.top.C[2], d.top.C[1], 0.5)); }
      for (let y = Y(14) + 2; y < (dressed ? Y(21) : Y(18)); y += 4) button(20, y, key === 'raincoat' ? '#F2EEE4' : '#FFFFFF');
    }
    if (key === 'cardigan') for (let y = Y(14) + 1; y < Y(18); y += 4) { put(16, y, '#FFFFFF'); put(16, y + 1, mix(T[1], '#FFFFFF', 0.3)); }
    if (key === 'hoodie') {
      // Kangaroo pocket and the drawstring tips.
      const py = Y(16) + 1;
      for (let x = 15; x <= 24; x++) on(Trgb, x, py, T[1]);
      for (let k = 1; k <= 4; k++) { on(Trgb, 15 - (k >> 1), py + k, T[1]); on(Trgb, 24 + (k >> 1), py + k, T[1]); }
      put(16, Y(15) + 1, '#C8C2B8'); put(22, Y(15) + 1, '#C8C2B8');
    }
    if (key === 'denim_jacket') {
      for (let x = 13; x <= 26; x += 2) on(Trgb, x, Y(18), '#D9A04A');
      for (const x0 of [14, 22]) { for (let x = x0; x < x0 + 4; x += 2) on(Trgb, x, Y(15) + 2, '#D9A04A'); }
    }
    if (key === 'blazer') {
      for (let k = 0; k < 4; k++) { on(Trgb, 17 - k, Y(14) + k * 2, T[0]); on(Trgb, 22 + k, Y(14) + k * 2, T[0]); }
      for (let x = 22; x <= 25; x++) on(Trgb, x, Y(17), T[0]);
      button(19, Y(17) - 1, mix(T[2], '#24161A', 0.5));
    }
    if (key === 'puffer') for (let y = Y(14); y < Y(18) + 2; y += 2) on(Trgb, 21, y, '#D8D4DC');
    if (key === 'varsity') for (let y = Y(14) + 1; y < Y(18); y += 4) put(21, y, '#F2EEE4');
    if (['tee', 'heart_tee', 'couple_tee', 'rugby', 'sundress', 'maxi'].includes(key)) {
      // Rib along the neckline.
      for (let x = 15; x <= 24; x++) on(Trgb, x, Y(13) + 1, mix(T[2], T[1], 0.45));
    }
  }

  // 4. Bottoms: waistband, fly, pockets, stitching, pleats, cuffs.
  const bk = d.bottom && !dressed ? Object.entries(BOTTOMS).find(([, a]) => a === d.bottom!.art)?.[0] : null;
  const band = mix(L[1], L[0], 0.3);
  if (bk && !sitting) {
    const kind = d.bottom!.art.kind;
    const pantsLike = kind === 'pants' || kind === 'wide' || kind === 'shorts';
    if (pantsLike) for (let x = 11; x <= 28; x++) on(Lrgb, x, waist + 2, band);
    const stitch = mix(L[2], '#E0A848', 0.55);
    if (bk === 'jeans' || bk === 'wide_jeans' || bk === 'shorts' || bk === 'overalls') {
      if (v === 'front') {
        for (let y = waist + 3; y < Y(21); y++) on(Lrgb, 20, y, L[1]);
        on(Lrgb, 20, waist + 1, '#C8A040');
        // Scooped front pockets.
        for (let k = 0; k < 3; k++) { on(Lrgb, 14 + k, waist + 3 + k, L[1]); on(Lrgb, 25 - k, waist + 3 + k, L[1]); }
      } else {
        for (const x0 of [13, 22]) {
          for (let x = x0; x < x0 + 5; x++) on(Lrgb, x, waist + 3, L[1]);
          for (let y = waist + 3; y < waist + 7; y++) { on(Lrgb, x0, y, L[1]); on(Lrgb, x0 + 4, y, L[1]); }
          for (let x = x0 + 1; x < x0 + 4; x += 2) on(Lrgb, x, waist + 5, stitch);
        }
      }
      // Gold side-seam stitching down the outside of each leg.
      for (let y = Y(21); y < H; y += 2) { on(Lrgb, 12, y, stitch); on(Lrgb, 27, y, stitch); }
    }
    if (bk === 'cargo') for (const x0 of [12, 25]) {
      for (let x = x0; x < x0 + 3; x++) on(Lrgb, x, Y(21) + 1, L[0]);
      for (let y = Y(21) + 2; y < Y(21) + 6; y++) on(Lrgb, x0 + 1, y, L[1]);
    }
    if (bk === 'slacks') { for (let x = 11; x <= 28; x++) on(Lrgb, x, waist + 1, '#3A2A2A'); on(Lrgb, 19, waist + 1, '#C8A040'); on(Lrgb, 20, waist + 1, '#C8A040'); }
    if (bk === 'joggers') for (let x = 10; x < 30; x++) for (let y = Y(23) - 2; y < Y(24); y++) if (x % 2 === 0) on(Lrgb, x, y, L[1]);
    if (bk === 'mini_skirt' || bk === 'midi_skirt') {
      for (let x = 12; x <= 28; x += 3) for (let y = waist + 3; y < H; y++) if ((y + x) % 5 !== 0) on(Lrgb, x, y, mix(L[2], L[1], 0.55));
    }
  }
  if (dressed && !sitting) {
    // Gathers in the skirt of a dress or the drape of a coat.
    for (let x = 11; x <= 29; x += 4) for (let y = waist + 2; y < H; y++) on(Crgb, x, y, mix(d.top.C[2], d.top.C[1], 0.5));
  }

  // 5. Shoes: a sole along the bottom edge of each shoe and laces on sneakers.
  const soleLight = S[2] && !isLight(S[2]) && (d.shoes.key === 'sneakers' || d.shoes.key === 'chunky');
  for (let x = 0; x < W; x++) {
    let bottom = -1;
    for (let y = H - 1; y >= Y(20); y--) if (tone(x, y, Srgb) >= 0) { bottom = y; break; }
    if (bottom < 0) continue;
    put(x, bottom, soleLight ? '#F2EEE4' : mix(S[0], '#24161A', 0.4));
    if (d.shoes.key === 'sneakers' && v === 'front' && x % 2 === 1 && tone(x, bottom - 1, Srgb) >= 2) put(x, bottom - 1, mix(S[2], '#FFFFFF', 0.6));
    if ((d.shoes.key === 'loafers' || d.shoes.key === 'maryjanes' || d.shoes.key === 'boots') && tone(x, bottom - 1, Srgb) === 4) put(x, bottom - 1, '#FFFFFF');
  }

  g.putImageData(img, 0, 0);
}
