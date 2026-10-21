// Decorate mode: the grid shows in the room, the storage box sits at the bottom, and items
// are dragged into place (green fits, red doesn't). Walls and floors are restyled here too.

import { signal } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import { sfx } from '../../audio/audio';
import type { Placement } from '../../core/grid';
import { ITEM_BY_KEY, ITEMS } from '../../data/catalog';
import { THEMES } from '../../data/themes';
import type { HomeScene, PlacingState } from '../../engine/scene';
import { slotsUsed } from '../../net/rules';
import type { RoomStyleRow } from '../../net/types';
import { act, actOptimistic, prefs, sheet, snap, toast } from '../../state/store';
import { Icon, Tabs } from '../kit';
import { ItemThumb } from '../ItemThumb';

/** Set by the store after a purchase: an inventory id to start placing, or "style:<key>". */
export const pendingPlace = signal<string | null>(null);

type Tab = 'box' | 'walls' | 'floor';

export function Decorate({ scene, onClose, bind }: { scene: HomeScene; onClose: () => void; bind: (d: (p: Placement | null) => void, pl: (s: PlacingState | null) => void) => void }) {
  const [tab, setTab] = useState<Tab>('box');
  const [placing, setPlacing] = useState<PlacingState | null>(null);
  const [placingInv, setPlacingInv] = useState<string | null>(null);
  const [selected, setSelected] = useState<Placement | null>(null);
  const s = snap.value!;
  const theme = prefs.value.theme;

  useEffect(() => {
    scene.setDecorating(true);
    bind((p) => { setSelected(p); if (p) sfx('tap'); }, (st) => setPlacing(st));
    const pend = pendingPlace.value;
    pendingPlace.value = null;
    if (pend?.startsWith('style:')) {
      const key = pend.slice(6);
      setTab(ITEM_BY_KEY[key]?.category === 'floor' ? 'floor' : 'walls');
    } else if (pend) {
      const row = snap.value?.inventory.find((r) => r.id === pend);
      if (row) { setPlacingInv(row.id); scene.startPlacing(row.item, { data: row.data }); }
    }
    return () => { scene.setDecorating(false); bind(() => {}, () => {}); };
  }, []);

  const startFromBox = (invId: string) => {
    const row = s.inventory.find((r) => r.id === invId);
    if (!row) return;
    sfx('tap');
    setSelected(null);
    scene.select(null);
    setPlacingInv(row.id);
    scene.startPlacing(row.item, { data: row.data });
  };

  // Placing, moving and storing all show in the room at once; the server catches up behind
  // (the piece breathes until it does) and anything it refuses is put back.
  const confirm = async () => {
    const inv = placingInv;
    const tempId = `pending:${Date.now().toString(36)}`;
    const st = scene.takePlacing(st0()?.placementId ? undefined : tempId);
    if (!st) return;
    setPlacing(null);
    setPlacingInv(null);
    sfx('place');
    if (st.placementId) {
      const pid = st.placementId;
      const ok = await actOptimistic('move', { pid, surface: st.surface, x: st.x, y: st.y, rot: st.rot },
        (s) => ({ ...s, placements: s.placements.map((p) => p.id === pid ? { ...p, surface: st.surface, x: st.x, y: st.y, rot: st.rot } : p) }));
      if (!ok) scene.sync(snap.value!.placements);
    } else if (inv) {
      const row = snap.value!.inventory.find((r) => r.id === inv);
      const ok = await actOptimistic('place', { invId: inv, surface: st.surface, x: st.x, y: st.y, rot: st.rot }, (s) => ({
        ...s,
        placements: [...s.placements, { id: tempId, item: st.item, surface: st.surface, x: st.x, y: st.y, rot: st.rot, data: row?.data ?? null }],
        inventory: s.inventory.flatMap((r) => r.id !== inv ? [r] : r.qty > 1 ? [{ ...r, qty: r.qty - 1 }] : []),
      }));
      if (!ok) scene.dropPending(tempId);
    }
  };
  const st0 = () => scene.placingState();

  const cancel = () => { scene.cancelPlacing(); setPlacingInv(null); sfx('close'); };

  const storeSelected = async () => {
    if (!selected) return;
    const p = selected;
    sfx('place'); setSelected(null); scene.select(null);
    scene.removeNow(p.id);
    await actOptimistic('store', { pid: p.id }, (s) => {
      const has = s.inventory.find((r) => r.item === p.item && ITEM_BY_KEY[p.item]?.stacks);
      return {
        ...s,
        placements: s.placements.filter((x) => x.id !== p.id),
        inventory: has ? s.inventory.map((r) => r === has ? { ...r, qty: r.qty + 1 } : r) : [...s.inventory, { id: `pending:${p.id}`, item: p.item, qty: 1, data: p.data ?? null }],
      };
    });
  };

  const moveSelected = () => {
    if (!selected) return;
    scene.startPlacing(selected.item, { placementId: selected.id, data: selected.data });
    setSelected(null);
  };

  const rotateSelected = () => {
    if (!selected) return;
    scene.startPlacing(selected.item, { placementId: selected.id, data: selected.data });
    scene.rotatePlacing();
    setSelected(null);
  };

  const used = slotsUsed(s.inventory);
  const slots = s.couple!.slots;
  const cells: ({ id: string; item: string; qty: number } | null)[] = [];
  for (const r of s.inventory) {
    if (ITEM_BY_KEY[r.item]?.stacks) cells.push({ id: r.id, item: r.item, qty: r.qty });
    else for (let i = 0; i < r.qty; i++) cells.push({ id: r.id, item: r.item, qty: 1 });
  }
  while (cells.length < Math.max(slots, used)) cells.push(null);

  return (
    <>
      <div class="hud">
        <div class="pill" style={{ cursor: 'default' }}><Icon name="decorate" size="s" />Decorating</div>
        <div class="grow" />
        <button class="btn good small" onClick={() => { cancel(); onClose(); }}><Icon name="check" size="s" />Done</button>
      </div>

      {placing && <div class={`fitnote pbox ${placing.fit.ok ? '' : 'bad'}`}>{placing.fit.ok ? 'Drag it around, then Place' : placing.fit.reason}</div>}

      {placing && (
        <div class="placebar pbox">
          <button class="btn soft icon" onClick={cancel} aria-label="Cancel"><Icon name="close" size="s" /></button>
          {ITEM_BY_KEY[placing.item]?.kind !== 'wall-item' && <button class="btn soft icon" onClick={() => { scene.rotatePlacing(); sfx('tap'); }} aria-label="Rotate"><Icon name="rotate" size="s" /></button>}
          <button class="btn good" disabled={!placing.fit.ok} onClick={confirm}><Icon name="check" size="s" />Place</button>
        </div>
      )}
      {!placing && selected && (
        <div class="placebar pbox">
          <span class="small" style={{ alignSelf: 'center', maxWidth: '110px' }}>{ITEM_BY_KEY[selected.item]?.name}</span>
          <button class="btn soft" onClick={moveSelected}>Move</button>
          {ITEM_BY_KEY[selected.item]?.kind !== 'wall-item' && <button class="btn soft icon" onClick={rotateSelected} aria-label="Rotate"><Icon name="rotate" size="s" /></button>}
          <button class="btn soft" onClick={storeSelected}><Icon name="box" size="s" />Store</button>
        </div>
      )}

      {/* The tray steps aside while you place or edit, so the whole room is visible. */}
      {!placing && !selected && <div class="sheet-wrap">
        <div class="tray">
          <Tabs value={tab} options={[{ key: 'box' as Tab, label: `Box ${used}/${slots}` }, { key: 'walls' as Tab, label: 'Walls' }, { key: 'floor' as Tab, label: 'Floor' }]} onChange={(k) => { setTab(k); sfx('tap'); }} />
          {tab === 'box' && (
            <>
              {s.inventory.length === 0 && <p class="small muted" style={{ margin: '0 4px 6px' }}>Your box is empty. Buy something in the Store, or tap an item in the room to move or store it.</p>}
              <div class="slots">
                {cells.map((c) => c ? (
                  <button class={`slot ${c.id.startsWith('pending:') ? 'pending' : ''}`} disabled={c.id.startsWith('pending:')} aria-selected={placingInv === c.id} onClick={() => startFromBox(c.id)} title={ITEM_BY_KEY[c.item]?.name}>
                    <ItemThumb item={c.item} theme={theme} alt={ITEM_BY_KEY[c.item]?.name} />
                    {c.qty > 1 && <span class="qty">×{c.qty}</span>}
                  </button>
                ) : <div class="slot empty" />)}
              </div>
              <div class="row" style={{ justifyContent: 'space-between', marginTop: '6px' }}>
                <span class="tiny muted">Tap an item in the room to move, turn or store it.</span>
                <button class="btn soft small" onClick={() => { sheet.value = 'store'; }}><Icon name="store" size="s" />Store</button>
              </div>
            </>
          )}
          {tab !== 'box' && <StylePicker kind={tab === 'walls' ? 'wallpaper' : 'floor'} />}
        </div>
      </div>}
    </>
  );
}

function StylePicker({ kind }: { kind: 'wallpaper' | 'floor' }) {
  const s = snap.value!;
  const theme = prefs.value.theme;
  const T = THEMES[theme];
  const style = s.couple!.style;
  const owned = new Set(s.unlocks);
  const all = ITEMS.filter((i) => i.category === kind);
  const set = async (patch: Partial<RoomStyleRow>) => {
    sfx('tap');
    const ok = await act('set_style', { style: { ...style, ...patch } });
    if (!ok) sfx('error');
  };
  const current = kind === 'wallpaper' ? style.wallpaper : style.floor;
  const tint = kind === 'wallpaper' ? style.wallTint : style.floorTint;
  return (
    <div class="col" style={{ gap: '8px', maxHeight: '200px', overflowY: 'auto', padding: '2px 4px' }}>
      <div class="slots" style={{ maxHeight: 'none', gridTemplateColumns: 'repeat(5, 1fr)' }}>
        {all.map((i) => {
          const have = owned.has(i.key);
          return (
            <button class="slot" aria-selected={current === i.key} style={{ opacity: have ? 1 : 0.4 }} title={i.name}
              onClick={() => { if (have) void set(kind === 'wallpaper' ? { wallpaper: i.key } : { floor: i.key }); else { toast(`${i.name} is in the Store.`); } }}>
              <ItemThumb item={i.key} theme={theme} alt={i.name} />
              {!have && <span class="qty"><Icon name="lock" size="s" /></span>}
            </button>
          );
        })}
      </div>
      <span class="tiny muted">Tint</span>
      <div class="swatches">
        <button class="swatch" aria-pressed={!tint} aria-label="Theme color" style={{ background: kind === 'wallpaper' ? T.wall.tint : '#C8A070', backgroundImage: 'linear-gradient(135deg, transparent 45%, var(--outline) 45%, var(--outline) 55%, transparent 55%)' }} onClick={() => void set(kind === 'wallpaper' ? { wallTint: '' } : { floorTint: null })} />
        {T.swatches.map((c) => <button class="swatch" aria-pressed={tint === c} style={{ background: c }} aria-label={c} onClick={() => void set(kind === 'wallpaper' ? { wallTint: c } : { floorTint: c })} />)}
      </div>
    </div>
  );
}
