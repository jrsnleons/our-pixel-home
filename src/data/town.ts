// Maple Town: every destination, district, street and decoration, and where it stands. Shared by
// the town scene, the interiors and the UI. Tile coordinates: x runs left to right, y runs from
// the far edge of the map (the river and Chapel Hill) toward the camera (your building at the
// bottom). Every door faces the camera, Octopath style.

import type { Tile } from '../core/grid';
import type { JobKey } from './jobs';

export type PlaceKind = 'job' | 'shop' | 'realty' | 'public' | 'soon' | 'home' | 'residence';

/** What a building looks like. */
export type Style = 'cafe' | 'flowers' | 'parcel' | 'labs' | 'furniture' | 'boutique' | 'realty' | 'chapel' | 'cart' | 'park' | 'boarded' | 'home' | 'house';

export interface Place {
  id: string;
  /** Full name, as on the board and in speech bubbles. */
  name: string;
  /** Short, uppercase text for the sign on the facade (3x5 pixel font: letters, digits, & - . ! only). */
  sign: string;
  note: string;
  kind: PlaceKind;
  style: Style;
  /** Jobs done here (the office has two desks). */
  jobs?: JobKey[];
  /** Footprint of the building body, in tiles. */
  x: number;
  y: number;
  w: number;
  d: number;
  /** Body height in tiles (world units). */
  h: number;
  /** The walkable tile in front of the door, where you stand to go in. */
  door: Tile;
  palette: { wall: string; trim: string; roof: string; accent: string; awning?: [string, string] };
}

export const TOWN = { w: 48, d: 72 } as const;

// ---------- The ground ----------

/** What a tile of ground is. Grass, paving and the bridge are walkable; water, beds and hedges are not. */
export enum G { Grass, Road, Walk, Plaza, Water, Bridge, Path, Deck, Bed, Hedge, Yard }

const SOLID_GROUND = new Set<G>([G.Water, G.Bed, G.Hedge]);

export interface Rect { x: number; y: number; w: number; d: number }
const R = (x: number, y: number, w: number, d: number): Rect => ({ x, y, w, d });

/** The avenue runs north to south through the middle of town, x 22..25. */
export const AVENUE = R(22, 20, 4, 41);
export const RIVER = R(0, 14, 48, 4);
export const BRIDGE = R(22, 14, 4, 4);
export const PIER = R(38, 15, 2, 3);
export const MARKET_ST = R(0, 27, 48, 3);
export const ELM_ST = R(0, 47, 48, 3);
export const SQUARE = R(12, 31, 24, 15);
export const PARK = R(28, 51, 19, 12);
export const POND = R(35, 55, 7, 4);

function paint(): Uint8Array {
  const g = new Uint8Array(TOWN.w * TOWN.d).fill(G.Grass);
  const fill = (r: Rect, k: G) => {
    for (let y = r.y; y < r.y + r.d; y++) for (let x = r.x; x < r.x + r.w; x++) if (x >= 0 && y >= 0 && x < TOWN.w && y < TOWN.d) g[y * TOWN.w + x] = k;
  };
  // Chapel Hill: a stone forecourt, a path down to the bridge, flower beds either side.
  fill(R(18, 10, 12, 3), G.Plaza);
  fill(R(23, 13, 2, 1), G.Path);
  fill(R(14, 7, 4, 3), G.Bed);
  fill(R(30, 7, 4, 3), G.Bed);
  // The river, its bridge and a little fishing pier; the promenade along the south bank.
  fill(RIVER, G.Water);
  fill(BRIDGE, G.Bridge);
  fill(PIER, G.Deck);
  fill(R(1, 18, 46, 2), G.Plaza);
  // The avenue and its sidewalks, from the promenade to Maple Court.
  fill(R(20, 20, 8, 7), G.Walk);
  fill(R(22, 20, 4, 7), G.Road);
  fill(R(20, 50, 8, 11), G.Walk);
  fill(R(22, 50, 4, 11), G.Road);
  // Market Street and Elm Street with sidewalks both sides.
  fill(R(1, 26, 46, 1), G.Walk); fill(MARKET_ST, G.Road); fill(R(1, 30, 46, 1), G.Walk);
  fill(R(1, 46, 46, 1), G.Walk); fill(ELM_ST, G.Road); fill(R(1, 50, 46, 1), G.Walk);
  // Town Square, the café terrace and the walks in front of the side buildings.
  fill(SQUARE, G.Plaza);
  fill(R(1, 36, 11, 4), G.Plaza);
  fill(R(1, 45, 11, 1), G.Walk);
  fill(R(36, 36, 11, 3), G.Walk);
  fill(R(36, 45, 11, 1), G.Walk);
  // The park: hedge border, winding paths, a pond.
  fill(R(30, 51, 17, 1), G.Hedge);
  fill(R(36, 51, 2, 1), G.Path);
  fill(R(46, 51, 1, 12), G.Hedge);
  fill(R(28, 53, 17, 1), G.Path);
  fill(R(28, 61, 17, 1), G.Path);
  fill(R(44, 53, 1, 9), G.Path);
  fill(R(30, 53, 1, 9), G.Path);
  fill(R(36, 51, 1, 3), G.Path);
  fill(POND, G.Water);
  for (const [x, y] of [[35, 55], [41, 55], [35, 58], [41, 58]]) g[y * TOWN.w + x] = G.Grass; // rounded corners
  fill(R(38, 52, 4, 1), G.Bed);
  // A community vegetable patch and a dirt path through the west garden.
  fill(R(3, 59, 6, 2), G.Bed);
  fill(R(1, 57, 19, 1), G.Path);
  fill(R(10, 58, 1, 4), G.Path);
  // The turnaround at the end of the avenue and the side paths down to Maple Court.
  fill(R(17, 61, 14, 2), G.Plaza);
  fill(R(17, 63, 2, 5), G.Walk);
  fill(R(29, 63, 2, 5), G.Walk);
  fill(R(1, 68, 46, 1), G.Walk);
  fill(R(1, 69, 46, 2), G.Plaza);
  return g;
}

export const GROUND = paint();
export const groundAt = (x: number, y: number): G => (x < 0 || y < 0 || x >= TOWN.w || y >= TOWN.d ? G.Hedge : (GROUND[y * TOWN.w + x] as G));

// ---------- Districts ----------

export interface District { id: string; name: string; area: Rect; blurb: string }

/** Named areas, listed top to bottom. A banner shows the name as you walk in. */
export const DISTRICTS: District[] = [
  { id: 'hill', name: 'Chapel Hill', area: R(0, 0, 48, 14), blurb: 'The chapel, flower beds and a view of the river' },
  { id: 'river', name: 'Riverside', area: R(0, 14, 48, 6), blurb: 'The bridge, the pier and the promenade' },
  { id: 'market', name: 'Market Street', area: R(0, 20, 48, 11), blurb: 'Furniture, clothes, homes and flowers' },
  { id: 'square', name: 'Town Square', area: R(12, 31, 24, 15), blurb: 'The clock tower, the fountain and the market' },
  { id: 'west', name: 'Café Corner', area: R(0, 31, 12, 15), blurb: 'Pixel Café and Pixel Labs' },
  { id: 'east', name: 'Post Office Row', area: R(36, 31, 12, 15), blurb: 'Parcel Post and the pet shop' },
  { id: 'elm', name: 'Elm Street', area: R(0, 46, 48, 5), blurb: 'The bus stop and the way to the park' },
  { id: 'park', name: 'Willow Park', area: R(28, 51, 20, 12), blurb: 'The pond, the gazebo and the ducks' },
  { id: 'gardens', name: 'Garden Lane', area: R(0, 51, 22, 12), blurb: 'The garden center and the vegetable patch' },
  { id: 'court', name: 'Maple Court', area: R(0, 61, 48, 11), blurb: 'Home, and the neighbours' },
];

export function districtAt(t: Tile): District | null {
  // Smaller districts first, so the square wins over the street rows around it.
  let best: District | null = null;
  for (const d of DISTRICTS) {
    const a = d.area;
    if (t.x >= a.x && t.y >= a.y && t.x < a.x + a.w && t.y < a.y + a.d && (!best || a.w * a.d < best.area.w * best.area.d)) best = d;
  }
  return best;
}

// ---------- Places ----------

const at = (x: number, y: number, w: number, d: number, door: number) => ({ x, y, w, d, door: { x: door, y: y + d } });

export const PLACES: Place[] = [
  { id: 'chapel', name: 'Chapel', sign: 'CHAPEL', note: 'Quiet time and prayer', kind: 'public', style: 'chapel', h: 3.4, ...at(20, 5, 8, 5, 23), palette: { wall: '#EFE7D8', trim: '#B5A58A', roof: '#7A5A52', accent: '#E8C060' } },
  { id: 'maple', name: 'Maple Furnishings', sign: 'MAPLE FURNISHINGS', note: 'Furniture, walls and floors', kind: 'shop', style: 'furniture', h: 3.6, ...at(2, 21, 9, 5, 6), palette: { wall: '#C8A878', trim: '#7A5A3A', roof: '#5E4630', accent: '#E8D4A8' } },
  { id: 'boutique', name: 'The Boutique', sign: 'THE BOUTIQUE', note: 'This week’s clothes', kind: 'shop', style: 'boutique', h: 3.2, ...at(12, 21, 8, 5, 15), palette: { wall: '#D4C4EC', trim: '#8A6AB8', roof: '#5E4A88', accent: '#FFE08A' } },
  { id: 'realty', name: 'Hearth & Home Realty', sign: 'HEARTH AND HOME', note: 'Bigger homes', kind: 'realty', style: 'realty', h: 3.4, ...at(28, 21, 7, 5, 31), palette: { wall: '#D6A08A', trim: '#8A4E3A', roof: '#6A3A30', accent: '#F2E0C0' } },
  { id: 'flowers', name: 'Petal & Stem', sign: 'PETAL AND STEM', note: 'Flower shop shifts', kind: 'job', style: 'flowers', jobs: ['flowers'], h: 2.8, ...at(36, 21, 8, 5, 39), palette: { wall: '#F2C6D0', trim: '#B8607A', roof: '#8A4A5E', accent: '#7FB070', awning: ['#7FB070', '#FFF2D0'] } },
  { id: 'cafe', name: 'Pixel Café', sign: 'PIXEL CAFE', note: 'Café shifts', kind: 'job', style: 'cafe', jobs: ['cafe'], h: 3.0, ...at(2, 31, 8, 5, 5), palette: { wall: '#C88A5E', trim: '#6E4A32', roof: '#7A3E32', accent: '#FFF2D0', awning: ['#C8553D', '#FFF2D0'] } },
  { id: 'labs', name: 'Pixel Labs', sign: 'PIXEL LABS', note: 'Two desks: Bug Squad and Inbox Zero', kind: 'job', style: 'labs', jobs: ['bugs', 'inbox'], h: 3.8, ...at(2, 40, 9, 5, 6), palette: { wall: '#C4D4DC', trim: '#5E7A8C', roof: '#4A5E6E', accent: '#5BC8D8' } },
  { id: 'parcel', name: 'Parcel Post', sign: 'PARCEL POST', note: 'Bike delivery shifts', kind: 'job', style: 'parcel', jobs: ['delivery'], h: 3.0, ...at(37, 31, 8, 5, 40), palette: { wall: '#9DB4D8', trim: '#4A5E8C', roof: '#3E4E78', accent: '#F2C14E' } },
  { id: 'pet', name: 'Pet shop', sign: 'COMING SOON', note: 'Coming soon', kind: 'soon', style: 'boarded', h: 2.7, ...at(37, 40, 8, 5, 40), palette: { wall: '#9A8F86', trim: '#6E655E', roof: '#5E5650', accent: '#C8B89A' } },
  { id: 'bakery', name: 'Bakery cart', sign: 'BAKERY', note: 'Snacks to share', kind: 'public', style: 'cart', h: 1.9, ...at(31, 37, 3, 2, 32), palette: { wall: '#E8B878', trim: '#9A6A3A', roof: '#C8553D', accent: '#FFF2D0', awning: ['#E8506A', '#FFF2D0'] } },
  { id: 'garden', name: 'Garden center', sign: 'COMING SOON', note: 'Coming soon', kind: 'soon', style: 'boarded', h: 2.6, ...at(2, 52, 8, 5, 5), palette: { wall: '#8FA088', trim: '#62705C', roof: '#566350', accent: '#C8D8B0' } },
  { id: 'alvarez', name: 'The Alvarez house', sign: '', note: 'Mrs. Alvarez lives here', kind: 'residence', style: 'house', h: 2.8, ...at(12, 52, 7, 4, 15), palette: { wall: '#F2E2C4', trim: '#A8785A', roof: '#B0503E', accent: '#7FB070' } },
  // The park's gazebo is the place you walk to; the lawn around it is open ground.
  { id: 'park', name: 'Willow Park', sign: 'PARK', note: 'A gazebo by the pond', kind: 'public', style: 'park', h: 2.6, ...at(31, 55, 3, 3, 32), palette: { wall: '#F2EAD8', trim: '#8A6A4A', roof: '#5E8A52', accent: '#9ED0F0' } },
  { id: 'home', name: 'Your building', sign: 'HOME', note: 'Back to your place', kind: 'home', style: 'home', h: 4.4, ...at(19, 63, 10, 5, 23), palette: { wall: '#EAD8B8', trim: '#9A7A5A', roof: '#6E4A3A', accent: '#E8506A' } },
  { id: 'joon', name: 'Grandpa Joon’s house', sign: '', note: 'Grandpa Joon lives here', kind: 'residence', style: 'house', h: 2.8, ...at(2, 63, 7, 5, 5), palette: { wall: '#DCE6EE', trim: '#5E7A8C', roof: '#3E5E7A', accent: '#F2C14E' } },
  { id: 'lena', name: 'Lena’s house', sign: '', note: 'Lena lives here', kind: 'residence', style: 'house', h: 2.8, ...at(10, 63, 7, 5, 13), palette: { wall: '#F4D8DC', trim: '#B8607A', roof: '#8A4A5E', accent: '#FFFFFF' } },
  { id: 'okafor', name: 'The Okafors’ house', sign: '', note: 'The Okafors live here', kind: 'residence', style: 'house', h: 2.8, ...at(31, 63, 7, 5, 34), palette: { wall: '#E8E0C8', trim: '#6E8A5A', roof: '#4E6E44', accent: '#E8506A' } },
  { id: 'bea', name: 'Bea’s house', sign: '', note: 'Bea lives here', kind: 'residence', style: 'house', h: 2.8, ...at(39, 63, 7, 5, 42), palette: { wall: '#F2E4B0', trim: '#9A7A3A', roof: '#7A5A30', accent: '#9ED0F0' } },
];

export const PLACE_BY_ID: Record<string, Place> = Object.fromEntries(PLACES.map((p) => [p.id, p]));

/** Where you appear when you step out of your front door. */
export const TOWN_SPAWN: Tile = { ...PLACE_BY_ID.home.door };

/** Which place offers a job. */
export function placeOfJob(job: JobKey): Place {
  return PLACES.find((p) => p.jobs?.includes(job))!;
}

// ---------- Decorations ----------

export type PropKind =
  | 'tree' | 'pine' | 'willow' | 'bush' | 'lamp' | 'bench' | 'planter' | 'stall' | 'fountain' | 'clock'
  | 'board' | 'hydrant' | 'mailbox' | 'busstop' | 'signpost' | 'cafetable' | 'bikerack' | 'greenhouse'
  | 'fence' | 'bunting' | 'boat' | 'lilypad' | 'picnic' | 'crates' | 'well' | 'flowers';

export interface TownProp {
  kind: PropKind;
  x: number;
  y: number;
  /** Footprint in tiles (default 1x1). */
  w?: number;
  d?: number;
  /** Which way a bench or sign faces. */
  facing?: '+z' | '-z' | '+x' | '-x';
  /** Walk through it (overhead bunting, decals). */
  open?: boolean;
  /** Free text: a stall's goods, a sign's words, a flower color. */
  label?: string;
  seed?: number;
}

const P = (kind: PropKind, x: number, y: number, more: Partial<TownProp> = {}): TownProp => ({ kind, x, y, ...more });

function props(): TownProp[] {
  const out: TownProp[] = [];
  const free = (x: number, y: number) => {
    const k = groundAt(x, y);
    if (k !== G.Grass && k !== G.Yard) return false;
    if (PLACES.some((p) => x >= p.x - 1 && x <= p.x + p.w && y >= p.y - 1 && y <= p.y + p.d)) return false;
    return !out.some((q) => x >= q.x && y >= q.y && x < q.x + (q.w ?? 1) && y < q.y + (q.d ?? 1));
  };
  const tree = (x: number, y: number, kind: PropKind = 'tree', seed = x * 7 + y * 13) => { if (free(x, y)) out.push(P(kind, x, y, { seed })); };

  // The forest along the far edge and the tree lines down both sides.
  for (let y = 0; y < 3; y++) for (let x = (y % 2); x < TOWN.w; x += 2) tree(x, y, (x + y) % 3 ? 'pine' : 'tree');
  for (let y = 3; y < TOWN.d - 1; y += 2) { tree(0, y, 'pine'); tree(TOWN.w - 1, y + 1, 'pine'); }
  for (let x = 1; x < TOWN.w - 1; x += 2) tree(x, TOWN.d - 1, 'tree');

  // Chapel Hill: trees and benches with a view over the river.
  for (const [x, y] of [[4, 5], [8, 4], [12, 6], [6, 9], [10, 11], [35, 4], [39, 6], [43, 4], [37, 10], [42, 9], [16, 4], [31, 4], [3, 12], [45, 12]]) tree(x, y, (x + y) % 2 ? 'tree' : 'pine');
  out.push(P('bench', 13, 13, { facing: '+z' }), P('bench', 34, 13, { facing: '+z' }), P('bench', 19, 11, { facing: '+z' }), P('bench', 28, 11, { facing: '+z' }));
  out.push(P('lamp', 18, 12), P('lamp', 29, 12), P('well', 9, 7));
  out.push(P('flowers', 21, 12, { label: '#E8506A' }), P('flowers', 26, 12, { label: '#F2C14E' }));

  // Riverside: lamps and benches facing the water, a boat and willows.
  for (const x of [4, 10, 16, 20, 27, 31, 36, 42]) out.push(P('lamp', x, 18));
  for (const x of [7, 13, 33, 44]) out.push(P('bench', x, 18, { facing: '-z' }));
  out.push(P('boat', 29, 16, { open: true }), P('boat', 8, 15, { open: true, seed: 2 }));

  // Market Street: lamps on the curbs, planters in the alleys, crosswalk signs.
  for (const x of [3, 9, 13, 19, 29, 34, 37, 44]) out.push(P('lamp', x, 30));
  out.push(P('planter', 11, 24), P('planter', 35, 24));
  out.push(P('greenhouse', 44, 21, { w: 2, d: 4 }));
  out.push(P('signpost', 21, 26, { label: 'MARKET ST' }), P('signpost', 26, 30, { label: 'TOWN SQUARE' }));
  tree(20, 21, 'tree'); tree(27, 21, 'tree'); tree(1, 21, 'pine'); tree(46, 22, 'pine');

  // Town Square: the clock tower and fountain on the avenue's line, market stalls, the notice
  // board, benches around the fountain and bunting overhead.
  out.push(P('clock', 23, 32, { w: 2, d: 2 }));
  out.push(P('fountain', 22, 37, { w: 4, d: 3 }));
  out.push(P('stall', 13, 33, { w: 3, d: 2, label: 'fruit', seed: 0 }), P('stall', 13, 41, { w: 3, d: 2, label: 'bread', seed: 1 }));
  out.push(P('stall', 32, 33, { w: 3, d: 2, label: 'flowers', seed: 2 }), P('stall', 32, 41, { w: 3, d: 2, label: 'crafts', seed: 3 }));
  out.push(P('board', 17, 36, { w: 2, d: 1 }));
  out.push(P('bench', 20, 38, { facing: '+x' }), P('bench', 27, 38, { facing: '-x' }), P('bench', 23, 41, { facing: '-z' }), P('bench', 24, 41, { facing: '-z' }));
  for (const [x, y] of [[12, 31], [35, 31], [12, 45], [35, 45]]) out.push(P('planter', x, y, { label: 'tree' }));
  out.push(P('bunting', 12, 35, { w: 24, d: 1, open: true }), P('bunting', 12, 43, { w: 24, d: 1, open: true, seed: 1 }));
  out.push(P('lamp', 19, 32), P('lamp', 28, 32), P('lamp', 19, 44), P('lamp', 28, 44));
  out.push(P('crates', 16, 34), P('crates', 31, 42));

  // Café Corner and Post Office Row.
  for (const x of [2, 5, 8]) out.push(P('cafetable', x, 38));
  out.push(P('bikerack', 37, 37, { w: 2, d: 1 }), P('mailbox', 44, 36), P('lamp', 10, 37), P('lamp', 36, 37));
  out.push(P('planter', 11, 40), P('planter', 36, 40));

  // Elm Street: the bus stop, hydrants, signposts and curb lamps.
  out.push(P('busstop', 8, 50, { w: 2, d: 1 }), P('hydrant', 15, 46), P('hydrant', 33, 50));
  out.push(P('signpost', 21, 46, { label: 'ELM ST' }), P('signpost', 26, 50, { label: 'WILLOW PARK' }));
  for (const x of [3, 12, 18, 29, 34, 43]) out.push(P('lamp', x, 46));

  // Willow Park: willows by the pond, trees, benches on the paths, a picnic and lily pads.
  for (const [x, y] of [[34, 54], [42, 54], [34, 59], [42, 59]]) tree(x, y, 'willow');
  for (const [x, y] of [[29, 52], [32, 52], [43, 52], [45, 55], [45, 58], [29, 57], [29, 60], [33, 60], [38, 60], [45, 61]]) tree(x, y, 'tree');
  for (const [x, y] of [[31, 54], [33, 54], [35, 60], [40, 60]]) out.push(P('bush', x, y));
  out.push(P('bench', 37, 54, { facing: '+z' }), P('bench', 39, 54, { facing: '+z' }), P('bench', 43, 57, { facing: '-x' }), P('bench', 37, 60, { facing: '-z' }));
  out.push(P('picnic', 40, 59, { w: 2, d: 1, open: true }), P('lilypad', 37, 56, { open: true }), P('lilypad', 39, 57, { open: true, seed: 1 }));
  out.push(P('lamp', 31, 52), P('lamp', 43, 60));

  // Garden Lane: trees, a fence round the vegetable patch, a lamp.
  for (const [x, y] of [[12, 59], [16, 60], [18, 58], [1, 52], [11, 51], [19, 52]]) tree(x, y, 'tree');
  out.push(P('fence', 2, 58, { w: 8, d: 1 }), P('lamp', 11, 56));

  // Maple Court: lamps along the lane, mailboxes by each door, bushes in the yards, trees.
  for (const x of [1, 9, 17, 30, 38, 46]) out.push(P('lamp', x, 69));
  for (const p of PLACES.filter((q) => q.kind === 'residence' && q.y > 60)) out.push(P('mailbox', p.door.x + 2, p.door.y));
  for (const [x, y] of [[19, 62], [28, 62], [1, 64], [9, 64], [17, 62], [30, 62], [38, 64], [46, 64]]) tree(x, y, 'bush');
  tree(14, 60, 'tree'); tree(33, 62, 'tree');

  // Every bench seats two: stretch it over the tile beside it (benches that touch become one).
  const along = (b: TownProp) => (b.facing === '+x' || b.facing === '-x' ? { dx: 0, dy: 1 } : { dx: 1, dy: 0 });
  const roomFor = (x: number, y: number) => !SOLID_GROUND.has(groundAt(x, y))
    && !PLACES.some((p) => x >= p.x - 1 && x <= p.x + p.w && y >= p.y - 1 && y <= p.y + p.d)
    && !out.some((q) => x >= q.x && y >= q.y && x < q.x + (q.w ?? 1) && y < q.y + (q.d ?? 1));
  for (const b of out.filter((q) => q.kind === 'bench')) {
    if (!out.includes(b)) continue;
    const { dx, dy } = along(b);
    const mate = out.find((q) => q !== b && q.kind === 'bench' && q.facing === b.facing && q.x === b.x + dx && q.y === b.y + dy);
    if (mate) out.splice(out.indexOf(mate), 1);
    else if (roomFor(b.x + dx, b.y + dy)) { /* grows forward */ }
    else if (roomFor(b.x - dx, b.y - dy)) { b.x -= dx; b.y -= dy; }
    else continue;
    b.w = dx ? 2 : 1; b.d = dy ? 2 : 1;
  }
  return out;
}

export const TOWN_PROPS = props();

/** Static obstacles: building bodies, water, beds and hedges, and every solid decoration. */
export function townBlocked(): Set<string> {
  const s = new Set<string>();
  for (let y = 0; y < TOWN.d; y++) for (let x = 0; x < TOWN.w; x++) if (SOLID_GROUND.has(groundAt(x, y))) s.add(key(x, y));
  for (const p of PLACES) {
    if (p.style === 'park') { for (let y = p.y; y < p.y + p.d; y++) for (let x = p.x; x < p.x + p.w; x++) s.add(key(x, y)); continue; }
    for (let y = p.y; y < p.y + p.d; y++) for (let x = p.x; x < p.x + p.w; x++) s.add(key(x, y));
  }
  for (let y = 0; y < TOWN.d; y++) { s.add(key(0, y)); s.add(key(TOWN.w - 1, y)); }
  for (let x = 0; x < TOWN.w; x++) { s.add(key(x, 0)); s.add(key(x, 1)); s.add(key(x, 2)); s.add(key(x, TOWN.d - 1)); }
  for (const q of TOWN_PROPS) {
    if (q.open) continue;
    for (let y = q.y; y < q.y + (q.d ?? 1); y++) for (let x = q.x; x < q.x + (q.w ?? 1); x++) s.add(key(x, y));
  }
  return s;
}

const key = (x: number, y: number) => `${x},${y}`;

// ---------- Townsfolk ----------

export interface Townsperson {
  name: string;
  line: string;
  /** The district they wander, or a fixed tile they keep to (a vendor behind a stall). */
  home: string | Tile;
  facing?: '+z' | '-z' | '+x' | '-x';
  /** Only out during the day (most people) or only at night (the busker). */
  hours?: 'day' | 'night';
}

export const TOWNSFOLK: Townsperson[] = [
  { name: 'Mrs. Alvarez', line: 'The café makes the best cinnamon rolls in Maple Town.', home: 'square' },
  { name: 'Theo', line: 'I deliver the post by bike. Come work with me!', home: 'east' },
  { name: 'Grandpa Joon', line: 'Be kind to each other. That is the whole secret.', home: 'court' },
  { name: 'Priya', line: 'I check the Boutique every Monday for the new rack.', home: 'market' },
  { name: 'Mr. Okafor', line: 'Realty is on Market Street. Homes grow with the people in them.', home: 'market' },
  { name: 'Bea', line: 'The ducks in Willow Park know me by name. Probably.', home: 'park' },
  { name: 'Sam the baker', line: 'Come by the cart later for something sweet to share.', home: 'square' },
  { name: 'Lena', line: 'I heard the pet shop is opening soon. I can’t wait.', home: 'elm' },
  { name: 'Marco', line: 'Best spot in town? The pier at sunset.', home: 'river' },
  { name: 'Ada', line: 'I walk up Chapel Hill every morning. Good for the legs and the heart.', home: 'hill' },
  { name: 'Kai', line: 'Race you to the fountain!', home: 'square' },
  { name: 'Nina', line: 'Pixel Labs is hiring. They have the comfiest chairs.', home: 'west' },
  { name: 'Mr. Webb', line: 'I planted the tomatoes on Garden Lane. Help yourself when they’re red.', home: 'gardens' },
  { name: 'Rosa', line: 'The bus never comes, but it’s a nice place to sit.', home: 'elm' },
  { name: 'Hana', line: 'Have you two been to the gazebo? It’s lovely at night.', home: 'park' },
  { name: 'Felix', line: 'Every lamp on the promenade, I light them myself.', home: 'river' },
  { name: 'Iris', line: 'Fresh fruit! Picked this morning.', home: { x: 14, y: 32 }, facing: '+z' },
  { name: 'Omar', line: 'Bread, still warm from the oven.', home: { x: 14, y: 40 }, facing: '+z' },
  { name: 'June', line: 'Flowers for someone special?', home: { x: 33, y: 32 }, facing: '+z' },
  { name: 'Pip', line: 'Handmade, every one of them.', home: { x: 33, y: 40 }, facing: '+z' },
  { name: 'Ray', line: '♪ This one’s for the two of you. ♪', home: { x: 18, y: 42 }, facing: '+z', hours: 'night' },
  { name: 'Old Tom', line: 'Shh. They’re biting today.', home: { x: 39, y: 15 }, facing: '-z' },
];

/** Tiles a person from a district wanders between: every walkable tile there, thinned out. */
export function districtWaypoints(id: string, blocked: Set<string>): Tile[] {
  const d = DISTRICTS.find((q) => q.id === id);
  if (!d) return [];
  const out: Tile[] = [];
  for (let y = d.area.y; y < d.area.y + d.area.d; y++) for (let x = d.area.x; x < d.area.x + d.area.w; x++) {
    if ((x * 3 + y * 5) % 7 !== 0 || blocked.has(key(x, y))) continue;
    out.push({ x, y });
  }
  return out;
}

// ---------- Inside the buildings ----------
// A shop or workplace is a room on the same tile grid as your home: the door is on the left wall
// (tap it or the mat to step back out) and the window is on the back wall, so every interior has
// the same bones and only the furniture changes.

export interface Prop {
  /** Catalog item that draws it. */
  item: string;
  x: number;
  y: number;
  rot?: number;
  surface?: 'floor' | 'back' | 'left';
  /** Referenced by a spot, so tapping the prop uses the spot. */
  id?: string;
}

export interface Spot {
  id: string;
  kind: 'work' | 'shop' | 'realty' | 'quiet' | 'snack';
  label: string;
  /** The tile you stand on to use it. */
  approach: Tile;
  /** The prop you tap (its id), if tapping it should do the same thing. */
  prop?: string;
  job?: JobKey;
}

export interface Keeper {
  name: string;
  line: string;
  tile: Tile;
  /** Which of the generated townsfolk looks to use. */
  look: number;
  facing: '+z' | '-z' | '+x' | '-x';
}

/** Which display a shop puts a piece of stock on. */
export type DisplayGroup = 'week' | 'step' | 'basic';

/** A sign in a shop: on the back wall (no y) or standing on the floor. */
export interface ShopSign { text: string; x: number; y?: number }

export interface InteriorSpec {
  id: string;
  w: number;
  d: number;
  floor: string;
  floorTint?: string | null;
  wallpaper: string;
  wallTint: string;
  props: Prop[];
  spots: Spot[];
  keeper?: Keeper;
  /** Shops: the stands (or mannequin plinths) for each kind of stock, in order. */
  displays?: Partial<Record<DisplayGroup, Tile[]>>;
  signs?: ShopSign[];
  /** Other people about: customers, coworkers, someone praying. */
  folk?: Keeper[];
}

/** Where you stand when you walk in (just inside the door). */
export const INTERIOR_DOOR: Tile = { x: 0, y: 5 };

const row = (y: number, xs: number[]): Tile[] => xs.map((x) => ({ x, y }));
const span = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

// Every room has the door on the left wall at y 4..5 and the window on the back wall at x 3..4;
// rooms are bigger than a studio, so the camera follows you around them.
export const INTERIORS: Record<string, InteriorSpec> = {
  cafe: {
    id: 'cafe', w: 11, d: 9, floor: 'fl_checker', wallpaper: 'wp_stripes', wallTint: '#E8C9A0',
    props: [
      { id: 'counterA', item: 'store_cabinet', x: 2, y: 2 },
      { id: 'counterB', item: 'store_cabinet', x: 4, y: 2 },
      { item: 'store_bookshelf', x: 1, y: 0 },
      { item: 'record_player', x: 6, y: 1 },
      { item: 'table_cafe', x: 7, y: 2 },
      { item: 'seat_stool', x: 9, y: 2 },
      { item: 'seat_stool', x: 6, y: 3 },
      { item: 'table_cafe', x: 7, y: 6 },
      { item: 'seat_stool', x: 6, y: 7 },
      { item: 'seat_stool', x: 9, y: 6 },
      { item: 'table_cafe', x: 3, y: 6 },
      { item: 'seat_stool', x: 5, y: 6 },
      { item: 'seat_stool', x: 2, y: 7 },
      { item: 'rug_round', x: 7, y: 4 },
      { item: 'plant_monstera', x: 10, y: 0 },
      { item: 'plant_fern', x: 0, y: 8 },
      { item: 'light_floor', x: 10, y: 8 },
      { item: 'light_lanterns', x: 10, y: 4 },
      { item: 'candles', x: 5, y: 8 },
      { item: 'wall_lights', x: 6, y: 2, surface: 'back' },
      { item: 'wall_corkboard', x: 9, y: 0, surface: 'back' },
      { item: 'wall_shelf', x: 1, y: 2, surface: 'back' },
      { item: 'frame_m', x: 1, y: 0, surface: 'left' },
    ],
    spots: [
      { id: 'cafe-counter', kind: 'work', label: 'Start a shift', approach: { x: 3, y: 3 }, prop: 'counterA', job: 'cafe' },
      { id: 'cafe-counter2', kind: 'work', label: 'Start a shift', approach: { x: 4, y: 3 }, prop: 'counterB', job: 'cafe' },
    ],
    keeper: { name: 'Rosa', line: 'Cinnamon rolls are fresh. Want to work a shift?', tile: { x: 3, y: 1 }, look: 2, facing: '+z' },
    folk: [
      { name: 'Jun', line: 'Second latte today. Don’t tell anyone.', tile: { x: 9, y: 7 }, look: 12, facing: '-x' },
      { name: 'Ellie', line: 'This is our spot. We come every Friday.', tile: { x: 5, y: 7 }, look: 13, facing: '-x' },
      { name: 'Dev', line: 'Best wifi in Maple Town.', tile: { x: 9, y: 3 }, look: 14, facing: '-x' },
    ],
  },
  flowers: {
    id: 'flowers', w: 11, d: 9, floor: 'fl_pine', wallpaper: 'wp_flowers', wallTint: '#F2D4DC',
    props: [
      { id: 'counterA', item: 'store_cabinet', x: 2, y: 2 },
      { id: 'counterB', item: 'store_cabinet', x: 4, y: 2 },
      { item: 'plant_monstera', x: 7, y: 1 },
      { item: 'plant_monstera', x: 9, y: 1 },
      { item: 'plant_fern', x: 8, y: 1 },
      { item: 'plant_fern', x: 10, y: 1 },
      { item: 'plant_sprout', x: 7, y: 3 },
      { item: 'plant_cactus', x: 8, y: 3 },
      { item: 'plant_sprout', x: 9, y: 3 },
      { item: 'plant_cactus', x: 10, y: 3 },
      { item: 'table_folding', x: 7, y: 6 },
      { item: 'plant_fern', x: 9, y: 6 },
      { item: 'plant_sprout', x: 10, y: 6 },
      { item: 'store_crate', x: 1, y: 7 },
      { item: 'store_crate', x: 2, y: 7 },
      { item: 'plant_monstera', x: 0, y: 8 },
      { item: 'plant_fern', x: 4, y: 8 },
      { item: 'plant_cactus', x: 5, y: 8 },
      { item: 'plant_sprout', x: 6, y: 8 },
      { item: 'plant_monstera', x: 7, y: 8 },
      { item: 'candles', x: 9, y: 8 },
      { item: 'light_lanterns', x: 6, y: 1 },
      { item: 'light_floor', x: 10, y: 8 },
      { item: 'store_shelf', x: 1, y: 0 },
      { item: 'rug_runner', x: 1, y: 5 },
      { item: 'rug_round', x: 4, y: 5 },
      { item: 'wall_poster', x: 0, y: 1, surface: 'back' },
      { item: 'wall_shelf', x: 6, y: 1, surface: 'back' },
      { item: 'wall_lights', x: 8, y: 2, surface: 'back' },
      { item: 'frame_s', x: 2, y: 1, surface: 'left' },
    ],
    spots: [
      { id: 'flowers-counter', kind: 'work', label: 'Start a shift', approach: { x: 3, y: 3 }, prop: 'counterA', job: 'flowers' },
      { id: 'flowers-counter2', kind: 'work', label: 'Start a shift', approach: { x: 4, y: 3 }, prop: 'counterB', job: 'flowers' },
    ],
    keeper: { name: 'Marigold', line: 'Every bouquet is a little love letter.', tile: { x: 3, y: 1 }, look: 5, facing: '+z' },
    folk: [{ name: 'Oscar', line: 'Tulips or roses? It’s our anniversary.', tile: { x: 8, y: 4 }, look: 15, facing: '-z' }],
  },
  parcel: {
    id: 'parcel', w: 11, d: 9, floor: 'fl_plywood', wallpaper: 'wp_planks', wallTint: '#B8C4D8',
    props: [
      { id: 'counterA', item: 'desk', x: 2, y: 2 },
      { id: 'counterB', item: 'desk', x: 4, y: 2 },
      { item: 'store_shelf', x: 1, y: 0 },
      { item: 'store_crate', x: 7, y: 1 },
      { item: 'store_crate', x: 8, y: 1 },
      { item: 'store_crate', x: 9, y: 1 },
      { item: 'store_crate', x: 10, y: 1 },
      { item: 'store_crate', x: 8, y: 2 },
      { item: 'store_crate', x: 10, y: 2 },
      { item: 'store_shelf', x: 10, y: 4 },
      { item: 'store_shelf', x: 10, y: 5 },
      { item: 'table_folding', x: 6, y: 6 },
      { item: 'seat_stool', x: 6, y: 7 },
      { item: 'globe', x: 8, y: 6 },
      { item: 'store_crate', x: 9, y: 8 },
      { item: 'store_crate', x: 10, y: 8 },
      { item: 'store_crate', x: 10, y: 7 },
      { item: 'plant_sprout', x: 0, y: 8 },
      { item: 'light_floor', x: 6, y: 1 },
      { item: 'rug_runner', x: 1, y: 5 },
      { item: 'wall_clock', x: 6, y: 1, surface: 'back' },
      { item: 'wall_calendar', x: 9, y: 1, surface: 'back' },
      { item: 'wall_poster', x: 1, y: 1, surface: 'back' },
      { item: 'wall_corkboard', x: 1, y: 0, surface: 'left' },
    ],
    spots: [
      { id: 'parcel-counter', kind: 'work', label: 'Start a shift', approach: { x: 3, y: 3 }, prop: 'counterA', job: 'delivery' },
      { id: 'parcel-counter2', kind: 'work', label: 'Start a shift', approach: { x: 4, y: 3 }, prop: 'counterB', job: 'delivery' },
    ],
    keeper: { name: 'Theo', line: 'Got a bike? I have parcels.', tile: { x: 3, y: 1 }, look: 1, facing: '+z' },
    folk: [{ name: 'Gran Pell', line: 'Sending cookies to my grandson. Again.', tile: { x: 4, y: 4 }, look: 16, facing: '-z' }],
  },
  labs: {
    id: 'labs', w: 11, d: 9, floor: 'fl_plywood', floorTint: '#8A98A6', wallpaper: 'wp_plain', wallTint: '#C4D4DC',
    props: [
      { id: 'deskBugs', item: 'desk', x: 2, y: 2 },
      { id: 'deskInbox', item: 'desk', x: 5, y: 2 },
      { item: 'light_desk', x: 4, y: 2 },
      { item: 'light_desk', x: 7, y: 2 },
      { item: 'desk', x: 2, y: 6 },
      { item: 'desk', x: 5, y: 6 },
      { item: 'seat_stool', x: 2, y: 7 },
      { item: 'seat_stool', x: 6, y: 7 },
      { item: 'aquarium', x: 8, y: 1 },
      { item: 'plant_monstera', x: 10, y: 1 },
      { item: 'seat_beanbag', x: 8, y: 5 },
      { item: 'seat_beanbag', x: 10, y: 5 },
      { item: 'rug_round', x: 8, y: 6 },
      { item: 'store_bookshelf', x: 9, y: 8 },
      { item: 'globe', x: 10, y: 3 },
      { item: 'plant_sprout', x: 0, y: 8 },
      { item: 'store_shelf', x: 1, y: 0 },
      { item: 'wall_corkboard', x: 5, y: 1, surface: 'back' },
      { item: 'wall_clock', x: 8, y: 2, surface: 'back' },
      { item: 'wall_poster', x: 1, y: 1, surface: 'back' },
      { item: 'frame_m', x: 1, y: 1, surface: 'left' },
    ],
    spots: [
      { id: 'labs-bugs', kind: 'work', label: 'Bug Squad desk', approach: { x: 2, y: 3 }, prop: 'deskBugs', job: 'bugs' },
      { id: 'labs-inbox', kind: 'work', label: 'Inbox Zero desk', approach: { x: 5, y: 3 }, prop: 'deskInbox', job: 'inbox' },
    ],
    keeper: { name: 'Dr. Ng', line: 'Two desks, two kinds of trouble. Pick one.', tile: { x: 8, y: 3 }, look: 4, facing: '+z' },
    folk: [
      { name: 'Sky', line: 'It worked on my machine.', tile: { x: 3, y: 7 }, look: 17, facing: '-z' },
      { name: 'Tomas', line: 'Coffee break by the fish tank. Best meetings happen here.', tile: { x: 9, y: 6 }, look: 18, facing: '+z' },
    ],
  },
};

// The shops are showrooms: every piece on sale this week stands on the floor with its price.
INTERIORS.maple = {
  id: 'maple', w: 14, d: 11, floor: 'fl_pine', wallpaper: 'wp_planks', wallTint: '#E6D2B0',
  props: [
    { id: 'counterA', item: 'store_cabinet', x: 1, y: 8 },
    { id: 'samples', item: 'store_bookshelf', x: 12, y: 9 },
    { item: 'plant_monstera', x: 0, y: 10 },
    { item: 'plant_fern', x: 1, y: 0 },
    { item: 'light_floor', x: 13, y: 0 },
    { item: 'light_floor', x: 13, y: 7 },
    { item: 'plant_monstera', x: 13, y: 4 },
    { item: 'light_chandelier', x: 7, y: 4 },
    { item: 'rug_diamond', x: 6, y: 3 },
    { item: 'rug_runner', x: 1, y: 5 },
    { item: 'seat_loveseat', x: 2, y: 10 },
    { item: 'store_crate', x: 11, y: 0 },
    { item: 'wall_lights', x: 6, y: 2, surface: 'back' },
    { item: 'wall_shelf', x: 10, y: 1, surface: 'back' },
    { item: 'frame_m', x: 1, y: 1, surface: 'back' },
    { item: 'frame_l', x: 7, y: 0, surface: 'left' },
  ],
  spots: [
    { id: 'maple-counter', kind: 'shop', label: 'Everything on the shelves', approach: { x: 2, y: 9 }, prop: 'counterA' },
    { id: 'maple-samples', kind: 'shop', label: 'Walls and floors', approach: { x: 12, y: 10 }, prop: 'samples' },
  ],
  keeper: { name: 'Mr. Maple', line: 'A few new pieces every Monday. Have a wander and tap anything you like.', tile: { x: 2, y: 7 }, look: 6, facing: '+z' },
  displays: { week: [...row(2, [4, 6, 8, 10]), ...row(5, [4, 6, 8, 10])], step: row(2, [12]).concat(row(5, [12])), basic: row(8, span(5, 10)) },
  signs: [{ text: 'THIS WEEK', x: 7.5 }, { text: 'NEXT STEP', x: 13, y: 2 }, { text: 'BASICS', x: 4, y: 8 }],
};

INTERIORS.boutique = {
  id: 'boutique', w: 14, d: 11, floor: 'fl_parquet', wallpaper: 'wp_scallop', wallTint: '#E2D2F0',
  props: [
    { id: 'counterA', item: 'store_cabinet', x: 1, y: 8 },
    { item: 'clothes_rack', x: 12, y: 1 },
    { item: 'clothes_rack', x: 13, y: 1 },
    { item: 'mirror', x: 13, y: 3 },
    { item: 'mirror', x: 13, y: 5 },
    { item: 'seat_loveseat', x: 12, y: 10 },
    { item: 'plant_fern', x: 0, y: 10 },
    { item: 'plant_monstera', x: 1, y: 0 },
    { item: 'light_floor', x: 11, y: 10 },
    { item: 'light_chandelier', x: 7, y: 4 },
    { item: 'rug_diamond', x: 6, y: 3 },
    { item: 'rug_runner', x: 1, y: 5 },
    { item: 'store_wardrobe', x: 10, y: 0 },
    { item: 'wall_lights', x: 6, y: 2, surface: 'back' },
    { item: 'wall_poster', x: 9, y: 1, surface: 'back' },
    { item: 'frame_m', x: 1, y: 1, surface: 'back' },
    { item: 'frame_l', x: 7, y: 0, surface: 'left' },
  ],
  spots: [
    { id: 'boutique-counter', kind: 'shop', label: 'The whole rack', approach: { x: 2, y: 9 }, prop: 'counterA' },
  ],
  keeper: { name: 'Priya', line: 'New rack every Monday. Tap a mannequin to see the piece up close.', tile: { x: 2, y: 7 }, look: 3, facing: '+z' },
  displays: { week: [...row(2, [4, 6, 8, 10]), ...row(5, [4, 6, 8, 10])], basic: [...row(8, [4, 6, 8, 10, 12]), { x: 12, y: 2 }, { x: 12, y: 5 }] },
  signs: [{ text: 'THIS WEEK', x: 7.5 }, { text: 'BASICS', x: 3, y: 8 }],
  folk: [{ name: 'Mei', line: 'I can never decide. Which one would you pick?', tile: { x: 7, y: 6 }, look: 9, facing: '-z' }],
};

INTERIORS.realty = {
  id: 'realty', w: 11, d: 9, floor: 'fl_parquet', floorTint: '#C8A27A', wallpaper: 'wp_stripes', wallTint: '#EBD0C0',
  props: [
    { id: 'agentDesk', item: 'desk', x: 4, y: 3 },
    { item: 'seat_stool', x: 4, y: 2 },
    { item: 'light_desk', x: 6, y: 3 },
    { item: 'store_cabinet', x: 7, y: 1 },
    { item: 'store_cabinet', x: 9, y: 1 },
    { item: 'seat_sofa', x: 7, y: 6 },
    { item: 'table_marble', x: 7, y: 8 },
    { item: 'rug_diamond', x: 3, y: 5 },
    { item: 'store_bookshelf', x: 1, y: 7 },
    { item: 'globe', x: 10, y: 4 },
    { item: 'plant_monstera', x: 0, y: 8 },
    { item: 'plant_monstera', x: 10, y: 8 },
    { item: 'light_floor', x: 10, y: 6 },
    { item: 'plant_fern', x: 1, y: 0 },
    { item: 'frame_xl', x: 6, y: 0, surface: 'back' },
    { item: 'frame_l', x: 1, y: 1, surface: 'back' },
    { item: 'wall_lights', x: 7, y: 2, surface: 'back' },
    { item: 'frame_m', x: 1, y: 1, surface: 'left' },
  ],
  spots: [
    { id: 'realty-desk', kind: 'realty', label: 'See the homes', approach: { x: 4, y: 4 }, prop: 'agentDesk' },
  ],
  keeper: { name: 'Ms. Hale', line: 'Every home on this street started as somebody’s first one. Take a look.', tile: { x: 5, y: 2 }, look: 5, facing: '+z' },
  folk: [{ name: 'The Parks', line: 'We’re saving for the condo. One day!', tile: { x: 8, y: 3 }, look: 19, facing: '-z' }],
};

INTERIORS.chapel = {
  id: 'chapel', w: 11, d: 11, floor: 'fl_parquet', floorTint: '#B08C68', wallpaper: 'wp_plain', wallTint: '#EFE7D8',
  props: [
    { id: 'lectern', item: 'bible_stand', x: 5, y: 2 },
    { item: 'candles', x: 3, y: 2 },
    { item: 'candles', x: 7, y: 2 },
    { item: 'light_floor', x: 2, y: 1 },
    { item: 'light_floor', x: 8, y: 1 },
    { item: 'rug_runner', x: 5, y: 4, rot: 1 },
    { item: 'rug_runner', x: 5, y: 7, rot: 1 },
    { id: 'pewA', item: 'seat_loveseat', x: 7, y: 4 },
    { item: 'seat_loveseat', x: 2, y: 4 },
    { item: 'seat_loveseat', x: 2, y: 6 },
    { item: 'seat_loveseat', x: 7, y: 6 },
    { item: 'seat_loveseat', x: 2, y: 8 },
    { item: 'seat_loveseat', x: 7, y: 8 },
    { item: 'plant_fern', x: 0, y: 10 },
    { item: 'plant_fern', x: 10, y: 10 },
    { item: 'plant_monstera', x: 10, y: 1 },
    { item: 'light_lanterns', x: 10, y: 5 },
    { item: 'wall_cross', x: 6, y: 1, surface: 'back' },
    { item: 'wall_scripture', x: 8, y: 1, surface: 'back' },
    { item: 'wall_lights', x: 0, y: 2, surface: 'back' },
    { item: 'wall_scripture', x: 7, y: 1, surface: 'left' },
  ],
  spots: [
    { id: 'chapel-lectern', kind: 'quiet', label: 'Quiet time', approach: { x: 5, y: 3 }, prop: 'lectern' },
    { id: 'chapel-pew', kind: 'quiet', label: 'Pray for each other', approach: { x: 6, y: 5 }, prop: 'pewA' },
  ],
  keeper: { name: 'Sister Ruth', line: 'Come in and sit a while. There’s no hurry here.', tile: { x: 1, y: 3 }, look: 2, facing: '+x' },
  folk: [{ name: 'Ada', line: 'I come here to say thank you, mostly.', tile: { x: 4, y: 7 }, look: 9, facing: '-z' }],
};
