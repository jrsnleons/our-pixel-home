// Maple Street: every destination in town, where it stands and what you do there. Shared by
// the town scene, the interiors and the UI. Tile coordinates: x runs left to right, y runs from
// the top of the map toward the camera; every door faces the camera (south) like a classic
// Pokémon town.

import type { Tile } from '../core/grid';
import type { JobKey } from './jobs';

export type PlaceKind = 'job' | 'shop' | 'realty' | 'public' | 'soon' | 'home';

/** What a building looks like. */
export type Style = 'cafe' | 'flowers' | 'parcel' | 'labs' | 'furniture' | 'boutique' | 'realty' | 'chapel' | 'cart' | 'park' | 'boarded' | 'home';

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

export const TOWN = {
  w: 14,
  d: 44,
  /** The left column of buildings spans x 1..5, the right column x 8..12, the lane is x 6..7. */
  lane: [6, 7] as const,
} as const;

/** Row r of the street (0 is the far end) has its building bodies at y = 2 + 6r, three tiles deep. */
export const rowY = (r: number) => 2 + r * 6;
const LEFT = { x: 1, w: 5, doorX: 3 };
const RIGHT = { x: 8, w: 5, doorX: 10 };

type PlaceInput = Omit<Place, 'x' | 'y' | 'w' | 'd' | 'door' | 'h'> & { h?: number; w?: number; d?: number };

/** A building on one side of a street row, centered in its column, with its door in front. */
const place = (side: typeof LEFT, r: number, p: PlaceInput): Place => {
  const w = p.w ?? side.w, d = p.d ?? 3;
  return { h: 2.7, ...p, w, d, x: side.x + (side.w - w) / 2, y: rowY(r) + (3 - d), door: { x: side.doorX, y: rowY(r) + 3 } };
};

export const PLACES: Place[] = [
  place(LEFT, 0, { id: 'pet', name: 'Pet shop', sign: 'COMING SOON', note: 'Coming soon', kind: 'soon', style: 'boarded', palette: { wall: '#9A8F86', trim: '#6E655E', roof: '#5E5650', accent: '#C8B89A' } }),
  place(RIGHT, 0, { id: 'garden', name: 'Garden center', sign: 'COMING SOON', note: 'Coming soon', kind: 'soon', style: 'boarded', palette: { wall: '#8FA088', trim: '#62705C', roof: '#566350', accent: '#C8D8B0' } }),
  place(LEFT, 1, { id: 'chapel', name: 'Chapel', sign: 'CHAPEL', note: 'Quiet time and prayer', kind: 'public', style: 'chapel', h: 3, palette: { wall: '#EFE7D8', trim: '#B5A58A', roof: '#7A5A52', accent: '#E8C060' } }),
  place(RIGHT, 1, { id: 'park', name: 'Park', sign: 'PARK', note: 'A bench and a fountain', kind: 'public', style: 'park', h: 0, palette: { wall: '#7FB070', trim: '#5E8A52', roof: '#4E7A44', accent: '#9ED0F0' } }),
  place(LEFT, 2, { id: 'labs', name: 'Pixel Labs', sign: 'PIXEL LABS', note: 'Two desks: Bug Squad and Inbox Zero', kind: 'job', style: 'labs', jobs: ['bugs', 'inbox'], palette: { wall: '#C4D4DC', trim: '#5E7A8C', roof: '#4A5E6E', accent: '#5BC8D8' } }),
  place(RIGHT, 2, { id: 'bakery', name: 'Bakery cart', sign: 'BAKERY', note: 'Snacks to share', kind: 'public', style: 'cart', w: 3, d: 2, h: 1.9, palette: { wall: '#E8B878', trim: '#9A6A3A', roof: '#C8553D', accent: '#FFF2D0', awning: ['#E8506A', '#FFF2D0'] } }),
  place(LEFT, 3, { id: 'parcel', name: 'Parcel Post', sign: 'PARCEL POST', note: 'Bike delivery shifts', kind: 'job', style: 'parcel', jobs: ['delivery'], palette: { wall: '#9DB4D8', trim: '#4A5E8C', roof: '#3E4E78', accent: '#F2C14E' } }),
  place(RIGHT, 3, { id: 'realty', name: 'Hearth & Home Realty', sign: 'HEARTH AND HOME', note: 'Bigger homes', kind: 'realty', style: 'realty', h: 3, palette: { wall: '#D6A08A', trim: '#8A4E3A', roof: '#6A3A30', accent: '#F2E0C0' } }),
  place(LEFT, 4, { id: 'flowers', name: 'Petal & Stem', sign: 'PETAL AND STEM', note: 'Flower shop shifts', kind: 'job', style: 'flowers', jobs: ['flowers'], palette: { wall: '#F2C6D0', trim: '#B8607A', roof: '#8A4A5E', accent: '#7FB070', awning: ['#7FB070', '#FFF2D0'] } }),
  place(RIGHT, 4, { id: 'boutique', name: 'The Boutique', sign: 'THE BOUTIQUE', note: 'This week’s clothes', kind: 'shop', style: 'boutique', palette: { wall: '#D4C4EC', trim: '#8A6AB8', roof: '#5E4A88', accent: '#FFE08A' } }),
  place(LEFT, 5, { id: 'cafe', name: 'Pixel Café', sign: 'PIXEL CAFE', note: 'Café shifts', kind: 'job', style: 'cafe', jobs: ['cafe'], palette: { wall: '#C88A5E', trim: '#6E4A32', roof: '#7A3E32', accent: '#FFF2D0', awning: ['#C8553D', '#FFF2D0'] } }),
  place(RIGHT, 5, { id: 'maple', name: 'Maple Furnishings', sign: 'MAPLE FURNISHINGS', note: 'Furniture, walls and floors', kind: 'shop', style: 'furniture', palette: { wall: '#C8A878', trim: '#7A5A3A', roof: '#5E4630', accent: '#E8D4A8' } }),
  // Your building, at the near end of the street.
  { id: 'home', name: 'Your building', sign: 'HOME', note: 'Back to your place', kind: 'home', style: 'home', x: 4, y: 38, w: 6, d: 3, h: 3.4, door: { x: 6, y: 41 }, palette: { wall: '#EAD8B8', trim: '#9A7A5A', roof: '#6E4A3A', accent: '#E8506A' } },
];

export const PLACE_BY_ID: Record<string, Place> = Object.fromEntries(PLACES.map((p) => [p.id, p]));

/** Where you appear when you step out of your front door. */
export const TOWN_SPAWN: Tile = { x: 6, y: 41 };

/** Which place offers a job. */
export function placeOfJob(job: JobKey): Place {
  return PLACES.find((p) => p.jobs?.includes(job))!;
}

const key = (x: number, y: number) => `${x},${y}`;

/** Static obstacles: building bodies, the fountain, street lamps and the tree line along the edges. */
export function townBlocked(): Set<string> {
  const s = new Set<string>();
  for (const p of PLACES) {
    if (p.kind === 'public' && p.style === 'park') continue; // the park is a lawn you can walk on
    for (let y = p.y; y < p.y + p.d; y++) for (let x = p.x; x < p.x + p.w; x++) s.add(key(x, y));
  }
  for (let y = 0; y < TOWN.d; y++) { s.add(key(0, y)); s.add(key(TOWN.w - 1, y)); }
  for (let x = 0; x < TOWN.w; x++) { s.add(key(x, 0)); s.add(key(x, TOWN.d - 1)); }
  for (const l of LAMPS) s.add(key(l.x, l.y));
  for (const t of PARK_SOLIDS) s.add(key(t.x, t.y));
  return s;
}

/** Street lamps stand in the gap row between two rows of buildings. */
export const LAMPS: Tile[] = [0, 1, 2, 3, 4, 5].flatMap((r) => [{ x: 5, y: rowY(r) + 5 }, { x: 8, y: rowY(r) + 5 }]).filter((t) => t.y < 38);

/** The fountain and its trees. */
export const PARK_SOLIDS: Tile[] = [{ x: 10, y: rowY(1) + 1 }, { x: 8, y: rowY(1) }, { x: 12, y: rowY(1) }];

/** Spots in the park where you can sit. */
export const BENCHES: { tile: Tile; facing: '+z' | '-z' | '+x' | '-x' }[] = [
  { tile: { x: 9, y: rowY(1) + 1 }, facing: '+z' },
  { tile: { x: 11, y: rowY(1) + 1 }, facing: '+z' },
];

/** Waypoints townsfolk wander between (all walkable). */
export function townWaypoints(): Tile[] {
  const blocked = townBlocked();
  const out: Tile[] = [];
  for (let r = 0; r < 6; r++) for (const x of [2, 3, 4, 6, 7, 9, 10, 11]) {
    const t = { x, y: rowY(r) + 4 };
    if (!blocked.has(key(t.x, t.y))) out.push(t);
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
}

/** Where you stand when you walk in (just inside the door). */
export const INTERIOR_DOOR: Tile = { x: 0, y: 5 };

export const INTERIORS: Record<string, InteriorSpec> = {
  cafe: {
    id: 'cafe', w: 7, d: 7, floor: 'fl_checker', wallpaper: 'wp_stripes', wallTint: '#E8C9A0',
    props: [
      { id: 'counterA', item: 'store_cabinet', x: 2, y: 2 },
      { id: 'counterB', item: 'store_cabinet', x: 4, y: 2 },
      { item: 'table_cafe', x: 4, y: 4 },
      { item: 'seat_stool', x: 3, y: 5 },
      { item: 'seat_stool', x: 6, y: 4 },
      { item: 'plant_monstera', x: 6, y: 1 },
      { item: 'plant_fern', x: 1, y: 1 },
      { item: 'light_floor', x: 6, y: 3 },
      { item: 'wall_lights', x: 0, y: 2, surface: 'back' },
      { item: 'wall_shelf', x: 5, y: 1, surface: 'back' },
    ],
    spots: [
      { id: 'cafe-counter', kind: 'work', label: 'Start a shift', approach: { x: 3, y: 3 }, prop: 'counterA', job: 'cafe' },
      { id: 'cafe-counter2', kind: 'work', label: 'Start a shift', approach: { x: 4, y: 3 }, prop: 'counterB', job: 'cafe' },
    ],
    keeper: { name: 'Rosa', line: 'Cinnamon rolls are fresh. Want to work a shift?', tile: { x: 1, y: 3 }, look: 2, facing: '+z' },
  },
  flowers: {
    id: 'flowers', w: 7, d: 7, floor: 'fl_pine', wallpaper: 'wp_flowers', wallTint: '#F2D4DC',
    props: [
      { id: 'counterA', item: 'store_cabinet', x: 2, y: 2 },
      { id: 'counterB', item: 'store_cabinet', x: 4, y: 2 },
      { item: 'plant_monstera', x: 1, y: 1 },
      { item: 'plant_fern', x: 6, y: 1 },
      { item: 'plant_sprout', x: 6, y: 3 },
      { item: 'plant_cactus', x: 5, y: 4 },
      { item: 'plant_fern', x: 2, y: 5 },
      { item: 'table_box', x: 4, y: 5 },
      { item: 'wall_poster', x: 0, y: 1, surface: 'back' },
      { item: 'wall_shelf', x: 5, y: 1, surface: 'back' },
    ],
    spots: [
      { id: 'flowers-counter', kind: 'work', label: 'Start a shift', approach: { x: 3, y: 3 }, prop: 'counterA', job: 'flowers' },
      { id: 'flowers-counter2', kind: 'work', label: 'Start a shift', approach: { x: 4, y: 3 }, prop: 'counterB', job: 'flowers' },
    ],
    keeper: { name: 'Marigold', line: 'Every bouquet is a little love letter.', tile: { x: 1, y: 3 }, look: 5, facing: '+z' },
  },
  parcel: {
    id: 'parcel', w: 7, d: 7, floor: 'fl_plywood', wallpaper: 'wp_planks', wallTint: '#B8C4D8',
    props: [
      { id: 'counterA', item: 'desk', x: 2, y: 2 },
      { id: 'counterB', item: 'desk', x: 4, y: 2 },
      { item: 'store_crate', x: 1, y: 1 },
      { item: 'store_crate', x: 6, y: 1 },
      { item: 'store_crate', x: 6, y: 2 },
      { item: 'store_shelf', x: 6, y: 4 },
      { item: 'store_crate', x: 5, y: 5 },
      { item: 'store_crate', x: 4, y: 5 },
      { item: 'wall_poster', x: 1, y: 1, surface: 'back' },
      { item: 'wall_shelf', x: 5, y: 1, surface: 'back' },
    ],
    spots: [
      { id: 'parcel-counter', kind: 'work', label: 'Start a shift', approach: { x: 3, y: 3 }, prop: 'counterA', job: 'delivery' },
      { id: 'parcel-counter2', kind: 'work', label: 'Start a shift', approach: { x: 4, y: 3 }, prop: 'counterB', job: 'delivery' },
    ],
    keeper: { name: 'Theo', line: 'Got a bike? I have parcels.', tile: { x: 1, y: 3 }, look: 1, facing: '+z' },
  },
  labs: {
    id: 'labs', w: 7, d: 7, floor: 'fl_plywood', floorTint: '#8A98A6', wallpaper: 'wp_plain', wallTint: '#C4D4DC',
    props: [
      { id: 'deskBugs', item: 'desk', x: 2, y: 2 },
      { id: 'deskInbox', item: 'desk', x: 4, y: 2 },
      { item: 'light_desk', x: 1, y: 2 },
      { item: 'light_desk', x: 6, y: 2 },
      { item: 'seat_stool', x: 2, y: 3 },
      { item: 'seat_stool', x: 5, y: 3 },
      { item: 'plant_sprout', x: 6, y: 3 },
      { item: 'store_bookshelf', x: 5, y: 5 },
      { item: 'wall_poster', x: 0, y: 1, surface: 'back' },
      { item: 'wall_shelf', x: 5, y: 1, surface: 'back' },
    ],
    spots: [
      { id: 'labs-bugs', kind: 'work', label: 'Bug Squad desk', approach: { x: 3, y: 3 }, prop: 'deskBugs', job: 'bugs' },
      { id: 'labs-inbox', kind: 'work', label: 'Inbox Zero desk', approach: { x: 4, y: 3 }, prop: 'deskInbox', job: 'inbox' },
    ],
    keeper: { name: 'Dr. Ng', line: 'Two desks, two kinds of trouble. Pick one.', tile: { x: 3, y: 5 }, look: 4, facing: '+z' },
  },
};
