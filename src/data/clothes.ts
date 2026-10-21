// Clothes: separate pieces (hat, glasses, top or dress, bottoms, shoes, bag), each sold in a
// few colorways. The server bundles this file too, so prices, the weekly Boutique rack and
// what counts as owned are decided in one place. Painting lives in engine/art/clothes.ts.

import { bagPick } from './bag';

export type Slot = 'hat' | 'face' | 'top' | 'bottom' | 'shoes' | 'bag';
export const SLOTS: Slot[] = ['top', 'bottom', 'shoes', 'hat', 'face', 'bag'];
export const SLOT_NAMES: Record<Slot, string> = { top: 'Tops', bottom: 'Bottoms', shoes: 'Shoes', hat: 'Hats', face: 'Glasses', bag: 'Bags' };
/** Slots you can leave empty. Everyone wears a top, bottoms (or a dress) and shoes. */
export const OPTIONAL: Slot[] = ['hat', 'face', 'bag'];

export type ThemeKey = 'cozy' | 'street' | 'sunday' | 'y2k' | 'rainy' | 'picnic' | 'date' | 'campus';
export const THEMES: Record<ThemeKey, { name: string; blurb: string }> = {
  cozy: { name: 'Cozy Knits', blurb: 'Soft layers for slow evenings in.' },
  street: { name: 'Streetwear', blurb: 'Baggy fits, caps and chunky soles.' },
  sunday: { name: 'Sunday Best', blurb: 'Pressed, pretty and ready for church.' },
  y2k: { name: 'Y2K', blurb: 'Tiny bags, heart shades and pleated minis.' },
  rainy: { name: 'Rainy Day', blurb: 'Raincoats, boots and puddle weather.' },
  picnic: { name: 'Picnic', blurb: 'Sundresses, straw hats and gingham skies.' },
  date: { name: 'Date Night', blurb: 'For the night you finally see each other.' },
  campus: { name: 'Campus', blurb: 'Cardigans, totes and library afternoons.' },
};
export const THEME_ORDER: ThemeKey[] = ['cozy', 'street', 'picnic', 'y2k', 'sunday', 'rainy', 'campus', 'date'];

export interface Piece {
  key: string;
  name: string;
  slot: Slot;
  price: number;
  /** Base color of each colorway; the painter shades it. */
  colors: string[];
  colorNames: string[];
  tags: ThemeKey[];
  blurb: string;
  /** Always on the basics rack. */
  basic?: boolean;
  /** Colorways everyone owns from the start. */
  starter?: number[];
  /** A dress or long coat: worn in the top slot, no bottoms underneath. */
  full?: boolean;
  /** Made to be worn by both of you. */
  matching?: boolean;
}

// Named colors, so colorways read the same across pieces.
const C = {
  cream: '#F2EEE4', white: '#FAF6EE', black: '#2E2A33', charcoal: '#45434F', grey: '#8A8A96', navy: '#2E3A5A',
  sky: '#A8C8E8', denim: '#4A6A9A', darkDenim: '#344766', lightDenim: '#86A6CC', sage: '#9DB38A', forest: '#3E6A4E',
  olive: '#6E7A48', mint: '#A8DCC8', butter: '#F2D98A', mustard: '#D9A43A', yellow: '#F2C230', pink: '#F2A7C3',
  rose: '#E07A90', red: '#C83A3A', wine: '#7A2E44', coral: '#E8806A', rust: '#C9603E', lilac: '#B8A2DA',
  camel: '#B8875A', oat: '#D8C4A0', brown: '#6E4E3A', tan: '#C8A47A', khaki: '#B8A880', tortoise: '#8A5A3A',
  gold: '#C8A040', straw: '#E0C27A', champagne: '#E8D2A8', blueGrey: '#8A9AB5',
};
type CName = keyof typeof C;
const NAMES: Record<CName, string> = {
  cream: 'Cream', white: 'White', black: 'Black', charcoal: 'Charcoal', grey: 'Grey', navy: 'Navy', sky: 'Sky', denim: 'Denim',
  darkDenim: 'Dark wash', lightDenim: 'Light wash', sage: 'Sage', forest: 'Forest', olive: 'Olive', mint: 'Mint', butter: 'Butter',
  mustard: 'Mustard', yellow: 'Sunny', pink: 'Pink', rose: 'Rose', red: 'Red', wine: 'Wine', coral: 'Coral', rust: 'Rust',
  lilac: 'Lilac', camel: 'Camel', oat: 'Oat', brown: 'Brown', tan: 'Tan', khaki: 'Khaki', tortoise: 'Tortoise', gold: 'Gold',
  straw: 'Straw', champagne: 'Champagne', blueGrey: 'Blue grey',
};

const P = (slot: Slot) => (key: string, name: string, price: number, colors: CName[], tags: ThemeKey[], blurb: string, extra: Partial<Piece> = {}): Piece =>
  ({ key, name, slot, price, colors: colors.map((c) => C[c]), colorNames: colors.map((c) => NAMES[c]), tags, blurb, ...extra });
const top = P('top'), bottom = P('bottom'), shoes = P('shoes'), hat = P('hat'), face = P('face'), bag = P('bag');

export const PIECES: Piece[] = [
  // Tops
  top('tee', 'Tee', 40, ['cream', 'black', 'sky', 'pink', 'sage', 'butter'], [], 'A soft everyday tee.', { basic: true, starter: [0, 1, 3] }),
  top('hoodie', 'Hoodie', 90, ['blueGrey', 'charcoal', 'cream', 'sage', 'pink', 'mustard'], ['street', 'campus', 'cozy'], 'Oversized, borrowed, never returned.', { basic: true, starter: [0] }),
  top('heart_tee', 'Heart tee', 70, ['cream', 'pink', 'lilac', 'black'], ['picnic', 'y2k', 'date'], 'A little heart right over yours.'),
  top('couple_tee', 'Couple tee', 90, ['cream', 'sky', 'pink', 'black'], ['date', 'picnic'], 'Half a heart each. Wear it together.', { matching: true }),
  top('tank', 'Tank top', 50, ['cream', 'black', 'coral', 'mint'], ['picnic', 'y2k', 'street'], 'Ribbed and simple.'),
  top('cardigan', 'Cropped cardigan', 120, ['lilac', 'butter', 'sage', 'pink', 'cream'], ['cozy', 'campus', 'y2k'], 'Pearl buttons over a white tee.'),
  top('knit', 'Cable knit', 130, ['rust', 'cream', 'forest', 'navy', 'oat'], ['cozy', 'rainy', 'campus'], 'Chunky cables for cold nights.'),
  top('turtleneck', 'Turtleneck', 110, ['black', 'cream', 'wine', 'camel'], ['date', 'cozy', 'sunday'], 'Fine-knit and a little bit fancy.'),
  top('flannel', 'Flannel', 110, ['red', 'forest', 'navy', 'mustard'], ['rainy', 'cozy', 'campus'], 'Plaid, with the sleeves pushed up.'),
  top('varsity', 'Varsity jacket', 180, ['navy', 'wine', 'forest', 'black'], ['street', 'campus'], 'Cream sleeves and a letter patch.'),
  top('denim_jacket', 'Denim jacket', 160, ['denim', 'lightDenim', 'black'], ['street', 'y2k', 'picnic'], 'Broken in, over a white tee.'),
  top('puffer', 'Puffer jacket', 200, ['black', 'cream', 'sky', 'coral'], ['street', 'rainy'], 'Quilted, puffy, warm as a hug.'),
  top('blouse', 'Ruffle blouse', 120, ['white', 'pink', 'sky', 'butter'], ['sunday', 'picnic', 'date'], 'A ruffled collar and puffed sleeves.'),
  top('rugby', 'Rugby shirt', 120, ['navy', 'forest', 'wine', 'mustard'], ['campus', 'street'], 'Wide stripes and a white collar.'),
  top('vest', 'Sweater vest', 120, ['oat', 'sage', 'navy', 'brown'], ['campus', 'sunday'], 'Argyle over a crisp shirt.'),
  top('shirt', 'Button-up', 100, ['white', 'sky', 'pink', 'black'], ['sunday', 'date', 'campus'], 'Pressed, buttoned, tucked in.'),
  top('blazer', 'Blazer', 220, ['navy', 'black', 'camel', 'grey'], ['date', 'sunday'], 'Sharp lapels over a white shirt.'),
  top('pj_top', 'Pajama top', 90, ['sky', 'pink', 'mint', 'lilac'], ['cozy'], 'Piping, little stars, bedtime.'),
  top('apron', 'Café apron', 120, ['forest', 'brown', 'black', 'wine'], [], 'Earned at the café counter.', { basic: true }),
  // Dresses and long coats
  top('sundress', 'Sundress', 160, ['pink', 'butter', 'sky', 'sage', 'cream'], ['picnic', 'sunday', 'date'], 'Light cotton with a little collar.', { full: true }),
  top('pinafore', 'Pinafore', 150, ['denim', 'brown', 'sage', 'wine'], ['campus', 'picnic', 'cozy'], 'Dungaree dress over a white tee.', { full: true }),
  top('maxi', 'Floral maxi', 200, ['cream', 'sky', 'lilac', 'sage'], ['sunday', 'picnic'], 'Tiny flowers all the way to your ankles.', { full: true }),
  top('slip_dress', 'Slip dress', 180, ['black', 'wine', 'champagne', 'sage'], ['date', 'y2k'], 'Satin, thin straps, a soft shine.', { full: true }),
  top('raincoat', 'Raincoat', 180, ['yellow', 'red', 'sky', 'sage'], ['rainy'], 'Bright and ready for puddles.', { full: true }),
  // Bottoms
  bottom('jeans', 'Jeans', 60, ['denim', 'darkDenim', 'lightDenim', 'black', 'cream'], [], 'Straight-leg and broken in.', { basic: true, starter: [0, 1] }),
  bottom('joggers', 'Joggers', 60, ['charcoal', 'grey', 'black', 'sage'], ['cozy'], 'Cuffed and comfy.', { basic: true, starter: [0] }),
  bottom('wide_jeans', 'Wide-leg jeans', 120, ['lightDenim', 'denim', 'black', 'cream'], ['street', 'y2k'], 'Baggy, puddling over your shoes.'),
  bottom('cargo', 'Cargo pants', 120, ['olive', 'khaki', 'black', 'grey'], ['street', 'campus'], 'Pockets on pockets.'),
  bottom('slacks', 'Slacks', 100, ['charcoal', 'brown', 'navy', 'camel', 'cream'], ['sunday', 'date'], 'A sharp front crease.'),
  bottom('shorts', 'Shorts', 70, ['denim', 'khaki', 'black', 'cream'], ['picnic', 'street'], 'For warm afternoons.'),
  bottom('mini_skirt', 'Pleated mini', 90, ['white', 'black', 'pink', 'navy'], ['y2k', 'campus', 'street'], 'A tennis skirt with crisp pleats.'),
  bottom('midi_skirt', 'Midi skirt', 110, ['brown', 'sage', 'black', 'cream', 'wine'], ['sunday', 'cozy', 'rainy'], 'Swishes when you walk.'),
  bottom('overalls', 'Overalls', 140, ['denim', 'brown', 'sage', 'cream'], ['picnic', 'campus'], 'Bib, buckles and big pockets.'),
  bottom('pj_pants', 'Pajama pants', 60, ['sky', 'pink', 'mint', 'lilac'], ['cozy'], 'Match them with the pajama top.'),
  // Shoes
  shoes('sneakers', 'Sneakers', 50, ['cream', 'black', 'red', 'sky', 'pink'], [], 'Canvas, everyday, go-anywhere.', { basic: true, starter: [0, 1] }),
  shoes('chunky', 'Chunky sneakers', 120, ['white', 'grey', 'pink', 'black'], ['y2k', 'street'], 'Thick soles, extra height.'),
  shoes('boots', 'Boots', 120, ['brown', 'black', 'tan'], ['rainy', 'cozy', 'campus'], 'Laced to the ankle.'),
  shoes('maryjanes', 'Mary Janes', 90, ['black', 'cream', 'wine', 'pink'], ['sunday', 'picnic', 'date'], 'A strap and a shine.'),
  shoes('loafers', 'Loafers', 100, ['brown', 'black', 'wine'], ['sunday', 'campus', 'date'], 'Polished penny loafers.'),
  shoes('rainboots', 'Rain boots', 80, ['red', 'yellow', 'sage', 'black'], ['rainy'], 'Tall and splash-proof.'),
  shoes('slippers', 'Slippers', 50, ['pink', 'cream', 'sky'], ['cozy'], 'Fluffy, for padding around.'),
  // Hats and hair things
  hat('beanie', 'Beanie', 70, ['rust', 'cream', 'black', 'sage', 'pink'], ['cozy', 'rainy', 'street'], 'Knitted, with a pom-pom.'),
  hat('cap', 'Cap', 60, ['denim', 'black', 'cream', 'pink', 'red'], ['street', 'campus', 'picnic'], 'A worn baseball cap.'),
  hat('bucket', 'Bucket hat', 90, ['cream', 'black', 'sage', 'lilac'], ['y2k', 'picnic', 'street'], 'Floppy brim, festival ready.'),
  hat('beret', 'Beret', 90, ['black', 'red', 'cream', 'camel'], ['date', 'campus', 'sunday'], 'Tilted just so.'),
  hat('sunhat', 'Sun hat', 110, ['straw', 'cream', 'pink'], ['picnic', 'sunday'], 'A wide straw brim with a ribbon.'),
  hat('bow', 'Hair bow', 50, ['red', 'pink', 'black', 'cream', 'sky'], ['sunday', 'date', 'picnic'], 'A big ribbon bow.'),
  hat('flower', 'Flower clip', 40, ['white', 'pink', 'butter', 'lilac'], ['picnic', 'sunday'], 'A daisy above one ear.'),
  hat('claw_clip', 'Claw clip', 40, ['tortoise', 'pink', 'lilac', 'black'], ['y2k', 'campus'], 'Hair up, effortlessly.'),
  hat('headphones', 'Headphones', 120, ['black', 'cream', 'pink', 'sky'], ['street', 'campus', 'cozy'], 'Over-ear, for music together.'),
  hat('cat_ears', 'Cat ears', 100, ['black', 'cream', 'pink', 'brown'], ['y2k', 'cozy'], 'Silly. Cute. Both.'),
  // Glasses
  face('glasses', 'Round glasses', 60, ['black', 'gold', 'tortoise', 'pink'], [], 'Thin wire frames.', { basic: true, starter: [0] }),
  face('sunglasses', 'Sunglasses', 80, ['black', 'tortoise', 'pink'], ['street', 'picnic', 'y2k'], 'Dark lenses, big energy.'),
  face('heart_glasses', 'Heart shades', 70, ['pink', 'red', 'lilac'], ['y2k', 'date'], 'Everything looks a little more in love.'),
  // Bags
  bag('tote', 'Tote bag', 70, ['cream', 'black', 'sage', 'pink'], ['campus', 'picnic'], 'Canvas, carries everything.'),
  bag('backpack', 'Mini backpack', 100, ['black', 'pink', 'lilac', 'sky', 'brown'], ['campus', 'y2k', 'street'], 'Small enough to be cute.'),
  bag('crossbody', 'Crossbody bag', 90, ['brown', 'black', 'cream', 'wine'], ['date', 'street', 'sunday'], 'A little bag on a long strap.'),
];

export const PIECE_BY_KEY: Record<string, Piece> = Object.fromEntries(PIECES.map((p) => [p.key, p]));

/** What someone has on: slot to "piece:color", e.g. { top: 'tee:0' }. */
export type Wear = Partial<Record<Slot, string>>;

export function parseWorn(v: string | undefined): { piece: Piece; color: number } | null {
  if (!v) return null;
  const [k, c] = v.split(':');
  const piece = PIECE_BY_KEY[k];
  const color = Number(c);
  if (!piece || !Number.isInteger(color) || color < 0 || color >= piece.colors.length) return null;
  return { piece, color };
}

export const worn = (key: string, color = 0) => `${key}:${color}`;

export const STARTER_WEAR: Wear = { top: 'tee:0', bottom: 'jeans:0', shoes: 'sneakers:0' };

// Looks saved before clothes were separate pieces wore one outfit and one accessory.
const LEGACY_OUTFIT: Record<string, Wear> = {
  fit_tee: { top: 'tee:0', bottom: 'jeans:0', shoes: 'sneakers:0' },
  fit_hoodie: { top: 'hoodie:0', bottom: 'joggers:0', shoes: 'sneakers:0' },
  fit_sweater: { top: 'knit:0', bottom: 'slacks:1', shoes: 'boots:0' },
  fit_overalls: { top: 'tee:0', bottom: 'overalls:0', shoes: 'sneakers:2' },
  fit_dress: { top: 'sundress:0', shoes: 'maryjanes:1' },
  fit_flannel: { top: 'flannel:0', bottom: 'jeans:1', shoes: 'boots:0' },
  fit_pajamas: { top: 'pj_top:0', bottom: 'pj_pants:0', shoes: 'slippers:0' },
  fit_raincoat: { top: 'raincoat:0', shoes: 'rainboots:0' },
  fit_apron: { top: 'apron:0', bottom: 'slacks:0', shoes: 'loafers:1' },
  fit_sunday: { top: 'shirt:0', bottom: 'slacks:2', shoes: 'loafers:0' },
  fit_formal: { top: 'blazer:0', bottom: 'slacks:0', shoes: 'loafers:1' },
};
const LEGACY_ACC: Record<string, Wear> = {
  acc_glasses: { face: 'glasses:0' }, acc_beanie: { hat: 'beanie:0' }, acc_cap: { hat: 'cap:0' }, acc_flower: { hat: 'flower:0' },
  acc_bow: { hat: 'bow:0' }, acc_headphones: { hat: 'headphones:0' }, acc_catears: { hat: 'cat_ears:0' },
};

/** Keep only real pieces in the right slots; fill the required slots; drop bottoms under a dress. */
export function cleanWear(w: unknown): Wear {
  const out: Wear = {};
  const src = (w && typeof w === 'object' ? w : {}) as Record<string, unknown>;
  for (const s of SLOTS) {
    const v = typeof src[s] === 'string' ? (src[s] as string).slice(0, 40) : undefined;
    const p = parseWorn(v);
    if (p && p.piece.slot === s) out[s] = worn(p.piece.key, p.color);
  }
  if (!out.top) out.top = STARTER_WEAR.top;
  if (!out.shoes) out.shoes = STARTER_WEAR.shoes;
  if (parseWorn(out.top)!.piece.full) delete out.bottom;
  else if (!out.bottom) out.bottom = STARTER_WEAR.bottom;
  return out;
}

/** What a look has on, including looks saved before pieces existed. */
export function wearOf(look: { wear?: Wear; outfit?: string; accessory?: string }): Wear {
  if (look.wear) return cleanWear(look.wear);
  return cleanWear({ ...(LEGACY_OUTFIT[look.outfit ?? ''] ?? STARTER_WEAR), ...(LEGACY_ACC[look.accessory ?? ''] ?? {}) });
}

/**
 * Every "piece:color" the couple owns: starter colorways, everything bought, and what the old
 * outfit and accessory purchases turned into.
 */
export function ownedClothes(unlocks: readonly string[]): Set<string> {
  const s = new Set<string>();
  for (const p of PIECES) for (const i of p.starter ?? []) s.add(worn(p.key, i));
  for (const u of unlocks) {
    if (parseWorn(u)) s.add(u);
    for (const v of Object.values(LEGACY_OUTFIT[u] ?? LEGACY_ACC[u] ?? {})) if (v) s.add(v);
  }
  return s;
}

export function ownsPiece(owned: Set<string>, key: string): boolean {
  const p = PIECE_BY_KEY[key];
  return !!p && p.colors.some((_, i) => owned.has(worn(key, i)));
}

/** Another colorway of something you already own costs half. */
export function colorPrice(owned: Set<string>, key: string): number {
  const p = PIECE_BY_KEY[key];
  if (!p) return 0;
  return ownsPiece(owned, key) ? Math.ceil(p.price / 2 / 5) * 5 : p.price;
}

// ---------- The weekly Boutique ----------

const DAY = 86_400_000;
const EPOCH_MONDAY = Date.UTC(1970, 0, 5);
export const RACK_SIZE = 8;
/** How many of the rack are the week's theme; the rest is a mix of everything else. */
const THEMED = 6;

/** Weeks since a Monday, in UTC: everyone's rack changes at the same moment. */
export function weekIndex(now: Date): number {
  return Math.floor((now.getTime() - EPOCH_MONDAY) / (7 * DAY));
}

export function nextRackAt(now: Date): Date {
  return new Date(EPOCH_MONDAY + (weekIndex(now) + 1) * 7 * DAY);
}

/**
 * This week's theme and its rack of eight: six pieces of the theme and two from elsewhere.
 * Each theme goes through its own shuffle bag, so a theme's pieces all show up before any repeats.
 */
export function boutique(now: Date): { week: number; theme: ThemeKey; pieces: Piece[] } {
  const week = weekIndex(now);
  const slot = ((week % THEME_ORDER.length) + THEME_ORDER.length) % THEME_ORDER.length;
  const theme = THEME_ORDER[slot];
  const visit = Math.floor(week / THEME_ORDER.length);
  const pool = PIECES.filter((p) => !p.basic);
  const themedPool = pool.filter((p) => p.tags.includes(theme));
  const themed = bagPick(themedPool, THEMED, visit * THEMED, slot * 131 + 17);
  const rest = bagPick(pool.filter((p) => !p.tags.includes(theme)), RACK_SIZE - themed.length, week * (RACK_SIZE - THEMED), 4421);
  const order: Slot[] = ['top', 'bottom', 'shoes', 'hat', 'face', 'bag'];
  const pieces = [...themed, ...rest].sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot));
  return { week, theme, pieces };
}

/** Sold right now: the basics rack, or this week's Boutique. */
export function onSale(key: string, now: Date): boolean {
  const p = PIECE_BY_KEY[key];
  if (!p) return false;
  return !!p.basic || boutique(now).pieces.some((q) => q.key === key);
}

/** A believable random outfit (café customers). */
export function randomWear(n: number): Wear {
  const pick = (slot: Slot, salt: number) => {
    const list = PIECES.filter((p) => p.slot === slot && p.key !== 'pj_top' && p.key !== 'pj_pants' && p.key !== 'slippers' && p.key !== 'apron');
    const p = list[(n * salt + 3) % list.length];
    return worn(p.key, (n * 7 + salt) % p.colors.length);
  };
  const w: Wear = { top: pick('top', 5), bottom: pick('bottom', 11), shoes: pick('shoes', 3) };
  if (n % 3 === 0) w.hat = pick('hat', 13);
  if (n % 4 === 1) w.face = pick('face', 17);
  if (n % 5 === 2) w.bag = pick('bag', 19);
  return cleanWear(w);
}
