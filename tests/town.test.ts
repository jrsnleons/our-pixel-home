import { describe, expect, it } from 'vitest';
import { cellsOf, key } from '../src/core/grid';
import { findPath } from '../src/core/pathfinding';
import { ITEM_BY_KEY } from '../src/data/catalog';
import { DISTRICTS, districtWaypoints, INTERIOR_DOOR, INTERIORS, PLACES, PLACE_BY_ID, TOWN, TOWN_PROPS, TOWN_SPAWN, TOWNSFOLK, townBlocked } from '../src/data/town';
import { JOBS } from '../src/data/jobs';

const floorOf = (w: number, d: number) => ({ w, d, rooms: [{ id: 'main', name: 'x', x: 0, y: 0, w, d }] });
const TOWN_FLOOR = floorOf(TOWN.w, TOWN.d);

describe('Maple Town', () => {
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

  it('keeps decorations off buildings, doorsteps and each other', () => {
    const doors = new Set(PLACES.map((p) => key(p.door.x, p.door.y)));
    const bodies = new Set<string>();
    for (const p of PLACES) for (let y = p.y; y < p.y + p.d; y++) for (let x = p.x; x < p.x + p.w; x++) bodies.add(key(x, y));
    const taken = new Set<string>();
    for (const q of TOWN_PROPS) {
      for (let y = q.y; y < q.y + (q.d ?? 1); y++) for (let x = q.x; x < q.x + (q.w ?? 1); x++) {
        const k = key(x, y);
        expect(x >= 0 && y >= 0 && x < TOWN.w && y < TOWN.d, `${q.kind} at ${k} is on the map`).toBe(true);
        expect(bodies.has(k), `${q.kind} inside a building at ${k}`).toBe(false);
        expect(doors.has(k), `${q.kind} on a doorstep at ${k}`).toBe(false);
        if (q.open) continue;
        expect(taken.has(k), `${q.kind} overlaps another decoration at ${k}`).toBe(false);
        taken.add(k);
      }
    }
  });

  it('has no walled-off pockets: every open tile can be walked to from home', () => {
    const seen = new Set([key(TOWN_SPAWN.x, TOWN_SPAWN.y)]);
    const todo = [TOWN_SPAWN];
    while (todo.length) {
      const t = todo.pop()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = { x: t.x + dx, y: t.y + dy }, k = key(n.x, n.y);
        if (n.x < 0 || n.y < 0 || n.x >= TOWN.w || n.y >= TOWN.d || blocked.has(k) || seen.has(k)) continue;
        seen.add(k); todo.push(n);
      }
    }
    const stranded: string[] = [];
    for (let y = 0; y < TOWN.d; y++) for (let x = 0; x < TOWN.w; x++) if (!blocked.has(key(x, y)) && !seen.has(key(x, y))) stranded.push(key(x, y));
    expect(stranded).toEqual([]);
  });

  it('gives every townsperson somewhere to be', () => {
    for (const t of TOWNSFOLK) {
      if (typeof t.home === 'string') {
        expect(DISTRICTS.some((d) => d.id === t.home), `${t.name}'s district`).toBe(true);
        expect(districtWaypoints(t.home, blocked).length, `${t.name} has places to wander`).toBeGreaterThan(3);
      } else expect(blocked.has(key(t.home.x, t.home.y)), `${t.name} stands on open ground`).toBe(false);
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
  it('have room for every piece of stock', () => {
    expect(INTERIORS.maple.displays!.week!.length).toBeGreaterThanOrEqual(8);
    expect(INTERIORS.maple.displays!.step!.length).toBeGreaterThanOrEqual(2);
    expect(INTERIORS.maple.displays!.basic!.length).toBeGreaterThanOrEqual(6);
    expect(INTERIORS.boutique.displays!.week!.length).toBeGreaterThanOrEqual(8);
    expect(INTERIORS.boutique.displays!.basic!.length).toBeGreaterThanOrEqual(7);
  });

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
      for (const f of spec.folk ?? []) {
        expect(blocked.has(key(f.tile.x, f.tile.y)), `${f.name} stands on furniture`).toBe(false);
        blocked.add(key(f.tile.x, f.tile.y));
      }
      for (const sg of spec.signs ?? []) if (sg.y != null) {
        expect(blocked.has(key(sg.x, sg.y)), `sign ${sg.text} overlaps`).toBe(false);
        blocked.add(key(sg.x, sg.y));
      }
      // Every stand is clear, and you can walk up to the tile in front of it with all of them full.
      const stands = Object.values(spec.displays ?? {}).flat();
      for (const t of stands) {
        expect(blocked.has(key(t.x, t.y)), `stand at ${t.x},${t.y} is clear`).toBe(false);
        blocked.add(key(t.x, t.y));
      }
      expect(new Set(stands.map((t) => key(t.x, t.y))).size).toBe(stands.length);
      for (const t of stands) expect(findPath(INTERIOR_DOOR, { x: t.x, y: t.y + 1 }, blocked, floor), `stand at ${t.x},${t.y} reachable`).not.toBeNull();
      expect(blocked.has(key(INTERIOR_DOOR.x, INTERIOR_DOOR.y))).toBe(false);
      for (const s of spec.spots) {
        expect(blocked.has(key(s.approach.x, s.approach.y)), `${s.id} approach is free`).toBe(false);
        expect(findPath(INTERIOR_DOOR, s.approach, blocked, floor), `${s.id} reachable`).not.toBeNull();
        if (s.prop) expect(spec.props.some((p) => p.id === s.prop), `${s.id} points at a real prop`).toBe(true);
      }
    });
  }
});
