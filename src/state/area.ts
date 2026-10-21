// Where each of us is: at home, out on Maple Street, or inside one of its buildings. Both phones
// say where they are, so you can see where your partner is and join them.

import { signal } from '@preact/signals';
import { PLACE_BY_ID } from '../data/town';

/** 'home', 'town', or 'in:<place id>' for the inside of a building. */
export type AreaId = string;

export const area = signal<AreaId>('home');
export const partnerArea = signal<AreaId>('home');

export const insideOf = (id: AreaId): string | null => (id.startsWith('in:') ? id.slice(3) : null);
export const inside = (placeId: string): AreaId => `in:${placeId}`;

export function areaName(id: AreaId): string {
  if (id === 'home') return 'Home';
  if (id === 'town') return 'Maple Street';
  const p = PLACE_BY_ID[insideOf(id) ?? ''];
  return p ? p.name : 'Maple Street';
}

/** Which shop sheet is open, and the item or piece to show first (tapped on a display). */
export const shopCtx = signal<{ shop: 'maple' | 'boutique'; focus?: string } | null>(null);
