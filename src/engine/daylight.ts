// Sky and sun by local time of day. Each person sees their own clock: morning sun,
// golden hour, then night with stars and the lamps switching on.

import { mix } from '../core/color';
import type { Theme } from '../data/themes';
import type { WeatherKind } from '../data/weather';

export interface Daylight {
  hour: number;
  sky: [string, string, string]; // top, middle, horizon
  sun: string;
  sunPower: number;
  ambientPower: number;
  shaft: number;      // strength of the window light shaft
  stars: number;      // 0..1
  lampsOn: boolean;
  label: 'night' | 'dawn' | 'morning' | 'day' | 'golden' | 'dusk';
  celestial: 'sun' | 'moon' | null;
}

interface Key { h: number; sky: [string, string, string]; sun: string; sunPower: number; ambient: number; shaft: number; stars: number }

const KEYS: Key[] = [
  { h: 0, sky: ['#0B1030', '#16204A', '#26306A'], sun: '#8FA2FF', sunPower: 0.45, ambient: 0.45, shaft: 0.02, stars: 1 },
  { h: 5, sky: ['#141A44', '#3A3270', '#8A5A8A'], sun: '#A8A0E8', sunPower: 0.5, ambient: 0.5, shaft: 0.03, stars: 0.6 },
  { h: 6.5, sky: ['#5A70B0', '#E89AA0', '#FFD0A0'], sun: '#FFC8A0', sunPower: 1.1, ambient: 0.8, shaft: 0.12, stars: 0 },
  { h: 9, sky: ['#7EC0E8', '#B0DCF0', '#E8F4F0'], sun: '#FFF0D8', sunPower: 1.7, ambient: 1.05, shaft: 0.18, stars: 0 },
  { h: 13, sky: ['#6AB4EC', '#A4D6F4', '#DCF0F8'], sun: '#FFFFFF', sunPower: 1.9, ambient: 1.15, shaft: 0.16, stars: 0 },
  { h: 16.5, sky: ['#7AA8D8', '#F2C690', '#FBE3A6'], sun: '#FFD7A0', sunPower: 1.6, ambient: 1.0, shaft: 0.18, stars: 0 },
  { h: 18.5, sky: ['#3A3A78', '#C8608A', '#F29E5C'], sun: '#FF9E70', sunPower: 1.0, ambient: 0.75, shaft: 0.1, stars: 0.15 },
  { h: 20, sky: ['#121640', '#2A2A62', '#4A3A70'], sun: '#9FB0FF', sunPower: 0.55, ambient: 0.5, shaft: 0.03, stars: 0.85 },
  { h: 24, sky: ['#0B1030', '#16204A', '#26306A'], sun: '#8FA2FF', sunPower: 0.45, ambient: 0.45, shaft: 0.02, stars: 1 },
];

/** `weather` overrides the theme's own (the town has real weather; a window in the cabin is always rainy). */
export function daylight(date: Date, T: Theme, weather?: WeatherKind): Daylight {
  const wet = weather ? weather === 'rain' || weather === 'snow' : T.weather === 'rain';
  const hour = date.getHours() + date.getMinutes() / 60;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= hour) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = (hour - a.h) / (b.h - a.h);
  const m = (x: string, y: string) => mix(x, y, t);
  let sky: [string, string, string] = [m(a.sky[0], b.sky[0]), m(a.sky[1], b.sky[1]), m(a.sky[2], b.sky[2])];
  let stars = a.stars + (b.stars - a.stars) * t;
  let sunPower = a.sunPower + (b.sunPower - a.sunPower) * t;
  if (wet) {
    sky = sky.map((c) => mix(c, weather === 'snow' ? '#7A8694' : '#5A6E7A', 0.6)) as [string, string, string];
    stars = 0;
    sunPower *= 0.6;
  }
  if (T.mood.nightStars) {
    // Lavender Night keeps a dusky, faintly starry window even by day.
    sky = sky.map((c, k) => mix(c, ['#3A3070', '#6A5AA8', '#C8A0D8'][k], 0.45)) as [string, string, string];
    stars = Math.max(stars, 0.35);
  }
  const label: Daylight['label'] = hour < 5 || hour >= 20 ? 'night' : hour < 7 ? 'dawn' : hour < 11 ? 'morning' : hour < 16 ? 'day' : hour < 18.5 ? 'golden' : 'dusk';
  return {
    hour, sky, stars,
    sun: m(a.sun, b.sun),
    sunPower,
    ambientPower: a.ambient + (b.ambient - a.ambient) * t,
    shaft: (a.shaft + (b.shaft - a.shaft) * t) * (wet ? 0.5 : 1),
    lampsOn: hour >= 17.5 || hour < 6.5,
    label,
    celestial: hour >= 6 && hour < 19.5 ? (wet ? null : 'sun') : 'moon',
  };
}
