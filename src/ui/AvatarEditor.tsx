// Body, skin, hair, eyes, face, outfit and accessory picker with a live pixel preview. Every
// hairstyle, outfit and accessory is shown as a little picture of you wearing it.

import { useEffect, useRef, useState } from 'preact/hooks';
import { sfx } from '../audio/audio';
import { ITEMS } from '../data/catalog';
import { avatarPreview, avatarThumb, EYE_COLORS, HAIR_COLOR_NAMES, HAIR_COLORS, HAIR_NAMES, HAIR_ORDER, SKINS, type AvatarLook, type Body } from '../engine/art/avatar';
import { sheet } from '../state/store';
import { Coin } from './kit';

// Mostly breathing and blinking, with one wave per loop: a constant wave looks frantic.
const FRAMES = ['idle', 'idle', 'idle2', 'idle2', 'idle', 'blink', 'idle', 'idle2', 'idle', 'idle', 'wave1', 'wave2', 'wave1', 'wave2', 'idle', 'idle2'];

/** Outfits that suit each body go first; the rest follow in catalog order. */
const OUTFIT_FIRST: Record<Body, string[]> = {
  guy: ['fit_tee', 'fit_hoodie', 'fit_flannel', 'fit_sunday', 'fit_formal', 'fit_sweater'],
  girl: ['fit_dress', 'fit_sweater', 'fit_raincoat', 'fit_pajamas', 'fit_tee', 'fit_hoodie'],
};

export function AvatarPreview({ look, scale = 6, animate = true }: { look: AvatarLook; scale?: number; animate?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<'front' | 'back'>('front');
  const [f, setF] = useState(0);
  useEffect(() => {
    if (!animate) return;
    const t = setInterval(() => setF((x) => (x + 1) % FRAMES.length), 380);
    return () => clearInterval(t);
  }, [animate]);
  useEffect(() => {
    const c = avatarPreview(look, view === 'back' ? 'idle' : FRAMES[f], view, scale);
    c.className = 'px';
    host.current?.replaceChildren(c);
  }, [look, view, f, scale]);
  return (
    <div class="avatar-stage pbox soft" onClick={() => setView(view === 'front' ? 'back' : 'front')} title="Tap to turn around">
      <div ref={host} />
    </div>
  );
}

export function AvatarEditor({ look, onChange, owned, onlyOwned = false }: { look: AvatarLook; onChange: (l: AvatarLook) => void; owned: Set<string>; onlyOwned?: boolean }) {
  const set = (p: Partial<AvatarLook>) => { sfx('tap'); onChange({ ...look, ...p }); };
  const body: Body = look.body === 'girl' ? 'girl' : 'guy';
  // First-time setup shows only what you have; the wardrobe also shows what the Store sells.
  const first = OUTFIT_FIRST[body];
  const rank = (k: string) => { const i = first.indexOf(k); return i < 0 ? first.length : i; };
  const outfits = ITEMS.filter((i) => i.category === 'outfit' && (!onlyOwned || owned.has(i.key))).sort((a, b) => rank(a.key) - rank(b.key));
  const accs = ITEMS.filter((i) => i.category === 'accessory' && (!onlyOwned || owned.has(i.key)));
  const toStore = () => { sfx('open'); sheet.value = 'store'; };
  return (
    <div class="col" style={{ gap: '14px' }}>
      <div class="editor-stage">
        <AvatarPreview look={look} scale={7} />
        <span class="tiny muted">Tap to turn around</span>
      </div>
      <Group label="Body">
        <div class="pick-grid two">
          {(['guy', 'girl'] as const).map((b) => (
            <button class="pick" aria-pressed={body === b} onClick={() => set(onlyOwned && !HAIR_ORDER[b].slice(0, 6).includes(look.hair) ? { body: b, hair: HAIR_ORDER[b][0] } : { body: b })}>
              <img class="px" src={avatarThumb({ ...look, body: b }, 'head', 3)} alt="" />
              <span>{b === 'guy' ? 'Guy' : 'Girl'}</span>
            </button>
          ))}
        </div>
      </Group>
      <Group label="Skin">
        <div class="swatches">{SKINS.map((c, i) => <button class="swatch" aria-label={`Skin ${i + 1}`} aria-pressed={look.skin === i} style={{ background: c }} onClick={() => set({ skin: i })} />)}</div>
      </Group>
      <Group label="Hair">
        <div class="pick-grid">
          {HAIR_ORDER[body].map((h) => (
            <button class="pick" aria-pressed={look.hair === h} onClick={() => set({ hair: h })}>
              <img class="px" src={avatarThumb({ ...look, hair: h, accessory: 'acc_none' }, 'head', 3)} alt="" />
              <span>{HAIR_NAMES[h]}</span>
            </button>
          ))}
        </div>
      </Group>
      <Group label="Hair color">
        <div class="swatches">{HAIR_COLORS.map((c, i) => <button class="swatch" aria-label={HAIR_COLOR_NAMES[i]} aria-pressed={look.hairColor === i} style={{ background: c }} onClick={() => set({ hairColor: i })} />)}</div>
      </Group>
      <Group label="Eyes">
        <div class="swatches">{EYE_COLORS.map((c, i) => <button class="swatch" aria-label={`Eyes ${i + 1}`} aria-pressed={look.eyes === i} style={{ background: c }} onClick={() => set({ eyes: i })} />)}</div>
      </Group>
      <Group label="Face">
        <div class="row" style={{ gap: '8px' }}>
          <button class="tab" aria-selected={!!look.freckles} onClick={() => set({ freckles: !look.freckles })}>Freckles</button>
          <button class="tab" aria-selected={!!look.blush} onClick={() => set({ blush: !look.blush })}>Rosy cheeks</button>
        </div>
      </Group>
      <Group label="Outfit">
        <div class="pick-grid">
          {outfits.map((o) => {
            const have = owned.has(o.key);
            return (
              <button class={`pick ${have ? '' : 'locked'}`} aria-pressed={look.outfit === o.key} onClick={have ? () => set({ outfit: o.key }) : toStore}>
                <img class="px" src={avatarThumb({ ...look, outfit: o.key }, 'full', 2)} alt="" />
                <span>{o.name}</span>
                {!have && <span class="price"><Coin n={o.price} /></span>}
              </button>
            );
          })}
        </div>
      </Group>
      <Group label="Accessory">
        <div class="pick-grid">
          {accs.map((o) => {
            const have = owned.has(o.key);
            return (
              <button class={`pick ${have ? '' : 'locked'}`} aria-pressed={look.accessory === o.key} onClick={have ? () => set({ accessory: o.key }) : toStore}>
                <img class="px" src={avatarThumb({ ...look, accessory: o.key }, 'head', 3)} alt="" />
                <span>{o.name}</span>
                {!have && <span class="price"><Coin n={o.price} /></span>}
              </button>
            );
          })}
        </div>
      </Group>
      <p class="tiny muted">{onlyOwned ? 'More outfits and accessories are in the Store.' : 'Tap a locked one to find it in the Store.'}</p>
    </div>
  );
}

function Group({ label, children }: { label: string; children: preact.ComponentChildren }) {
  return <div class="col" style={{ gap: '6px' }}><span class="small muted">{label}</span>{children}</div>;
}
