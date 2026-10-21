// Where avatars go to use furniture: which tile they walk to, where they end up, which way
// they face, how high they sit. Pure functions so the rules are unit-tested.

import { footprint, ITEM_BY_KEY, type Action, type ItemDef } from '../data/catalog';
import { blockedTiles, cellsOf, inFloor, key, neighbors, type Placement, type Tile } from './grid';
import { ORIGIN, STUDIO, type FloorPlan } from './layout';

export type Facing = '+x' | '-x' | '+z' | '-z';
export type Pose = 'sit' | 'lie' | 'stand';

export interface Spot {
  /** Tile the avatar walks to before using the spot. */
  approach: Tile;
  /** Final resting point in world units (may be inside furniture). */
  world: { x: number; z: number };
  facing: Facing;
  height: number;
  pose: Pose;
  /** Rotation of a lying body around the vertical axis, in quarter turns. */
  lieRot?: number;
}

const FRONT: Facing[] = ['+z', '+x', '-z', '-x'];
const OPP: Record<Facing, Facing> = { '+x': '-x', '-x': '+x', '+z': '-z', '-z': '+z' };

export const SEAT_HEIGHT: Record<string, number> = {
  seat_cushion: 0.16, seat_stool: 0.5, seat_beanbag: 0.4, seat_loveseat: 0.42, seat_sofa: 0.42, window_seat: 0.4,
  bed_mat: 0.1, bed_futon: 0.36, bed_wood: 0.56, bed_quilted: 0.64, bed_canopy: 0.66,
};

/** Map an item-local point (rot 0, tile units) to world coordinates. */
export function localToWorld(def: ItemDef, p: Pick<Placement, 'x' | 'y' | 'rot'>, lx: number, lz: number): { x: number; z: number } {
  const [w, d] = def.size ?? [1, 1];
  let x = lx, z = lz;
  switch (((p.rot % 4) + 4) % 4) {
    case 1: x = lz; z = w - lx; break;
    case 2: x = w - lx; z = d - lz; break;
    case 3: x = d - lz; z = lx; break;
  }
  return { x: -ORIGIN.w / 2 + p.x + x, z: -ORIGIN.d / 2 + p.y + z };
}

export function frontOf(rot: number): Facing {
  return FRONT[((rot % 4) + 4) % 4];
}

function worldToTile(w: { x: number; z: number }): Tile {
  return { x: Math.floor(w.x + ORIGIN.w / 2), y: Math.floor(w.z + ORIGIN.d / 2) };
}

function step(t: Tile, f: Facing): Tile {
  return f === '+x' ? { x: t.x + 1, y: t.y } : f === '-x' ? { x: t.x - 1, y: t.y } : f === '+z' ? { x: t.x, y: t.y + 1 } : { x: t.x, y: t.y - 1 };
}

/** A free floor tile next to `t`, preferring the given direction. */
function approachFor(t: Tile, prefer: Facing, blocked: Set<string>, L: FloorPlan): Tile | null {
  const first = step(t, prefer);
  if (inFloor(first, L) && !blocked.has(key(first.x, first.y))) return first;
  for (const n of neighbors(t, L)) if (!blocked.has(key(n.x, n.y))) return n;
  return null;
}

/** Spots for using an item. Returns as many as the item offers (two people can share a sofa). */
export function spotsFor(p: Placement, action: Action, placements: Placement[], L: FloorPlan = STUDIO): Spot[] {
  const def = ITEM_BY_KEY[p.item];
  if (!def || p.surface !== 'floor') return [];
  const blocked = blockedTiles(placements);
  const [w, d] = def.size ?? [1, 1];
  const front = frontOf(p.rot);
  const out: Spot[] = [];
  const h = SEAT_HEIGHT[def.key] ?? 0;

  if (action === 'sleep' && def.category === 'bed') {
    // Lie with the head on the pillow (local z near 0), one spot per tile of width.
    for (let i = 0; i < w; i++) {
      // Head on the pillow (sprite top lands about 0.15 in from the head end).
      const world = localToWorld(def, p, i + 0.5, 1.2);
      const tile = worldToTile(world);
      const a = approachFor(tile, front, blocked, L) ?? approachFor(worldToTile(localToWorld(def, p, i + 0.5, d - 0.5)), front, blocked, L);
      if (a) out.push({ approach: a, world, facing: front, height: h, pose: 'lie', lieRot: p.rot });
    }
    return out;
  }

  if (action === 'sit' && (def.category === 'seating' || def.key === 'window_seat' || def.category === 'bed')) {
    // Seats: sit on each tile of the front row, facing out.
    const row = def.category === 'bed' ? d - 0.5 : 0.55;
    for (let i = 0; i < w; i++) {
      const world = localToWorld(def, p, i + 0.5, row);
      const tile = worldToTile(world);
      const a = approachFor(tile, front, blocked, L);
      if (a) out.push({ approach: a, world, facing: front, height: h, pose: 'sit' });
    }
    return out;
  }

  if (action === 'play' || action === 'write') {
    // Around a table: free tiles touching the footprint, facing the table, seated on the floor
    // (or on a cushion/stool if one is already there).
    const cells = cellsOf(def, p);
    const cellKeys = new Set(cells.map((c) => key(c.x, c.y)));
    const seen = new Set<string>();
    const cand: Spot[] = [];
    for (const c of cells) for (const dir of FRONT) {
      const n = step(c, dir);
      const k = key(n.x, n.y);
      if (cellKeys.has(k) || seen.has(k) || !inFloor(n, L)) continue;
      seen.add(k);
      const seat = placements.find((q) => q.surface === 'floor' && ITEM_BY_KEY[q.item]?.category === 'seating' && ITEM_BY_KEY[q.item]!.size?.[0] === 1 && cellsOf(ITEM_BY_KEY[q.item]!, q).some((t) => t.x === n.x && t.y === n.y));
      if (blocked.has(k) && !seat) continue;
      const world = { x: -ORIGIN.w / 2 + n.x + 0.5, z: -ORIGIN.d / 2 + n.y + 0.5 };
      const approach = seat ? approachFor(n, OPP[dir], blocked, L) : n;
      if (!approach) continue;
      cand.push({ approach, world, facing: OPP[dir], height: seat ? SEAT_HEIGHT[seat.item] ?? 0 : 0, pose: 'sit' });
    }
    // Prefer two spots facing each other.
    cand.sort((a, b) => (a.facing === '-z' || a.facing === '+z' ? 0 : 1) - (b.facing === '-z' || b.facing === '+z' ? 0 : 1));
    const pair = cand.find((s) => cand.some((o) => o !== s && o.facing === OPP[s.facing]));
    if (pair) {
      const other = cand.find((o) => o !== pair && o.facing === OPP[pair.facing])!;
      return [pair, other, ...cand.filter((c) => c !== pair && c !== other)];
    }
    return cand;
  }

  // Everything else: stand in front of it, facing it.
  const [fw, fd] = footprint(def, p.rot);
  void fw; void fd;
  const cells = cellsOf(def, p);
  for (const c of cells) {
    const n = step(c, front);
    if (!inFloor(n, L) || blocked.has(key(n.x, n.y))) continue;
    out.push({ approach: n, world: { x: -ORIGIN.w / 2 + n.x + 0.5, z: -ORIGIN.d / 2 + n.y + 0.5 }, facing: OPP[front], height: 0, pose: 'stand' });
  }
  if (!out.length) {
    for (const c of cells) for (const n of neighbors(c, L)) {
      if (blocked.has(key(n.x, n.y)) || cells.some((q) => q.x === n.x && q.y === n.y)) continue;
      const dir = (['+x', '-x', '+z', '-z'] as Facing[]).find((f) => { const s = step(n, f); return s.x === c.x && s.y === c.y; })!;
      out.push({ approach: n, world: { x: -ORIGIN.w / 2 + n.x + 0.5, z: -ORIGIN.d / 2 + n.y + 0.5 }, facing: dir, height: 0, pose: 'stand' });
    }
  }
  return out;
}
