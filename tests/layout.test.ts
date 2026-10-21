import { describe, expect, it } from 'vitest';
import { canPlace, inFloor, key, neighbors, tileToWorld, wallLength } from '../src/core/grid';
import { floorTiles, HOME_ORDER, layoutOf, LAYOUTS, nextHome, roomAt, STUDIO } from '../src/core/layout';
import { findPath } from '../src/core/pathfinding';
import { item } from '../src/data/catalog';


describe('layouts', () => {
  it('knows the studio as the default home', () => {
    expect(layoutOf(undefined)).toBe(STUDIO);
    expect(layoutOf('nonsense')).toBe(STUDIO);
    expect(floorTiles(STUDIO).size).toBe(49);
    expect(roomAt(STUDIO, { x: 6, y: 6 })?.id).toBe('main');
    expect(roomAt(STUDIO, { x: 7, y: 0 })).toBeNull();
  });

  it('gives each home a floor that matches its rooms and fits its bounding box', () => {
    for (const L of Object.values(LAYOUTS)) {
      const area = L.rooms.reduce((n, r) => n + r.w * r.d, 0);
      expect(floorTiles(L).size).toBe(area); // rooms never overlap
      for (const r of L.rooms) { expect(r.x + r.w).toBeLessThanOrEqual(L.w); expect(r.y + r.d).toBeLessThanOrEqual(L.d); }
      expect(inFloor(L.door, L)).toBe(true);
      for (const [wall, cells] of Object.entries(L.fixedWall)) for (const c of cells) expect(c.x).toBeLessThan(wallLength(wall as 'back' | 'left', L));
    }
  });

  it('grows around the studio: every home contains the previous one at the same tiles', () => {
    for (let i = 1; i < HOME_ORDER.length; i++) {
      const prev = floorTiles(LAYOUTS[HOME_ORDER[i - 1]]);
      const next = floorTiles(LAYOUTS[HOME_ORDER[i]]);
      for (const k of prev) expect(next.has(k)).toBe(true);
      expect(LAYOUTS[HOME_ORDER[i]].price).toBeGreaterThan(LAYOUTS[HOME_ORDER[i - 1]].price);
    }
  });

  it('keeps tile (0, 0) at the same world spot whatever the home', () => {
    expect(tileToWorld({ x: 0, y: 0 })).toEqual({ x: -3, z: -3 });
  });

  it('stops walking and placing at the edge of the floor', () => {
    expect(neighbors({ x: 0, y: 0 })).toHaveLength(2);
    expect(canPlace(item('seat_stool'), { surface: 'floor', x: 7, y: 0, rot: 0 }, []).ok).toBe(false);
    expect(findPath({ x: 0, y: 0 }, { x: 6, y: 6 }, new Set(), STUDIO)?.length).toBe(12);
    expect(key(1, 2)).toBe('1,2');
  });
});

describe('the home ladder', () => {
  it('goes studio, 1-bedroom, 2-bedroom, condo, house for 5k, 15k, 30k and 60k', () => {
    expect(HOME_ORDER).toEqual(['studio', 'one_bed', 'two_bed', 'condo', 'house']);
    expect(HOME_ORDER.slice(1).map((id) => LAYOUTS[id].price)).toEqual([5000, 15000, 30000, 60000]);
    expect(nextHome(undefined)?.id).toBe('one_bed');
    expect(nextHome('house')).toBeNull();
  });

  it('tiles each home with rooms that fill its bounding box', () => {
    for (const L of Object.values(LAYOUTS)) expect(floorTiles(L).size, L.id).toBe(L.w * L.d);
  });

  it('puts doorways only between two different rooms, and every room can be reached from the front door', () => {
    for (const L of Object.values(LAYOUTS)) {
      for (const op of L.openings) {
        const a = { x: op.x, y: op.y }, b = op.dir === 'x' ? { x: op.x + 1, y: op.y } : { x: op.x, y: op.y + 1 };
        expect(roomAt(L, a), `${L.id} opening at ${op.x},${op.y}`).toBeTruthy();
        expect(roomAt(L, b)).toBeTruthy();
        expect(roomAt(L, a)).not.toBe(roomAt(L, b));
      }
      for (const r of L.rooms) {
        const mid = { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.d / 2) };
        expect(findPath(L.door, mid, new Set(), L), `${L.id}: ${r.id} reachable`).not.toBeNull();
      }
    }
  });

  it('stops walking and placing at a partition but lets you through a doorway', () => {
    const L = LAYOUTS.one_bed;
    expect(neighbors({ x: 6, y: 1 }, L).some((n) => n.x === 7)).toBe(false);
    expect(neighbors({ x: 6, y: 3 }, L).some((n) => n.x === 7)).toBe(true);
    expect(canPlace(item('bed_wood'), { surface: 'floor', x: 6, y: 0, rot: 1 }, [], { layout: L }).ok).toBe(false);
    expect(canPlace(item('bed_wood'), { surface: 'floor', x: 8, y: 0, rot: 0 }, [], { layout: L }).ok).toBe(true);
  });
});
