// The store: furniture, decor, wall items, styles and the clothes Boutique, bought with the shared wallet.

import { useState } from 'preact/hooks';
import { sfx } from '../../audio/audio';
import { ITEMS, STORE_TABS, type ItemDef } from '../../data/catalog';
import type { Piece } from '../../data/clothes';
import { INTERACTION_BY_ID } from '../../data/interactions';
import { slotsUsed } from '../../net/rules';
import { act, coins, prefs, sheet, snap, storeTab } from '../../state/store';
import { ItemThumb } from '../ItemThumb';
import { Coin, Icon, Sheet, Tabs } from '../kit';
import { BoutiqueTab, PieceDetail } from './Boutique';
import { pendingPlace } from './Decorate';

const TIER = ['Starter', 'Basic', 'Cozy', 'Premium', 'Luxe', 'Luxe+'];

export function Store({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState(() => { const t = storeTab.value ?? STORE_TABS[0].key; storeTab.value = null; return t; });
  const [sel, setSel] = useState<ItemDef | null>(null);
  const [piece, setPiece] = useState<Piece | null>(null);
  const s = snap.value!;
  const owned = new Set(s.unlocks);
  const t = STORE_TABS.find((x) => x.key === tab)!;
  const items = ITEMS.filter((i) => t.cats.includes(i.category) && !(i.starter && i.price === 0));
  const used = slotsUsed(s.inventory);
  const theme = prefs.value.theme;

  if (piece) return <PieceDetail piece={piece} onBack={() => setPiece(null)} onClose={onClose} onDecor={() => { setPiece(null); setTab('decor'); }} />;
  if (sel) return <Detail def={sel} onBack={() => setSel(null)} onClose={onClose} owned={owned.has(sel.key)} />;

  return (
    <Sheet title="Store" onClose={onClose} size="tall" head={<span class="chip"><Coin n={coins.value.toLocaleString()} /></span>}>
      <Tabs value={tab} options={STORE_TABS.map((x) => ({ key: x.key, label: x.label }))} onChange={(k) => { sfx('tap'); setTab(k); }} />
      {tab === 'boutique' ? <BoutiqueTab onPick={setPiece} /> : <>
      <p class="tiny muted" style={{ margin: '0 0 10px' }}>Storage box: {used}/{s.couple!.slots} slots</p>
      <div class="grid">
        {items.map((i) => {
          const have = (i.kind === 'style' || i.unique) && owned.has(i.key);
          return (
            <button class={`card ${have ? 'owned' : ''}`} onClick={() => { sfx('tap'); setSel(i); }}>
              {i.tier != null && i.kind !== 'style' && <span class="tag">{TIER[i.tier]}</span>}
              <div class="thumb"><ItemThumb item={i.key} theme={theme} fallback={<Icon name={i.key === 'up_slots' ? 'box' : 'sparkle'} size="l" />} /></div>
              <span class="name">{i.name}</span>
              <span class="price">{have ? 'Owned' : <Coin n={i.price} />}</span>
            </button>
          );
        })}
      </div>
      </>}
    </Sheet>
  );
}

function Detail({ def, onBack, onClose, owned }: { def: ItemDef; onBack: () => void; onClose: () => void; owned: boolean }) {
  const [busy, setBusy] = useState(false);
  const theme = prefs.value.theme;
  const afford = coins.value >= def.price;
  const placeable = def.kind === 'floor-item' || def.kind === 'wall-item';
  const unlocks = (def.unlocks ?? []).map((id) => INTERACTION_BY_ID[id]?.label).filter(Boolean);
  const buy = async () => {
    setBusy(true);
    const r = (await act('buy', { item: def.key })) as { invId?: string } | undefined;
    setBusy(false);
    if (!r) { sfx('error'); return; }
    sfx('coin');
    if (placeable && r.invId) {
      pendingPlace.value = r.invId;
      sheet.value = 'decorate';
    } else if (def.category === 'wallpaper' || def.category === 'floor') {
      pendingPlace.value = `style:${def.key}`;
      sheet.value = 'decorate';
    } else onBack();
  };
  const size = def.size ? `${def.size[0]}×${def.size[1]} ${def.kind === 'wall-item' ? 'wall tiles' : 'tiles'}` : null;
  return (
    <Sheet title={def.name} onClose={onClose} size="tall" head={<button class="btn ghost small icon" onClick={onBack} aria-label="Back"><Icon name="back" size="s" /></button>}>
      <div class="detail">
        <div class="thumb pbox soft"><ItemThumb item={def.key} theme={theme} fallback={<Icon name="sparkle" size="l" />} /></div>
        <div class="col" style={{ gap: '6px' }}>
          <p style={{ margin: 0, fontFamily: 'var(--read-font), system-ui, sans-serif', fontSize: '15px', lineHeight: 1.35 }}>{def.blurb}</p>
          {size && <span class="tiny muted">{size}{def.flat ? ', goes under furniture' : ''}</span>}
          {def.tier != null && def.kind !== 'style' && <span class="tiny muted">{TIER[def.tier]} tier</span>}
          {unlocks.length > 0 && <span class="chip"><Icon name="sparkle" size="s" />Unlocks {unlocks.join(', ')}</span>}
          {def.actions?.length ? <span class="tiny muted">Tap it in your room to {def.actions.map((a) => VERB[a] ?? a).join(' or ')}.</span> : null}
        </div>
      </div>
      <div style={{ height: '18px' }} />
      {owned ? (
        <button class="btn block" disabled>Owned</button>
      ) : (
        <button class="btn block" disabled={busy || !afford} onClick={buy}>
          {afford ? <>Buy for <Coin n={def.price} /></> : <>Need <Coin n={def.price - coins.value} /> more</>}
        </button>
      )}
      {!afford && !owned && <p class="tiny muted center">Earn coins at the café (Work), with quests, notes, quiet time and time together.</p>}
    </Sheet>
  );
}

const VERB: Record<string, string> = { sit: 'sit', sleep: 'sleep', play: 'play games', read: 'read', draw: 'play Draw & Guess', music: 'play music', quiet: 'start quiet time', look: 'look closer', water: 'water it', write: 'write', wardrobe: 'change clothes', photo: 'add a photo', calendar: 'set your next visit', feed: 'feed the fish' };
