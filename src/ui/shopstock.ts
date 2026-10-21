// What the shops put on their display rows this week, as the scenes want it.

import { boutique, ownedClothes, PIECES } from '../data/clothes';
import { ITEM_BY_KEY } from '../data/catalog';
import { shelves, type Owned } from '../data/stock';
import type { AvatarLook } from '../engine/art/avatar';
import type { StockEntry } from '../engine/interior';
import { putOn } from './AvatarEditor';
import { wearOf } from '../data/clothes';

/** This week's pieces, the next step up for the families you've climbed least, and the basics. */
export function furnitureEntries(now: Date, owned: Owned): StockEntry[] {
  const s = shelves(now, owned);
  const entry = (group: 'week' | 'step' | 'basic') => (d: { key: string; price: number }) => ({ id: `item:${d.key}`, kind: 'item' as const, key: d.key, price: String(d.price), group });
  return [
    ...s.featured.map(entry('week')),
    ...s.steps.map(entry('step')),
    // Upgrades (more slots, curtains) aren't things you can stand on a plinth.
    ...s.essentials.filter((d) => ITEM_BY_KEY[d.key]).map(entry('basic')),
  ];
}

/** Outfits on mannequins: you and your partner take turns wearing each piece. */
export function boutiqueEntries(now: Date, unlocks: readonly string[], looks: { me: AvatarLook; partner: AvatarLook | null }): StockEntry[] {
  const owned = ownedClothes(unlocks);
  const week = boutique(now).pieces.map((p) => ({ p, group: 'week' as const }));
  const basics = PIECES.filter((p) => p.basic).map((p) => ({ p, group: 'basic' as const }));
  return [...week, ...basics].map(({ p, group }, i) => {
    const base = i % 2 && looks.partner ? looks.partner : looks.me;
    return { id: `piece:${p.key}`, kind: 'piece' as const, key: p.key, name: p.name, price: String(p.price), group, look: { ...base, wear: putOn(wearOf(base), p, 0, owned) } };
  });
}
