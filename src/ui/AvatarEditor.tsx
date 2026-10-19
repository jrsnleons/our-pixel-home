// Hair, skin, eyes, outfit and accessory picker with a live pixel preview.

import { useEffect, useRef, useState } from 'preact/hooks';
import { ITEMS } from '../data/catalog';
import { avatarPreview, EYE_COLORS, HAIR_COLOR_NAMES, HAIR_COLORS, HAIR_NAMES, HAIR_STYLES, SKINS, type AvatarLook } from '../engine/art/avatar';
import { Icon } from './kit';

// Mostly breathing and blinking, with one wave per loop: a constant wave looks frantic.
const FRAMES = ['idle', 'idle', 'idle2', 'idle2', 'idle', 'blink', 'idle', 'idle2', 'idle', 'idle', 'wave1', 'wave2', 'wave1', 'wave2', 'idle', 'idle2'];

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
  const set = (p: Partial<AvatarLook>) => onChange({ ...look, ...p });
  // First-time setup shows only what you have; the wardrobe also shows what the Store sells.
  const outfits = ITEMS.filter((i) => i.category === 'outfit' && (!onlyOwned || owned.has(i.key)));
  const accs = ITEMS.filter((i) => i.category === 'accessory' && (!onlyOwned || owned.has(i.key)));
  return (
    <div class="col" style={{ gap: '14px' }}>
      <AvatarPreview look={look} />
      <Group label="Skin">
        <div class="swatches">{SKINS.map((c, i) => <button class="swatch" aria-label={`Skin ${i + 1}`} aria-pressed={look.skin === i} style={{ background: c }} onClick={() => set({ skin: i })} />)}</div>
      </Group>
      <Group label="Hair">
        <div class="row wrap" style={{ gap: '8px' }}>
          {HAIR_STYLES.map((h) => <button class="tab" aria-selected={look.hair === h} onClick={() => set({ hair: h })}>{HAIR_NAMES[h]}</button>)}
        </div>
      </Group>
      <Group label="Hair color">
        <div class="swatches">{HAIR_COLORS.map((c, i) => <button class="swatch" aria-label={HAIR_COLOR_NAMES[i]} aria-pressed={look.hairColor === i} style={{ background: c }} onClick={() => set({ hairColor: i })} />)}</div>
      </Group>
      <Group label="Eyes">
        <div class="swatches">{EYE_COLORS.map((c, i) => <button class="swatch" aria-label={`Eyes ${i + 1}`} aria-pressed={look.eyes === i} style={{ background: c }} onClick={() => set({ eyes: i })} />)}</div>
      </Group>
      <Group label="Outfit">
        <div class="row wrap" style={{ gap: '8px' }}>
          {outfits.map((o) => {
            const have = owned.has(o.key);
            return <button class="tab" disabled={!have} aria-selected={look.outfit === o.key} onClick={() => have && set({ outfit: o.key })} style={{ opacity: have ? 1 : 0.45 }}>{!have && <Icon name="lock" size="s" />}{o.name}</button>;
          })}
        </div>
      </Group>
      <Group label="Accessory">
        <div class="row wrap" style={{ gap: '8px' }}>
          {accs.map((o) => {
            const have = owned.has(o.key);
            return <button class="tab" disabled={!have} aria-selected={look.accessory === o.key} onClick={() => have && set({ accessory: o.key })} style={{ opacity: have ? 1 : 0.45 }}>{!have && <Icon name="lock" size="s" />}{o.name}</button>;
          })}
        </div>
      </Group>
      <p class="tiny muted">{onlyOwned ? 'More outfits and accessories are in the Store.' : 'Locked outfits and accessories are in the Store.'}</p>
    </div>
  );
}

function Group({ label, children }: { label: string; children: preact.ComponentChildren }) {
  return <div class="col" style={{ gap: '6px' }}><span class="small muted">{label}</span>{children}</div>;
}
