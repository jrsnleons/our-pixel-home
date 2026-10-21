// What Maple Furnishings has on its shelves this week. Shared with the server, which refuses to
// sell anything that isn't out: a few featured pieces that change every Monday, a handful of
// essentials that are always there, and a next step or two for what you already own.

import { bagPick, seeded, shuffled } from './bag';
import { ITEM_BY_KEY, ITEMS, type Category, type ItemDef } from './catalog';
import { nextRackAt, weekIndex } from './clothes';

export const FEATURED = 8;
export const WALLPAPERS_OUT = 3;
export const STEP_SLOTS = 2;

/** Cheap starters that never leave the shelf, so nobody is ever stuck without a bed or a lamp. */
export const ESSENTIALS = ['bed_mat', 'table_box', 'seat_cushion', 'light_bulb', 'store_crate', 'clothes_rack', 'up_slots', 'up_curtains'];

/** The furniture families that climb a ladder of tiers. */
export const FAMILIES: Category[] = ['bed', 'table', 'seating', 'lighting', 'storage'];

export interface Owned {
  unlocks: readonly string[];
  inventory: readonly { item: string }[];
  placements: readonly { item: string }[];
}

export interface Shelves {
  week: number;
  nextAt: Date;
  /** This week's features. */
  featured: ItemDef[];
  /** The next tier of the families you're climbing. */
  steps: ItemDef[];
  essentials: ItemDef[];
  /** The walls and floors counter. */
  wallpapers: ItemDef[];
  floor: ItemDef | null;
}

const sold = (d: ItemDef) => !d.starter || d.price > 0;
const byKey = (a: ItemDef, b: ItemDef) => (a.key < b.key ? -1 : 1);

/** Everything that can be featured: not an essential, not a style (those have their own counter) or an upgrade. */
export const FEATURE_POOL = ITEMS.filter((d) => sold(d) && d.kind !== 'style' && d.kind !== 'upgrade' && !ESSENTIALS.includes(d.key)).sort(byKey);
const WALLPAPER_POOL = ITEMS.filter((d) => d.category === 'wallpaper' && sold(d)).sort(byKey);
const FLOORS = ITEMS.filter((d) => d.category === 'floor' && sold(d)).sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0));

/** How many weeks it takes to show everything once. */
export const FEATURE_CYCLE = Math.ceil(FEATURE_POOL.length / FEATURED);

function ownedKeys(o: Owned): Set<string> {
  return new Set([...o.unlocks, ...o.inventory.map((r) => r.item), ...o.placements.map((p) => p.item)]);
}

export function shelves(now: Date, owned: Owned): Shelves {
  const week = weekIndex(now);
  const own = ownedKeys(owned);
  const essentials = ESSENTIALS.map((k) => ITEM_BY_KEY[k]).filter(Boolean);
  const featured = bagPick(FEATURE_POOL, FEATURED, week * FEATURED, 101);
  const wallpapers = bagPick(WALLPAPER_POOL, WALLPAPERS_OUT, week * WALLPAPERS_OUT, 303);

  // The next tier of each family, for the families you've climbed least, so the next bed or table
  // is never more than a visit away.
  const shown = new Set([...essentials, ...featured].map((d) => d.key));
  const climb = FAMILIES.map((cat) => {
    const tiers = ITEMS.filter((d) => d.category === cat && d.tier != null).sort((a, b) => a.tier! - b.tier!);
    const top = Math.max(-1, ...tiers.filter((d) => own.has(d.key)).map((d) => d.tier!));
    return { cat, top, next: tiers.find((d) => d.tier === top + 1 && !shown.has(d.key)) };
  }).filter((f) => f.next);
  const order = shuffled(climb, seeded(week * 29 + 5)).sort((a, b) => a.top - b.top);
  const steps = order.slice(0, STEP_SLOTS).map((f) => f.next!);

  const ownedFloor = Math.max(0, ...FLOORS.filter((d) => own.has(d.key)).map((d) => d.tier ?? 0));
  const floor = FLOORS.find((d) => (d.tier ?? 0) === ownedFloor + 1) ?? null;
  return { week, nextAt: nextRackAt(now), featured, steps, essentials, wallpapers, floor };
}

/** Every key on the shelves right now. */
export function onShelf(key: string, now: Date, owned: Owned): boolean {
  const s = shelves(now, owned);
  return [...s.featured, ...s.steps, ...s.essentials, ...s.wallpapers, ...(s.floor ? [s.floor] : [])].some((d) => d.key === key);
}
