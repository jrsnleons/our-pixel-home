// Body, skin, hair, eyes and face, plus clothes slot by slot, with a live pixel preview. Every
// choice is shown as a little picture of you wearing it.

import { useEffect, useRef, useState } from 'preact/hooks';
import { sfx } from '../audio/audio';
import { OPTIONAL, PIECES, SLOT_NAMES, SLOTS, parseWorn, wearOf, worn, type Piece, type Slot, type Wear } from '../data/clothes';
import { avatarPreview, avatarThumb, EYE_COLORS, HAIR_COLOR_NAMES, HAIR_COLORS, HAIR_NAMES, HAIR_ORDER, SKINS, type AvatarLook, type Body } from '../engine/art/avatar';
import { Tabs } from './kit';

// Mostly breathing and blinking, with one wave per loop: a constant wave looks frantic.
const FRAMES = ['idle', 'idle', 'idle2', 'idle2', 'idle', 'blink', 'idle', 'idle2', 'idle', 'idle', 'wave1', 'wave2', 'wave1', 'wave2', 'idle', 'idle2'];

export function AvatarPreview({ look, scale = 3, animate = true }: { look: AvatarLook; scale?: number; animate?: boolean }) {
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
  const thumbOf = (w: Wear) => avatarThumb({ ...look, wear: w }, slot === 'hat' || slot === 'face' ? 'head' : 'full', slot === 'hat' || slot === 'face' ? 2 : 1);
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

type Part = 'clothes' | 'body' | 'hair' | 'face';
const PARTS: { key: Part; label: string }[] = [{ key: 'body', label: 'Body' }, { key: 'hair', label: 'Hair' }, { key: 'face', label: 'Face' }, { key: 'clothes', label: 'Clothes' }];

/** Every hair style works on both bodies; one fixed order, so switching body never reshuffles it. */
const HAIR_PICKS = ['short', 'slick', 'buzz', 'curly', 'afro', 'wavy', 'long', 'bob', 'ponytail', 'twintails', 'braid', 'bun'];

/**
 * The editor: a preview that stays in view with tabs under it, so each group of options is one
 * short page instead of one long scroll. clothesFirst opens on Clothes (the wardrobe).
 */
export function AvatarEditor({ look, onChange, owned, clothesFirst = false, foot }: { look: AvatarLook; onChange: (l: AvatarLook) => void; owned: Set<string>; clothesFirst?: boolean; foot?: preact.ComponentChildren }) {
  const [part, setPart] = useState<Part>(clothesFirst ? 'clothes' : 'body');
  const set = (p: Partial<AvatarLook>) => { sfx('tap'); onChange({ ...look, ...p }); };
  const body: Body = look.body === 'girl' ? 'girl' : 'guy';
  // Thumbnails of the head alone don't need what you're wearing on your head.
  const bare: AvatarLook = { ...look, wear: { ...wearOf(look), hat: undefined, face: undefined } };
  const parts = clothesFirst ? [PARTS[3], ...PARTS.slice(0, 3)] : PARTS;
  // Switching body keeps your hair, unless it was the other body's starting style.
  const asBody = (b: Body): Partial<AvatarLook> => (look.hair === HAIR_ORDER[body][0] && b !== body ? { body: b, hair: HAIR_ORDER[b][0] } : { body: b });
  return (
    <div class="editor">
      <div class="editor-top">
        <EditorStage look={look} compact />
        <Tabs value={part} onChange={(k) => { sfx('tap'); setPart(k); }} options={parts} />
      </div>
      <div class="col editor-page" style={{ gap: '14px' }}>
        {part === 'body' && (
          <>
            <Group label="Body">
              <div class="pick-grid two">
                {(['guy', 'girl'] as const).map((b) => (
                  <button class="pick" aria-pressed={body === b} onClick={() => set(asBody(b))}>
                    <img class="px" src={avatarThumb({ ...bare, ...asBody(b) }, 'full', 2)} alt="" />
                    <span>{b === 'guy' ? 'Guy' : 'Girl'}</span>
                  </button>
                ))}
              </div>
            </Group>
            <Group label="Skin">
              <div class="swatches">{SKINS.map((c, i) => <button class="swatch" aria-label={`Skin ${i + 1}`} aria-pressed={look.skin === i} style={{ background: c }} onClick={() => set({ skin: i })} />)}</div>
            </Group>
          </>
        )}
        {part === 'hair' && (
          <>
            <Group label="Hair color">
              <div class="swatches">{HAIR_COLORS.map((c, i) => <button class="swatch" aria-label={HAIR_COLOR_NAMES[i]} aria-pressed={look.hairColor === i} style={{ background: c }} onClick={() => set({ hairColor: i })} />)}</div>
            </Group>
            <Group label="Style">
              <div class="pick-grid">
                {HAIR_PICKS.map((h) => (
                  <button class="pick" aria-pressed={look.hair === h} onClick={() => set({ hair: h })}>
                    <img class="px" src={avatarThumb({ ...bare, hair: h }, 'head', 2)} alt="" />
                    <span>{HAIR_NAMES[h]}</span>
                  </button>
                ))}
              </div>
            </Group>
          </>
        )}
        {part === 'face' && (
          <>
            <Group label="Eyes">
              <div class="swatches">{EYE_COLORS.map((c, i) => <button class="swatch" aria-label={`Eyes ${i + 1}`} aria-pressed={look.eyes === i} style={{ background: c }} onClick={() => set({ eyes: i })} />)}</div>
            </Group>
            <Group label="Extras">
              <div class="row" style={{ gap: '8px' }}>
                <button class="tab" aria-selected={!!look.freckles} onClick={() => set({ freckles: !look.freckles })}>Freckles</button>
                <button class="tab" aria-selected={!!look.blush} onClick={() => set({ blush: !look.blush })}>Rosy cheeks</button>
              </div>
            </Group>
          </>
        )}
        {part === 'clothes' && <ClothesPicker look={look} onChange={onChange} owned={owned} />}
        {foot}
      </div>
    </div>
  );
}

export function Group({ label, children }: { label: string; children: preact.ComponentChildren }) {
  return <div class="col" style={{ gap: '6px' }}><span class="small muted">{label}</span>{children}</div>;
}

/** The live preview above an editor; sticky keeps it in view while you scroll the options. */
export function EditorStage({ look, sticky = false, compact = false }: { look: AvatarLook; sticky?: boolean; compact?: boolean }) {
  return (
    <div class={`editor-stage ${sticky ? 'sticky' : ''}`}>
      <AvatarPreview look={look} scale={sticky || compact ? 3 : 4} />
      {!sticky && !compact && <span class="tiny muted">Tap to turn around</span>}
    </div>
  );
}
