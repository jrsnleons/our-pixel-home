// The wardrobe: opened by tapping a clothes rack, mirror or wardrobe in the room. Change your
// clothes, hair and face, keep up to four looks for quick changes, or pick an outfit for your
// partner that waits for them to say yes.

import { useState } from 'preact/hooks';
import { sfx } from '../../audio/audio';
import { cleanWear, ownedClothes, wearOf, type Wear } from '../../data/clothes';
import { avatarThumb, type AvatarLook } from '../../engine/art/avatar';
import { SAVED_LOOKS } from '../../net/rules';
import { act, partner, sheet, snap, storeTab, toast } from '../../state/store';
import { AvatarEditor, AvatarPreview, ClothesPicker, EditorStage } from '../AvatarEditor';
import { Icon, Sheet, Tabs } from '../kit';

type Tab = 'me' | 'looks' | 'partner';

export function Wardrobe({ onClose }: { onClose: () => void }) {
  const s = snap.value!;
  const [tab, setTab] = useState<Tab>('me');
  const [look, setLook] = useState<AvatarLook>({ ...s.me.look, wear: wearOf(s.me.look) });
  const owned = ownedClothes(s.unlocks);
  const them = partner.value;
  const changed = JSON.stringify(look) !== JSON.stringify({ ...s.me.look, wear: wearOf(s.me.look) });
  const save = async () => { const ok = await act('set_look', { look }); if (ok) { sfx('pop'); toast('Looking good.'); } };
  const shop = () => { sfx('open'); storeTab.value = 'boutique'; sheet.value = 'store'; };
  const options: { key: Tab; label: string }[] = [{ key: 'me', label: 'Me' }, { key: 'looks', label: 'Saved looks' }];
  if (them) options.push({ key: 'partner', label: `For ${them.name}` });
  return (
    <Sheet title="Wardrobe" onClose={onClose} size="tall" head={<button class="btn ghost small" onClick={shop}><Icon name="store" size="s" />Boutique</button>}>
      <Tabs value={tab} onChange={(t) => { sfx('tap'); setTab(t); }} options={options} />
      {tab === 'me' && (
        <div class="col">
          <AvatarEditor look={look} onChange={setLook} owned={owned} clothesFirst foot={
            <div class="sheet-foot">
              <button class="btn block" disabled={!changed} onClick={save}>Save my look</button>
            </div>
          } />
        </div>
      )}
      {tab === 'looks' && <Looks current={look} onWear={(w) => { setLook({ ...look, wear: w }); setTab('me'); sfx('pop'); }} />}
      {tab === 'partner' && them && <ForPartner owned={owned} />}
    </Sheet>
  );
}

function Looks({ current, onWear }: { current: AvatarLook; onWear: (w: Wear) => void }) {
  const me = snap.value!.me;
  const saved = me.saved ?? [];
  const slots = Array.from({ length: SAVED_LOOKS }, (_, i) => saved[i] ?? null);
  return (
    <div class="col">
      <p class="tiny muted" style={{ margin: 0 }}>Keep your favorite outfits here and switch in one tap.</p>
      <div class="pick-grid two">
        {slots.map((w, i) => (
          <div class="pick" style={{ cursor: 'default' }}>
            {w ? <img class="px" src={avatarThumb({ ...current, wear: w }, 'full', 2)} alt="" style={{ maxWidth: '80px' }} /> : <div class="empty-look"><Icon name="plus" /></div>}
            <span>Look {i + 1}</span>
            <div class="row" style={{ gap: '4px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {w && <button class="btn small" onClick={() => onWear(cleanWear(w))}>Wear</button>}
              <button class="btn soft small" onClick={async () => { if (await act('save_look', { index: i, wear: current.wear })) { sfx('pop'); toast(`Saved as look ${i + 1}.`); } }}>{w ? 'Replace' : 'Save current'}</button>
              {w && <button class="btn ghost small" aria-label="Clear" onClick={() => act('save_look', { index: i, wear: null })}><Icon name="close" size="s" /></button>}
            </div>
          </div>
        ))}
      </div>
      <p class="tiny muted" style={{ margin: 0 }}>“Save current” keeps what’s on you in the Me tab right now, even before you save it.</p>
    </div>
  );
}

function ForPartner({ owned }: { owned: Set<string> }) {
  const them = partner.value!;
  const [look, setLook] = useState<AvatarLook>({ ...them.look, wear: wearOf(them.look) });
  const send = async () => {
    if (await act('gift_look', { wear: look.wear })) { sfx('heart'); toast(`Sent. ${them.name} will see it next time they open the app.`); }
  };
  return (
    <div class="col">
      <EditorStage look={look} sticky />
      <p class="tiny muted center" style={{ margin: 0 }}>Pick an outfit for {them.name} from your clothes. They can wear it or save it for later.</p>
      <ClothesPicker look={look} onChange={setLook} owned={owned} />
      <div class="sheet-foot">
        <button class="btn block" onClick={send}><Icon name="heart" size="s" />Send to {them.name}</button>
      </div>
    </div>
  );
}

/** A card on the home screen when your partner picked an outfit for you. */
export function OutfitGift() {
  const s = snap.value!;
  const gift = s.me.gift;
  if (!gift) return null;
  const from = s.partner?.id === gift.from ? s.partner.name : 'Your partner';
  const answer = async (accept: boolean) => { if (await act('answer_gift', { accept })) sfx(accept ? 'win' : 'close'); };
  return (
    <div class="bubble gift-card" role="dialog" aria-label="An outfit for you">
      <span class="small center">{from} picked an outfit for you</span>
      <div class="row" style={{ justifyContent: 'center' }}><AvatarPreview look={{ ...s.me.look, wear: gift.wear }} scale={2} /></div>
      <div class="row">
        <button class="btn ghost grow" onClick={() => answer(false)}>Maybe later</button>
        <button class="btn grow" onClick={() => answer(true)}>Wear it</button>
      </div>
    </div>
  );
}
