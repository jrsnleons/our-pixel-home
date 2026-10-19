// The five looks Jerson approved in the prototype. A theme sets the mood of the room
// (lighting, palette, fabrics, UI font); the sky and sun come from each person's local time.

export type ThemeKey = 'honey' | 'matcha' | 'lavender' | 'strawberry' | 'cabin';
export type BlanketPattern = 'quilt' | 'plaid' | 'hearts' | 'stars' | 'gingham';

export interface UiPalette {
  bg: string; panel: string; ink: string; accent: string; accentInk: string; soft: string; muted: string; good: string; bad: string;
}

export interface Theme {
  key: ThemeKey;
  name: string;
  blurb: string;
  font: string;
  fontScale: number;
  outline: string;
  ui: UiPalette;
  wood: string;
  darkWood: string;
  blanket: string;
  blanketPattern: BlanketPattern;
  sheet: string;
  curtain: string;
  cushion: string;
  accent: string;
  metal: string;
  plant: string;
  pot: string;
  books: string[];
  bulbs: string[];
  shade: string;
  wall: { pattern: string; tint: string; trim: string };
  slab: string;
  swatches: string[];
  weather: 'clear' | 'rain';
  mood: {
    lamp: string;
    lampPower: number;
    ambient: string;
    ground: string;
    ambientPower: number;
    bloom: number;
    grade: string;
    gradeAmount: number;
    backdrop: string;
    nightStars: boolean;
  };
  shirtA: string;
  shirtB: string;
}

export const THEMES: Record<ThemeKey, Theme> = {
  honey: {
    key: 'honey', name: 'Honey Lamp', blurb: 'Warm wood, a glowing lamp, amber evenings.',
    font: "'Pixelify Sans'", fontScale: 1, outline: '#3A2418',
    ui: { bg: '#FBF1DC', panel: '#FFF8EA', ink: '#3A2418', accent: '#C8572B', accentInk: '#FFF8EA', soft: '#EBCB98', muted: '#8A6A50', good: '#4F7A2E', bad: '#B0362A' },
    wood: '#A86A3D', darkWood: '#6E4127', blanket: '#E9A23B', blanketPattern: 'quilt', sheet: '#FFF4DE',
    curtain: '#E05A47', cushion: '#D9644A', accent: '#F2B544', metal: '#C9A45C', plant: '#6E8B3D', pot: '#C8643B',
    books: ['#C8572B', '#5B7DB1', '#6E8B3D', '#E9A23B', '#8A4B2A', '#F4DDB2', '#7D4E8C'], bulbs: ['#FFD27A', '#FF9E6A'], shade: '#E05A47',
    wall: { pattern: 'flowers', tint: '#F4DDB2', trim: '#A86A3D' }, slab: '#5A3A24',
    swatches: ['#F4DDB2', '#F2C6A0', '#E8B4A8', '#D7D3A4', '#C9DCC0', '#BFD3E0', '#D9C4E0', '#FFF3E0'],
    weather: 'clear',
    mood: { lamp: '#FFB45A', lampPower: 5.5, ambient: '#FFE2B8', ground: '#5A3A24', ambientPower: 1.0, bloom: 0.45, grade: '#FFE7C2', gradeAmount: 0.12, backdrop: '#1E140D', nightStars: false },
    shirtA: '#5B7DB1', shirtB: '#E07A3F',
  },
  matcha: {
    key: 'matcha', name: 'Matcha Morning', blurb: 'Soft greens, linen, bright clean light.',
    font: "'Tiny5'", fontScale: 1, outline: '#2E3A28',
    ui: { bg: '#F4F1E4', panel: '#FFFDF3', ink: '#2E3A28', accent: '#4F6B3E', accentInk: '#FFFDF3', soft: '#DDE5C8', muted: '#6B7560', good: '#3F6B2E', bad: '#A8452E' },
    wood: '#B08A5E', darkWood: '#7A5C3C', blanket: '#A9C49A', blanketPattern: 'gingham', sheet: '#FFFFF5',
    curtain: '#F2E5C2', cushion: '#9DB383', accent: '#E3B04B', metal: '#B8B49A', plant: '#5F8A4B', pot: '#D9A47A',
    books: ['#E8946A', '#7A9FB5', '#6E8B5A', '#E3B04B', '#B08A5E', '#EFEEDB', '#A47FA0'], bulbs: ['#FFF6D0', '#D9F0C0'], shade: '#F2E5C2',
    wall: { pattern: 'stripes', tint: '#EFEEDB', trim: '#B08A5E' }, slab: '#6B5A3E',
    swatches: ['#EFEEDB', '#DDE5C8', '#C9DCC0', '#F2E5C2', '#E5D5C0', '#CFE0E6', '#E8DDE8', '#FFFFF5'],
    weather: 'clear',
    mood: { lamp: '#FFE9B8', lampPower: 3, ambient: '#F4FFE8', ground: '#7A6A4A', ambientPower: 1.25, bloom: 0.3, grade: '#F2FFE8', gradeAmount: 0.08, backdrop: '#151C12', nightStars: false },
    shirtA: '#E8946A', shirtB: '#7A9FB5',
  },
  lavender: {
    key: 'lavender', name: 'Lavender Night', blurb: 'Dusky violet walls and a starry window.',
    font: "'Jersey 10'", fontScale: 1.25, outline: '#1B1530',
    ui: { bg: '#241C3D', panel: '#322855', ink: '#F4EEFF', accent: '#F2A7C3', accentInk: '#1B1530', soft: '#51447E', muted: '#B8AEDB', good: '#9EE0B4', bad: '#FF9A8A' },
    wood: '#8C6A86', darkWood: '#5A4058', blanket: '#F2A7C3', blanketPattern: 'stars', sheet: '#E8E2FF',
    curtain: '#3A2F66', cushion: '#E58FB4', accent: '#FFD58A', metal: '#C9B8E8', plant: '#6FAE9A', pot: '#B86A8E',
    books: ['#F2A7C3', '#8FB8F2', '#6FAE9A', '#FFD58A', '#8C6A86', '#E8E2FF', '#B07AE0'], bulbs: ['#FFD58A', '#F2A7C3', '#8FB8F2'], shade: '#FFD58A',
    wall: { pattern: 'stars', tint: '#51447E', trim: '#8C6A86' }, slab: '#2A2248',
    swatches: ['#51447E', '#3E3768', '#6A5DA6', '#7A4E7E', '#2F4A6E', '#4E6A8E', '#8A6AA0', '#2A2248'],
    weather: 'clear',
    mood: { lamp: '#FFC870', lampPower: 5, ambient: '#8A7AD0', ground: '#1B1530', ambientPower: 0.8, bloom: 0.6, grade: '#E6DCFF', gradeAmount: 0.1, backdrop: '#0B0818', nightStars: true },
    shirtA: '#8FB8F2', shirtB: '#FFD58A',
  },
  strawberry: {
    key: 'strawberry', name: 'Strawberry Milk', blurb: 'Pink and cream, hearts on the wall.',
    font: "'DotGothic16'", fontScale: 0.95, outline: '#5A2A35',
    ui: { bg: '#FFF4F2', panel: '#FFFFFF', ink: '#5A2A35', accent: '#C93E58', accentInk: '#FFFFFF', soft: '#FFDCE0', muted: '#9A6A72', good: '#3F7A4E', bad: '#B0362A' },
    wood: '#F5C9A8', darkWood: '#C99A7A', blanket: '#FF9EB0', blanketPattern: 'hearts', sheet: '#FFFFFF',
    curtain: '#FFFFFF', cushion: '#FF9EB0', accent: '#E5566F', metal: '#E8C8A0', plant: '#8CC79A', pot: '#FF9EB0',
    books: ['#FF9EB0', '#9AC8F0', '#8CC79A', '#F2B544', '#E5566F', '#FFFFFF', '#C8A0E0'], bulbs: ['#FFFFFF', '#FFC8D3'], shade: '#FFFFFF',
    wall: { pattern: 'hearts', tint: '#FFE8E6', trim: '#F5C9A8' }, slab: '#E5A0A8',
    swatches: ['#FFE8E6', '#FFD0D2', '#FFF0DC', '#E8F4E8', '#E0F0FF', '#F0E4FF', '#FFFFFF', '#FFE0C8'],
    weather: 'clear',
    mood: { lamp: '#FFE0E8', lampPower: 3, ambient: '#FFF0F4', ground: '#C07A86', ambientPower: 1.25, bloom: 0.35, grade: '#FFE8EE', gradeAmount: 0.08, backdrop: '#2A1418', nightStars: false },
    shirtA: '#9AC8F0', shirtB: '#FF9EB0',
  },
  cabin: {
    key: 'cabin', name: 'Rainy Cabin', blurb: 'Plaid, pine planks and rain on the glass.',
    font: "'VT323'", fontScale: 1.3, outline: '#1F2A30',
    ui: { bg: '#E4E9EA', panel: '#F5F7F7', ink: '#1F2A30', accent: '#2F5D7C', accentInk: '#FFFFFF', soft: '#B9C6CB', muted: '#5A6A72', good: '#3F6B3E', bad: '#A8452E' },
    wood: '#B98657', darkWood: '#7A5236', blanket: '#C4513B', blanketPattern: 'plaid', sheet: '#F2EEE6',
    curtain: '#2F5D7C', cushion: '#3E6E8E', accent: '#E9A23B', metal: '#9AA4A8', plant: '#4F7A4A', pot: '#A65A3A',
    books: ['#C4513B', '#3E6E8E', '#4F7A4A', '#E9A23B', '#7A5236', '#F2EEE6', '#6E5A8A'], bulbs: ['#FFC870', '#FFE0A0'], shade: '#E9A23B',
    wall: { pattern: 'planks', tint: '#9A6E4C', trim: '#5A4030' }, slab: '#4A4A48',
    swatches: ['#9A6E4C', '#B0825C', '#7E5638', '#8A8A70', '#6E7E80', '#A88A6A', '#C4A484', '#5A4A3A'],
    weather: 'rain',
    mood: { lamp: '#FFB050', lampPower: 7, ambient: '#9FB5C0', ground: '#3A2A20', ambientPower: 0.75, bloom: 0.55, grade: '#FFE6C8', gradeAmount: 0.1, backdrop: '#0E1214', nightStars: false },
    shirtA: '#C4513B', shirtB: '#E9A23B',
  },
};

export const THEME_ORDER: ThemeKey[] = ['honey', 'matcha', 'lavender', 'strawberry', 'cabin'];
