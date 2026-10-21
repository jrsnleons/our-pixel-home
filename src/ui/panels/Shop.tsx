// The two shops on Maple Street: Maple Furnishings (furniture, walls and floors) and The Boutique
// (clothes). Each only sells what is on its shelves this week.

import { useEffect, useState } from 'preact/hooks';
import { sfx } from '../../audio/audio';
import { ITEM_BY_KEY, SLOT_UPGRADE, type ItemDef } from '../../data/catalog';
import { INTERACTION_BY_ID } from '../../data/interactions';
import { PIECE_BY_KEY } from '../../data/clothes';
import { shelves } from '../../data/stock';
import { slotsUsed } from '../../net/rules';
import { shopCtx } from '../../state/area';
import { act, coins, prefs, snap, toast } from '../../state/store';
import { ItemThumb } from '../ItemThumb';
import { Coin, Icon, Sheet } from '../kit';
import { BoutiqueTab, PieceDetail } from './Boutique';
import type { Piece } from '../../data/clothes';

const TIER = ['Starter', 'Basic', 'Cozy', 'Premium', 'Luxe', 'Luxe+'];

function left(ms: number): string {
  const h = Math.max(0, Math.floor(ms / 3_600_000));
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${Math.max(0, Math.floor(ms / 60_000) % 60)}m`;
}

export function Shop({ onClose }: { onClose: () => void }) {
  const ctx = shopCtx.value;
  if (!ctx) return null;
  return ctx.shop === 'boutique' ? <Boutique focus={ctx.focus} onClose={onClose} /> : <Furnishings focus={ctx.focus} onClose={onClose} />;
}

function Boutique({ focus, onClose }: { focus?: string; onClose: () => void }) {
  const [piece, setPiece] = useState<Piece | null>(() => (focus ? PIECE_BY_KEY[focus] ?? null : null));
  if (piece) return <PieceDetail piece={piece} onBack={() => setPiece(null)} onClose={onClose} />;
  return (
    <Sheet title="The Boutique" onClose={onClose} size="tall" head={<span class="chip"><Coin n={coins.value.toLocaleString()} /></span>}>
      <BoutiqueTab onPick={setPiece} />
    </Sheet>
  );
}

function Furnishings({ focus, onClose }: { focus?: string; onClose: () => void }) {
  const [sel, setSel] = useState<ItemDef | null>(() => (focus ? ITEM_BY_KEY[focus] ?? null : null));
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
  const s = snap.value!;
  const owned = new Set(s.unlocks);
  const st = shelves(now, { unlocks: s.unlocks, inventory: s.inventory, placements: s.placements });
  const theme = prefs.value.theme;
  const used = slotsUsed(s.inventory);

  if (sel) return <Detail def={sel} onBack={() => setSel(null)} onClose={onClose} owned={owned.has(sel.key)} />;

  const grid = (list: ItemDef[]) => (
    <div class="grid">
      {list.map((i) => {
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
  );
  const heading = (t: string, sub?: string) => <div class="col" style={{ gap: '2px', margin: '14px 0 8px' }}><span class="small">{t}</span>{sub && <span class="tiny muted">{sub}</span>}</div>;
  return (
    <Sheet title="Maple Furnishings" onClose={onClose} size="tall" head={<span class="chip"><Coin n={coins.value.toLocaleString()} /></span>}>
      <p class="tiny muted" style={{ margin: 0 }}>Storage box: {used}/{s.couple!.slots} slots · +{SLOT_UPGRADE} per box upgrade</p>
      {heading('New this week', `Fresh stock in ${left(st.nextAt.getTime() - now.getTime())}`)}
      {grid(st.featured)}
      {st.steps.length > 0 && <>{heading('A step up from what you have', 'Picked for you')}{grid(st.steps)}</>}
      {heading('Walls and floors', 'Three wallpapers this week, and the next floor up')}
      {grid([...st.wallpapers, ...(st.floor ? [st.floor] : [])])}
      {heading('Always on the shelf')}
      {grid(st.essentials)}
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
    toast(placeable ? `${def.name} is in your storage box. Place it from Decorate at home.` : def.category === 'wallpaper' || def.category === 'floor' ? `${def.name} is yours. Apply it from Decorate at home.` : `${def.name} is yours.`, 'love');
    onBack();
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
      {!afford && !owned && <p class="tiny muted center">Earn coins with shifts in Maple Town, quests, notes, quiet time and time together.</p>}
    </Sheet>
  );
}

const VERB: Record<string, string> = { sit: 'sit', sleep: 'sleep', play: 'play games', read: 'read', draw: 'play Draw & Guess', music: 'play music', quiet: 'start quiet time', look: 'look closer', water: 'water it', write: 'write', wardrobe: 'change clothes', photo: 'add a photo', calendar: 'set your next visit', feed: 'feed the fish' };
