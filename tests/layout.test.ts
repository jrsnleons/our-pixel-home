import { describe, expect, it } from 'vitest';
import { canPlace, inFloor, key, neighbors, tileToWorld, wallLength } from '../src/core/grid';
import { floorTiles, HOME_ORDER, layoutOf, LAYOUTS, roomAt, STUDIO } from '../src/core/layout';
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
