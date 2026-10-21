import { onShelf, type Owned } from '../src/data/stock';

const NONE: Owned = { unlocks: [], inventory: [], placements: [] };

/** A day in a week when all of these are on Maple Furnishings' shelves (for tests that buy specific things). */
export function weekWith(keys: string[], owned: Owned = NONE, from = new Date('2026-10-19T09:00:00Z')): Date {
  for (let w = 0; w < 120; w++) {
    const d = new Date(from.getTime() + w * 7 * 86_400_000);
    if (keys.every((k) => onShelf(k, d, owned))) return d;
  }
  throw new Error(`never on the shelf together: ${keys.join(', ')}`);
}
