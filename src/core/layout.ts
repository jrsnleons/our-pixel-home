// Home layouts. A home is a set of rectangular rooms on the tile grid; the studio is one 7x7
// room. Every bigger home contains the previous one at the same tile coordinates (the "grows
// around you" rule), so upgrading never moves a placed item. Shared with the server.

import type { Tile } from './grid';

export type HomeId = 'studio' | 'one_bed' | 'two_bed' | 'condo' | 'house';

export interface RoomDef {
  id: string;
  name: string;
  /** Top-left tile and size, in tiles. */
  x: number;
  y: number;
  w: number;
  d: number;
}

/** A gap in a partition: between tile (x, y) and the tile to its right ('x') or below it ('y'). */
export interface Opening { x: number; y: number; dir: 'x' | 'y' }

export interface HomeLayout {
  id: HomeId;
  name: string;
  blurb: string;
  /** Coins at Hearth & Home Realty; the studio is where everyone starts. */
  price: number;
  /** Bounding box of every room, in tiles. */
  w: number;
  d: number;
  rooms: RoomDef[];
  /** Doorways in the half-height walls between rooms. Everything else between two rooms is wall. */
  openings: Opening[];
  /** Wall cells the shell uses itself (window on the back wall, door on the left wall). */
  fixedWall: Record<'back' | 'left', Tile[]>;
  /** The tile just inside the front door, where an arriving partner appears. */
  door: Tile;
}

/**
 * World coordinates are anchored on the studio, whatever the home: tile (0, 0) is always at
 * (-3.5, -3.5), so the studio never shifts when the home grows around it.
 */
export const ORIGIN = { w: 7, d: 7 } as const;

export const STUDIO: HomeLayout = {
  id: 'studio',
  name: 'Studio',
  blurb: 'One cozy room. Everyone starts here.',
  price: 0,
  w: 7,
  d: 7,
  rooms: [{ id: 'main', name: 'Studio', x: 0, y: 0, w: 7, d: 7 }],
  openings: [],
  fixedWall: {
    back: [{ x: 3, y: 1 }, { x: 4, y: 1 }, { x: 3, y: 2 }, { x: 4, y: 2 }],
    left: [{ x: 4, y: 0 }, { x: 5, y: 0 }, { x: 4, y: 1 }, { x: 5, y: 1 }],
  },
  door: { x: 0, y: 5 },
};

/** What walking and pathfinding need to know about a place: the floor it covers. Towns and shops use this too. */
export type FloorPlan = Pick<HomeLayout, 'w' | 'd' | 'rooms'> & { openings?: Opening[] };





const FIXED = STUDIO.fixedWall;
const o = (x: number, y: number, dir: 'x' | 'y'): Opening => ({ x, y, dir });

/** Each home contains the one before it at the same tile coordinates, so upgrading never moves a thing. */
export const ONE_BED: HomeLayout = {
  id: 'one_bed', name: '1-bedroom', blurb: 'A living room and a bedroom with a doorway between.', price: 5000,
  w: 12, d: 7,
  rooms: [
    { id: 'living', name: 'Living room', x: 0, y: 0, w: 7, d: 7 },
    { id: 'bedroom', name: 'Bedroom', x: 7, y: 0, w: 5, d: 7 },
  ],
  openings: [o(6, 3, 'x'), o(6, 4, 'x')],
  fixedWall: FIXED, door: STUDIO.door,
};

export const TWO_BED: HomeLayout = {
  id: 'two_bed', name: '2-bedroom', blurb: 'Two bedrooms and a bathroom around the living room.', price: 15000,
  w: 12, d: 10,
  rooms: [
    { id: 'living', name: 'Living room', x: 0, y: 0, w: 7, d: 7 },
    { id: 'bedroom', name: 'Bedroom', x: 7, y: 0, w: 5, d: 7 },
    { id: 'bedroom2', name: 'Second bedroom', x: 0, y: 7, w: 7, d: 3 },
    { id: 'bath', name: 'Bathroom', x: 7, y: 7, w: 5, d: 3 },
  ],
  openings: [o(6, 3, 'x'), o(6, 4, 'x'), o(2, 6, 'y'), o(3, 6, 'y'), o(9, 6, 'y'), o(6, 8, 'x')],
  fixedWall: FIXED, door: STUDIO.door,
};

export const CONDO: HomeLayout = {
  id: 'condo', name: 'Condo', blurb: 'A study off the bedroom and a balcony with a view.', price: 30000,
  w: 16, d: 10,
  rooms: [
    ...TWO_BED.rooms,
    { id: 'study', name: 'Study', x: 12, y: 0, w: 4, d: 6 },
    { id: 'balcony', name: 'Balcony', x: 12, y: 6, w: 4, d: 4 },
  ],
  openings: [...TWO_BED.openings, o(11, 2, 'x'), o(11, 3, 'x'), o(13, 5, 'y'), o(14, 5, 'y')],
  fixedWall: FIXED, door: STUDIO.door,
};

export const HOUSE: HomeLayout = {
  id: 'house', name: 'House', blurb: 'A dining room, a kitchen and a porch to sit on.', price: 60000,
  w: 20, d: 11,
  rooms: [
    ...CONDO.rooms,
    { id: 'dining', name: 'Dining room', x: 16, y: 0, w: 4, d: 5 },
    { id: 'kitchen', name: 'Kitchen', x: 16, y: 5, w: 4, d: 5 },
    { id: 'porch', name: 'Porch', x: 0, y: 10, w: 20, d: 1 },
  ],
  openings: [...CONDO.openings, o(15, 2, 'x'), o(15, 3, 'x'), o(17, 4, 'y'), o(18, 4, 'y'), o(15, 7, 'x'), o(15, 8, 'x'), o(3, 9, 'y'), o(4, 9, 'y')],
  fixedWall: FIXED, door: STUDIO.door,
};

export const LAYOUTS: Record<HomeId, HomeLayout> = { studio: STUDIO, one_bed: ONE_BED, two_bed: TWO_BED, condo: CONDO, house: HOUSE };
export const HOME_ORDER: HomeId[] = ['studio', 'one_bed', 'two_bed', 'condo', 'house'];

/** The next home up the ladder, or null at the top. */
export function nextHome(id: string | null | undefined): HomeLayout | null {
  const i = HOME_ORDER.indexOf((id ?? 'studio') as HomeId);
  return i >= 0 && i < HOME_ORDER.length - 1 ? LAYOUTS[HOME_ORDER[i + 1]] : null;
}

export function layoutOf(id: string | null | undefined): HomeLayout {
  return LAYOUTS[(id ?? 'studio') as HomeId] ?? STUDIO;
}

const floors = new WeakMap<FloorPlan, Set<string>>();

/** The floor tiles of a home as "x,y" keys. */
export function floorTiles(L: FloorPlan): Set<string> {
  let s = floors.get(L);
  if (!s) {
    s = new Set();
    for (const r of L.rooms) for (let y = r.y; y < r.y + r.d; y++) for (let x = r.x; x < r.x + r.w; x++) s.add(`${x},${y}`);
    floors.set(L, s);
  }
  return s;
}

/** Which room a floor tile is in. */
export function roomAt(L: FloorPlan, t: Tile): RoomDef | null {
  return L.rooms.find((r) => t.x >= r.x && t.y >= r.y && t.x < r.x + r.w && t.y < r.y + r.d) ?? null;
}

/** True when you can walk (or place a piece) from one tile straight to the one next to it: same room, or through a doorway. */
export function crossable(L: FloorPlan, a: Tile, b: Tile): boolean {
  const ra = roomAt(L, a), rb = roomAt(L, b);
  if (!ra || !rb || ra === rb) return true;
  const ops = L.openings;
  if (!ops?.length) return false;
  const [p, q] = a.x < b.x || a.y < b.y ? [a, b] : [b, a];
  const dir = p.x !== q.x ? 'x' : 'y';
  return ops.some((op) => op.dir === dir && op.x === p.x && op.y === p.y);
}
