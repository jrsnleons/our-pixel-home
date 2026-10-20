// Dev-only page for reviewing pixel art at real scale: open /gallery.html.
import { avatarPreview, FRAME_NAMES, HAIR_STYLES, OUTFIT_KEYS, DEFAULT_LOOK, type AvatarLook } from '../engine/art/avatar';

const out = document.getElementById('out')!;
const params = new URLSearchParams(location.search);
const section = params.get('s') ?? 'avatars';
const scale = Number(params.get('scale') ?? 4);

function row(title: string, items: HTMLCanvasElement[]) {
  const h = document.createElement('h3'); h.textContent = title; out.appendChild(h);
  const r = document.createElement('div'); r.className = 'row'; items.forEach((i) => r.appendChild(i)); out.appendChild(r);
}

if (section === 'avatars') {
  const looks: AvatarLook[] = HAIR_STYLES.map((hair, i) => ({ ...DEFAULT_LOOK, hair, hairColor: i % 8, skin: i % 6, outfit: OUTFIT_KEYS[i % OUTFIT_KEYS.length], accessory: ['acc_none', 'acc_glasses', 'acc_beanie', 'acc_cap', 'acc_flower', 'acc_bow', 'acc_headphones', 'acc_catears'][i % 8] }));
  row('styles front', looks.map((l) => avatarPreview(l, 'idle', 'front', scale)));
  row('styles back', looks.map((l) => avatarPreview(l, 'idle', 'back', scale)));
  row('outfits', OUTFIT_KEYS.map((o) => avatarPreview({ ...DEFAULT_LOOK, outfit: o, hair: 'bob', hairColor: 2 }, 'idle', 'front', scale)));
  const girls = looks.map((l): AvatarLook => ({ ...l, body: 'girl' }));
  row('girl styles front', girls.map((l) => avatarPreview(l, 'idle', 'front', scale)));
  row('girl styles back', girls.map((l) => avatarPreview(l, 'idle', 'back', scale)));
  row('girl outfits', OUTFIT_KEYS.map((o) => avatarPreview({ ...DEFAULT_LOOK, body: 'girl', outfit: o, hair: 'long', hairColor: 2 }, 'idle', 'front', scale)));
  row('faces', [{}, { freckles: true }, { blush: true }, { body: 'girl' as const }, { body: 'girl' as const, freckles: true, blush: true }].map((x) => avatarPreview({ ...DEFAULT_LOOK, hair: 'slick', ...x }, 'idle', 'front', scale)));
}
if (section === 'frames') {
  const look: AvatarLook = { ...DEFAULT_LOOK, body: params.get('body') === 'girl' ? 'girl' : 'guy', hair: params.get('hair') ?? 'long', hairColor: 3, outfit: params.get('outfit') ?? 'fit_sweater' };
  row('frames front', FRAME_NAMES.map((f) => avatarPreview(look, f, 'front', scale)));
  row('frames back', FRAME_NAMES.map((f) => avatarPreview(look, f, 'back', scale)));
}
(window as unknown as { __ready: boolean }).__ready = true;
