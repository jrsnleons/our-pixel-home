import { describe, expect, it } from 'vitest';
import { cellsOf, key } from '../src/core/grid';
import { findPath } from '../src/core/pathfinding';
import { ITEM_BY_KEY } from '../src/data/catalog';
import { INTERIOR_DOOR, INTERIORS, PLACES, PLACE_BY_ID, TOWN, TOWN_SPAWN, townBlocked } from '../src/data/town';
import { JOBS } from '../src/data/jobs';

const floorOf = (w: number, d: number) => ({ w, d, rooms: [{ id: 'main', name: 'x', x: 0, y: 0, w, d }] });
const TOWN_FLOOR = floorOf(TOWN.w, TOWN.d);

describe('Maple Street', () => {
  const blocked = townBlocked();

  it('has unique places whose bodies never overlap', () => {
    expect(new Set(PLACES.map((p) => p.id)).size).toBe(PLACES.length);
    const seen = new Set<string>();
    for (const p of PLACES) {
      if (p.style === 'park') continue;
      for (let y = p.y; y < p.y + p.d; y++) for (let x = p.x; x < p.x + p.w; x++) {
        expect(seen.has(key(x, y)), `${p.id} overlaps at ${x},${y}`).toBe(false);
        seen.add(key(x, y));
      }
    }
  });

  it('lets you walk from your front door to every place', () => {
    expect(blocked.has(key(TOWN_SPAWN.x, TOWN_SPAWN.y))).toBe(false);
    for (const p of PLACES) {
      expect(blocked.has(key(p.door.x, p.door.y)), `${p.id} door is blocked`).toBe(false);
      expect(findPath(TOWN_SPAWN, p.door, blocked, TOWN_FLOOR), `no way to ${p.id}`).not.toBeNull();
    }
  });

  it('gives every job a workplace with an interior that offers it', () => {
    for (const job of Object.keys(JOBS)) {
      const place = PLACES.find((p) => p.jobs?.includes(job as never));
      expect(place, job).toBeTruthy();
      const spec = INTERIORS[place!.id];
      expect(spec, place!.id).toBeTruthy();
      expect(spec.spots.some((s) => s.job === job), `${place!.id} has a ${job} desk`).toBe(true);
    }
  });
});

describe('Interiors', () => {
  for (const spec of Object.values(INTERIORS)) {
    it(`${spec.id}: props fit, don't overlap and leave the spots reachable`, () => {
      expect(PLACE_BY_ID[spec.id]).toBeTruthy();
      const floor = floorOf(spec.w, spec.d);
      const blocked = new Set<string>();
      for (const p of spec.props) {
        const def = ITEM_BY_KEY[p.item];
        expect(def, `${p.item} exists`).toBeTruthy();
        if (def.kind === 'wall-item') {
          const [w, h] = def.size ?? [1, 1];
          expect(p.x + w <= spec.w && p.y + h <= 3, `${p.item} on the wall`).toBe(true);
          continue;
        }
        if (def.flat || def.hanging) continue;
        for (const c of cellsOf(def, { x: p.x, y: p.y, rot: p.rot ?? 0 })) {
          expect(c.x >= 0 && c.y >= 0 && c.x < spec.w && c.y < spec.d, `${p.item} inside the room`).toBe(true);
          expect(blocked.has(key(c.x, c.y)), `${p.item} overlaps at ${c.x},${c.y}`).toBe(false);
          blocked.add(key(c.x, c.y));
        }
      }
      if (spec.keeper) {
        expect(blocked.has(key(spec.keeper.tile.x, spec.keeper.tile.y)), 'keeper stands on furniture').toBe(false);
        blocked.add(key(spec.keeper.tile.x, spec.keeper.tile.y));
      }
      expect(blocked.has(key(INTERIOR_DOOR.x, INTERIOR_DOOR.y))).toBe(false);
      for (const s of spec.spots) {
        expect(blocked.has(key(s.approach.x, s.approach.y)), `${s.id} approach is free`).toBe(false);
        expect(findPath(INTERIOR_DOOR, s.approach, blocked, floor), `${s.id} reachable`).not.toBeNull();
        if (s.prop) expect(spec.props.some((p) => p.id === s.prop), `${s.id} points at a real prop`).toBe(true);
      }
    });
  }
});
