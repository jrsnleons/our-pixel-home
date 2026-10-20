// Shapes shared by both backends (Supabase and the on-device preview). Field names follow
// the SQL columns in camelCase.

import type { Placement, Surface } from '../core/grid';
import type { AvatarLook } from '../engine/art/avatar';
import type { SettleState, InteractionPlay } from '../engine/scene';
import type { Tile } from '../core/grid';

export interface Profile {
  id: string;
  name: string;
  look: AvatarLook;
  city: string | null;
  /** IANA time zone, used for the partner clock and for "today" in daily limits. */
  tz: string;
  lastSeen: string | null;
  /** Consecutive days visited (daily visit reward). */
  visitStreak: number;
  devotionStreak: number;
  /** Finished or skipped the guided tour of the home screen (so a new phone doesn't repeat it). */
  tourDone?: boolean;
}

export interface RoomStyleRow {
  wallpaper: string;
  wallTint: string;
  floor: string;
  floorTint: string | null;
}

export interface Couple {
  id: string;
  a: string;
  b: string | null;
  inviteCode: string;
  /** Together-since date, YYYY-MM-DD. */
  since: string | null;
  nextVisit: string | null;
  coins: number;
  slots: number;
  style: RoomStyleRow;
  cafeXp: number;
  archivedAt: string | null;
}

export interface InvRow {
  id: string;
  item: string;
  qty: number;
  data: Record<string, unknown> | null;
}

export interface Notebook { id: string; title: string; color: string; createdBy: string; createdAt: string }
export interface Page { id: string; notebookId: string; author: string; title: string; body: string; createdAt: string; updatedAt: string }

export interface Prayer {
  id: string;
  author: string;
  text: string;
  createdAt: string;
  /** User ids, one entry per "I prayed" tap (newest last). */
  prayedBy: { by: string; at: string }[];
  answeredAt: string | null;
  answerNote: string | null;
}

export interface Devotion {
  id: string;
  author: string;
  day: string;
  passage: string;
  reflection: string;
  shared: boolean;
  createdAt: string;
}

export type EventKind = 'heart' | 'interaction' | 'nudge' | 'buy' | 'note' | 'prayer' | 'prayed' | 'answered' | 'devotion' | 'game' | 'shift' | 'quest' | 'reward' | 'decor' | 'joined' | 'milestone';

export interface FeedEvent {
  id: string;
  actor: string;
  kind: EventKind;
  /** Kind-specific details, e.g. { interaction: 'hug' } or { text: 'Praying for you' }. */
  payload: Record<string, unknown>;
  createdAt: string;
}

export type QuestKey = 'buy_bed' | 'place_table' | 'first_game' | 'first_note' | 'first_quiet' | 'first_heart';

export interface QuestState { key: QuestKey; done: boolean; claimed: boolean }

export type GameKind = 'connect4' | 'tictactoe' | 'draw';

export interface Game {
  id: string;
  kind: GameKind;
  /** Player 1 started the game. */
  p1: string;
  p2: string;
  board: number[];
  turn: string;
  status: 'live' | 'won' | 'draw' | 'resigned';
  winner: string | null;
  winCells: number[];
  /** Draw & Guess: who draws this round, the word length and a hint (the word stays on the server). */
  drawer?: string | null;
  wordLength?: number;
  round?: number;
  scores?: Record<string, number>;
  updatedAt: string;
}

export interface Shift {
  id: string;
  together: boolean;
  startedBy: string;
  startedAt: string;
  status: 'open' | 'done';
  pay?: number;
}

export interface Snapshot {
  me: Profile;
  partner: Profile | null;
  couple: Couple | null;
  placements: Placement[];
  inventory: InvRow[];
  /** Owned styles, outfits, accessories and unique upgrades. */
  unlocks: string[];
  notebooks: Notebook[];
  pages: Page[];
  prayers: Prayer[];
  devotions: Devotion[];
  events: FeedEvent[];
  quests: QuestState[];
  games: Game[];
  /** Coins earned today per reason, for "2 left today" hints. */
  today: Record<string, number>;
}

/** What changed after an action or a remote update; the store merges it in. */
export type Patch = Partial<Omit<Snapshot, 'me'>> & { me?: Profile; toast?: string; coinsEarned?: number };

/** Live, unsaved messages between the two phones. */
export type LiveMsg =
  | { t: 'walk'; from: Tile; path: Tile[] }
  | { t: 'settle'; state: SettleState | null }
  | { t: 'interact'; play: InteractionPlay }
  | { t: 'heart' }
  | { t: 'lamp'; id: string; on: boolean }
  | { t: 'music'; on: boolean; track: number }
  | { t: 'stroke'; game: string; pts: number[]; color: string; size: number }
  | { t: 'clear'; game: string }
  | { t: 'cafe'; shift: string; ev: CafeEvent }
  | { t: 'invite'; what: 'play' | 'shift' | 'draw'; ref?: string; kind?: GameKind; at?: string }
  | { t: 'decor'; placing: { item: string; surface: Surface; x: number; y: number; rot: number } | null };

export type CafeEvent =
  | { k: 'order'; id: number; drink: string; seat: number }
  | { k: 'ready'; id: number }
  | { k: 'served'; id: number; ok: boolean }
  | { k: 'end'; served: number; missed: number };

export interface Presence { userId: string; online: boolean; at: string }
