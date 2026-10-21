// Everything the store sells. The server bundles this same file (npm run build:api), so
// prices are checked on the server and can't be changed from a phone.

export type Category =
  | 'bed' | 'table' | 'seating' | 'lighting' | 'storage'
  | 'decor' | 'plant' | 'rug' | 'faith' | 'wall'
  | 'wallpaper' | 'floor' | 'upgrade';

/** placeable: takes an inventory slot and goes on a grid. style: owned once, applied (wallpaper, floor). Clothes live in clothes.ts. */
export type Kind = 'floor-item' | 'wall-item' | 'style' | 'upgrade';

export type Action = 'sit' | 'sleep' | 'play' | 'read' | 'draw' | 'music' | 'quiet' | 'look' | 'water' | 'write' | 'wardrobe' | 'photo' | 'calendar' | 'feed';

export interface ItemDef {
  key: string;
  name: string;
  category: Category;
  kind: Kind;
  price: number;
  /** Upgrade tier within a furniture family: 0 starter, 1 basic, 2 cozy, 3 premium, 4 luxe. */
  tier?: number;
  /** Footprint in tiles at rotation 0: [x, z] for floor items, [w, h] for wall items. */
  size?: [number, number];
  /** Rugs: drawn on the floor, can sit under furniture, never block walking. */
  flat?: boolean;
  /** Ceiling items (chandelier): hang above the tile, people walk under them. */
  hanging?: boolean;
  /** Small decor stacks in one inventory slot. */
  stacks?: boolean;
  actions?: Action[];
  /** Point-light strength when this lamp is on (0 = no real light, only glow). */
  light?: number;
  /** Interactions this item makes possible. */
  unlocks?: string[];
  blurb: string;
  /** Only sold once (it's a room upgrade or style). */
  unique?: boolean;
  /** Not sold, only given (starter items). */
  starter?: boolean;
}

const F = (d: Omit<ItemDef, 'kind'>): ItemDef => ({ kind: 'floor-item', ...d });
const W = (d: Omit<ItemDef, 'kind'>): ItemDef => ({ kind: 'wall-item', ...d });
const S = (d: Omit<ItemDef, 'kind' | 'unique'>): ItemDef => ({ kind: 'style', unique: true, ...d });

export const ITEMS: ItemDef[] = [
  // Beds
  F({ key: 'bed_mat', name: 'Sleeping mat', category: 'bed', tier: 0, price: 40, size: [1, 2], actions: ['sleep', 'sit'], blurb: 'A rolled-out mat and a flat pillow. Everyone starts somewhere.' }),
  F({ key: 'bed_futon', name: 'Futon', category: 'bed', tier: 1, price: 150, size: [2, 3], actions: ['sleep', 'sit'], blurb: 'A thick cotton futon on a low slatted base.' }),
  F({ key: 'bed_wood', name: 'Wooden bed', category: 'bed', tier: 2, price: 250, size: [2, 3], actions: ['sleep', 'sit'], blurb: 'A sturdy frame with a heart carved in the headboard.' }),
  F({ key: 'bed_quilted', name: 'Quilted double', category: 'bed', tier: 3, price: 900, size: [2, 3], actions: ['sleep', 'sit'], unlocks: ['cuddle'], blurb: 'Two pillows, a hand-stitched quilt, room for both of you.' }),
  F({ key: 'bed_canopy', name: 'Canopy bed', category: 'bed', tier: 4, price: 2200, size: [2, 3], actions: ['sleep', 'sit'], unlocks: ['cuddle', 'nap_together'], blurb: 'Draped posts and soft curtains. Unlocks napping together.' }),

  // Tables
  F({ key: 'table_box', name: 'Cardboard box', category: 'table', tier: 0, price: 30, size: [1, 1], blurb: 'It held your stuff on moving day. Now it holds your tea.' }),
  F({ key: 'table_folding', name: 'Folding table', category: 'table', tier: 1, price: 120, size: [2, 1], actions: ['write'], blurb: 'Light, wobbly, honest.' }),
  F({ key: 'table_games', name: 'Wooden games table', category: 'table', tier: 2, price: 400, size: [2, 1], actions: ['play'], blurb: 'Connect 4 and tic-tac-toe live in the drawer.' }),
  F({ key: 'table_cafe', name: 'Round café table', category: 'table', tier: 3, price: 900, size: [2, 2], actions: ['play'], blurb: 'Bistro legs and a tablecloth. Games night, upgraded.' }),
  F({ key: 'table_marble', name: 'Marble table', category: 'table', tier: 4, price: 2000, size: [2, 1], actions: ['play'], blurb: 'Cool white stone veined with grey.' }),

  // Seating
  F({ key: 'seat_cushion', name: 'Floor cushion', category: 'seating', tier: 0, price: 60, size: [1, 1], actions: ['sit'], stacks: true, blurb: 'Plump and tufted. Sits anywhere.' }),
  F({ key: 'seat_stool', name: 'Stool', category: 'seating', tier: 1, price: 90, size: [1, 1], actions: ['sit'], blurb: 'Three legs, one seat, zero back support.' }),
  F({ key: 'seat_beanbag', name: 'Beanbag', category: 'seating', tier: 2, price: 200, size: [1, 1], actions: ['sit'], blurb: 'You will not get up for a while.' }),
  F({ key: 'seat_loveseat', name: 'Loveseat', category: 'seating', tier: 3, price: 700, size: [2, 1], actions: ['sit'], unlocks: ['sit_together', 'lean_shoulder'], blurb: 'Made for two. Unlocks leaning on a shoulder.' }),
  F({ key: 'seat_sofa', name: 'Velvet sofa', category: 'seating', tier: 4, price: 1600, size: [3, 1], actions: ['sit'], unlocks: ['sit_together', 'lean_shoulder'], blurb: 'Deep velvet, rolled arms, brass feet.' }),

  // Lighting
  F({ key: 'light_bulb', name: 'Bare bulb lamp', category: 'lighting', tier: 0, price: 40, size: [1, 1], light: 3.2, blurb: 'A bulb on a pole. Warm, if a little sad.' }),
  F({ key: 'light_desk', name: 'Desk lamp', category: 'lighting', tier: 1, price: 120, size: [1, 1], light: 3.6, blurb: 'A little lamp with a pleated shade.' }),
  F({ key: 'light_floor', name: 'Floor lamp', category: 'lighting', tier: 2, price: 260, size: [1, 1], light: 4.8, blurb: 'Tall, with a fabric drum shade.' }),
  F({ key: 'light_lanterns', name: 'Paper lanterns', category: 'lighting', tier: 3, price: 500, size: [1, 1], light: 4.4, blurb: 'Three paper globes on a wooden stand.' }),
  F({ key: 'light_chandelier', name: 'Chandelier', category: 'lighting', tier: 4, price: 1800, size: [1, 1], hanging: true, light: 6, blurb: 'Hangs from the ceiling. Walk right under it.' }),

  // Storage
  F({ key: 'store_crate', name: 'Crate', category: 'storage', tier: 0, price: 50, size: [1, 1], blurb: 'A fruit crate turned on its side.' }),
  F({ key: 'store_shelf', name: 'Small shelf', category: 'storage', tier: 1, price: 160, size: [1, 1], actions: ['read'], blurb: 'Two shelves of paperbacks.' }),
  F({ key: 'store_bookshelf', name: 'Bookshelf', category: 'storage', tier: 2, price: 350, size: [2, 1], actions: ['read'], blurb: 'Full of books, and one Bible you can open.' }),
  F({ key: 'store_wardrobe', name: 'Wardrobe', category: 'storage', tier: 3, price: 800, size: [2, 1], actions: ['wardrobe'], blurb: 'Change outfits right in the room.' }),
  F({ key: 'store_cabinet', name: 'Display cabinet', category: 'storage', tier: 4, price: 1700, size: [2, 1], actions: ['look'], blurb: 'Glass doors, keepsakes, a soft light inside.' }),

  // Activity and cozy decor
  F({ key: 'easel', name: 'Easel', category: 'decor', price: 450, size: [1, 1], actions: ['draw'], blurb: 'A canvas for Draw & Guess.' }),
  F({ key: 'desk', name: 'Writing desk', category: 'decor', price: 300, size: [2, 1], actions: ['write'], blurb: 'Open your notebooks here.' }),
  F({ key: 'record_player', name: 'Record player', category: 'decor', price: 350, size: [1, 1], actions: ['music'], blurb: 'Soft music you both hear.' }),
  F({ key: 'globe', name: 'Globe', category: 'decor', price: 260, size: [1, 1], actions: ['look'], blurb: 'Pins on both your cities and the miles between.' }),
  F({ key: 'aquarium', name: 'Aquarium', category: 'decor', price: 900, size: [2, 1], actions: ['look', 'feed'], blurb: 'Three small fish and a castle.' }),
  F({ key: 'clothes_rack', name: 'Clothes rack', category: 'decor', price: 80, size: [1, 1], actions: ['wardrobe'], blurb: 'A rail for your clothes. Tap it to get changed.' }),
  F({ key: 'mirror', name: 'Standing mirror', category: 'decor', price: 220, size: [1, 1], actions: ['wardrobe'], blurb: 'Check your outfit, then change it.' }),
  F({ key: 'candles', name: 'Candles', category: 'decor', price: 40, size: [1, 1], stacks: true, light: 1.6, blurb: 'Three candles on a tray.' }),
  F({ key: 'plush_bear', name: 'Bear plushie', category: 'decor', price: 90, size: [1, 1], stacks: true, blurb: 'Soft, patient, a good listener.' }),
  F({ key: 'plush_bunny', name: 'Bunny plushie', category: 'decor', price: 90, size: [1, 1], stacks: true, blurb: 'Floppy ears, button nose.' }),
  F({ key: 'book_stack', name: 'Book stack', category: 'decor', price: 30, size: [1, 1], stacks: true, blurb: 'Your to-read pile.' }),
  F({ key: 'window_seat', name: 'Window cushion', category: 'decor', price: 120, size: [2, 1], actions: ['sit'], blurb: 'A long cushion for watching the sky.' }),

  // Plants
  F({ key: 'plant_sprout', name: 'Potted sprout', category: 'plant', price: 50, size: [1, 1], actions: ['water'], stacks: true, blurb: 'Water it and it grows over a few days.' }),
  F({ key: 'plant_monstera', name: 'Monstera', category: 'plant', price: 180, size: [1, 1], actions: ['water'], blurb: 'Big split leaves. Grows in three stages.' }),
  F({ key: 'plant_cactus', name: 'Cactus', category: 'plant', price: 70, size: [1, 1], actions: ['water'], stacks: true, blurb: 'Barely needs you. Blooms when it is happy.' }),
  F({ key: 'plant_fern', name: 'Hanging fern', category: 'plant', price: 140, size: [1, 1], actions: ['water'], blurb: 'Trails over the edge of a tall stand.' }),

  // Rugs
  F({ key: 'rug_round', name: 'Round rug', category: 'rug', price: 150, size: [2, 2], flat: true, blurb: 'A braided circle.' }),
  F({ key: 'rug_diamond', name: 'Diamond rug', category: 'rug', price: 300, size: [3, 2], flat: true, blurb: 'Woven border, diamond center.' }),
  F({ key: 'rug_runner', name: 'Runner', category: 'rug', price: 120, size: [3, 1], flat: true, blurb: 'A long striped runner.' }),

  // Faith
  F({ key: 'bible_stand', name: 'Bible on a stand', category: 'faith', price: 120, size: [1, 1], actions: ['quiet'], blurb: 'Opens your quiet time.' }),
  W({ key: 'wall_cross', name: 'Cross', category: 'faith', price: 120, size: [1, 1], blurb: 'A simple wooden cross.' }),
  W({ key: 'wall_scripture', name: 'Scripture art', category: 'faith', price: 180, size: [2, 1], actions: ['look'], blurb: 'A verse you choose, hand-lettered.' }),

  // Wall items
  W({ key: 'frame_s', name: 'Photo frame (small)', category: 'wall', price: 60, size: [1, 1], actions: ['photo'], blurb: 'Holds one of your real photos.' }),
  W({ key: 'frame_m', name: 'Photo frame (wide)', category: 'wall', price: 100, size: [2, 1], actions: ['photo'], blurb: 'A wide frame for a real photo.' }),
  W({ key: 'frame_l', name: 'Photo frame (large)', category: 'wall', price: 150, size: [2, 2], actions: ['photo'], blurb: 'A big square frame for a real photo.' }),
  W({ key: 'frame_xl', name: 'Photo frame (gallery)', category: 'wall', price: 240, size: [3, 2], actions: ['photo'], blurb: 'Your favorite photo, gallery-sized.' }),
  W({ key: 'wall_clock', name: 'Two-time-zone clock', category: 'wall', price: 200, size: [2, 1], actions: ['look'], blurb: 'Your time and theirs, side by side.' }),
  W({ key: 'wall_calendar', name: 'Next-visit calendar', category: 'wall', price: 150, size: [1, 1], actions: ['calendar'], blurb: 'Counts down to when you see each other.' }),
  W({ key: 'wall_corkboard', name: 'Corkboard', category: 'wall', price: 220, size: [2, 2], actions: ['look'], blurb: 'Your latest notes and prayer requests, pinned.' }),
  W({ key: 'wall_shelf', name: 'Wall shelf', category: 'wall', price: 140, size: [2, 1], blurb: 'A plank with a mug and a tiny plant.' }),
  W({ key: 'wall_poster', name: 'Mountain poster', category: 'wall', price: 90, size: [1, 2], blurb: 'Somewhere you want to go together.' }),
  W({ key: 'wall_lights', name: 'String lights', category: 'wall', price: 150, size: [3, 1], light: 0, blurb: 'Warm little bulbs on a wire.' }),

  // Wallpaper patterns
  S({ key: 'wp_plain', name: 'Plain', category: 'wallpaper', price: 0, starter: true, blurb: 'Fresh paint.' }),
  S({ key: 'wp_stripes', name: 'Stripes', category: 'wallpaper', price: 200, blurb: 'Tall pinstripes.' }),
  S({ key: 'wp_flowers', name: 'Little flowers', category: 'wallpaper', price: 250, blurb: 'Tiny four-petal flowers.' }),
  S({ key: 'wp_stars', name: 'Stars', category: 'wallpaper', price: 300, blurb: 'Twinkles in rows.' }),
  S({ key: 'wp_hearts', name: 'Hearts', category: 'wallpaper', price: 300, blurb: 'Small hearts, evenly spaced.' }),
  S({ key: 'wp_planks', name: 'Wood planks', category: 'wallpaper', price: 350, blurb: 'Cabin boards with knots.' }),
  S({ key: 'wp_brick', name: 'Brick', category: 'wallpaper', price: 400, blurb: 'Painted city brick.' }),
  S({ key: 'wp_checker', name: 'Checker', category: 'wallpaper', price: 300, blurb: 'A soft two-tone check.' }),
  S({ key: 'wp_scallop', name: 'Scallop', category: 'wallpaper', price: 350, blurb: 'Rows of fish-scale curves.' }),
  S({ key: 'wp_gingham', name: 'Gingham', category: 'wallpaper', price: 300, blurb: 'Picnic-blanket check.' }),

  // Floors (tiers)
  S({ key: 'fl_plywood', name: 'Worn plywood', category: 'floor', tier: 0, price: 0, starter: true, blurb: 'Scuffed, but it is yours.' }),
  S({ key: 'fl_pine', name: 'Pine planks', category: 'floor', tier: 1, price: 300, blurb: 'Honey-colored boards.' }),
  S({ key: 'fl_parquet', name: 'Oak parquet', category: 'floor', tier: 2, price: 800, blurb: 'Herringbone oak.' }),
  S({ key: 'fl_checker', name: 'Checkered tile', category: 'floor', tier: 3, price: 1500, blurb: 'Diner-style tile.' }),
  S({ key: 'fl_marble', name: 'Marble', category: 'floor', tier: 4, price: 3000, blurb: 'Polished, veined stone.' }),
  S({ key: 'fl_marble_gold', name: 'Marble with gold inlay', category: 'floor', tier: 5, price: 6000, blurb: 'Marble with thin gold lines.' }),

  // Upgrades
  { key: 'up_slots', name: 'Bigger storage box', category: 'upgrade', kind: 'upgrade', price: 300, blurb: '+8 inventory slots. Buy as many as you need.' },
  { key: 'up_curtains', name: 'Window curtains', category: 'upgrade', kind: 'upgrade', unique: true, price: 120, blurb: 'Dress the window. The color follows your theme.' },
];

export const ITEM_BY_KEY: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.key, i]));

export function item(key: string): ItemDef {
  const d = ITEM_BY_KEY[key];
  if (!d) throw new Error(`Unknown item ${key}`);
  return d;
}

export const STARTER_PLACEMENTS = [
  { item: 'bed_mat', x: 0, z: 0, rot: 0 },
  { item: 'light_bulb', x: 1, z: 0, rot: 0 },
] as const;

export const STARTER_COINS = 300;
export const STARTER_SLOTS = 24;
export const SLOT_UPGRADE = 8;

/** Footprint after rotating by rot quarter turns. */
export function footprint(def: ItemDef, rot: number): [number, number] {
  const [w, d] = def.size ?? [1, 1];
  return rot % 2 === 0 ? [w, d] : [d, w];
}
