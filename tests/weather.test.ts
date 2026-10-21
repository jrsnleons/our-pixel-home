import { describe, expect, it } from 'vitest';
import { fogAmount, weatherAt, WEATHER_SLOT_MS } from '../src/data/weather';
import { daylight } from '../src/engine/daylight';
import { THEMES } from '../src/data/themes';
import { INTERACTIONS, lockedReason } from '../src/data/interactions';

describe('weather', () => {
  it('is the same for both phones and holds steady for four hours', () => {
    const t = Date.UTC(2026, 9, 21, 8, 0, 0);
    const slot = Math.floor(t / WEATHER_SLOT_MS) * WEATHER_SLOT_MS;
    expect(weatherAt(t, 'honey')).toBe(weatherAt(t + 1000, 'honey'));
    expect(weatherAt(slot, 'honey')).toBe(weatherAt(slot + WEATHER_SLOT_MS - 1, 'honey'));
  });

  it('is mostly fair, sometimes wet, and rainier in the rainy cabin', () => {
    const count = (theme: 'honey' | 'cabin') => {
      const n: Record<string, number> = { clear: 0, rain: 0, snow: 0, mist: 0 };
      for (let i = 0; i < 2000; i++) n[weatherAt(i * WEATHER_SLOT_MS, theme)]++;
      return n;
    };
    const honey = count('honey'), cabin = count('cabin');
    expect(honey.clear).toBeGreaterThan(honey.rain);
    expect(honey.snow).toBeGreaterThan(0);
    expect(cabin.rain).toBeGreaterThan(honey.rain);
  });

  it('thickens the fog after dark and in bad weather', () => {
    expect(fogAmount(13, 'clear')).toBe(0);
    expect(fogAmount(23, 'clear')).toBeGreaterThan(0.4);
    expect(fogAmount(6, 'clear')).toBeGreaterThan(0);
    expect(fogAmount(6, 'clear')).toBeLessThan(fogAmount(2, 'clear'));
    expect(fogAmount(13, 'mist')).toBeGreaterThan(fogAmount(13, 'rain'));
    expect(fogAmount(13, 'rain')).toBeGreaterThan(0);
    for (let h = 0; h < 24; h += 0.5) for (const w of ['clear', 'rain', 'snow', 'mist'] as const) expect(fogAmount(h, w)).toBeLessThanOrEqual(1);
  });

  it('dims the sun for rain and snow, and an explicit clear sky beats the rainy theme', () => {
    const noon = new Date(2026, 9, 21, 13, 0);
    const clear = daylight(noon, THEMES.honey, 'clear');
    expect(daylight(noon, THEMES.honey, 'rain').sunPower).toBeLessThan(clear.sunPower);
    expect(daylight(noon, THEMES.honey, 'snow').celestial).toBeNull();
    expect(daylight(noon, THEMES.cabin, 'clear').sunPower).toBe(clear.sunPower);
    expect(daylight(noon, THEMES.cabin).sunPower).toBeLessThan(clear.sunPower);
  });
});

describe('sleeping together', () => {
  const nap = INTERACTIONS.find((i) => i.id === 'nap_together')!;
  const ctx = (items: string[]) => ({ placedItems: new Set(items), theme: 'honey' as const, day: 1, questsDone: true });

  it('works on every double bed, not just the canopy', () => {
    for (const bed of ['bed_futon', 'bed_wood', 'bed_quilted', 'bed_canopy']) expect(lockedReason(nap, ctx([bed])), bed).toBeNull();
    expect(lockedReason(nap, ctx(['bed_mat']))).toBe('Needs a double bed');
    expect(lockedReason(nap, ctx([]))).toBe('Needs a double bed');
  });
});
