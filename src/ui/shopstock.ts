// What the shops put on their display rows this week, as the scenes want it.

import { boutique, ownedClothes } from '../data/clothes';
import { shelves, type Owned } from '../data/stock';
import type { AvatarLook } from '../engine/art/avatar';
import type { StockEntry } from '../engine/interior';
import { putOn } from './AvatarEditor';
import { wearOf } from '../data/clothes';

export function furnitureEntries(now: Date, owned: Owned): StockEntry[] {
  return shelves(now, owned).featured.map((d) => ({ id: `item:${d.key}`, kind: 'item' as const, key: d.key, price: String(d.price) }));
}

/** Outfits on mannequins: you and your partner take turns wearing each piece. */
export function boutiqueEntries(now: Date, unlocks: readonly string[], looks: { me: AvatarLook; partner: AvatarLook | null }): StockEntry[] {
  const owned = ownedClothes(unlocks);
  return boutique(now).pieces.map((p, i) => {
    const base = i % 2 && looks.partner ? looks.partner : looks.me;
    return { id: `piece:${p.key}`, kind: 'piece' as const, key: p.key, name: p.name, price: String(p.price), look: { ...base, wear: putOn(wearOf(base), p, 0, owned) } };
  });
}
