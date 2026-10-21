// Home layouts. A home is a set of rectangular rooms on the tile grid; the studio is one 7x7
// room. Every bigger home contains the previous one at the same tile coordinates (the "grows
// around you" rule), so upgrading never moves a placed item. Shared with the server.

import type { Tile } from './grid';

export type HomeId = 'studio';

export interface RoomDef {
  id: string;
  name: string;
  /** Top-left tile and size, in tiles. */
  x: number;
  y: number;
  w: number;
  d: number;
}

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
  fixedWall: {
    back: [{ x: 3, y: 1 }, { x: 4, y: 1 }, { x: 3, y: 2 }, { x: 4, y: 2 }],
    left: [{ x: 4, y: 0 }, { x: 5, y: 0 }, { x: 4, y: 1 }, { x: 5, y: 1 }],
  },
  door: { x: 0, y: 5 },
};

export const LAYOUTS: Record<HomeId, HomeLayout> = { studio: STUDIO };

export const HOME_ORDER: HomeId[] = ['studio'];

export function layoutOf(id: string | null | undefined): HomeLayout {
  return LAYOUTS[(id ?? 'studio') as HomeId] ?? STUDIO;
}

const floors = new WeakMap<HomeLayout, Set<string>>();

/** The floor tiles of a home as "x,y" keys. */
export function floorTiles(L: HomeLayout): Set<string> {
  let s = floors.get(L);
  if (!s) {
    s = new Set();
    for (const r of L.rooms) for (let y = r.y; y < r.y + r.d; y++) for (let x = r.x; x < r.x + r.w; x++) s.add(`${x},${y}`);
    floors.set(L, s);
  }
  return s;
}

/** Which room a floor tile is in. */
export function roomAt(L: HomeLayout, t: Tile): RoomDef | null {
  return L.rooms.find((r) => t.x >= r.x && t.y >= r.y && t.x < r.x + r.w && t.y < r.y + r.d) ?? null;
}
