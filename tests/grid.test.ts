import { describe, expect, it } from 'vitest';
import { allFreeTilesConnected, blockedTiles, canPlace, findFreeSpot, type Placement } from '../src/core/grid';
import { findPath, nearestFree, pathToAdjacent } from '../src/core/pathfinding';
import { item } from '../src/data/catalog';

const P = (id: string, itemKey: string, x: number, y: number, rot = 0, surface: Placement['surface'] = 'floor'): Placement =>
  ({ id, item: itemKey, surface, x, y, rot });

describe('placement', () => {
  it('blocks the tiles a bed covers, rotated or not', () => {
    const bed = P('a', 'bed_wood', 0, 0);
    expect([...blockedTiles([bed])].sort()).toEqual(['0,0', '0,1', '0,2', '1,0', '1,1', '1,2']);
    const turned = P('b', 'bed_wood', 0, 0, 1);
    expect([...blockedTiles([turned])].sort()).toEqual(['0,0', '0,1', '1,0', '1,1', '2,0', '2,1']);
  });

  it('refuses to overlap furniture or leave the room', () => {
    const placed = [P('a', 'table_games', 2, 2)];
    expect(canPlace(item('seat_stool'), { surface: 'floor', x: 3, y: 2, rot: 0 }, placed).ok).toBe(false);
    expect(canPlace(item('seat_stool'), { surface: 'floor', x: 4, y: 2, rot: 0 }, placed).ok).toBe(true);
    expect(canPlace(item('bed_wood'), { surface: 'floor', x: 6, y: 0, rot: 0 }, []).ok).toBe(false);
  });

  it('lets furniture sit on a rug and people walk on rugs', () => {
    const placed = [P('r', 'rug_diamond', 1, 1)];
    expect(canPlace(item('table_games'), { surface: 'floor', x: 2, y: 2, rot: 0 }, placed).ok).toBe(true);
    expect(blockedTiles(placed).size).toBe(0);
    expect(canPlace(item('rug_round'), { surface: 'floor', x: 2, y: 1, rot: 0 }, placed).ok).toBe(false);
  });

  it('never lets a placement cut the room in two', () => {
    const wall = [0, 1, 2, 3, 4, 5].map((x) => P(`s${x}`, 'seat_stool', x, 3));
    expect(allFreeTilesConnected(blockedTiles(wall))).toBe(true);
    const r = canPlace(item('seat_stool'), { surface: 'floor', x: 6, y: 3, rot: 0 }, wall);
    expect(r.ok).toBe(false);
  });

  it('keeps wall items off the window and door', () => {
    expect(canPlace(item('frame_s'), { surface: 'back', x: 3, y: 1, rot: 0 }, []).ok).toBe(false);
    expect(canPlace(item('frame_s'), { surface: 'back', x: 0, y: 1, rot: 0 }, []).ok).toBe(true);
    expect(canPlace(item('frame_xl'), { surface: 'left', x: 3, y: 0, rot: 0 }, []).ok).toBe(false);
    expect(canPlace(item('frame_s'), { surface: 'floor', x: 0, y: 0, rot: 0 }, []).ok).toBe(false);
  });

  it('finds a free spot for new furniture', () => {
    const spot = findFreeSpot(item('bed_wood'), [P('m', 'bed_mat', 0, 0)]);
    expect(spot).not.toBeNull();
    expect(canPlace(item('bed_wood'), spot!, [P('m', 'bed_mat', 0, 0)]).ok).toBe(true);
  });
});

describe('pathfinding', () => {
  it('walks around furniture, never through it', () => {
    const blocked = blockedTiles([P('t', 'store_bookshelf', 1, 2), P('u', 'store_bookshelf', 3, 2)]);
    const path = findPath({ x: 2, y: 1 }, { x: 2, y: 3 }, blocked)!;
    expect(path).not.toBeNull();
    for (const t of path) expect(blocked.has(`${t.x},${t.y}`)).toBe(false);
    expect(path.at(-1)).toEqual({ x: 2, y: 3 });
  });

  it('returns null when the goal is unreachable', () => {
    expect(findPath({ x: 0, y: 0 }, { x: 1, y: 1 }, new Set(['1,1']))).toBeNull();
  });

  it('walks up next to a table', () => {
    const blocked = blockedTiles([P('t', 'table_games', 3, 3)]);
    const p = pathToAdjacent({ x: 0, y: 0 }, [{ x: 3, y: 3 }, { x: 4, y: 3 }], blocked)!;
    const end = p.at(-1)!;
    const touching = [[3, 3], [4, 3]].some(([x, y]) => Math.abs(end.x - x) + Math.abs(end.y - y) === 1);
    expect(touching).toBe(true);
  });

  it('steps out of furniture to the nearest free tile', () => {
    const blocked = blockedTiles([P('b', 'bed_wood', 0, 0)]);
    const t = nearestFree({ x: 0, y: 0 }, blocked)!;
    expect(blocked.has(`${t.x},${t.y}`)).toBe(false);
  });
});
