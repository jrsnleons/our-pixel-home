import { describe, expect, it } from 'vitest';
import { cafeLevel, cafePayout, daysTogether } from '../src/data/economy';

describe('economy', () => {
  it('pays about 30 solo and 50 each together for a good shift', () => {
    expect(cafePayout({ together: false, quality: 1, level: 1, shiftsToday: 0 })).toBe(30);
    expect(cafePayout({ together: true, quality: 1, level: 1, shiftsToday: 0 })).toBe(50);
  });
  it('softly diminishes after ten shifts a day', () => {
    const fresh = cafePayout({ together: false, quality: 1, level: 1, shiftsToday: 3 });
    const tired = cafePayout({ together: false, quality: 1, level: 1, shiftsToday: 12 });
    expect(tired).toBeLessThan(fresh);
    expect(tired).toBeGreaterThan(0);
  });
  it('levels up with experience and caps at 10', () => {
    expect(cafeLevel(0)).toBe(1);
    expect(cafeLevel(40)).toBe(2);
    expect(cafeLevel(1e9)).toBe(10);
  });
  it('counts days together from day 1', () => {
    expect(daysTogether('2026-10-19', new Date(2026, 9, 19))).toBe(1);
    expect(daysTogether('2026-01-01', new Date(2026, 0, 31))).toBe(31);
  });
});
