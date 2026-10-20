import { describe, expect, it } from 'vitest';
import { boutique, cleanWear, colorPrice, nextRackAt, onSale, ownedClothes, PIECES, RACK_SIZE, THEME_ORDER, wearOf } from '../src/data/clothes';
import { DEFAULT_LOOK } from '../src/engine/art/avatar';
import * as R from '../src/net/rules';
import type { Profile } from '../src/net/types';

let n = 0;
const id = () => `id${n++}`;
const prof = (pid: string): Profile => ({ id: pid, name: pid, look: { ...DEFAULT_LOOK }, city: null, tz: 'Asia/Manila', lastSeen: null, visitStreak: 0, devotionStreak: 0 });
const MON = new Date('2026-10-19T09:00:00Z');

function setup(now = MON) {
  const w = R.newWorld(prof('ana'), 'c1', 'ABCD', id);
  const ana = (t = now): R.Ctx => ({ w, me: 'ana', now: t, id });
  const ben = (t = now): R.Ctx => ({ w, me: 'ben', now: t, id });
  R.joinCouple(ana(), prof('ben'));
  w.couple.coins = 5000;
  return { w, ana, ben };
}

function placeRack(c: R.Ctx) {
  const { invId } = R.buy(c, 'clothes_rack');
  R.place(c, invId!, { surface: 'floor', x: 4, y: 4, rot: 0 });
}

describe('the weekly Boutique', () => {
  it('shows the same 12 pieces all week and changes on Monday (UTC)', () => {
    const a = boutique(MON), b = boutique(new Date('2026-10-25T23:59:00Z')), c = boutique(new Date('2026-10-26T00:00:00Z'));
    expect(a.pieces).toHaveLength(RACK_SIZE);
    expect(b.pieces.map((p) => p.key)).toEqual(a.pieces.map((p) => p.key));
    expect(c.theme).not.toBe(a.theme);
    expect(nextRackAt(MON).toISOString()).toBe('2026-10-26T00:00:00.000Z');
  });
  it('fills most of the rack from the week’s theme and never sells basics there', () => {
    for (let wk = 0; wk < THEME_ORDER.length; wk++) {
      const r = boutique(new Date(MON.getTime() + wk * 7 * 86_400_000));
      expect(r.pieces.filter((p) => p.tags.includes(r.theme)).length).toBeGreaterThanOrEqual(6);
      expect(r.pieces.some((p) => p.basic)).toBe(false);
      expect(new Set(r.pieces.map((p) => p.key)).size).toBe(RACK_SIZE);
    }
  });
  it('sells every piece in 3 to 6 colors', () => {
    for (const p of PIECES) expect(p.colors.length).toBeGreaterThanOrEqual(3), expect(p.colors.length).toBeLessThanOrEqual(6);
  });
});

describe('wearing clothes', () => {
  it('reads looks saved before separate pieces', () => {
    expect(wearOf({ outfit: 'fit_dress', accessory: 'acc_bow' })).toEqual({ top: 'sundress:0', shoes: 'maryjanes:1', hat: 'bow:0' });
    expect(wearOf({ outfit: 'nope' })).toEqual({ top: 'tee:0', bottom: 'jeans:0', shoes: 'sneakers:0' });
  });
  it('drops bottoms under a dress, fills missing slots and ignores junk', () => {
    expect(cleanWear({ top: 'maxi:2', bottom: 'jeans:0', hat: 'jeans:1', face: 'glasses:99' })).toEqual({ top: 'maxi:2', shoes: 'sneakers:0' });
    expect(cleanWear({ top: 'tee:1' })).toEqual({ top: 'tee:1', bottom: 'jeans:0', shoes: 'sneakers:0' });
  });
  it('counts old outfit purchases as owned pieces', () => {
    const own = ownedClothes(['fit_sweater', 'acc_beanie']);
    expect(own.has('knit:0') && own.has('boots:0') && own.has('beanie:0')).toBe(true);
    expect(own.has('tee:0')).toBe(true);
  });
});

describe('buying and changing', () => {
  it('buys a colorway from this week’s rack, half price for a second color', () => {
    const { w, ana } = setup();
    const p = boutique(MON).pieces[0];
    R.buyClothes(ana(), p.key, 0);
    expect(w.unlocks).toContain(`${p.key}:0`);
    expect(colorPrice(ownedClothes(w.unlocks), p.key)).toBe(Math.ceil(p.price / 10) * 5);
    const before = w.couple.coins;
    R.buyClothes(ana(), p.key, 1);
    expect(before - w.couple.coins).toBe(Math.ceil(p.price / 10) * 5);
    expect(() => R.buyClothes(ana(), p.key, 1)).toThrow('already own');
  });
  it('refuses pieces that aren’t on the rack this week', () => {
    const { ana } = setup();
    const off = PIECES.find((p) => !p.basic && !onSale(p.key, MON))!;
    expect(() => R.buyClothes(ana(), off.key, 0)).toThrow('gone from the Boutique');
  });
  it('only changes at a clothes rack, mirror or wardrobe, and only into owned clothes', () => {
    const { w, ana } = setup();
    const look = { ...DEFAULT_LOOK, wear: { top: 'tee:1', bottom: 'jeans:1', shoes: 'sneakers:1' } };
    expect(() => R.setLook(ana(), look)).toThrow('clothes rack');
    placeRack(ana());
    R.setLook(ana(), look);
    expect(w.profiles.ana.look.wear.top).toBe('tee:1');
    expect(() => R.setLook(ana(), { ...look, wear: { ...look.wear, top: 'tee:4' } })).toThrow('Buy that');
  });
  it('saves up to four looks and gifts an outfit the partner can accept', () => {
    const { w, ana, ben } = setup();
    placeRack(ana());
    R.saveLook(ana(), 2, { top: 'hoodie:0', bottom: 'joggers:0', shoes: 'sneakers:0' });
    expect(w.profiles.ana.saved).toEqual([null, null, { top: 'hoodie:0', bottom: 'joggers:0', shoes: 'sneakers:0' }, null]);
    expect(() => R.saveLook(ana(), 4, null)).toThrow();
    R.giftLook(ana(), { top: 'hoodie:0', bottom: 'joggers:0', shoes: 'sneakers:1', face: 'glasses:0' });
    expect(w.profiles.ben.gift?.from).toBe('ana');
    R.answerGift(ben(), true);
    expect(w.profiles.ben.look.wear).toEqual({ top: 'hoodie:0', bottom: 'joggers:0', shoes: 'sneakers:1', face: 'glasses:0' });
    expect(w.profiles.ben.gift).toBeNull();
    expect(() => R.answerGift(ben(), true)).toThrow('no outfit');
  });
});
