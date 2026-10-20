// Painters for every clothing piece, on the 20x26 avatar frame. The body layer (torso, legs,
// shoes and anything strapped across the chest) is painted first so the girl body can narrow
// it; head things (glasses, hats) and hand-held bags go on after.
//
// Layout (guy): collar row 13 at x 7-12, torso rows 14-18 at x 6-13, hips rows 19-20, legs rows
// 21-23 at x 6-8 and 11-13, shoes on row 24. Seated: hips x 5-14, knees row 21, shoes row 22.

import { luminance, mix, ramp } from '../../core/color';
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
  /** Drawn after the head: high collars and hoods that sit over the neck. */
  collar?: (g: Ctx, v: View, C: R, dy: number) => void;
}

interface BottomArt {
  kind: 'pants' | 'wide' | 'shorts' | SkirtLen;
  detail?: (g: Ctx, v: View, C: R, k: LegSpan) => void;
  /** Painted over the top (overall bibs). */
  over?: (g: Ctx, v: View, C: R) => void;
}

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
    sleeves: 'long',
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
    sleeves: 'long',
    detail: (g, v, C) => {
      if (v === 'front') {
        px(g, WHITE, 9, 13, 2, 5); px(g, C[1], 8, 13, 1, 5); px(g, '#FFFFFF', 8, 14); px(g, '#FFFFFF', 8, 16);
      }
      px(g, C[1], 6, 17, 8, 1); px(g, WHITE, 7, 18, 6, 1);
    },
  },
  knit: {
    sleeves: 'long',
    detail: (g, _v, C) => {
      for (const x of [7, 10, 12]) for (let y = 14; y < 18; y++) px(g, (y + x) % 2 ? C[1] : C[3], x, y);
      px(g, C[1], 6, 18, 8, 1);
    },
  },
  turtleneck: {
    sleeves: 'long', neck: 'closed',
    detail: (g, _v, C) => { px(g, C[1], 10, 16, 1, 2); },
    collar: (g, _v, C, dy) => { px(g, C[2], 8, 12 + dy, 4, 1); px(g, C[3], 8, 12 + dy); px(g, C[1], 11, 12 + dy); },
  },
  flannel: {
    sleeves: 'long',
    detail: (g, v, C) => {
      for (let y = 13; y < 19; y++) for (let x = 6; x < 14; x++) {
        if (x % 3 === 0 && y % 3 === 0) px(g, C[0], x, y);
        else if (x % 3 === 0 || y % 3 === 0) px(g, C[1], x, y);
      }
      if (v === 'front') { px(g, WHITE, 9, 13, 2, 1); for (let y = 14; y < 19; y += 2) px(g, WHITE, 10, y); }
    },
  },
  varsity: {
    sleeves: 'long', sleeve: '#F2EEE4',
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
    sleeves: 'long',
    detail: (g, v, C) => {
      px(g, C[1], 6, 18, 8, 1);
      if (v === 'front') {
        px(g, WHITE, 9, 13, 2, 5); px(g, C[3], 8, 13); px(g, C[3], 11, 13);
        px(g, C[1], 7, 15, 2, 1); px(g, C[1], 11, 15, 2, 1); px(g, '#C8A040', 8, 16); px(g, '#C8A040', 11, 16);
      } else { px(g, C[1], 6, 15, 8, 1); px(g, C[3], 7, 14, 6, 1); }
    },
  },
  puffer: {
    sleeves: 'long', neck: 'closed',
    detail: (g, v, C) => {
      for (const y of [14, 16]) px(g, C[3], 6, y, 8, 1);
      for (const y of [15, 17]) px(g, C[1], 6, y, 8, 1);
      if (v === 'front') px(g, C[0], 10, 13, 1, 6);
    },
    collar: (g, _v, C, dy) => { px(g, C[2], 7, 12 + dy, 6, 1); px(g, C[3], 7, 12 + dy, 2, 1); px(g, C[1], 12, 12 + dy); },
  },
  blouse: {
    sleeves: 'long',
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
    sleeves: 'long', sleeve: '#FAF6EE',
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
    sleeves: 'long',
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
    sleeves: 'short', skirt: 'maxi',
    detail: (g, v, C) => {
      const fl = isLight(C[2]) ? ['#E5869A', '#F2C230'] : ['#FFFFFF', '#F2C230'];
      for (let y = 14; y < 24; y++) for (let x = 4; x < 16; x++) if ((x * 3 + y * 5) % 7 === 0 && y !== 18) px(g, fl[(x + y) % 2], x, y);
      px(g, C[1], 6, 18, 8, 1);
      if (v === 'front') px(g, '#FFFFFF', 9, 13, 2, 1);
    },
  },
  slip_dress: {
    sleeves: 'none', neck: 'strap', skirt: 'midi',
    detail: (g, _v, C) => { px(g, C[4], 7, 15, 1, 7); px(g, C[3], 8, 19, 1, 3); px(g, C[1], 6, 18, 8, 1); },
  },
  raincoat: {
    sleeves: 'long', skirt: 'short',
    detail: (g, v, C) => {
      if (v === 'front') { for (let y = 14; y < 21; y += 2) px(g, C[0], 10, y); px(g, C[1], 9, 13, 1, 9); px(g, C[3], 6, 17, 2, 1); px(g, C[3], 12, 17, 2, 1); }
      else px(g, C[1], 6, 13, 8, 2);
    },
  },
};

// ---------- Bottoms ----------

const BOTTOMS: Record<string, BottomArt> = {
  jeans: { kind: 'pants', detail: (g, v, C, k) => { px(g, C[3], k.l, 23 + k.offL, 3, 1); px(g, C[3], k.r, 23 + k.offR, 3, 1); if (v === 'front') px(g, C[1], 9, 19, 1, 2); } },
  joggers: { kind: 'pants', detail: (g, v, C, k) => { px(g, C[1], k.l, 23 + k.offL, 3, 1); px(g, C[1], k.r, 23 + k.offR, 3, 1); px(g, C[1], 6, 19, 8, 1); if (v === 'front') { px(g, '#FFFFFF', 9, 19); px(g, '#FFFFFF', 10, 20); } } },
  wide_jeans: { kind: 'wide', detail: (g, _v, C) => { px(g, C[3], 7, 19, 1, 2); } },
  cargo: { kind: 'pants', detail: (g, _v, C, k) => { px(g, C[1], k.l, 21, 1, 2); px(g, C[3], k.l, 21); px(g, C[0], k.r + 2, 21, 1, 2); px(g, C[1], 6, 19, 8, 1); } },
  slacks: { kind: 'pants', detail: (g, v, C, k) => { px(g, C[3], k.l + 1, 21, 1, 3 + k.offL); px(g, C[3], k.r + 1, 21, 1, 3 + k.offR); px(g, C[0], 6, 19, 8, 1); if (v === 'front') px(g, '#C8A040', 9, 19); } },
  shorts: { kind: 'shorts', detail: (g, _v, C, k) => { px(g, C[3], k.l, 21, 3, 1); px(g, C[3], k.r, 21, 3, 1); } },
  mini_skirt: { kind: 'mini', detail: (g, _v, C) => { for (const x of [6, 8, 10, 12]) px(g, C[1], x, 20, 1, 2); px(g, C[1], 6, 19, 8, 1); } },
  midi_skirt: { kind: 'midi', detail: (g, _v, C) => { px(g, C[1], 8, 20, 1, 2); px(g, C[1], 11, 20, 1, 2); } },
  overalls: {
    kind: 'pants',
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
