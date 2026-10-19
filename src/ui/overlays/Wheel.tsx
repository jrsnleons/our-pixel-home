// The couple interaction picker: every paired animation, grouped, with locked ones explained.

import { useMemo, useState } from 'preact/hooks';
import { CATEGORY_LABEL, INTERACTIONS, lockedReason, type Category } from '../../data/interactions';
import { avatarPreview } from '../../engine/art/avatar';
import { day, me, partner, partnerOnline, placedKeys, prefs, snap } from '../../state/store';
import { Icon, Sheet, Tabs } from '../kit';

const CATS: Category[] = ['affection', 'playful', 'cozy', 'faith', 'greeting'];

export function InteractionWheel({ onClose, onPick }: { onClose: () => void; onPick: (id: string) => void }) {
  const [cat, setCat] = useState<Category>('affection');
  const look = me.value!.look;
  const pics = useMemo(() => Object.fromEntries(INTERACTIONS.map((i) => [i.id, avatarPreview(look, i.a[0], 'front', 2).toDataURL()])), [look]);
  const ctx = { placedItems: placedKeys.value, theme: prefs.value.theme, day: day.value, questsDone: (snap.value?.quests ?? []).every((q) => q.claimed) };
  const list = INTERACTIONS.filter((i) => i.category === cat);
  return (
    <Sheet title="Together" onClose={onClose}>
      {!partnerOnline.value && <p class="small muted" style={{ marginTop: 0 }}>{partner.value?.name} is asleep. They’ll see what you did when they’re back.</p>}
      <Tabs value={cat} options={CATS.map((c) => ({ key: c, label: CATEGORY_LABEL[c] }))} onChange={setCat} />
      <div class="emotes">
        {list.map((i) => {
          const why = lockedReason(i, ctx);
          return (
            <button class={`emote ${why ? 'locked' : ''}`} onClick={() => !why && onPick(i.id)} title={why ?? i.label} aria-disabled={!!why}>
              {why && <span class="lk"><Icon name="lock" size="s" /></span>}
              <img src={pics[i.id]} alt="" />
              <span>{i.label}</span>
              {why && <span class="tiny muted">{why}</span>}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
