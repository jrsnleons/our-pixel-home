// Avatars are painted layer by layer (back hair, body, outfit, arms, face, front hair,
// accessory) into one atlas per person, then outlined. Animation just moves the texture
// offset, so walking costs no texture uploads.
//
// Everything is drawn at the room's own pixel size (16 px per tile), so people and furniture
// read as one piece of pixel art. The base art is 20x26 px per frame; the room and UI frames
// lengthen the torso and legs by a row each (20x30), for trainer-style proportions instead of
// a chibi, and the job mini-games use the 20x26 frames as they are. "front" faces down-left on
// screen, "back" faces up-left; the renderer mirrors them for the other two diagonals.

import * as THREE from 'three';
import { hexToRgb, mix, ramp, shade } from '../../core/color';
import { STARTER_WEAR, type Wear } from '../../data/clothes';
import { dress, paintBag, paintBody, paintCollar, paintHeadwear, sleeveOf } from './clothes';
import { canvas, outline, px, texture, type Ctx } from './pixel';

/** Small frames, for the job mini-games. */
export const SW = 20, SH = 26;
/** Room and UI frames: the same art with a longer body. */
export const FW = 20, FH = 30;
/** Pixels per world unit, the same as the room's textures. */
export const PPU = 16;

/** Small rows drawn twice in the room frame: mid-chest, waist, and both thigh rows. */
const LONG_ROWS = new Set([15, 17, 21, 22]);
/** Room-frame y for a small y (the top of that row). */
export function hy(y: number): number {
  let n = 0;
  for (const r of LONG_ROWS) if (r < y) n++;
  return y + n;
}

export type Body = 'guy' | 'girl';

export interface AvatarLook {
  /** Build: broader and straighter, or narrower shoulders with lashes. Older looks have none (guy). */
  body: Body;
  skin: number;
  hair: string;
  hairColor: number;
  /** What they have on, slot by slot (see data/clothes.ts). */
  wear: Wear;
  /** Looks saved before separate pieces had one outfit and one accessory; read through wearOf. */
  outfit?: string;
  accessory?: string;
  eyes: number;
  freckles: boolean;
  /** Rosy cheeks all the time, not just when happy. */
  blush: boolean;
}

export const DEFAULT_LOOK: AvatarLook = { body: 'guy', skin: 1, hair: 'short', hairColor: 1, wear: STARTER_WEAR, eyes: 0, freckles: false, blush: false };

export const SKINS = ['#FBE3CC', '#F3C9A2', '#E2AC7E', '#C78B5C', '#9C6642', '#6F4631'];
export const HAIR_COLORS = ['#2B2026', '#4A2E1F', '#7A4A2E', '#A4512E', '#D9A949', '#B8B2AA', '#E890A8', '#8E7AD0'];
export const HAIR_COLOR_NAMES = ['Black', 'Dark brown', 'Brown', 'Auburn', 'Blonde', 'Silver', 'Pink', 'Lavender'];
export const EYE_COLORS = ['#2A1A1A', '#3A5A8A', '#3E6A3A', '#6A3E22'];
export const HAIR_STYLES = ['short', 'bob', 'long', 'ponytail', 'buzz', 'curly', 'bun', 'wavy', 'twintails', 'braid', 'afro', 'slick'] as const;
export const HAIR_NAMES: Record<string, string> = {
  short: 'Messy short', bob: 'Bob', long: 'Long', ponytail: 'Ponytail', buzz: 'Crop', curly: 'Curly', bun: 'Top bun', wavy: 'Side-swept',
  twintails: 'Twin tails', braid: 'Braid', afro: 'Afro', slick: 'Slicked back',
};
/** Every style works on both bodies; these orders just put the usual picks first. */
export const HAIR_ORDER: Record<Body, readonly string[]> = {
  guy: ['short', 'slick', 'buzz', 'curly', 'afro', 'wavy', 'bob', 'long', 'ponytail', 'bun', 'braid', 'twintails'],
  girl: ['long', 'bob', 'ponytail', 'twintails', 'braid', 'bun', 'wavy', 'curly', 'afro', 'short', 'slick', 'buzz'],
};

type Expr = 'normal' | 'happy' | 'closed' | 'blush' | 'surprised' | 'kiss' | 'laugh';
type Legs = 'stand' | 'stepA' | 'stepB' | 'sit';
/** Arm: hand position (x, y) of the hand's top-left pixel, an optional elbow, and whether it's drawn behind the body. */
type Arm = { hand: [number, number]; elbow?: [number, number]; behind?: boolean; fist?: boolean };

interface FrameSpec { arms: [Arm, Arm]; legs: Legs; bob?: number; expr: Expr; bow?: boolean; prop?: 'snack' }

// Shoulders: near arm (screen-left) at x=5, far arm (screen-right) at x=14, y=14.
const DOWN: [Arm, Arm] = [{ hand: [4, 18] }, { hand: [14, 18] }];

export const FRAMES: Record<string, FrameSpec> = {
  idle: { arms: DOWN, legs: 'stand', expr: 'normal' },
  idle2: { arms: DOWN, legs: 'stand', bob: 1, expr: 'normal' },
  blink: { arms: DOWN, legs: 'stand', expr: 'closed' },
  walk1: { arms: [{ hand: [3, 17] }, { hand: [15, 18] }], legs: 'stepA', expr: 'normal' },
  walk2: { arms: DOWN, legs: 'stand', bob: 1, expr: 'normal' },
  walk3: { arms: [{ hand: [5, 18] }, { hand: [14, 17] }], legs: 'stepB', expr: 'normal' },
  sit: { arms: [{ hand: [6, 18] }, { hand: [12, 18] }], legs: 'sit', expr: 'normal' },
  sitHappy: { arms: [{ hand: [6, 18] }, { hand: [12, 18] }], legs: 'sit', expr: 'happy' },
  sitLean: { arms: [{ hand: [6, 18] }, { hand: [12, 18] }], legs: 'sit', expr: 'closed', bow: true },
  wave1: { arms: [{ hand: [4, 18] }, { hand: [16, 9], elbow: [16, 13] }], legs: 'stand', expr: 'happy' },
  wave2: { arms: [{ hand: [4, 18] }, { hand: [14, 9], elbow: [16, 13] }], legs: 'stand', expr: 'happy' },
  cheer: { arms: [{ hand: [2, 9], elbow: [3, 12] }, { hand: [16, 9], elbow: [16, 12] }], legs: 'stand', bob: 1, expr: 'laugh' },
  hug: { arms: [{ hand: [1, 15], elbow: [3, 15] }, { hand: [2, 14], elbow: [8, 15], behind: true }], legs: 'stand', expr: 'happy' },
  hugBack: { arms: [{ hand: [1, 16], elbow: [3, 16] }, { hand: [3, 15], elbow: [9, 16], behind: true }], legs: 'stand', expr: 'closed' },
  pray: { arms: [{ hand: [8, 15], elbow: [6, 17] }, { hand: [9, 15], elbow: [12, 17] }], legs: 'stand', expr: 'closed', bow: true },
  sitPray: { arms: [{ hand: [8, 15], elbow: [6, 17] }, { hand: [9, 15], elbow: [12, 17] }], legs: 'sit', expr: 'closed', bow: true },
  heart: { arms: [{ hand: [7, 0], elbow: [3, 6] }, { hand: [10, 0], elbow: [15, 6] }], legs: 'stand', expr: 'happy' },
  point: { arms: [{ hand: [0, 14], elbow: [3, 14] }, { hand: [14, 18] }], legs: 'stand', expr: 'happy' },
  hold: { arms: [{ hand: [4, 18] }, { hand: [17, 17], elbow: [16, 15] }], legs: 'stand', expr: 'happy' },
  holdL: { arms: [{ hand: [1, 17], elbow: [3, 15] }, { hand: [14, 18] }], legs: 'stand', expr: 'happy' },
  kiss: { arms: [{ hand: [3, 16], elbow: [4, 15] }, { hand: [14, 18] }], legs: 'stand', expr: 'kiss', bow: true },
  carry: { arms: [{ hand: [1, 16], elbow: [3, 17] }, { hand: [2, 15], elbow: [8, 16], behind: true }], legs: 'stand', expr: 'happy' },
  ride: { arms: [{ hand: [2, 14], elbow: [3, 15] }, { hand: [4, 13], elbow: [9, 14], behind: true }], legs: 'sit', expr: 'laugh' },
  dance1: { arms: [{ hand: [2, 13], elbow: [3, 15] }, { hand: [14, 18] }], legs: 'stepA', expr: 'closed' },
  dance2: { arms: [{ hand: [2, 14], elbow: [3, 16] }, { hand: [14, 18] }], legs: 'stepB', bob: 1, expr: 'closed' },
  laugh1: { arms: [{ hand: [6, 16], elbow: [4, 17] }, { hand: [12, 16], elbow: [14, 17] }], legs: 'stand', expr: 'laugh' },
  laugh2: { arms: [{ hand: [6, 16], elbow: [4, 17] }, { hand: [12, 16], elbow: [14, 17] }], legs: 'stand', bob: 1, expr: 'laugh' },
  feed: { arms: [{ hand: [1, 13], elbow: [3, 15] }, { hand: [14, 18] }], legs: 'stand', expr: 'happy', prop: 'snack' },
  eat: { arms: DOWN, legs: 'stand', expr: 'happy' },
  surprised: { arms: [{ hand: [3, 15], elbow: [4, 17] }, { hand: [15, 15], elbow: [15, 17] }], legs: 'stand', expr: 'surprised' },
  highfive: { arms: [{ hand: [1, 7], elbow: [3, 11] }, { hand: [14, 18] }], legs: 'stand', expr: 'laugh' },
  blow: { arms: [{ hand: [6, 10], elbow: [4, 14] }, { hand: [14, 18] }], legs: 'stand', expr: 'kiss' },
  blow2: { arms: [{ hand: [0, 11], elbow: [3, 13] }, { hand: [14, 18] }], legs: 'stand', expr: 'happy' },
  pinch: { arms: [{ hand: [0, 10], elbow: [3, 13] }, { hand: [14, 18] }], legs: 'stand', expr: 'laugh' },
  tickle: { arms: [{ hand: [1, 15], elbow: [3, 16] }, { hand: [2, 17], elbow: [8, 17], behind: true }], legs: 'stepA', expr: 'laugh' },
  fist: { arms: [{ hand: [0, 14], elbow: [3, 15], fist: true }, { hand: [14, 18] }], legs: 'stand', expr: 'happy' },
  pat: { arms: [{ hand: [1, 5], elbow: [3, 10] }, { hand: [14, 18] }], legs: 'stand', expr: 'happy' },
  umbrella: { arms: [{ hand: [5, 11], elbow: [4, 14] }, { hand: [14, 18] }], legs: 'stand', expr: 'happy' },
  squish: { arms: DOWN, legs: 'stand', expr: 'blush' },
  blush: { arms: [{ hand: [6, 17], elbow: [5, 16] }, { hand: [12, 17], elbow: [13, 16] }], legs: 'stand', expr: 'blush' },
  lie: { arms: DOWN, legs: 'stand', expr: 'closed' },
};

export const FRAME_NAMES = Object.keys(FRAMES);
export const FRAME_INDEX: Record<string, number> = Object.fromEntries(FRAME_NAMES.map((n, i) => [n, i]));

// ---------- Hair maps ----------
// h = base, H = highlight, d = shadow. 20 columns. Head skin spans x 4..15, y 3..11.
interface HairStyle { front: string[]; back: string[]; behind?: string[]; frontY?: number; backY?: number; behindY?: number }

const HAIR: Record<string, HairStyle> = {
  short: {
    front: [
      '.......hhhhh........',
      '.....hhhhhhhhh......',
      '....hhHHHhhhhhhh....',
      '...hhHHhhhhhhhhhd...',
      '...hhhhhhhhhhhhhd...',
      '...hhhhhhhhhhhhhhd..',
      '...hhhhhdhhhhdhhhd..',
      '...hhh..hh...hhhhd..',
      '...hh..........hhd..',
      '...h...........hhd..',
      '...............hd...',
    ],
    back: [
      '.......hhhhhh.......',
      '.....hhhhhhhhhh.....',
      '....hhHHHhhhhhhh....',
      '...hhHHhhhhhhhhhd...',
      '...hhhhhhhhhhhhhd...',
      '...hhhhhhhhhhhhhd...',
      '...hhhhhhhhhhhhhd...',
      '...hhhhhhhhhhhhhd...',
      '...dhhhhhhhhhhhdd...',
      '....dhhhhhhhhhdd....',
      '.....dddhhhhddd.....',
    ],
  },
  bob: {
    front: [
      '......hhhhhhh.......',
      '....hhhhhhhhhhh.....',
      '...hhHHHhhhhhhhh....',
      '..hhHHhhhhhhhhhhd...',
      '..hhhhhhhhhhhhhhhd..',
      '..hhhhhhhhhhhhhhhd..',
      '..hhhhhhhhhhhhhhhd..',
      '..hhh.........hhhd..',
      '..hhh.........hhhd..',
      '..hhh.........hhhd..',
      '..hhh.........hhhd..',
      '..dhhd.......dhhdd..',
      '...dd.........ddd...',
    ],
    back: [
      '......hhhhhhhh......',
      '....hhhhhhhhhhhh....',
      '...hhHHHhhhhhhhhh...',
      '..hhHHhhhhhhhhhhhd..',
      '..hhhhhhhhhhhhhhhd..',
      '..hhhhhhhhhhhhhhhd..',
      '..hhhhhhhhhhhhhhhd..',
      '..hhhhhhhhhhhhhhhd..',
      '..hhhhhhhhhhhhhhhd..',
      '..hhhhhhhhhhhhhhhd..',
      '..hhhhhhhhhhhhhhhd..',
      '..dhhhhhhhhhhhhhdd..',
      '...ddddddddddddd....',
    ],
  },
  long: {
    front: [
      '......hhhhhhh.......',
      '....hhhhhhhhhhh.....',
      '...hhHHHhhhhhhhh....',
      '..hhHHhhhhhhhhhhd...',
      '..hhhhhhhhhhhhhhhd..',
      '..hhhhhhhhhhhhhhhd..',
      '..hhhhhhhhhhhhhhhd..',
      '..hhh.........hhhd..',
      '..hhh.........hhhd..',
      '..hhh.........hhhd..',
    ],
    behind: [
      '..hhh.........hhhd..',
      '..hhh.........hhhd..',
      '..hhhh.......hhhhd..',
      '..hhhh.......hhhhd..',
      '..hhhh.......hhhhd..',
      '..dhhh.......hhhdd..',
      '...dhh.......hhdd...',
      '....d.........d.....',
    ],
    back: [
      '......hhhhhhhh......',
      '....hhhhhhhhhhhh....',
      '...hhHHHhhhhhhhhh...',
      '..hhHHhhhhhhhhhhhd..',
      '..hhhhhhhhhhhhhhhd..',
      '..hhhhhhhhhhhhhhhd..',
      '..hhhhhhhhhhhhhhhd..',
      '..hhhhhhhhhhhhhhhd..',
      '..hhhhhhhhhhhhhhhd..',
      '..hhhhhhhhhhhhhhhd..',
      '..hhhhhhhhhhhhhhhd..',
      '..hhhhhhhhhhhhhhhd..',
      '..hhhhhhhhhhhhhhhd..',
      '..hhhhhhhhhhhhhhhd..',
      '..hhhhhhhhhhhhhhhd..',
      '..dhhhhhhhhhhhhhdd..',
      '...dhhhhhhhhhhhdd...',
      '....ddddddddddd.....',
    ],
    behindY: 12,
  },
  ponytail: {
    front: [
      '......hhhhhhh.......',
      '....hhhhhhhhhhhd....',
      '...hhHHHhhhhhhhhdhh.',
      '...hHHhhhhhhhhhhdhhh',
      '...hhhhhhhhhhhhhhdhh',
      '...hhhhhhhhhhhhhhdhh',
      '...hhhhdhhhhhdhhhdhh',
      '...hhh..h.....hhhdhh',
      '...hh..........hhdhd',
      '...h...........hd.hd',
      '..................dd',
    ],
    back: [
      '......hhhhhhhh......',
      '....hhhhhhhhhhhh....',
      '...hhHHHhhhhhhhhh...',
      '...hHHhhhhhhhhhhhd..',
      '...hhhhhhhhhhhhhhd..',
      '...hhhhhhhhhhhhhhd..',
      '...hhhhhhdddhhhhhd..',
      '...hhhhhhhHhhhhhhd..',
      '...dhhhhhhhhhhhhdd..',
      '....dhhhhhhhhhhdd...',
      '.....ddhhhhhhdd.....',
      '........hhhh........',
      '........hhhh........',
      '........dhhd........',
      '.........dd.........',
    ],
  },
  buzz: {
    front: [
      '....................',
      '......dhhhhhd.......',
      '....dhhhHhhhhhd.....',
      '....hhHhhhhhhhhd....',
      '....hhhhhhhhhhhd....',
      '....h..........hd...',
      '...............hd...',
    ],
    back: [
      '....................',
      '......dhhhhhhd......',
      '....dhhhHhhhhhhd....',
      '....hhHhhhhhhhhhd...',
      '....hhhhhhhhhhhhd...',
      '....hhhhhhhhhhhhd...',
      '....hhhhhhhhhhhhd...',
      '....dhhhhhhhhhhdd...',
      '.....dhhhhhhhhdd....',
    ],
  },
  curly: {
    front: [
      '.....hhh.hhh.hh.....',
      '...hhhHhhhHhhhhhh...',
      '..hhHHhhhHHhhhhhhh..',
      '.hhHhhhhhhhhhhhhhhd.',
      '.hhhhhhHhhhhhHhhhhd.',
      '.hhhhhhhhhhhhhhhhhd.',
      '.hhhhdhhhhdhhhhhhhd.',
      '.hhhh..h...h..hhhhd.',
      '.hhh..........hhhhd.',
      '.hhh...........hhhd.',
      '..hd...........hhd..',
      '...............dd...',
    ],
    back: [
      '.....hhh.hhh.hhh....',
      '...hhhHhhhHhhhhhh...',
      '..hhHHhhhHHhhhhhhh..',
      '.hhHhhhhhhhhhhhhhhd.',
      '.hhhhhhHhhhhhHhhhhd.',
      '.hhhhhhhhhhhhhhhhhd.',
      '.hhhhhhhhhhhhhhhhhd.',
      '.hhhHhhhhhhHhhhhhhd.',
      '.hhhhhhhhhhhhhhhhhd.',
      '.dhhhhhhhhhhhhhhhdd.',
      '..dhhhdhhhhdhhhhdd..',
      '...ddd.dddd.dddd....',
    ],
  },
  bun: {
    front: [
      '.......hhhh.........',
      '......hHHhhd........',
      '......hhhhhd........',
      '.....hhhhhhhh.......',
      '...hhHHhhhhhhhd.....',
      '...hHhhhhhhhhhhd....',
      '...hhhhhhhhhhhhhd...',
      '...hhhhhhhhhhhhhd...',
      '...hhdhhhhhhdhhhd...',
      '...hh..........hhd..',
      '...h...........hhd..',
      '...............hd...',
    ],
    back: [
      '.......hhhhh........',
      '......hHHhhhd.......',
      '......hhhhhhd.......',
      '.....hhhhhhhhh......',
      '...hhHHhhhhhhhhd....',
      '...hHhhhhhhhhhhhd...',
      '...hhhhhhhhhhhhhd...',
      '...hhhhhhhhhhhhhd...',
      '...hhhhhhhhhhhhhd...',
      '...hhhhhhhhhhhhhd...',
      '...dhhhhhhhhhhhdd...',
      '....dhhhhhhhhhdd....',
      '.....dddddddddd.....',
    ],
    frontY: -2, backY: -2,
  },
  wavy: {
    front: [
      '......hhhhhhh.......',
      '....hhhhhhhhhhh.....',
      '...hHHHHhhhhhhhh....',
      '..hhHhhhhhhhhhhhd...',
      '..hhhhhhhhhhhhhhhd..',
      '..hhhhhhhhhhhhhhhd..',
      '..hhhhhhhhhdhhhhhd..',
      '..hhhhd.......hhhd..',
      '..hhhd........hhhd..',
      '..hhh.........hhhhd.',
      '...hh.........hhhhd.',
      '...hhh.......dhhhd..',
      '....dd.......hhhd...',
      '.............ddd....',
    ],
    back: [
      '......hhhhhhhh......',
      '....hhhhhhhhhhhh....',
      '...hhHHHhhhhhhhhh...',
      '..hhHHhhhhhhhhhhhd..',
      '..hhhhhhhhhhhhhhhd..',
      '..hhhhhhhhhhhhhhhd..',
      '..hhhhhhhhhhhhhhhd..',
      '..hhhhhhhhhhhhhhhd..',
      '..hhhhhhhhhhhhhhhhd.',
      '..hhhhhhhhhhhhhhhhd.',
      '...hhhhhhhhhhhhhhhd.',
      '...hhhhhhhhhhhhhhd..',
      '....hhhhhhhhhhhhd...',
      '.....ddhhhhhhddd....',
    ],
  },
  // r = ribbon ties.
  twintails: {
    front: [
      '......hhhhhhh.......',
      '....hhhhhhhhhhh.....',
      '...hhHHHhhhhhhhh....',
      '..hhHHhhhhhhhhhhd...',
      '.rrhhhhhhhhhhhhhdrr.',
      'hhhhhhhhhhhhhhhhdhhh',
      'hhh.hhhhdhhhhdhhhdhh',
      'hhh.hh..h.....hhhdhh',
      'hHh.h..........hhdhh',
      'dhh............hd.hh',
      'dhh...............Hh',
      '.hh...............hd',
      '.dh...............hd',
      '..d...............d.',
    ],
    back: [
      '......hhhhhhhh......',
      '....hhhhhhhhhhhh....',
      '...hhHHHhhhhhhhhh...',
      '..hhHHhhhhhhhhhhhd..',
      'rrhhhhhhhhhhhhhhhdrr',
      'hhhhhhhhhhhhhhhhhdhh',
      'hhhhhhhhhdhhhhhhhdhh',
      'hhhhhhhhhdhhhhhhhdhh',
      'hHh.hhhhhhhhhhhhd.hh',
      'hhh..dhhhhhhhhdd..Hh',
      'dhh...dddddddd....hd',
      '.hh...............hd',
      '.dh...............hd',
      '..d...............d.',
    ],
  },
  braid: {
    front: [
      '......hhhhhhh.......',
      '....hhhhhhhhhhh.....',
      '...hHHHHhhhhhhhh....',
      '..hhHhhhhhhhhhhhd...',
      '..hhhhhhhhhhhhhhhd..',
      '..hhhhhhhhhdhhhhhd..',
      '..hhhhd......hhhhd..',
      '..hhd........hhhhd..',
      '..hh..........hhhd..',
      '...h..........hhhd..',
      '..............hhd...',
    ],
    // The braid hangs behind the far shoulder in the front view.
    behind: [
      '..............hhd...',
      '..............hHd...',
      '...............hhd..',
      '..............dHh...',
      '...............hhd..',
      '..............dHh...',
      '...............hd...',
      '..............rr....',
      '..............hd....',
      '..............dh....',
    ],
    behindY: 11,
    back: [
      '......hhhhhhhh......',
      '....hhhhhhhhhhhh....',
      '...hhHHHhhhhhhhhh...',
      '..hhHHhhhhhhhhhhhd..',
      '..hhhhhhhhhhhhhhhd..',
      '..hhhhhhhhhhhhhhhd..',
      '..hhhhhhhhhhhhhhhd..',
      '..hhhhhhhhhhhhhhhd..',
      '..dhhhhhhhhhhhhhdd..',
      '...dhhhhhhhhhhhdd...',
      '.....ddhhhhhdd......',
      '........hHd.........',
      '........dhh.........',
      '........hHd.........',
      '........dhh.........',
      '........hHd.........',
      '.........rr.........',
      '........hhd.........',
      '.........d..........',
    ],
  },
  afro: {
    front: [
      '.....hhhhhhhhh......',
      '...hhhHHhhhhhhhh....',
      '..hhHHHhhhhdhhhhh...',
      '.hhHHhhhhhhhhhhhhh..',
      '.hhHhhhdhhhhhhdhhhd.',
      'hhhhhhhhhhhhhhhhhhhd',
      'hhhhdhhhhhhhdhhhhhhd',
      'hhhhh.h..h..hhhhhhhd',
      'hhhh..........hhhhhd',
      'hhh...........hhhhd.',
      '.hh...........hhdhd.',
      '..d...........hhhd..',
      '...............dd...',
    ],
    back: [
      '.....hhhhhhhhh......',
      '...hhhHHhhhhhhhh....',
      '..hhHHHhhhhdhhhhh...',
      '.hhHHhhhhhhhhhhhhh..',
      '.hhHhhhdhhhhhhdhhhd.',
      'hhhhhhhhhhhhhhhhhhhd',
      'hhhhhhhHhhhhdhhhhhhd',
      'hhhdhhhhhhhhhhhhhhhd',
      'hhhhhhhhhhdhhhhhhhhd',
      'hhhhhHhhhhhhhHhhhdhd',
      '.hhhhhhhhhhhhhhhhhd.',
      '.dhhhhhdhhhhhhhhhdd.',
      '..ddhhhhhhhhhhhdd...',
      '....dddddddddddd....',
    ],
    frontY: -2, backY: -2,
  },
  slick: {
    front: [
      '....................',
      '......hhhhhhh.......',
      '....hhHHHHHhhh......',
      '...hHHhhhhhhhhhd....',
      '...hhhhhhhhhhhhhd...',
      '...hh.......hhhhd...',
      '...h.........hhhd...',
      '..............hhd...',
      '..............hd....',
    ],
    back: [
      '....................',
      '......hhhhhhh.......',
      '....hhHHHHHhhh......',
      '...hHHhhHHhhhhhd....',
      '...hhhhhhhhhhhhhd...',
      '...hhhHhhhhHhhhhd...',
      '...hhhhhhhhhhhhhd...',
      '...hhhhhhhhhhhhhd...',
      '...dhhhhhhhhhhhdd...',
      '....dhhhhhhhhhdd....',
      '.....dddddddddd.....',
    ],
  },
};

// ---------- Painting ----------

function drawHairMap(g: Ctx, rows: string[] | undefined, oy: number, hair: string[]) {
  if (!rows) return;
  const pal: Record<string, string> = { h: hair[2], H: hair[4], d: hair[1], r: '#E5566F' };
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) { const c = pal[r[x]]; if (c) px(g, c, x, oy + y); }
  });
}

/** bare: how far along the arm the sleeve ends (1 long, 0.42 short, 0 sleeveless). */
function drawArm(g: Ctx, sx: number, sy: number, arm: Arm, sleeve: string[], skin: string[], bare: number) {
  const [hx, hy] = arm.hand;
  const pts: [number, number][] = arm.elbow ? [[sx, sy], arm.elbow, [hx, hy]] : [[sx, sy], [hx, hy]];
  // Sleeve from the shoulder, then skin for the bare part of the arm and the hand.
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = Math.round(ax + (bx - ax) * t), y = Math.round(ay + (by - ay) * t);
      const along = (i + t) / (pts.length - 1);
      const off = along > bare;
      px(g, off ? skin[2] : sleeve[2], x, y, 2, 2);
      px(g, off ? skin[1] : sleeve[1], x + 1, y + 1);
    }
  }
  px(g, skin[2], hx, hy, 2, 2);
  px(g, skin[1], hx + 1, hy + 1);
  if (arm.fist) px(g, skin[1], hx, hy + 1);
}

function drawFace(g: Ctx, expr: Expr, skin: string[], eye: string, dy: number, look: AvatarLook) {
  const y = 8 + dy;
  const girl = look.body === 'girl';
  const blush = mix(skin[2], '#F0708A', 0.45);
  const eyeL = mix(eye, '#FFFFFF', 0.25);
  switch (expr) {
    case 'happy':
    case 'laugh':
      for (const x of [6, 10]) { px(g, eye, x, y); px(g, eye, x - 1, y + 1); px(g, eye, x + 1, y + 1); }
      break;
    case 'closed':
    case 'kiss':
      for (const x of [6, 10]) px(g, eye, x - 1, y + 1, 3, 1);
      if (girl) { px(g, eye, 4, y); px(g, eye, 12, y); }
      break;
    case 'surprised':
      for (const x of [6, 10]) { px(g, eye, x, y - 1, 1, 3); px(g, '#FFFFFF', x, y - 1); }
      break;
    default:
      // Two-pixel eyes, dark on top and the iris color below, the way overworld sprites do it:
      // clean at room size, and the eye color still shows.
      for (const x of [6, 10]) { px(g, mix(eye, '#120A10', 0.55), x, y); px(g, eyeL, x, y + 1); }
      // Lashes: one flick out from each outer corner.
      if (girl) { px(g, mix(eye, '#120A10', 0.55), 5, y); px(g, mix(eye, '#120A10', 0.55), 11, y); }
  }
  // Brows sit just under the bangs and sell the expression.
  if (expr === 'surprised') { px(g, shade(skin[0], -0.25), 5, y - 3, 2, 1); px(g, shade(skin[0], -0.25), 10, y - 3, 2, 1); }
  // Cheeks
  const blushy = look.blush || expr === 'blush' || expr === 'kiss' || expr === 'happy' || expr === 'laugh';
  if (blushy) { px(g, blush, 5, y + 2); px(g, blush, 11, y + 2, 2, 1); }
  else { px(g, mix(skin[2], blush, 0.5), 5, y + 2); px(g, mix(skin[2], blush, 0.5), 11, y + 2); }
  if (look.freckles) {
    const f = mix(skin[1], '#7A3E22', 0.4);
    for (const [fx, fy] of [[6, y + 2], [13, y + 2], [12, y + 3]]) px(g, f, fx, fy);
  }
  // Mouth
  // A muted brown-rose, not red: a saturated mouth reads as a cut at this size.
  const mouth = girl ? mix(skin[0], '#A04A58', 0.6) : mix(skin[0], '#7A4A48', 0.6);
  if (expr === 'laugh') { px(g, mouth, 7, y + 3, 3, 1); px(g, '#E86A7A', 8, y + 4); px(g, mouth, 7, y + 4); px(g, mouth, 9, y + 4); }
  else if (expr === 'surprised') { px(g, mouth, 8, y + 3, 1, 2); }
  else if (expr === 'kiss') { px(g, '#D85A6A', 7, y + 3, 1, 1); px(g, '#D85A6A', 7, y + 4); }
  else if (expr === 'happy' || expr === 'blush') { px(g, mouth, 7, y + 3); px(g, mouth, 9, y + 3); px(g, mouth, 8, y + 4); }
  else px(g, mouth, 7, y + 3, 2, 1);
}

function drawHead(g: Ctx, skin: string[], dy: number, view: 'front' | 'back') {
  const rows = [
    '......ssssssss......',
    '.....skkssssssS.....',
    '....skkssssssssS....',
    '....sksssssssssS....',
    '....sssssssssssS....',
    '....sssssssssssSE...',
    '....sssssssssssSE...',
    '.....ssssssssssS....',
    '......sssssssSS.....',
  ];
  const pal: Record<string, string> = { s: skin[2], k: skin[3], S: skin[1], E: view === 'front' ? skin[1] : '' };
  rows.forEach((r, y) => {
    for (let x = 0; x < 20; x++) { const c = pal[r[x]]; if (c) px(g, c, x, 3 + y + dy); }
  });
  if (view === 'back') { px(g, skin[1], 3, 8 + dy, 1, 2); px(g, skin[1], 16, 8 + dy, 1, 2); }
  // Neck with a shadow under the chin.
  px(g, skin[1], 8, 12 + dy, 4, 1);
}

function drawProp(g: Ctx, prop: FrameSpec['prop']) {
  if (prop === 'snack') { px(g, '#E8B860', 0, 11, 3, 2); px(g, '#C8883A', 0, 12, 3, 1); px(g, '#7A4A2A', 1, 11); }
}

/**
 * Copy a body layer into g with the chest (collar to waist, rows 13-17) two pixels narrower:
 * columns 7 and 12 are dropped so the lit and shaded edges and the middle details survive.
 * Hips and legs are copied as they are, so the waist reads narrower than the hips.
 */
function narrowTorso(g: Ctx, src: HTMLCanvasElement, bob: number) {
  const top = 13 + bob, rows = 5;
  g.drawImage(src, 0, 0, SW, top, 0, 0, SW, top);
  g.drawImage(src, 0, top + rows, SW, SH - top - rows, 0, top + rows, SW, SH - top - rows);
  g.drawImage(src, 0, top, 7, rows, 1, top, 7, rows); // ..6 -> ..7
  g.drawImage(src, 8, top, 4, rows, 8, top, 4, rows);
  g.drawImage(src, 13, top, SW - 13, rows, 12, top, SW - 13, rows); // 13.. -> 12..
}

export interface PaintOptions { look: AvatarLook; frame: string; view: 'front' | 'back' }

/** Paint one small (20x26) frame into g at (ox, oy). */
export function paintAvatarSmall(g: Ctx, ox: number, oy: number, opt: PaintOptions) {
  const c = paintSmallLayers(opt);
  outline(c.getContext('2d')!, SW, SH, undefined, 0.45);
  g.drawImage(c, ox, oy);
}

/**
 * A soft shadow one pixel under the fringe, where hair meets the face, so bangs sit on the
 * forehead instead of being pasted flat onto it.
 */
function fringeShadow(g: Ctx, hairLayer: HTMLCanvasElement, skin: string[]) {
  const h = hairLayer.getContext('2d')!.getImageData(0, 0, SW, SH).data;
  const img = g.getImageData(0, 0, SW, SH);
  const d = img.data;
  const base = hexToRgb(skin[2]), sh = hexToRgb(mix(skin[2], skin[1], 0.7));
  for (let y = 0; y < 12; y++) for (let x = 0; x < SW; x++) {
    const i = (y * SW + x) * 4, j = ((y - 1) * SW + x) * 4;
    if (y === 0 || h[i + 3] > 0 || h[j + 3] === 0) continue;
    if (d[i] === base[0] && d[i + 1] === base[1] && d[i + 2] === base[2]) { d[i] = sh[0]; d[i + 1] = sh[1]; d[i + 2] = sh[2]; }
  }
  g.putImageData(img, 0, 0);
}

/** Every layer of one small frame, composited but not yet outlined. */
function paintSmallLayers(opt: PaintOptions): HTMLCanvasElement {
  const f = FRAMES[opt.frame] ?? FRAMES.idle;
  const [c, cg] = canvas(SW, SH, true);
  const skin = ramp(SKINS[opt.look.skin] ?? SKINS[1]);
  const hair = ramp(HAIR_COLORS[opt.look.hairColor] ?? HAIR_COLORS[1]);
  const style = HAIR[opt.look.hair] ?? HAIR.short;
  const d = dress(opt.look);
  const { C: sleeve, bare } = sleeveOf(d);
  const eye = EYE_COLORS[opt.look.eyes] ?? EYE_COLORS[0];
  const bob = f.bob ?? 0;
  const view = opt.view;
  const headDy = (f.bow ? 1 : 0);
  const sitDrop = f.legs === 'sit' ? 2 : 0;
  const girl = opt.look.body === 'girl';
  // Shoulders: the girl body is a pixel narrower on each side.
  const nearSx = girl ? 6 : 5, farSx = girl ? 12 : 13, behindSx = girl ? 13 : 14;

  // Everything above the legs drops when seated; the body bobs on alternate frames.
  cg.save();
  cg.translate(0, sitDrop + bob);
  if (view === 'front') drawHairMap(cg, style.behind, (style.behindY ?? 12) + headDy, hair);
  if (f.legs !== 'sit' && f.arms[1].behind) drawArm(cg, behindSx, 14, f.arms[1], sleeve, skin, bare);
  cg.restore();

  const [bc, bg] = canvas(SW, SH);
  bg.translate(0, bob);
  paintBody(bg, d, { girl, skin, legs: f.legs }, view);
  paintBag(bg, d, view);
  if (girl) narrowTorso(cg, bc, bob);
  else cg.drawImage(bc, 0, 0);

  cg.save();
  cg.translate(0, sitDrop + bob);
  if (f.legs === 'sit' && f.arms[1].behind) drawArm(cg, behindSx, 14, f.arms[1], sleeve, skin, bare);
  drawHead(cg, skin, headDy, view);
  paintCollar(cg, d, view, headDy);
  if (view === 'front') drawFace(cg, f.expr, skin, eye, headDy, opt.look);
  const [hc, hg] = canvas(SW, SH, true);
  drawHairMap(hg, view === 'front' ? style.front : style.back, (view === 'front' ? style.frontY ?? 0 : style.backY ?? 0) + 1 + headDy, hair);
  cg.restore();
  // The hair layer was drawn without the sit/bob offset, so line it up before shading.
  cg.save();
  cg.translate(0, sitDrop + bob);
  cg.drawImage(hc, 0, 0);
  cg.restore();
  if (view === 'front') { const [sc, sg] = canvas(SW, SH, true); sg.drawImage(hc, 0, sitDrop + bob); fringeShadow(cg, sc, skin); }
  cg.save();
  cg.translate(0, sitDrop + bob);
  paintHeadwear(cg, d, view, headDy);
  // Arms go over the body (near arm last). In the back view the near arm is screen-left too.
  if (!f.arms[1].behind) drawArm(cg, farSx, 14, f.arms[1], sleeve, skin, bare);
  drawArm(cg, nearSx, 14, f.arms[0], sleeve, skin, bare);
  drawProp(cg, f.prop);
  cg.restore();
  return c;
}

// ---------- Room frames ----------

/** Paint one room frame (20x30) into g at (ox, oy): the small art with the body lengthened. */
export function paintAvatarFrame(g: Ctx, ox: number, oy: number, opt: PaintOptions) {
  const src = paintSmallLayers(opt);
  const [c, cg] = canvas(FW, FH, true);
  let y = 0;
  for (let r = 0; r < SH; r++) {
    const n = LONG_ROWS.has(r) ? 2 : 1;
    for (let k = 0; k < n; k++) cg.drawImage(src, 0, r, SW, 1, 0, y++, SW, 1);
  }
  outline(cg, FW, FH, undefined, 0.45);
  g.drawImage(c, ox, oy);
}

/** Atlas: one row per view (front, back), one column per frame. */
export function buildAvatarAtlas(look: AvatarLook): { texture: THREE.CanvasTexture; cols: number } {
  const cols = FRAME_NAMES.length;
  const [c, g] = canvas(FW * cols, FH * 2);
  FRAME_NAMES.forEach((name, i) => {
    paintAvatarFrame(g, i * FW, 0, { look, frame: name, view: 'front' });
    paintAvatarFrame(g, i * FW, FH, { look, frame: name, view: 'back' });
  });
  const t = texture(c);
  t.repeat.set(1 / cols, 0.5);
  return { texture: t, cols };
}

/**
 * UI pictures are blown up by twice the scale they're asked for, so the sizes used around the
 * app stay as they were when frames were drawn at double resolution.
 */
const UI = 2;

/** A standalone canvas of one frame, scaled up, for UI previews (avatar editor, partner card). */
export function avatarPreview(look: AvatarLook, frame = 'idle', view: 'front' | 'back' = 'front', scale = 2): HTMLCanvasElement {
  scale *= UI;
  const [c, g] = canvas(FW * scale, FH * scale);
  const [s, sg] = canvas(FW, FH);
  paintAvatarFrame(sg, 0, 0, { look, frame, view });
  g.imageSmoothingEnabled = false;
  g.drawImage(s, 0, 0, FW * scale, FH * scale);
  return c;
}


const thumbs = new Map<string, string>();

/**
 * A data URL of one still for picker buttons: the head and shoulders, or the whole body.
 * Cached by look, since the editor redraws every option on each change.
 */
export function avatarThumb(look: AvatarLook, part: 'head' | 'full', scale = 2): string {
  scale *= UI;
  const key = `${part}${scale}${JSON.stringify(look)}`;
  const hit = thumbs.get(key);
  if (hit) return hit;
  const h = part === 'head' ? Math.round(hy(16)) : FH;
  const [s, sg] = canvas(FW, FH);
  paintAvatarFrame(sg, 0, 0, { look, frame: 'idle', view: 'front' });
  const [c, g] = canvas(FW * scale, h * scale);
  g.imageSmoothingEnabled = false;
  g.drawImage(s, 0, 0, FW, h, 0, 0, FW * scale, h * scale);
  const url = c.toDataURL();
  if (thumbs.size > 400) thumbs.clear();
  thumbs.set(key, url);
  return url;
}
