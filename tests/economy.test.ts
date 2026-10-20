import { describe, expect, it } from 'vitest';
import { jobLevel, shiftPayout, daysTogether, milestone, sinceFromDays } from '../src/data/economy';

describe('economy', () => {
  it('pays about 30 solo and 50 each together for a good shift', () => {
    expect(shiftPayout({ together: false, quality: 1, level: 1, shiftsToday: 0 })).toBe(30);
    expect(shiftPayout({ together: true, quality: 1, level: 1, shiftsToday: 0 })).toBe(50);
  });
  it('softly diminishes after ten shifts a day', () => {
    const fresh = shiftPayout({ together: false, quality: 1, level: 1, shiftsToday: 3 });
    const tired = shiftPayout({ together: false, quality: 1, level: 1, shiftsToday: 12 });
    expect(tired).toBeLessThan(fresh);
    expect(tired).toBeGreaterThan(0);
  });
  it('levels up with experience and caps at 10', () => {
    expect(jobLevel(0)).toBe(1);
    expect(jobLevel(40)).toBe(2);
    expect(jobLevel(1e9)).toBe(10);
  });
  it('counts days together from day 1', () => {
    expect(daysTogether('2026-10-19', new Date(2026, 9, 19))).toBe(1);
    expect(daysTogether('2026-01-01', new Date(2026, 0, 31))).toBe(31);
  });
});

describe('days together', () => {
  it('turns a day count into a start date (day 1 is the start)', () => {
    expect(sinceFromDays(1, '2026-10-20')).toBe('2026-10-20');
    expect(sinceFromDays(412, '2026-10-20')).toBe('2025-09-04');
    expect(daysTogether(sinceFromDays(412, '2026-10-20'), new Date(2026, 9, 20, 12))).toBe(412);
  });
  it('celebrates monthsaries, hundredth days and anniversaries', () => {
    expect(milestone('2026-01-15', '2026-02-15')).toEqual({ label: '1 month together', coins: 40 });
    expect(milestone('2026-01-15', '2026-02-16')).toBeNull();
    expect(milestone('2026-01-31', '2026-02-28')?.label).toBe('1 month together');
    expect(milestone('2026-01-01', '2026-04-10')).toEqual({ label: 'Day 100 together', coins: 100 });
    expect(milestone('2025-03-09', '2026-03-09')).toEqual({ label: '1 year together', coins: 300 });
    expect(milestone('2025-03-09', '2025-03-09')).toBeNull();
    expect(milestone(null, '2026-03-09')).toBeNull();
  });
});
