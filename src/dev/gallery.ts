// Dev-only page for reviewing pixel art at real scale: open /gallery.html.
import { PIECES, randomWear, worn, type Wear } from '../data/clothes';
import { avatarPreview, FRAME_NAMES, HAIR_STYLES, DEFAULT_LOOK, type AvatarLook } from '../engine/art/avatar';

const out = document.getElementById('out')!;
const params = new URLSearchParams(location.search);
const section = params.get('s') ?? 'avatars';
const scale = Number(params.get('scale') ?? 4);

function row(title: string, items: HTMLCanvasElement[]) {
  const h = document.createElement('h3'); h.textContent = title; out.appendChild(h);
  const r = document.createElement('div'); r.className = 'row'; items.forEach((i) => r.appendChild(i)); out.appendChild(r);
}

if (section === 'avatars') {
  const looks: AvatarLook[] = HAIR_STYLES.map((hair, i) => ({ ...DEFAULT_LOOK, hair, hairColor: i % 8, skin: i % 6, wear: randomWear(i) }));
  row('styles front', looks.map((l) => avatarPreview(l, 'idle', 'front', scale)));
  row('styles back', looks.map((l) => avatarPreview(l, 'idle', 'back', scale)));
  const girls = looks.map((l): AvatarLook => ({ ...l, body: 'girl' }));
  row('girl styles front', girls.map((l) => avatarPreview(l, 'idle', 'front', scale)));
  row('girl styles back', girls.map((l) => avatarPreview(l, 'idle', 'back', scale)));
  row('faces', [{}, { freckles: true }, { blush: true }, { body: 'girl' as const }, { body: 'girl' as const, freckles: true, blush: true }].map((x) => avatarPreview({ ...DEFAULT_LOOK, hair: 'slick', ...x }, 'idle', 'front', scale)));
}
if (section === 'frames') {
  const look: AvatarLook = { ...DEFAULT_LOOK, body: params.get('body') === 'girl' ? 'girl' : 'guy', hair: params.get('hair') ?? 'long', hairColor: 3, wear: randomWear(Number(params.get('n') ?? 4)) };
  row('frames front', FRAME_NAMES.map((f) => avatarPreview(look, f, 'front', scale)));
  row('frames back', FRAME_NAMES.map((f) => avatarPreview(look, f, 'back', scale)));
}
if (section === 'clothes') {
  // Every piece in every colorway, on both bodies, plus the back of the first colorway.
  const only = params.get('slot');
  for (const p of PIECES.filter((q) => !only || q.slot === only)) {
    const on = (c: number): Wear => ({ ...DEFAULT_LOOK.wear, ...(p.full ? { bottom: undefined } : {}), [p.slot]: worn(p.key, c) });
    const look = (body: 'guy' | 'girl', c: number): AvatarLook => ({ ...DEFAULT_LOOK, body, hair: body === 'girl' ? 'long' : 'short', hairColor: 2, wear: on(c) });
    row(p.key, [
      ...p.colors.map((_, c) => avatarPreview(look('guy', c), 'idle', 'front', scale)),
      ...p.colors.map((_, c) => avatarPreview(look('girl', c), 'idle', 'front', scale)),
      avatarPreview(look('guy', 0), 'idle', 'back', scale), avatarPreview(look('girl', 0), 'walk1', 'front', scale), avatarPreview(look('girl', 0), 'sit', 'front', scale),
    ]);
  }
}
if (section === 'pick') {
  // A few pieces up close: ?s=pick&keys=hoodie,jeans&scale=6
  const keys = (params.get('keys') ?? '').split(',');
  for (const p of PIECES.filter((q) => keys.includes(q.key))) {
    const on = (c: number): Wear => ({ ...DEFAULT_LOOK.wear, ...(p.full ? { bottom: undefined } : {}), [p.slot]: worn(p.key, c) });
    const look = (body: 'guy' | 'girl', c: number): AvatarLook => ({ ...DEFAULT_LOOK, body, hair: body === 'girl' ? 'long' : 'short', hairColor: 2, wear: on(c) });
    row(p.key, [avatarPreview(look('guy', 0), 'idle', 'front', scale), avatarPreview(look('girl', 1), 'idle', 'front', scale), avatarPreview(look('guy', 0), 'idle', 'back', scale), avatarPreview(look('girl', 0), 'sit', 'front', scale)]);
  }
}
if (section === 'faces') {
  const looks: AvatarLook[] = HAIR_STYLES.map((hair, i) => ({ ...DEFAULT_LOOK, body: i % 2 ? 'girl' : 'guy', hair, hairColor: i % 8, skin: i % 6, eyes: i % 4, wear: randomWear(i) }));
  row('faces', looks.slice(0, 6).map((l) => avatarPreview(l, 'idle', 'front', 4)));
  row('expr', ['idle', 'blink', 'wave1', 'surprised', 'kiss', 'laugh1'].map((f) => avatarPreview(looks[1], f, 'front', 4)));
}
(window as unknown as { __ready: boolean }).__ready = true;
