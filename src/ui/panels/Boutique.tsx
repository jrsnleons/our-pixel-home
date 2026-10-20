// The Boutique tab of the Store: twelve themed pieces that change every Monday, the basics
// rack that never changes, and a fitting room that shows each colorway on you.

import { useEffect, useState } from 'preact/hooks';
import { sfx } from '../../audio/audio';
import { boutique, colorPrice, nextRackAt, ownedClothes, ownsPiece, PIECES, SLOT_NAMES, THEMES, wearOf, worn, type Piece } from '../../data/clothes';
import { avatarThumb, type AvatarLook } from '../../engine/art/avatar';
import { hasWardrobe } from '../../net/rules';
import { act, coins, sheet, snap } from '../../state/store';
import { AvatarPreview, putOn } from '../AvatarEditor';
import { Coin, Icon, Sheet } from '../kit';

function left(ms: number): string {
  const h = Math.max(0, Math.floor(ms / 3_600_000));
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${Math.max(0, Math.floor(ms / 60_000) % 60)}m`;
}

/** You wearing one colorway of a piece, for cards and the fitting room. */
function tryOn(look: AvatarLook, p: Piece, color: number, owned: Set<string>): AvatarLook {
  return { ...look, wear: putOn(wearOf(look), p, color, owned) };
}

export function BoutiqueTab({ onPick }: { onPick: (p: Piece) => void }) {
  const s = snap.value!;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
  const rack = boutique(now);
  const theme = THEMES[rack.theme];
  const owned = ownedClothes(s.unlocks);
  const basics = PIECES.filter((p) => p.basic);
  const card = (p: Piece) => {
    const have = ownsPiece(owned, p.key);
    const all = p.colors.every((_, i) => owned.has(worn(p.key, i)));
    const head = p.slot === 'hat' || p.slot === 'face';
    return (
      <button class={`card ${all ? 'owned' : ''}`} onClick={() => { sfx('tap'); onPick(p); }}>
        {p.matching && <span class="tag">Matching</span>}
        <div class="thumb"><img class="px" src={avatarThumb(tryOn(s.me.look, p, 0, owned), head ? 'head' : 'full', head ? 2 : 1)} alt="" loading="lazy" /></div>
        <span class="name">{p.name}</span>
        <span class="swatch-dots">{p.colors.map((c) => <i style={{ background: c }} />)}</span>
        <span class="price">{all ? 'Owned' : have ? <>More colors <Coin n={colorPrice(owned, p.key)} /></> : <Coin n={p.price} />}</span>
      </button>
    );
  };
  return (
    <div class="col" style={{ gap: '10px' }}>
      <div class="boutique-head pbox soft">
        <span class="tiny muted">This week’s theme</span>
        <b style={{ fontWeight: 'normal', fontSize: '1.25em' }}>{theme.name}</b>
        <span class="small">{theme.blurb}</span>
        <span class="tiny muted">New rack in {left(nextRackAt(now).getTime() - now.getTime())}</span>
      </div>
      <div class="grid">{rack.pieces.map(card)}</div>
      <span class="small muted" style={{ marginTop: '6px' }}>Basics, always here</span>
      <div class="grid">{basics.map(card)}</div>
    </div>
  );
}

export function PieceDetail({ piece: p, onBack, onClose, onDecor }: { piece: Piece; onBack: () => void; onClose: () => void; onDecor: () => void }) {
  const s = snap.value!;
  const owned = ownedClothes(s.unlocks);
  const [color, setColor] = useState(() => Math.max(0, p.colors.findIndex((_, i) => !owned.has(worn(p.key, i)))));
  const [busy, setBusy] = useState(false);
  const have = owned.has(worn(p.key, color));
  const price = colorPrice(owned, p.key);
  const afford = coins.value >= price;
  const canChange = hasWardrobe(s);
  const buy = async () => {
    setBusy(true);
    const ok = await act('buy_clothes', { key: p.key, color });
    setBusy(false);
    if (ok) sfx('coin'); else sfx('error');
  };
  const go = (to: 'wardrobe' | 'decor') => { sfx('open'); if (to === 'decor') onDecor(); else sheet.value = 'wardrobe'; };
  return (
    <Sheet title={p.name} onClose={onClose} size="tall" head={<button class="btn ghost small icon" onClick={onBack} aria-label="Back"><Icon name="back" size="s" /></button>}>
      <div class="col" style={{ alignItems: 'center', gap: '8px' }}>
        <AvatarPreview look={tryOn(s.me.look, p, color, owned)} scale={4} />
        <span class="tiny muted">On you · tap to turn around</span>
      </div>
      <p style={{ margin: '10px 0 4px', fontFamily: 'var(--read-font), system-ui, sans-serif', fontSize: '15px', lineHeight: 1.35 }}>{p.blurb}</p>
      <span class="tiny muted">{SLOT_NAMES[p.slot].replace(/s$/, '')}{p.full ? ' · a dress, worn without bottoms' : ''}{p.matching ? ' · made to wear together' : ''}</span>
      <div class="col" style={{ gap: '6px', marginTop: '12px' }}>
        <span class="small">{p.colorNames[color]}{have ? ' · owned' : ''}</span>
        <div class="swatches">
          {p.colors.map((c, i) => (
            <button class={`swatch ${owned.has(worn(p.key, i)) ? 'have' : ''}`} aria-label={`${p.colorNames[i]}${owned.has(worn(p.key, i)) ? ', owned' : ''}`} aria-pressed={color === i} style={{ background: c }} onClick={() => { sfx('tap'); setColor(i); }} />
          ))}
        </div>
      </div>
      <div style={{ height: '16px' }} />
      {have ? (
        canChange
          ? <button class="btn block" onClick={() => go('wardrobe')}>Wear it (opens your wardrobe)</button>
          : <button class="btn soft block" onClick={() => go('decor')}>Get a clothes rack to change into it</button>
      ) : (
        <button class="btn block" disabled={busy || !afford} onClick={buy}>
          {afford ? <>Buy {p.colorNames[color]} for <Coin n={price} /></> : <>Need <Coin n={price - coins.value} /> more</>}
        </button>
      )}
      {!have && ownsPiece(owned, p.key) && <p class="tiny muted center">Half price: you already have this in another color.</p>}
      {!have && !canChange && <p class="tiny muted center">You’ll change at a clothes rack, mirror or wardrobe in your room.</p>}
    </Sheet>
  );
}
