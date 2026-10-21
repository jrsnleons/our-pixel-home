// Four-direction A* over the floor grid. Homes are at most a couple of hundred tiles, so this runs in microseconds;
// clarity beats a binary heap here.

import { key, neighbors, type Tile } from './grid';
import { STUDIO, type FloorPlan } from './layout';

const manhattan = (a: Tile, b: Tile) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/**
 * Path from start to goal, excluding start, including goal. Returns null if unreachable.
 * The start tile may be blocked (you can always step off furniture you were sitting on).
 * Paths prefer to keep going straight so walking looks deliberate, not zig-zaggy.
 */
export function findPath(start: Tile, goal: Tile, blocked: Set<string>, L: FloorPlan = STUDIO): Tile[] | null {
  if (start.x === goal.x && start.y === goal.y) return [];
  if (blocked.has(key(goal.x, goal.y))) return null;
  const open: { t: Tile; f: number; g: number; dir: number }[] = [{ t: start, f: manhattan(start, goal), g: 0, dir: -1 }];
  const came = new Map<string, Tile>();
  const best = new Map<string, number>([[key(start.x, start.y), 0]]);
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur.t.x === goal.x && cur.t.y === goal.y) {
      const path: Tile[] = [];
      let k = key(goal.x, goal.y);
      let t: Tile | undefined = goal;
      while (t && !(t.x === start.x && t.y === start.y)) {
        path.push(t);
        t = came.get(k);
        if (t) k = key(t.x, t.y);
      }
      return path.reverse();
    }
    neighbors(cur.t, L).forEach((n, dir) => {
      const nk = key(n.x, n.y);
      if (blocked.has(nk)) return;
      // A small penalty for turning keeps paths in straight runs.
      const g = cur.g + 1 + (cur.dir !== -1 && cur.dir !== dir ? 0.01 : 0);
      if (g >= (best.get(nk) ?? Infinity)) return;
      best.set(nk, g);
      came.set(nk, cur.t);
      open.push({ t: n, g, f: g + manhattan(n, goal), dir });
    });
  }
  return null;
}

/** Nearest reachable walkable tile next to any of `targets` (for walking up to furniture or a person). */
export function pathToAdjacent(start: Tile, targets: Tile[], blocked: Set<string>, prefer?: (t: Tile) => number, L: FloorPlan = STUDIO): Tile[] | null {
  const targetKeys = new Set(targets.map((t) => key(t.x, t.y)));
  const candidates: Tile[] = [];
  for (const t of targets) for (const n of neighbors(t, L)) {
    if (!blocked.has(key(n.x, n.y)) && !targetKeys.has(key(n.x, n.y))) candidates.push(n);
  }
  let best: Tile[] | null = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    if (c.x === start.x && c.y === start.y) {
      const score = prefer ? prefer(c) : 0;
      if (score < bestScore) { best = []; bestScore = score; }
      continue;
    }
    const p = findPath(start, c, blocked, L);
    if (!p) continue;
    const score = p.length + (prefer ? prefer(c) : 0);
    if (score < bestScore) { best = p; bestScore = score; }
  }
  return best;
}

/** The closest walkable tile to `t` (breadth-first), used when someone ends up inside furniture. */
export function nearestFree(t: Tile, blocked: Set<string>, L: FloorPlan = STUDIO): Tile | null {
  const seen = new Set([key(t.x, t.y)]);
  const q = [t];
  while (q.length) {
    const c = q.shift()!;
    if (!blocked.has(key(c.x, c.y))) return c;
    for (const n of neighbors(c, L)) {
      const k = key(n.x, n.y);
      if (!seen.has(k)) { seen.add(k); q.push(n); }
    }
  }
  return null;
}
