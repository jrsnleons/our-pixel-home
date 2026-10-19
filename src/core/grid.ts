// The studio's tile grids. One floor tile is one world unit and 16 texture pixels.
// Floor coordinates: x runs left to right along the back wall, y runs from the back wall
// toward the camera. Wall coordinates: x runs along the wall, y counts rows up from the
// wainscot.

import { footprint, ITEM_BY_KEY, type ItemDef } from '../data/catalog';

export const ROOM = { w: 7, d: 7, wallRows: 3, wallHeight: 4, wainscot: 1 } as const;

export type Surface = 'floor' | 'back' | 'left';

export interface Placement {
  id: string;
  item: string;
  surface: Surface;
  x: number;
  y: number;
  rot: number;
  /** Item-specific data: photo path, verse text, growth start time. */
  data?: Record<string, unknown> | null;
}

export interface Tile { x: number; y: number }

/** Wall cells the room itself uses: the window on the back wall and the door on the left. */
export const FIXED_WALL_CELLS: Record<'back' | 'left', Tile[]> = {
  back: [{ x: 3, y: 1 }, { x: 4, y: 1 }, { x: 3, y: 2 }, { x: 4, y: 2 }],
  left: [{ x: 4, y: 0 }, { x: 5, y: 0 }, { x: 4, y: 1 }, { x: 5, y: 1 }],
};

/** The tile just inside the door, where an arriving partner appears. */
export const DOOR_TILE: Tile = { x: 0, y: 5 };

export const key = (x: number, y: number) => `${x},${y}`;

export function cellsOf(def: ItemDef, p: Pick<Placement, 'x' | 'y' | 'rot'>): Tile[] {
  const [w, d] = def.kind === 'wall-item' ? (def.size ?? [1, 1]) : footprint(def, p.rot);
  const out: Tile[] = [];
  for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) out.push({ x: p.x + i, y: p.y + j });
  return out;
}

export function blocksWalking(def: ItemDef): boolean {
  return def.kind === 'floor-item' && !def.flat && !def.hanging;
}

export function inFloor(t: Tile): boolean {
  return t.x >= 0 && t.y >= 0 && t.x < ROOM.w && t.y < ROOM.d;
}

export function inWall(t: Tile, surface: 'back' | 'left'): boolean {
  const len = surface === 'back' ? ROOM.w : ROOM.d;
  return t.x >= 0 && t.y >= 0 && t.x < len && t.y < ROOM.wallRows;
}

/** Floor tiles people can't walk on. */
export function blockedTiles(placements: Placement[], ignoreId?: string): Set<string> {
  const s = new Set<string>();
  for (const p of placements) {
    if (p.id === ignoreId || p.surface !== 'floor') continue;
    const def = ITEM_BY_KEY[p.item];
    if (!def || !blocksWalking(def)) continue;
    for (const c of cellsOf(def, p)) s.add(key(c.x, c.y));
  }
  return s;
}

export type FitResult = { ok: true } | { ok: false; reason: string; bad: Tile[] };

/**
 * Can `def` go at this spot? Rugs may overlap furniture but not other rugs; furniture may sit
 * on rugs; hanging items only collide with other hanging items.
 */
export function canPlace(
  def: ItemDef,
  spot: { surface: Surface; x: number; y: number; rot: number },
  placements: Placement[],
  opts: { ignoreId?: string; occupiedByPeople?: Tile[] } = {},
): FitResult {
  const cells = cellsOf(def, spot);
  const bad: Tile[] = [];
  if (def.kind === 'wall-item') {
    if (spot.surface === 'floor') return { ok: false, reason: 'This goes on a wall.', bad: cells };
    const wall = spot.surface;
    const taken = new Set(FIXED_WALL_CELLS[wall].map((c) => key(c.x, c.y)));
    for (const p of placements) {
      if (p.id === opts.ignoreId || p.surface !== wall) continue;
      const d = ITEM_BY_KEY[p.item];
      if (d) for (const c of cellsOf(d, p)) taken.add(key(c.x, c.y));
    }
    for (const c of cells) if (!inWall(c, wall) || taken.has(key(c.x, c.y))) bad.push(c);
    return bad.length ? { ok: false, reason: 'That spot on the wall is taken.', bad } : { ok: true };
  }
  if (spot.surface !== 'floor') return { ok: false, reason: 'This goes on the floor.', bad: cells };
  const layer = (d: ItemDef) => (d.flat ? 'flat' : d.hanging ? 'hanging' : 'solid');
  const mine = layer(def);
  const taken = new Set<string>();
  for (const p of placements) {
    if (p.id === opts.ignoreId || p.surface !== 'floor') continue;
    const d = ITEM_BY_KEY[p.item];
    if (!d || layer(d) !== mine) continue;
    for (const c of cellsOf(d, p)) taken.add(key(c.x, c.y));
  }
  const people = new Set((mine === 'solid' ? opts.occupiedByPeople ?? [] : []).map((t) => key(t.x, t.y)));
  for (const c of cells) {
    if (!inFloor(c) || taken.has(key(c.x, c.y)) || people.has(key(c.x, c.y))) bad.push(c);
  }
  if (bad.length) {
    const outside = bad.some((c) => !inFloor(c));
    return { ok: false, reason: outside ? 'It doesn’t fit inside the room there.' : 'Something is already there.', bad };
  }
  if (mine === 'solid') {
    const others = placements.filter((p) => p.id !== opts.ignoreId);
    const blocked = blockedTiles([...others, { id: '__probe', item: def.key, ...spot, data: null }]);
    if (!allFreeTilesConnected(blocked)) return { ok: false, reason: 'That would cut off part of the room.', bad: cells };
  }
  return { ok: true };
}

/** First free spot for an item, scanning from the back-left corner. Used for auto-placing. */
export function findFreeSpot(def: ItemDef, placements: Placement[], avoid: Tile[] = []): { surface: Surface; x: number; y: number; rot: number } | null {
  if (def.kind === 'wall-item') {
    for (const surface of ['back', 'left'] as const) {
      const len = surface === 'back' ? ROOM.w : ROOM.d;
      for (let y = ROOM.wallRows - 1; y >= 0; y--) for (let x = 0; x < len; x++) {
        const spot = { surface, x, y, rot: 0 };
        if (canPlace(def, spot, placements).ok) return spot;
      }
    }
    return null;
  }
  for (const rot of [0, 1]) for (let y = 0; y < ROOM.d; y++) for (let x = 0; x < ROOM.w; x++) {
    const spot = { surface: 'floor' as const, x, y, rot };
    if (canPlace(def, spot, placements, { occupiedByPeople: avoid }).ok) return spot;
  }
  return null;
}

/** True if every walkable tile can reach every other one. Placement refuses to cut the room in two. */
export function allFreeTilesConnected(blocked: Set<string>): boolean {
  let start: Tile | null = null;
  let total = 0;
  for (let y = 0; y < ROOM.d; y++) for (let x = 0; x < ROOM.w; x++) {
    if (!blocked.has(key(x, y))) { total++; start ??= { x, y }; }
  }
  if (!start) return true;
  const seen = new Set([key(start.x, start.y)]);
  const q = [start];
  while (q.length) {
    const t = q.pop()!;
    for (const n of neighbors(t)) {
      const k = key(n.x, n.y);
      if (!seen.has(k) && !blocked.has(k)) { seen.add(k); q.push(n); }
    }
  }
  return seen.size === total;
}

export function neighbors(t: Tile): Tile[] {
  return [
    { x: t.x + 1, y: t.y }, { x: t.x - 1, y: t.y }, { x: t.x, y: t.y + 1 }, { x: t.x, y: t.y - 1 },
  ].filter(inFloor);
}

/** World position of a floor tile's center. The room spans -3.5..3.5 on both axes. */
export function tileToWorld(t: Tile): { x: number; z: number } {
  return { x: t.x - ROOM.w / 2 + 0.5, z: t.y - ROOM.d / 2 + 0.5 };
}

export function worldToTile(x: number, z: number): Tile {
  return { x: Math.floor(x + ROOM.w / 2), y: Math.floor(z + ROOM.d / 2) };
}
