// Dev-only page for looking at the room: /scene.html?room=full&theme=honey&hour=20&act=hug
import { HomeScene } from '../engine/scene';
import { THEMES, type ThemeKey } from '../data/themes';
import { DEFAULT_LOOK } from '../engine/art/avatar';
import type { Placement } from '../core/grid';

const q = new URLSearchParams(location.search);
const theme = (q.get('theme') ?? 'honey') as ThemeKey;
const room = q.get('room') ?? 'full';

let n = 0;
const P = (item: string, x: number, y: number, rot = 0, surface: Placement['surface'] = 'floor', data?: Record<string, unknown>): Placement => ({ id: `p${n++}`, item, surface, x, y, rot, data });

const ROOMS: Record<string, Placement[]> = {
  starter: [P('bed_mat', 0, 0), P('light_bulb', 1, 0)],
  full: [
    P('bed_wood', 0, 0), P('light_desk', 3, 0), P('store_bookshelf', 4, 0), P('plant_monstera', 6, 0, 0, 'floor', { water: 6 }),
    P('rug_round', 2, 3), P('table_games', 3, 3), P('seat_cushion', 3, 4), P('seat_loveseat', 4, 5, 2),
    P('record_player', 6, 3, 3), P('easel', 6, 5, 3), P('plant_fern', 0, 6, 0, 'floor', { water: 6 }), P('light_floor', 0, 4, 1), P('globe', 1, 6),
    P('frame_m', 1, 1, 0, 'back'), P('wall_clock', 5, 1, 0, 'back'), P('wall_cross', 0, 1, 0, 'back'),
    P('wall_corkboard', 0, 1, 0, 'left'), P('wall_scripture', 2, 2, 0, 'left'), P('wall_lights', 0, 2, 0, 'back'),
  ],
};

const canvas = document.getElementById('c') as HTMLCanvasElement;
const noop = () => {};
const T = THEMES[theme];
const scene = new HomeScene(canvas, theme, { wallpaper: q.get('wp') ?? (room === 'starter' ? 'wp_plain' : 'wp_flowers'), wallTint: T.wall.tint, floor: q.get('fl') ?? (room === 'starter' ? 'fl_plywood' : 'fl_pine'), floorTint: null, curtains: room !== 'starter' },
  { me: { ...DEFAULT_LOOK, hair: 'short', hairColor: 1, wear: { top: 'hoodie:0', bottom: 'joggers:0', shoes: 'sneakers:0' } }, partner: { ...DEFAULT_LOOK, hair: 'long', hairColor: 3, skin: 2, wear: { top: 'knit:0', bottom: 'jeans:0', shoes: 'boots:0', hat: 'flower:0' } } },
  { tapFurniture: noop, tapPartner: noop, tapMe: noop, tapEmpty: noop, tapDoor: noop, walked: noop, settled: noop, decorTap: noop, placingChanged: noop });
if (q.has('zoom')) { scene.setZoom(Number(q.get('zoom'))); scene.r.pan.set(Number(q.get('px') ?? 0), Number(q.get('py') ?? 0)); }
if (q.has('hour')) scene.setHour(Number(q.get('hour')));
scene.sync(ROOMS[room] ?? ROOMS.full);
scene.setWallContext({ partnerOffsetMin: -480, myLabel: 'MNL', partnerLabel: 'LDN', daysToVisit: 23, notes: [{ text: 'miss u', kind: 'note' }, { text: 'call 9pm', kind: 'note' }, { text: 'job interview', kind: 'prayer' }], verse: { text: 'Be still, and know that I am God.', ref: 'Psalm 46:10' } });
scene.placeActors({ x: 2, y: 4 }, { x: 4, y: 4 });
scene.setPartnerOnline(q.get('partner') !== 'off');
const fit = () => scene.resize(innerWidth, innerHeight);
addEventListener('resize', fit); fit();
const hud = document.getElementById('hud')!;
let acc = 0;
scene.start((dt) => { acc += dt; if (acc > 0.5) { acc = 0; hud.textContent = `${scene.r.fps.toFixed(0)} fps · ${scene.daylightNow.label}`; } });
const act = q.get('act');
if (act) setTimeout(async () => { const p = await scene.startInteraction(act); if (p) scene.playInteraction(p, true); }, 600);
(window as unknown as { __ready: boolean; scene: HomeScene }).__ready = true;
(window as unknown as { scene: HomeScene }).scene = scene;
