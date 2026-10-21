// Couple interactions from the interaction wheel. Each one says how the two avatars arrange
// themselves and which frames each plays; the scene turns that into a little paired animation.

import type { ThemeKey } from './themes';
import type { FxKind } from '../engine/fx';

export type Arrange = 'face' | 'side' | 'behind' | 'seat' | 'bed' | 'none';
export type Category = 'affection' | 'playful' | 'cozy' | 'faith' | 'greeting';

export interface InteractionDef {
  id: string;
  label: string;
  category: Category;
  arrange: Arrange;
  /** Frames for the person who started it (a) and the other person (b). */
  a: string[];
  b: string[];
  fps: number;
  seconds: number;
  fx?: { kind: FxKind; on: 'a' | 'b' | 'both' | 'between'; every: number }[];
  /** How far each leans toward the other (world units). */
  lean?: number;
  special?: 'piggyback' | 'carry' | 'twirl' | 'chase' | 'blow' | 'umbrella' | 'hop';
  needs?: { items?: string[]; theme?: ThemeKey; day?: number; quests?: boolean };
  /** One line shown to the partner if they were away. */
  away: string;
}

/** Beds wide enough for two. */
export const DOUBLE_BEDS = ['bed_futon', 'bed_wood', 'bed_quilted', 'bed_canopy'];

export const INTERACTIONS: InteractionDef[] = [
  // Affection
  { id: 'hug', label: 'Hug', category: 'affection', arrange: 'face', a: ['hug'], b: ['hug'], fps: 2, seconds: 3, lean: 0.28, fx: [{ kind: 'heart', on: 'between', every: 0.7 }], away: 'gave you a big hug' },
  { id: 'back_hug', label: 'Back hug', category: 'affection', arrange: 'behind', a: ['hugBack'], b: ['blush'], fps: 2, seconds: 3, lean: 0.3, fx: [{ kind: 'smallheart', on: 'b', every: 0.5 }], away: 'hugged you from behind' },
  { id: 'hold_hands', label: 'Hold hands', category: 'affection', arrange: 'side', a: ['hold'], b: ['holdL'], fps: 2, seconds: 3.5, lean: 0.12, fx: [{ kind: 'smallheart', on: 'between', every: 0.8 }], away: 'held your hand' },
  { id: 'head_pat', label: 'Head pat', category: 'affection', arrange: 'face', a: ['pat', 'pat'], b: ['blush', 'squish'], fps: 3, seconds: 2.5, lean: 0.1, fx: [{ kind: 'sparkle', on: 'b', every: 0.4 }], away: 'patted your head' },
  { id: 'cheek_kiss', label: 'Cheek kiss', category: 'affection', arrange: 'face', a: ['kiss'], b: ['blush'], fps: 2, seconds: 2.4, lean: 0.3, fx: [{ kind: 'heart', on: 'b', every: 0.6 }], away: 'kissed your cheek' },
  { id: 'forehead_kiss', label: 'Forehead kiss', category: 'affection', arrange: 'face', a: ['kiss'], b: ['blink'], fps: 2, seconds: 2.6, lean: 0.3, fx: [{ kind: 'smallheart', on: 'b', every: 0.4 }], needs: { day: 30 }, away: 'kissed your forehead' },
  { id: 'nose_boop', label: 'Nose boop', category: 'affection', arrange: 'face', a: ['point'], b: ['surprised', 'laugh1'], fps: 2, seconds: 1.8, lean: 0.12, fx: [{ kind: 'sparkle', on: 'b', every: 0.6 }], away: 'booped your nose' },
  { id: 'lean_shoulder', label: 'Lean on shoulder', category: 'affection', arrange: 'seat', a: ['sitLean'], b: ['sitHappy'], fps: 1, seconds: 5, lean: 0.12, fx: [{ kind: 'smallheart', on: 'between', every: 1 }], needs: { items: ['seat_loveseat', 'seat_sofa'] }, away: 'leaned on your shoulder' },
  { id: 'cuddle', label: 'Cuddle', category: 'affection', arrange: 'face', a: ['hugBack'], b: ['hug'], fps: 1, seconds: 4.5, lean: 0.34, fx: [{ kind: 'heart', on: 'between', every: 0.9 }], away: 'cuddled up with you' },
  { id: 'blow_kiss', label: 'Blow a kiss', category: 'affection', arrange: 'none', a: ['blow', 'blow2'], b: ['blush'], fps: 2, seconds: 2, special: 'blow', away: 'blew you a kiss' },
  { id: 'heart_hands', label: 'Heart hands', category: 'affection', arrange: 'none', a: ['heart'], b: ['idle'], fps: 1, seconds: 2.2, fx: [{ kind: 'heart', on: 'a', every: 0.5 }], away: 'made a heart for you' },

  // Playful
  { id: 'high_five', label: 'High five', category: 'playful', arrange: 'face', a: ['highfive'], b: ['highfive'], fps: 2, seconds: 1.4, lean: 0.12, fx: [{ kind: 'star', on: 'between', every: 0.7 }], special: 'hop', away: 'high-fived you' },
  { id: 'fist_bump', label: 'Fist bump', category: 'playful', arrange: 'face', a: ['fist'], b: ['fist'], fps: 2, seconds: 1.4, lean: 0.1, fx: [{ kind: 'sparkle', on: 'between', every: 0.7 }], away: 'fist-bumped you' },
  { id: 'tickle', label: 'Tickle', category: 'playful', arrange: 'face', a: ['tickle', 'hug'], b: ['laugh1', 'laugh2'], fps: 6, seconds: 2.6, lean: 0.2, special: 'hop', away: 'tickled you' },
  { id: 'cheek_pinch', label: 'Cheek pinch', category: 'playful', arrange: 'face', a: ['pinch'], b: ['squish'], fps: 2, seconds: 1.8, lean: 0.12, away: 'pinched your cheeks' },
  { id: 'piggyback', label: 'Piggyback ride', category: 'playful', arrange: 'behind', a: ['carry'], b: ['ride'], fps: 2, seconds: 4.5, special: 'piggyback', needs: { quests: true }, away: 'gave you a piggyback ride' },
  { id: 'princess_carry', label: 'Princess carry', category: 'playful', arrange: 'face', a: ['carry'], b: ['laugh1'], fps: 2, seconds: 4, special: 'carry', needs: { day: 100 }, away: 'swept you off your feet' },
  { id: 'twirl', label: 'Twirl', category: 'playful', arrange: 'face', a: ['hold'], b: ['dance1', 'dance2'], fps: 6, seconds: 2.2, fx: [{ kind: 'sparkle', on: 'b', every: 0.25 }], special: 'twirl', away: 'twirled you around' },
  { id: 'slow_dance', label: 'Slow dance', category: 'playful', arrange: 'face', a: ['dance1', 'dance2'], b: ['dance2', 'dance1'], fps: 1.5, seconds: 6, lean: 0.26, fx: [{ kind: 'note', on: 'between', every: 0.8 }], needs: { day: 30 }, away: 'slow danced with you' },
  { id: 'chase', label: 'Chase', category: 'playful', arrange: 'none', a: ['laugh1'], b: ['laugh2'], fps: 4, seconds: 6, special: 'chase', away: 'chased you around the room' },

  // Cozy
  { id: 'sit_together', label: 'Sit together', category: 'cozy', arrange: 'seat', a: ['sitHappy'], b: ['sitHappy'], fps: 1, seconds: 0, needs: { items: ['seat_loveseat', 'seat_sofa', 'bed_futon', 'bed_wood', 'bed_quilted', 'bed_canopy', 'window_seat'] }, away: 'sat down with you' },
  { id: 'nap_together', label: 'Sleep together', category: 'cozy', arrange: 'bed', a: ['lie'], b: ['lie'], fps: 1, seconds: 0, fx: [{ kind: 'zzz', on: 'both', every: 1.4 }], needs: { items: DOUBLE_BEDS }, away: 'lay down next to you' },
  { id: 'feed_snack', label: 'Feed a snack', category: 'cozy', arrange: 'face', a: ['feed'], b: ['eat', 'laugh1'], fps: 2, seconds: 2.4, lean: 0.12, fx: [{ kind: 'crumb', on: 'b', every: 0.3 }], away: 'shared a snack with you' },
  { id: 'umbrella', label: 'Share an umbrella', category: 'cozy', arrange: 'side', a: ['umbrella'], b: ['holdL'], fps: 1, seconds: 5, lean: 0.14, special: 'umbrella', needs: { theme: 'cabin' }, away: 'shared an umbrella with you' },

  // Faith
  { id: 'pray_together', label: 'Pray together', category: 'faith', arrange: 'side', a: ['pray'], b: ['pray'], fps: 1, seconds: 6, lean: 0.1, fx: [{ kind: 'pray', on: 'between', every: 1.2 }], away: 'prayed with you' },

  // Greetings
  { id: 'wave', label: 'Wave', category: 'greeting', arrange: 'none', a: ['wave1', 'wave2'], b: ['wave1', 'wave2'], fps: 4, seconds: 1.8, away: 'waved at you' },
  { id: 'welcome_home', label: 'Welcome home', category: 'greeting', arrange: 'face', a: ['hug'], b: ['hug'], fps: 2, seconds: 3, lean: 0.28, fx: [{ kind: 'heart', on: 'between', every: 0.5 }], special: 'hop', away: 'welcomed you home' },
];

export const INTERACTION_BY_ID: Record<string, InteractionDef> = Object.fromEntries(INTERACTIONS.map((i) => [i.id, i]));

export const CATEGORY_LABEL: Record<Category, string> = { affection: 'Affection', playful: 'Playful', cozy: 'Cozy', faith: 'Faith', greeting: 'Hello' };

export function lockedReason(i: InteractionDef, ctx: { placedItems: Set<string>; theme: ThemeKey; day: number; questsDone: boolean }): string | null {
  const n = i.needs;
  if (!n) return null;
  if (n.items && !n.items.some((k) => ctx.placedItems.has(k))) return n.items === DOUBLE_BEDS ? 'Needs a double bed' : n.items.some((k) => k.startsWith('seat_')) && !n.items.some((k) => k.startsWith('bed_')) ? 'Needs a loveseat or sofa' : 'Needs a sofa or bed';
  if (n.theme && n.theme !== ctx.theme) return 'Only in Rainy Cabin';
  if (n.day && ctx.day < n.day) return `Unlocks on day ${n.day}`;
  if (n.quests && !ctx.questsDone) return 'Finish the starter quests';
  return null;
}
