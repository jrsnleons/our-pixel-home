// Dev-only page for looking at the town: /town.html?theme=honey&hour=19&x=6&y=30
import { THEMES, type ThemeKey } from '../data/themes';
import { DEFAULT_LOOK } from '../engine/art/avatar';
import { Renderer } from '../engine/renderer';
import { INTERIORS } from '../data/town';
import { boutiqueEntries, furnitureEntries } from '../ui/shopstock';
import { InteriorScene } from '../engine/interior';
import { TownScene } from '../engine/town';

const q = new URLSearchParams(location.search);
const theme = (q.get('theme') ?? 'honey') as ThemeKey;
const canvas = document.getElementById('c') as HTMLCanvasElement;
const hud = document.getElementById('hud')!;
const r = new Renderer(canvas);
const looks = {
  me: { ...DEFAULT_LOOK, hair: 'short', hairColor: 1, wear: { top: 'hoodie:0', bottom: 'joggers:0', shoes: 'sneakers:0' } },
  partner: { ...DEFAULT_LOOK, body: 'girl' as const, hair: 'long', hairColor: 3, skin: 2, wear: { top: 'knit:0', bottom: 'jeans:0', shoes: 'boots:0' } },
};
const events = {
  hotspot: (h: { label: string }) => { hud.textContent = `arrived at ${h.label}`; },
  tapPartner: () => {}, tapNpc: (id: string) => { hud.textContent = `npc ${id}`; }, walked: () => {}, tapEmpty: () => {},
};
const inside = q.get('inside');
const town = inside ? new InteriorScene(r, theme, INTERIORS[inside], looks, events) as unknown as TownScene : new TownScene(r, theme, looks, events);
void THEMES;
const x = Number(q.get('x') ?? (inside ? 0 : 6)), y = Number(q.get('y') ?? (inside ? 5 : 41));
town.placeMe({ x, y });
if (q.get('partner') !== 'off') town.setPartnerHere(true, { x: x + 1, y });
if (q.has('locked') && !inside) town.setLocked(new Set(['flowers', 'parcel', 'labs']));
if (inside === 'maple') (town as unknown as InteriorScene).setStock(furnitureEntries(new Date(), { unlocks: [], inventory: [], placements: [{ item: 'bed_mat' }] }));
if (inside === 'boutique') (town as unknown as InteriorScene).setStock(boutiqueEntries(new Date(), [], looks));
if (q.has('hour')) town.hourOverride = Number(q.get('hour'));
town.start();
const fit = () => r.resize(innerWidth, innerHeight);
addEventListener('resize', fit); fit();
(window as unknown as { town: TownScene }).town = town;
