import { describe, expect, it } from 'vitest';
import { ITEM_BY_KEY } from '../src/data/catalog';
import { ESSENTIALS, FEATURED, FEATURE_CYCLE, FEATURE_POOL, onShelf, shelves, WALLPAPERS_OUT, type Owned } from '../src/data/stock';
import * as R from '../src/net/rules';
import { DEFAULT_LOOK } from '../src/engine/art/avatar';

const MON = new Date('2026-10-19T09:00:00Z');
const week = (n: number) => new Date(MON.getTime() + n * 7 * 86_400_000);
const NONE: Owned = { unlocks: [], inventory: [], placements: [{ item: 'bed_mat' }, { item: 'light_bulb' }] };

describe('Maple Furnishings stock', () => {
  it('features eight different things, the same all week, new on Monday', () => {
    const a = shelves(MON, NONE), b = shelves(new Date('2026-10-25T23:59:00Z'), NONE), c = shelves(new Date('2026-10-26T00:00:00Z'), NONE);
    expect(a.featured).toHaveLength(FEATURED);
    expect(new Set(a.featured.map((d) => d.key)).size).toBe(FEATURED);
    expect(b.featured.map((d) => d.key)).toEqual(a.featured.map((d) => d.key));
    expect(c.featured.map((d) => d.key)).not.toEqual(a.featured.map((d) => d.key));
  });

  it('shows everything once before anything comes round again', () => {
    const seen = new Map<string, number>();
    for (let w = 0; w < FEATURE_CYCLE + 2; w++) for (const d of shelves(week(w), NONE).featured) seen.set(d.key, (seen.get(d.key) ?? 0) + 1);
    expect(seen.size).toBe(FEATURE_POOL.length);
    expect(Math.max(...seen.values())).toBeLessThanOrEqual(3); // the window can straddle three shuffles
    // Never the same thing two weeks running.
    for (let w = 1; w < 60; w++) {
      const prev = new Set(shelves(week(w - 1), NONE).featured.map((d) => d.key));
      expect(shelves(week(w), NONE).featured.filter((d) => prev.has(d.key))).toEqual([]);
    }
  });

  it('always has the essentials, three wallpapers and the next floor', () => {
    for (let w = 0; w < 10; w++) {
      const s = shelves(week(w), NONE);
      expect(s.essentials.map((d) => d.key)).toEqual(ESSENTIALS);
      expect(s.wallpapers).toHaveLength(WALLPAPERS_OUT);
      expect(s.floor?.key).toBe('fl_pine');
    }
    const owned = { ...NONE, unlocks: ['fl_pine'] };
    expect(shelves(MON, owned).floor?.key).toBe('fl_parquet');
  });

  it('offers the next tier of what you are climbing', () => {
    const owned: Owned = { unlocks: [], inventory: [{ item: 'bed_futon' }], placements: [{ item: 'bed_mat' }] };
    for (let w = 0; w < 20; w++) {
      const s = shelves(week(w), owned);
      expect(s.steps.length).toBeLessThanOrEqual(2);
      for (const d of s.steps) {
        const own = d.category === 'bed' ? 1 : -1; // highest owned tier in that family (a bed_futon, and nothing else)
        if (own >= 0) expect(d.tier).toBe(own + 1);
        else expect(d.tier).toBe(0);
      }
    }
  });

  it('is what the server sells: it refuses things that are off the shelf', () => {
    let n = 0;
    const id = () => `id${n++}`;
    const w = R.newWorld({ id: 'ana', name: 'ana', look: { ...DEFAULT_LOOK }, city: null, tz: 'Asia/Manila', lastSeen: null, visitStreak: 0, devotionStreak: 0 }, 'c1', 'ABCD', id);
    w.couple.coins = 100_000;
    const c = (t: Date): R.Ctx => ({ w, me: 'ana', now: t, id });
    const luxe = ITEM_BY_KEY.bed_canopy;
    const off = Array.from({ length: 12 }, (_, i) => week(i)).find((d) => !onShelf(luxe.key, d, w));
    expect(off).toBeTruthy();
    expect(() => R.buy(c(off!), luxe.key)).toThrow('doesn’t have that out');
    expect(w.couple.coins).toBe(100_000);
    expect(() => R.buy(c(off!), 'candles')).toThrow();
  });
});
