// Avatars are painted layer by layer (back hair, body, outfit, arms, face, front hair,
// accessory) into one atlas per person, then outlined. Animation just moves the texture
// offset, so walking costs no texture uploads.
//
// Frames are 20x26 px. "front" faces down-left on screen, "back" faces up-left; the
// renderer mirrors them for the other two diagonals.

import * as THREE from 'three';
import { mix, ramp, shade } from '../../core/color';
import { canvas, outline, px, texture, type Ctx } from './pixel';

export const FW = 20, FH = 26;

export type Body = 'guy' | 'girl';

export interface AvatarLook {
  /** Build: broader and straighter, or narrower shoulders with lashes. Older looks have none (guy). */
  body: Body;
  skin: number;
  hair: string;
  hairColor: number;
  outfit: string;
  accessory: string;
  eyes: number;
  freckles: boolean;
  /** Rosy cheeks all the time, not just when happy. */
  blush: boolean;
}

export const DEFAULT_LOOK: AvatarLook = { body: 'guy', skin: 1, hair: 'short', hairColor: 1, outfit: 'fit_tee', accessory: 'acc_none', eyes: 0, freckles: false, blush: false };

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

// ---------- Outfits ----------
interface Outfit {
  top: string;
  sleeves: 'short' | 'long';
  sleeve?: string;
  bottom: string;
  bottomKind: 'pants' | 'shorts' | 'skirt' | 'dress';
  shoes: string;
  detail?: (g: Ctx, view: 'front' | 'back', c: OutfitColors) => void;
}
interface OutfitColors { top: string[]; bottom: string[] }

const OUTFITS: Record<string, Outfit> = {
  fit_tee: {
    top: '#F2EEE4', sleeves: 'short', bottom: '#4A6A9A', bottomKind: 'pants', shoes: '#5A3A2A',
    detail: (g, view, c) => { if (view === 'front') { px(g, c.top[0], 9, 13, 2, 1); px(g, c.top[1], 10, 16); } },
  },
  fit_hoodie: {
    top: '#8A9AB5', sleeves: 'long', bottom: '#3E3E4E', bottomKind: 'pants', shoes: '#E8E4DA',
    detail: (g, view, c) => {
      if (view === 'front') {
        px(g, c.top[1], 7, 13, 6, 1); px(g, '#F2EEE4', 8, 14, 1, 2); px(g, '#F2EEE4', 11, 14, 1, 2);
        px(g, c.top[1], 7, 17, 6, 1); px(g, c.top[0], 7, 18, 6, 1);
      } else { px(g, c.top[1], 6, 13, 8, 2); px(g, c.top[0], 7, 15, 6, 1); }
    },
  },
  fit_sweater: {
    top: '#C9603E', sleeves: 'long', bottom: '#5A4A3E', bottomKind: 'pants', shoes: '#3A2A22',
    detail: (g, _view, c) => {
      for (const x of [7, 10, 12]) for (let y = 14; y < 19; y++) px(g, (y + x) % 2 ? c.top[1] : c.top[3], x, y);
      px(g, c.top[1], 6, 18, 8, 1);
    },
  },
  fit_overalls: {
    top: '#F2E6D0', sleeves: 'short', bottom: '#5B7DB1', bottomKind: 'pants', shoes: '#8A3A2A',
    detail: (g, view, c) => {
      for (let x = 6; x < 14; x++) if (x % 2) px(g, '#D9604A', x, 14);
      if (view === 'front') { px(g, c.bottom[2], 8, 15, 4, 4); px(g, c.bottom[2], 7, 13, 1, 2); px(g, c.bottom[2], 12, 13, 1, 2); px(g, '#F2D56A', 7, 15); px(g, '#F2D56A', 12, 15); px(g, c.bottom[1], 9, 16, 2, 1); }
      else { px(g, c.bottom[2], 7, 13, 1, 6); px(g, c.bottom[2], 12, 13, 1, 6); px(g, c.bottom[2], 6, 18, 8, 1); }
    },
  },
  fit_dress: {
    top: '#F2A7C3', sleeves: 'short', bottom: '#F2A7C3', bottomKind: 'dress', shoes: '#F2EEE4',
    detail: (g, view, c) => { if (view === 'front') { px(g, '#FFFFFF', 8, 13, 4, 1); px(g, c.top[3], 9, 15); px(g, c.top[3], 9, 17); } px(g, c.top[1], 6, 18, 8, 1); for (let x = 5; x < 15; x += 2) px(g, c.top[4], x, 21); },
  },
  fit_flannel: {
    top: '#B83A32', sleeves: 'long', bottom: '#3E4E6A', bottomKind: 'pants', shoes: '#5A3A22',
    detail: (g, view, c) => {
      for (let y = 13; y < 19; y++) for (let x = 6; x < 14; x++) {
        if (x % 3 === 0 && y % 3 === 0) px(g, c.top[0], x, y);
        else if (x % 3 === 0 || y % 3 === 0) px(g, c.top[1], x, y);
      }
      if (view === 'front') { px(g, '#F2EEE4', 9, 13, 2, 1); for (let y = 14; y < 19; y += 2) px(g, '#F2EEE4', 10, y); }
    },
  },
  fit_pajamas: {
    top: '#A8C4E8', sleeves: 'long', bottom: '#A8C4E8', bottomKind: 'pants', shoes: '#F2D5D5',
    detail: (g, view, c) => {
      if (view === 'front') { px(g, '#FFFFFF', 8, 13, 1, 6); px(g, '#FFFFFF', 11, 13, 1, 1); px(g, c.top[1], 9, 15); px(g, c.top[1], 9, 17); }
      for (let y = 14; y < 19; y += 3) for (let x = 7; x < 14; x += 4) px(g, '#FFF2B0', x, y);
      px(g, '#FFFFFF', 6, 23, 3, 1); px(g, '#FFFFFF', 11, 23, 3, 1);
    },
  },
  fit_raincoat: {
    top: '#F2C230', sleeves: 'long', bottom: '#F2C230', bottomKind: 'dress', shoes: '#C83A32',
    detail: (g, view, c) => {
      if (view === 'front') { for (let y = 14; y < 21; y += 2) px(g, c.top[0], 10, y); px(g, c.top[1], 9, 13, 1, 9); px(g, c.top[3], 6, 17, 2, 1); px(g, c.top[3], 12, 17, 2, 1); }
      else { px(g, c.top[1], 6, 13, 8, 2); }
    },
  },
  fit_apron: {
    top: '#F2EEE4', sleeves: 'long', bottom: '#3A3A44', bottomKind: 'pants', shoes: '#2A2A30',
    detail: (g, view, c) => {
      if (view === 'front') { px(g, '#4E6A5A', 7, 14, 6, 7); px(g, '#3E5A4A', 7, 14, 6, 1); px(g, '#4E6A5A', 8, 13, 4, 1); px(g, '#E8C878', 9, 17, 2, 1); }
      else { px(g, '#4E6A5A', 6, 18, 8, 1); px(g, '#4E6A5A', 9, 19, 2, 1); px(g, '#4E6A5A', 7, 13, 1, 5); px(g, '#4E6A5A', 12, 13, 1, 5); }
      void c;
    },
  },
  fit_sunday: {
    top: '#FFFFFF', sleeves: 'long', sleeve: '#5A6A8A', bottom: '#4A5068', bottomKind: 'pants', shoes: '#2A1A14',
    detail: (g, view) => {
      if (view === 'front') { px(g, '#5A6A8A', 6, 13, 2, 6); px(g, '#5A6A8A', 12, 13, 2, 6); px(g, '#E8E4F0', 8, 13, 1, 1); px(g, '#E8E4F0', 11, 13, 1, 1); px(g, '#C8A040', 7, 15); px(g, '#C8A040', 7, 17); }
      else px(g, '#5A6A8A', 6, 13, 8, 6);
    },
  },
  fit_formal: {
    top: '#2E3448', sleeves: 'long', bottom: '#2E3448', bottomKind: 'pants', shoes: '#1A1414',
    detail: (g, view) => {
      if (view === 'front') { px(g, '#F2EEE4', 9, 13, 2, 4); px(g, '#B8303A', 9, 14, 1, 3); px(g, '#3E465E', 8, 13, 1, 4); px(g, '#3E465E', 11, 13, 1, 4); px(g, '#F2A7C3', 7, 14); px(g, '#FFFFFF', 7, 13); }
    },
  },
};

export const OUTFIT_KEYS = Object.keys(OUTFITS);

// ---------- Painting ----------

function drawHairMap(g: Ctx, rows: string[] | undefined, oy: number, hair: string[]) {
  if (!rows) return;
  const pal: Record<string, string> = { h: hair[2], H: hair[4], d: hair[1], r: '#E5566F' };
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) { const c = pal[r[x]]; if (c) px(g, c, x, oy + y); }
  });
}

function drawArm(g: Ctx, sx: number, sy: number, arm: Arm, sleeve: string[], skin: string[], short: boolean) {
  const [hx, hy] = arm.hand;
  const pts: [number, number][] = arm.elbow ? [[sx, sy], arm.elbow, [hx, hy]] : [[sx, sy], [hx, hy]];
  // Sleeve along the full arm, then skin for forearm (short sleeves) and the hand.
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = Math.round(ax + (bx - ax) * t), y = Math.round(ay + (by - ay) * t);
      const along = (i + t) / (pts.length - 1);
      const c = short && along > 0.42 ? skin[2] : sleeve[2];
      px(g, c, x, y, 2, 2);
      px(g, short && along > 0.42 ? skin[1] : sleeve[1], x + 1, y + 1);
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
      for (const x of [6, 10]) { px(g, eye, x, y, 1, 2); px(g, eyeL, x, y + 1); px(g, '#FFFFFF', x, y); }
      px(g, eye, 5, y, 1, 1); px(g, eye, 11, y);
      // Lashes: one flick up and out from each outer corner.
      if (girl) { px(g, eye, 4, y - 1); px(g, eye, 12, y - 1); }
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

function drawBody(g: Ctx, o: Outfit, oc: OutfitColors, skin: string[], legs: Legs, view: 'front' | 'back') {
  const T = oc.top, B = oc.bottom;
  const shoe = ramp(o.shoes);
  const sitting = legs === 'sit';
  // Torso: rows 13-18.
  px(g, T[2], 7, 13, 6, 1);
  px(g, T[2], 6, 14, 8, 5);
  px(g, T[3], 6, 14, 1, 3);
  px(g, T[1], 13, 14, 1, 5);
  px(g, T[1], 6, 18, 8, 1);
  if (view === 'front') px(g, skin[2], 9, 13, 2, 1);

  const dress = o.bottomKind === 'dress' || o.bottomKind === 'skirt';
  if (sitting) {
    // Seated: hips and thighs toward the viewer, feet tucked below.
    const L = dress ? T : B;
    px(g, L[2], 5, 19, 10, 2);
    px(g, L[1], 5, 20, 10, 1);
    px(g, L[3], 6, 19, 3, 1);
    if (dress) { px(g, skin[2], 6, 21, 3, 1); px(g, skin[2], 11, 21, 3, 1); }
    else { px(g, L[1], 6, 21, 3, 1); px(g, L[1], 11, 21, 3, 1); }
    px(g, shoe[2], 5, 22, 4, 1); px(g, shoe[2], 11, 22, 4, 1);
    px(g, shoe[3], 5, 22); px(g, shoe[3], 11, 22);
    return;
  }
  const legL = legs === 'stepA' ? -1 : 0; // lifted leg is shorter by 1
  const legR = legs === 'stepB' ? -1 : 0;
  if (dress) {
    // Skirt flares from the waist.
    px(g, T[2], 6, 19, 8, 1);
    px(g, T[2], 5, 20, 10, 2);
    px(g, T[1], 5, 21, 10, 1);
    px(g, T[3], 6, 19, 2, 2);
    const skinL = skin[2], skinS = skin[1];
    px(g, skinL, 7, 22 + legL, 2, 2); px(g, skinS, 8, 22 + legL, 1, 2);
    px(g, skinL, 11, 22 + legR, 2, 2); px(g, skinS, 12, 22 + legR, 1, 2);
  } else {
    px(g, B[2], 6, 19, 8, 2);
    px(g, B[3], 6, 19, 2, 1);
    px(g, B[1], 13, 19, 1, 2);
    const shorts = o.bottomKind === 'shorts';
    for (const [x, off] of [[6, legL], [11, legR]] as const) {
      px(g, B[2], x, 21, 3, 3 + off);
      px(g, B[1], x + 2, 21, 1, 3 + off);
      if (shorts) { px(g, skin[2], x, 22, 3, 2 + off); }
    }
  }
  // Shoes face down-left in the front view.
  for (const [x, off] of [[5, legL], [10, legR]] as const) {
    const y = 24 + off;
    if (view === 'front') { px(g, shoe[2], x, y, 4, 1); px(g, shoe[3], x, y); px(g, shoe[0], x + 3, y); }
    else { px(g, shoe[1], x + 1, y, 3, 1); px(g, shoe[2], x + 1, y); }
  }
}

function drawAccessory(g: Ctx, acc: string, view: 'front' | 'back', dy: number, hair: string[]) {
  switch (acc) {
    case 'acc_glasses':
      if (view !== 'front') return;
      for (const x of [5, 9]) { px(g, '#3A3A3A', x, 7 + dy, 3, 1); px(g, '#3A3A3A', x, 10 + dy, 3, 1); px(g, '#3A3A3A', x, 8 + dy, 1, 2); px(g, '#3A3A3A', x + 2, 8 + dy, 1, 2); }
      px(g, '#3A3A3A', 8, 8 + dy); px(g, '#3A3A3A', 12, 8 + dy, 3, 1);
      break;
    case 'acc_beanie': {
      const c = ramp('#D9644A');
      px(g, c[2], 3, 2 + dy, 14, 4); px(g, c[3], 4, 1 + dy, 12, 1); px(g, c[1], 3, 5 + dy, 14, 1);
      for (let x = 3; x < 17; x += 2) px(g, c[1], x, 3 + dy, 1, 2);
      px(g, '#F2EEE4', 8, -1 + dy + 1, 4, 2); px(g, '#FFFFFF', 8, 0 + dy);
      break;
    }
    case 'acc_cap': {
      const c = ramp('#4A6A9A');
      px(g, c[2], 3, 2 + dy, 13, 3); px(g, c[3], 5, 1 + dy, 9, 1); px(g, c[1], 3, 4 + dy, 13, 1);
      if (view === 'front') { px(g, c[1], 0, 5 + dy, 7, 1); px(g, c[2], 1, 4 + dy, 5, 1); }
      else { px(g, c[1], 7, 5 + dy, 6, 1); }
      px(g, '#F2EEE4', 9, 2 + dy, 2, 1);
      break;
    }
    case 'acc_flower':
      px(g, '#FFFFFF', 13, 4 + dy, 3, 3); px(g, '#FFFFFF', 14, 3 + dy); px(g, '#F2C230', 14, 5 + dy);
      px(g, '#E8E4DA', 15, 6 + dy);
      break;
    case 'acc_bow': {
      const c = ramp('#E5566F');
      px(g, c[2], 11, 0 + dy, 3, 3); px(g, c[2], 15, 0 + dy, 3, 3); px(g, c[1], 14, 1 + dy, 1, 1); px(g, c[3], 11, 0 + dy); px(g, c[3], 15, 0 + dy);
      px(g, c[1], 13, 3 + dy); px(g, c[1], 15, 3 + dy);
      break;
    }
    case 'acc_headphones': {
      const c = ramp('#3A3A44');
      px(g, c[2], 4, 1 + dy, 12, 1); px(g, c[2], 3, 2 + dy, 1, 4); px(g, c[2], 16, 2 + dy, 1, 4);
      px(g, '#E5566F', 2, 6 + dy, 2, 4); px(g, '#E5566F', 16, 6 + dy, 2, 4); px(g, c[3], 2, 6 + dy);
      break;
    }
    case 'acc_catears': {
      const h = hair;
      for (const x of [5, 12]) { px(g, h[2], x, 0 + dy, 3, 2); px(g, h[2], x + 1, -1 + dy + 0, 1, 1); px(g, '#F2A7C3', x + 1, 1 + dy); }
      px(g, '#3A3A44', 4, 2 + dy, 12, 1);
      break;
    }
  }
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
  g.drawImage(src, 0, 0, FW, top, 0, 0, FW, top);
  g.drawImage(src, 0, top + rows, FW, FH - top - rows, 0, top + rows, FW, FH - top - rows);
  g.drawImage(src, 0, top, 7, rows, 1, top, 7, rows); // ..6 -> ..7
  g.drawImage(src, 8, top, 4, rows, 8, top, 4, rows);
  g.drawImage(src, 13, top, FW - 13, rows, 12, top, FW - 13, rows); // 13.. -> 12..
}

export interface PaintOptions { look: AvatarLook; frame: string; view: 'front' | 'back' }

/** Paint one frame into g at (ox, oy). */
export function paintAvatarFrame(g: Ctx, ox: number, oy: number, opt: PaintOptions) {
  const f = FRAMES[opt.frame] ?? FRAMES.idle;
  const [c, cg] = canvas(FW, FH);
  const skin = ramp(SKINS[opt.look.skin] ?? SKINS[1]);
  const hair = ramp(HAIR_COLORS[opt.look.hairColor] ?? HAIR_COLORS[1]);
  const style = HAIR[opt.look.hair] ?? HAIR.short;
  const outfit = OUTFITS[opt.look.outfit] ?? OUTFITS.fit_tee;
  const oc: OutfitColors = { top: ramp(outfit.top), bottom: ramp(outfit.bottom) };
  const sleeve = ramp(outfit.sleeve ?? outfit.top);
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
  if (f.legs !== 'sit' && f.arms[1].behind) drawArm(cg, behindSx, 14, f.arms[1], sleeve, skin, outfit.sleeves === 'short');
  cg.restore();

  const [bc, bg] = canvas(FW, FH);
  bg.translate(0, bob);
  drawBody(bg, outfit, oc, skin, f.legs, view);
  outfit.detail?.(bg, view, oc);
  if (girl) narrowTorso(cg, bc, bob);
  else cg.drawImage(bc, 0, 0);

  cg.save();
  cg.translate(0, sitDrop + bob);
  if (f.legs === 'sit' && f.arms[1].behind) drawArm(cg, behindSx, 14, f.arms[1], sleeve, skin, outfit.sleeves === 'short');
  drawHead(cg, skin, headDy, view);
  if (view === 'front') drawFace(cg, f.expr, skin, eye, headDy, opt.look);
  drawHairMap(cg, view === 'front' ? style.front : style.back, (view === 'front' ? style.frontY ?? 0 : style.backY ?? 0) + 1 + headDy, hair);
  drawAccessory(cg, opt.look.accessory, view, headDy, hair);
  // Arms go over the body (near arm last). In the back view the near arm is screen-left too.
  if (!f.arms[1].behind) drawArm(cg, farSx, 14, f.arms[1], sleeve, skin, outfit.sleeves === 'short');
  drawArm(cg, nearSx, 14, f.arms[0], sleeve, skin, outfit.sleeves === 'short');
  drawProp(cg, f.prop);
  cg.restore();

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

/** A standalone canvas of one frame, scaled up, for UI previews (avatar editor, partner card). */
export function avatarPreview(look: AvatarLook, frame = 'idle', view: 'front' | 'back' = 'front', scale = 4): HTMLCanvasElement {
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
export function avatarThumb(look: AvatarLook, part: 'head' | 'full', scale = 3): string {
  const key = `${part}${scale}${JSON.stringify(look)}`;
  const hit = thumbs.get(key);
  if (hit) return hit;
  const h = part === 'head' ? 16 : FH;
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
