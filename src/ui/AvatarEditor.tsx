// Body, skin, hair, eyes and face, plus clothes slot by slot, with a live pixel preview. Every
// choice is shown as a little picture of you wearing it.

import { useEffect, useRef, useState } from 'preact/hooks';
import { sfx } from '../audio/audio';
import { OPTIONAL, PIECES, SLOT_NAMES, SLOTS, parseWorn, wearOf, worn, type Piece, type Slot, type Wear } from '../data/clothes';
import { avatarPreview, avatarThumb, EYE_COLORS, HAIR_COLOR_NAMES, HAIR_COLORS, HAIR_NAMES, HAIR_ORDER, SKINS, type AvatarLook, type Body } from '../engine/art/avatar';
import { Tabs } from './kit';

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

/** Put one piece on, keeping the outfit wearable: a dress replaces bottoms, bottoms replace a dress. */
export function putOn(wear: Wear, piece: Piece, color: number, owned: Set<string>): Wear {
  const w: Wear = { ...wear, [piece.slot]: worn(piece.key, color) };
  if (piece.slot === 'top' && piece.full) delete w.bottom;
  if (piece.slot === 'top' && !piece.full && !w.bottom) w.bottom = firstOwned('bottom', owned);
  if (piece.slot === 'bottom' && parseWorn(w.top)?.piece.full) w.top = firstOwned('top', owned, (p) => !p.full);
  return w;
}

function firstOwned(slot: Slot, owned: Set<string>, ok: (p: Piece) => boolean = () => true): string {
  for (const p of PIECES) if (p.slot === slot && ok(p)) for (let i = 0; i < p.colors.length; i++) if (owned.has(worn(p.key, i))) return worn(p.key, i);
  return slot === 'top' ? 'tee:0' : 'jeans:0';
}

/** Tops, bottoms, shoes, hats, glasses and bags you own, with each one's colorways. */
export function ClothesPicker({ look, onChange, owned }: { look: AvatarLook; onChange: (l: AvatarLook) => void; owned: Set<string> }) {
  const [slot, setSlot] = useState<Slot>('top');
  const wear = wearOf(look);
  const on = parseWorn(wear[slot]);
  const dress = parseWorn(wear.top)?.piece.full;
  const mine = PIECES.filter((p) => p.slot === slot && p.colors.some((_, i) => owned.has(worn(p.key, i))));
  const set = (w: Wear) => { sfx('tap'); onChange({ ...look, wear: w }); };
  const thumbOf = (w: Wear) => avatarThumb({ ...look, wear: w }, slot === 'hat' || slot === 'face' ? 'head' : 'full', slot === 'hat' || slot === 'face' ? 3 : 2);
  return (
    <div class="col" style={{ gap: '8px' }}>
      <Tabs value={slot} onChange={(s) => { sfx('tap'); setSlot(s); }} options={SLOTS.map((s) => ({ key: s, label: SLOT_NAMES[s] }))} />
      {slot === 'bottom' && dress && <p class="tiny muted" style={{ margin: 0 }}>Your dress covers this. Pick bottoms to switch to a top.</p>}
      <div class="pick-grid">
        {OPTIONAL.includes(slot) && (
          <button class="pick" aria-pressed={!wear[slot]} onClick={() => { const w = { ...wear }; delete w[slot]; set(w); }}>
            <img class="px" src={thumbOf({ ...wear, [slot]: undefined })} alt="" />
            <span>None</span>
          </button>
        )}
        {mine.map((p) => {
          const c = on?.piece.key === p.key ? on.color : p.colors.findIndex((_, i) => owned.has(worn(p.key, i)));
          return (
            <button class="pick" aria-pressed={on?.piece.key === p.key} onClick={() => set(putOn(wear, p, c, owned))}>
              <img class="px" src={thumbOf(putOn(wear, p, c, owned))} alt="" />
              <span>{p.name}</span>
            </button>
          );
        })}
      </div>
      {on && on.piece.colors.length > 1 && (
        <div class="col" style={{ gap: '6px' }}>
          <span class="small muted">{on.piece.name} colors</span>
          <div class="swatches">
            {on.piece.colors.map((c, i) => {
              const have = owned.has(worn(on.piece.key, i));
              return (
                <button class={`swatch ${have ? '' : 'locked'}`} aria-label={`${on.piece.colorNames[i]}${have ? '' : ' (not owned)'}`} aria-pressed={on.color === i} style={{ background: c }}
                  disabled={!have} onClick={() => set(putOn(wear, on.piece, i, owned))} />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function AvatarEditor({ look, onChange, owned, clothesFirst = false }: { look: AvatarLook; onChange: (l: AvatarLook) => void; owned: Set<string>; clothesFirst?: boolean }) {
  const set = (p: Partial<AvatarLook>) => { sfx('tap'); onChange({ ...look, ...p }); };
  const body: Body = look.body === 'girl' ? 'girl' : 'guy';
  // Thumbnails of the head alone don't need what you're wearing on your head.
  const bare: AvatarLook = { ...look, wear: { ...wearOf(look), hat: undefined, face: undefined } };
  const clothes = <Group label="Clothes"><ClothesPicker look={look} onChange={onChange} owned={owned} /></Group>;
  return (
    <div class="col" style={{ gap: '14px' }}>
      {clothesFirst && clothes}
      <Group label="Body">
        <div class="pick-grid two">
          {(['guy', 'girl'] as const).map((b) => (
            <button class="pick" aria-pressed={body === b} onClick={() => set(!HAIR_ORDER[b].slice(0, 6).includes(look.hair) ? { body: b, hair: HAIR_ORDER[b][0] } : { body: b })}>
              <img class="px" src={avatarThumb({ ...bare, body: b }, 'head', 3)} alt="" />
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
              <img class="px" src={avatarThumb({ ...bare, hair: h }, 'head', 3)} alt="" />
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
      {!clothesFirst && clothes}
    </div>
  );
}

export function Group({ label, children }: { label: string; children: preact.ComponentChildren }) {
  return <div class="col" style={{ gap: '6px' }}><span class="small muted">{label}</span>{children}</div>;
}

/** The live preview above an editor; sticky keeps it in view while you scroll the options. */
export function EditorStage({ look, sticky = false }: { look: AvatarLook; sticky?: boolean }) {
  return (
    <div class={`editor-stage ${sticky ? 'sticky' : ''}`}>
      <AvatarPreview look={look} scale={sticky ? 5 : 7} />
      {!sticky && <span class="tiny muted">Tap to turn around</span>}
    </div>
  );
}
