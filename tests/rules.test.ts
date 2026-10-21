import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK } from '../src/engine/art/avatar';
import * as R from '../src/net/rules';
import { weekWith } from './shelf';
import type { Profile } from '../src/net/types';

let n = 0;
const id = () => `id${n++}`;
const prof = (pid: string, tz = 'Asia/Manila'): Profile => ({ id: pid, name: pid, look: { ...DEFAULT_LOOK }, city: null, tz, lastSeen: null, visitStreak: 0, devotionStreak: 0 });

function setup(now = new Date('2026-10-19T09:00:00Z')) {
  const w = R.newWorld(prof('ana'), 'c1', 'ABCD', id);
  const ana = (t = now): R.Ctx => ({ w, me: 'ana', now: t, id });
  const ben = (t = now): R.Ctx => ({ w, me: 'ben', now: t, id });
  R.joinCouple(ana(), prof('ben', 'Europe/London'));
  return { w, ana, ben, now };
}

describe('store and inventory', () => {
  it('starts with a mat, a lamp and 300 coins', () => {
    const { w } = setup();
    expect(w.placements.map((p) => p.item)).toEqual(['bed_mat', 'light_bulb']);
    expect(w.couple.coins).toBe(300);
  });
  it('buys into the box, spends the shared wallet and refuses when broke', () => {
    const { w, ana, ben } = setup();
    R.buy(ana(), 'bed_futon');
    expect(w.couple.coins).toBe(150);
    expect(w.inventory).toHaveLength(1);
    expect(() => R.buy(ben(), 'bed_wood')).toThrow('Not enough coins');
  });
  it('stacks small decor in one slot', () => {
    const { w, ana } = setup();
    w.couple.coins = 1000;
    const day = weekWith(['candles']);
    R.buy(ana(day), 'candles'); R.buy(ana(day), 'candles');
    expect(w.inventory).toHaveLength(1);
    expect(w.inventory[0].qty).toBe(2);
    expect(R.slotsUsed(w.inventory)).toBe(1);
  });
  it('places, refuses overlaps and stores back', () => {
    const { w, ana } = setup();
    R.buy(ana(), 'seat_cushion');
    const inv = w.inventory[0].id;
    expect(() => R.place(ana(), inv, { surface: 'floor', x: 0, y: 0, rot: 0 })).toThrow('already there');
    const pid = R.place(ana(), inv, { surface: 'floor', x: 3, y: 3, rot: 0 });
    expect(w.inventory).toHaveLength(0);
    R.store(ana(), pid);
    expect(w.inventory[0].item).toBe('seat_cushion');
  });
  it('styles are owned once and need buying before use', () => {
    const { w, ana } = setup();
    expect(() => R.setStyle(ana(), { ...w.couple.style, floor: 'fl_pine' })).toThrow();
    R.buy(ana(weekWith(['fl_pine'])), 'fl_pine');
    R.setStyle(ana(), { ...w.couple.style, floor: 'fl_pine' });
    expect(() => R.buy(ana(), 'fl_pine')).toThrow('already own');
  });
});

describe('daily limits', () => {
  it('pays hearts 5 times a day per person', () => {
    const { w, ana, ben } = setup();
    const start = w.couple.coins;
    for (let i = 0; i < 7; i++) R.heart(ana());
    expect(w.couple.coins - start).toBe(10);
    R.heart(ben());
    expect(w.couple.coins - start).toBe(12);
  });
  it('caps together time at 20 a day and needs 10 minutes between ticks', () => {
    const { w, ana } = setup();
    const t0 = new Date('2026-10-19T01:00:00Z').getTime();
    let paid = 0;
    for (let m = 0; m < 300; m += 5) paid += R.togetherTick(ana(new Date(t0 + m * 60_000)), true);
    expect(paid).toBe(20);
    expect(R.togetherTick(ana(new Date(t0 + 400 * 60_000)), false)).toBe(0);
    void w;
  });
  it('builds a visit streak across days and pays the 7-day milestone once', () => {
    const { w, ana } = setup();
    for (let d = 0; d < 7; d++) R.claimDaily(ana(new Date(Date.UTC(2026, 9, 10 + d, 3))), false);
    expect(w.profiles.ana.visitStreak).toBe(7);
    expect(w.ledger.filter((l) => l.reason === 'streak_7')).toHaveLength(1);
  });
});

describe('quiet time', () => {
  it('allows one check-in a day and counts the streak', () => {
    const { w, ana } = setup();
    R.devotion(ana(new Date('2026-10-18T02:00:00Z')), 'Psalm 23', '', false);
    expect(() => R.devotion(ana(new Date('2026-10-18T05:00:00Z')), 'Psalm 24', '', false)).toThrow('already checked in');
    const r = R.devotion(ana(new Date('2026-10-19T02:00:00Z')), 'Psalm 24', 'Good shepherd', true);
    expect(r.streak).toBe(2);
    expect(w.devotions).toHaveLength(2);
  });
});

describe('quests', () => {
  it('can only claim finished quests, once', () => {
    const { w, ana } = setup();
    expect(() => R.questClaim(ana(), 'first_heart')).toThrow('Not done');
    R.heart(ana());
    const before = w.couple.coins;
    R.questClaim(ana(), 'first_heart');
    expect(w.couple.coins).toBeGreaterThan(before);
    expect(() => R.questClaim(ana(), 'first_heart')).toThrow('Already');
  });
});

describe('games', () => {
  it('needs a table, alternates turns and pays when someone wins', () => {
    const { w, ana, ben } = setup();
    expect(() => R.gameStart(ana(), 'tictactoe')).toThrow('games table');
    w.couple.coins = 1000;
    R.buy(ana(weekWith(['table_games'])), 'table_games');
    R.place(ana(), w.inventory[0].id, { surface: 'floor', x: 3, y: 3, rot: 0 });
    const g = R.gameStart(ana(), 'tictactoe');
    expect(() => R.gameMove(ben(), g.id, 0)).toThrow('turn');
    R.gameMove(ana(), g.id, 0); R.gameMove(ben(), g.id, 3);
    R.gameMove(ana(), g.id, 1); R.gameMove(ben(), g.id, 4);
    const coins = w.couple.coins;
    const r = R.gameMove(ana(), g.id, 2);
    expect(r.game.status).toBe('won');
    expect(r.game.winner).toBe('ana');
    expect(w.couple.coins - coins).toBe(20);
  });
  it('keeps the Draw & Guess word from the guesser', () => {
    const { w, ana, ben } = setup();
    w.couple.coins = 1000;
    R.buy(ana(weekWith(['easel'])), 'easel');
    R.place(ana(), w.inventory[0].id, { surface: 'floor', x: 5, y: 5, rot: 0 });
    const g = R.gameStart(ana(), 'draw');
    expect(() => R.drawWord(ben(), g.id)).toThrow();
    const word = R.drawWord(ana(), g.id);
    expect(R.drawGuess(ben(), g.id, 'definitely not it').right).toBe(false);
    const ok = R.drawGuess(ben(), g.id, ` ${word.toUpperCase()}!`);
    expect(ok.right).toBe(true);
    expect(ok.game.drawer).toBe('ben');
  });
});

describe('café', () => {
  it('refuses instant shifts and pays a real one', () => {
    const { w, ana } = setup();
    const t = new Date('2026-10-19T03:00:00Z');
    const s = R.shiftStart(ana(t), false);
    expect(() => R.shiftFinish(ana(new Date(t.getTime() + 20_000)), s.id, 30, 0)).toThrow('too short');
    const before = w.couple.coins;
    const r = R.shiftFinish(ana(new Date(t.getTime() + 180_000)), s.id, 20, 2);
    expect(r.pay).toBeGreaterThan(10);
    expect(w.couple.coins - before).toBe(r.pay);
    expect(() => R.shiftFinish(ana(new Date(t.getTime() + 190_000)), s.id, 20, 2)).toThrow();
  });
});

describe('looks and milestones', () => {
  it('keeps body and face options and fills them in for older looks', () => {
    const old = { skin: 2, hair: 'bob', hairColor: 1, outfit: 'fit_tee', accessory: 'acc_none', eyes: 0 } as unknown as Parameters<typeof R.cleanLook>[0];
    expect(R.cleanLook(old)).toMatchObject({ body: 'guy', freckles: false, blush: false });
    expect(R.cleanLook({ ...DEFAULT_LOOK, body: 'girl', freckles: true, blush: true, hair: 'twintails' })).toMatchObject({ body: 'girl', freckles: true, blush: true, hair: 'twintails' });
    expect(R.cleanLook({ ...DEFAULT_LOOK, body: 'robot' as 'guy' }).body).toBe('guy');
  });
  it('pays a monthsary gift once for the couple, whoever opens first', () => {
    const { w, ana, ben } = setup();
    R.setCouple(ana(), { since: '2026-09-19' });
    const before = w.couple.coins;
    const a = R.claimDaily(ana(new Date('2026-10-19T03:00:00Z')), false);
    expect(a.lines).toContain('1 month together! +40');
    // London is still on the 18th here; when its 19th arrives, the gift is already claimed.
    R.claimDaily(ben(new Date('2026-10-19T12:00:00Z')), false);
    expect(w.ledger.filter((l) => l.reason.startsWith('milestone_'))).toHaveLength(1);
    expect(w.events.filter((e) => e.kind === 'milestone')).toHaveLength(1);
    expect(w.couple.coins - before).toBeGreaterThanOrEqual(40);
  });
  it('remembers the finished tour on the profile', () => {
    const { w, ana } = setup();
    R.setProfile(ana(), { tourDone: true });
    expect(w.profiles.ana.tourDone).toBe(true);
  });
});
