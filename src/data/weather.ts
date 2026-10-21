// Which weather it is and how foggy: pure rules, so the screen and the tests agree.

import { rngAt } from '../core/hash';
import type { ThemeKey } from './themes';

export type WeatherKind = 'clear' | 'rain' | 'snow' | 'mist';
export const WEATHER_KINDS: WeatherKind[] = ['clear', 'rain', 'snow', 'mist'];
export const WEATHER_LABEL: Record<WeatherKind, string> = { clear: 'Clear', rain: 'Rain', snow: 'Snow', mist: 'Misty' };

/** The weather is the same for everyone for four hours at a time. */
export const WEATHER_SLOT_MS = 4 * 3_600_000;

/** What the sky is doing right now, from the calendar: mostly fair, sometimes wet, rarely snowy. */
export function weatherAt(now: number, theme: ThemeKey): WeatherKind {
  const slot = Math.floor(now / WEATHER_SLOT_MS);
  const r = rngAt(9157, slot);
  // The rainy cabin is rainy more often than not.
  const rain = theme === 'cabin' ? 0.5 : 0.22;
  if (r < rain) return 'rain';
  if (r < rain + 0.07) return 'snow';
  if (r < rain + 0.15) return 'mist';
  return 'clear';
}

/** How thick the fog is (0 to 1): a veil at dawn, haze at dusk, real mist at night, more in bad weather. */
export function fogAmount(hour: number, weather: WeatherKind): number {
  let f = 0;
  if (hour >= 21 || hour < 4.5) f = 0.52;
  else if (hour >= 19) f = 0.52 * ((hour - 19) / 2);
  else if (hour < 8) f = 0.52 * ((8 - hour) / 3.5);
  if (weather === 'mist') f = Math.max(f, 0.75);
  else if (weather === 'rain') f = Math.max(f, 0.3);
  else if (weather === 'snow') f = Math.max(f, 0.4);
  return Math.min(1, f);
}
