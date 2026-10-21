import { describe, expect, it } from 'vitest';
import { jobLock, type JobKey } from '../src/data/jobs';
import { DEFAULT_LOOK } from '../src/engine/art/avatar';
import { dispatch, snapshotOf } from '../src/net/dispatch';
import * as R from '../src/net/rules';
import type { Profile } from '../src/net/types';

let n = 0;
const id = () => `job${n++}`;
const prof = (pid: string): Profile => ({ id: pid, name: pid, look: { ...DEFAULT_LOOK }, city: null, tz: 'Asia/Manila', lastSeen: null, visitStreak: 0, devotionStreak: 0 });
const T0 = new Date('2026-10-19T03:00:00Z');
const later = (min: number) => new Date(T0.getTime() + min * 60_000);

function setup() {
  const w = R.newWorld(prof('ana'), 'c1', 'ABCD', id);
  const ana = (t = T0): R.Ctx => ({ w, me: 'ana', now: t, id });
  const ben = (t = T0): R.Ctx => ({ w, me: 'ben', now: t, id });
  R.joinCouple(ana(), prof('ben'));
  return { w, ana, ben };
}

/** A whole shift, three minutes long, starting `at` minutes after T0. */
function work(c: (t?: Date) => R.Ctx, job: JobKey, at: number, served = 12, missed = 0) {
  const s = R.shiftStart(c(later(at)), false, job);
  return R.shiftFinish(c(later(at + 3)), s.id, served, missed);
}

describe('job unlocks', () => {
  it('opens the flower shop after three café shifts, then delivery after three flower shifts', () => {
    const { w, ana } = setup();
    expect(() => R.shiftStart(ana(), false, 'flowers')).toThrow('Work 3 more café shifts first.');
    work(ana, 'cafe', 0);
    work(ana, 'cafe', 5);
    expect(() => R.shiftStart(ana(), false, 'flowers')).toThrow('Work 1 more café shift first.');
    expect(work(ana, 'cafe', 10).opened).toBe('flowers');
    expect(() => R.shiftStart(ana(), false, 'delivery')).toThrow('flower shop');
    work(ana, 'flowers', 15); work(ana, 'flowers', 20);
    expect(work(ana, 'flowers', 25).opened).toBe('delivery');
    expect(w.profiles.ana.jobs).toEqual({ cafe: 3, flowers: 3 });
    expect(jobLock(w.profiles.ana, 'delivery')).toBeNull();
  });
  it('opens Bug Squad with the flower shop, then Inbox Zero after three bug shifts', () => {
    const { ana } = setup();
    work(ana, 'cafe', 0); work(ana, 'cafe', 5);
    expect(work(ana, 'cafe', 10).openedAll).toEqual(['flowers', 'bugs']);
    expect(() => R.shiftStart(ana(), false, 'inbox')).toThrow('bug');
    work(ana, 'bugs', 15, 40); work(ana, 'bugs', 20, 40);
    expect(work(ana, 'bugs', 25, 40).opened).toBe('inbox');
  });
  it('counts per person, and a together shift counts for both', () => {
    const { w, ana, ben } = setup();
    for (let i = 0; i < 3; i++) {
      const s = R.shiftStart(ana(later(i * 5)), true, 'cafe');
      R.shiftFinish(ana(later(i * 5 + 3)), s.id, 10, 0);
      R.shiftFinish(ben(later(i * 5 + 3)), s.id, 10, 0);
    }
    expect(w.profiles.ben.jobs?.cafe).toBe(3);
    expect(jobLock(w.profiles.ben, 'flowers')).toBeNull();
  });
  it('lets a partner come along on a job only the host has opened', () => {
    const { w, ana, ben } = setup();
    w.profiles.ana.jobs = { cafe: 3 };
    expect(() => R.shiftStart(ben(), true, 'flowers')).toThrow('café');
    const s = R.shiftStart(ana(), true, 'flowers');
    expect(R.shiftFinish(ben(later(3)), s.id, 10, 0).pay).toBeGreaterThan(0);
    expect(w.profiles.ben.jobs).toEqual({ flowers: 1 });
  });
});

describe('job pay and levels', () => {
  it('levels each job on its own', () => {
    const { w, ana } = setup();
    w.profiles.ana.jobs = { cafe: 3 };
    work(ana, 'flowers', 0, 10);
    expect(w.couple.cafeXp).toBe(0);
    expect(w.couple.jobXp?.flowers).toBe(30);
  });
  it('softens pay after twelve shifts a day across every job', () => {
    const { w, ana } = setup();
    w.profiles.ana.jobs = { cafe: 3, flowers: 3 };
    for (let i = 0; i < 12; i++) work(ana, i % 2 ? 'flowers' : 'delivery', i * 5);
    expect(R.shiftsToday(w, 'ana', '2026-10-19')).toBe(12);
    const tired = work(ana, 'cafe', 70);
    const fresh = setup();
    expect(tired.pay).toBeLessThan(work(fresh.ana, 'cafe', 0).pay);
  });
  it('caps orders at what the job allows in the time', () => {
    const { w, ana } = setup();
    w.profiles.ana.jobs = { cafe: 3 };
    const honest = work(ana, 'flowers', 0, 15, 0);
    const cheat = work(ana, 'flowers', 5, 80, 0);
    expect(cheat.pay).toBeLessThan(honest.pay);
    expect(w.couple.jobXp?.flowers).toBe(45 + 60);
  });
  it('checks the job name from the network and reports today’s pay per job', () => {
    const { w, ana } = setup();
    expect(() => dispatch(ana(), 'shift_start', { together: false, job: 'mining' as 'cafe' }, { partnerOnline: true })).toThrow('isn’t hiring');
    const r = work(ana, 'cafe', 0);
    const view = snapshotOf(w, 'ana', later(5));
    expect(view.today.cafe).toBe(r.pay);
    expect(view.today.shifts).toBe(1);
    expect(view.today.flowers).toBe(0);
  });
});

describe('test mode', () => {
  it('only opens with the right code, then owns everything and opens every job', () => {
    const { w, ana } = setup();
    const opts = { partnerOnline: true, godCheck: (c: string) => c === 'secret' };
    expect(() => dispatch(ana(), 'god_mode', { code: 'guess' }, opts)).toThrow('isn’t right');
    expect(() => dispatch(ana(), 'god_mode', { code: 'secret' }, { partnerOnline: true })).toThrow('isn’t right');
    const before = w.couple.coins;
    dispatch(ana(), 'god_mode', { code: 'secret' }, opts);
    expect(w.couple.coins).toBe(before + R.GOD_COINS);
    expect(w.profiles.ana.god).toBe(true);
    expect(jobLock(w.profiles.ana, 'delivery')).toBeNull();
    expect(w.unlocks).toContain('maxi:3');
    expect(new Set(w.unlocks).size).toBe(w.unlocks.length);
  });
});
