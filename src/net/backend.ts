// One interface, two implementations: SupabaseBackend (real, two phones) and LocalBackend
// (the on-device preview with a simulated partner, used when no Supabase keys are set).

import type { Surface } from '../core/grid';
import type { AvatarLook } from '../engine/art/avatar';
import type { GameKind, LiveMsg, Patch, Profile, QuestKey, RoomStyleRow, Snapshot } from './types';

export interface Rpcs {
  buy: { item: string };
  place: { invId: string; surface: Surface; x: number; y: number; rot: number };
  move: { pid: string; surface: Surface; x: number; y: number; rot: number };
  store: { pid: string };
  set_style: { style: RoomStyleRow };
  set_look: { look: AvatarLook };
  set_profile: { name?: string; city?: string | null; tz?: string; tourDone?: boolean };
  set_couple: { since?: string | null; nextVisit?: string | null };
  placement_data: { pid: string; patch: Record<string, unknown> };
  water: { pid: string };
  claim_daily: { partnerOnline: boolean };
  together_tick: Record<string, never>;
  heart: Record<string, never>;
  interaction: { id: string };
  nudge: { kind: 'encourage' | 'verse'; text: string; ref?: string };
  notebook_create: { title: string; color: string };
  page_write: { notebookId: string; title: string; body: string };
  page_edit: { pageId: string; title: string; body: string };
  page_delete: { pageId: string };
  prayer_add: { text: string };
  prayer_pray: { id: string };
  prayer_answer: { id: string; note: string };
  prayer_delete: { id: string };
  devotion: { passage: string; reflection: string; shared: boolean };
  quest_claim: { key: QuestKey };
  game_start: { kind: GameKind };
  game_move: { gameId: string; move: number };
  game_resign: { gameId: string };
  draw_word: { gameId: string };
  draw_guess: { gameId: string; guess: string };
  draw_skip: { gameId: string };
  shift_start: { together: boolean };
  shift_finish: { shiftId: string; served: number; missed: number };
  unpair: Record<string, never>;
  restore: Record<string, never>;
}

export type RpcName = keyof Rpcs;

/** What an action returns: the slices that changed plus a small result value. */
export type RpcResult = Patch & { result?: unknown };

export interface AuthUser { id: string; email?: string | null; name?: string | null; avatarUrl?: string | null }

export interface Handlers {
  /** Data changed on the server (often by the partner). */
  patch(p: Patch): void;
  /** A live message from the partner's phone. */
  live(m: LiveMsg): void;
  /** Partner came online or left. */
  presence(online: boolean, lastSeen: string | null): void;
}

export interface Passage { ref: string; verses: { n: number; text: string }[]; copyright: string }

export interface Backend {
  readonly mode: 'preview' | 'online';
  user(): Promise<AuthUser | null>;
  /** Email and password. `create` makes a new account. Throws ActionError with a message to show. */
  signIn(email: string, password: string, create: boolean): Promise<void>;
  signOut(): Promise<void>;
  /** Everything for the home screen, or null when this account has no profile yet. */
  load(): Promise<Snapshot | null>;
  createProfile(name: string, look: AvatarLook, tz: string): Promise<Profile>;
  createCouple(): Promise<Snapshot>;
  joinCouple(code: string): Promise<Snapshot>;
  call<K extends RpcName>(name: K, args: Rpcs[K]): Promise<RpcResult>;
  subscribe(h: Handlers): () => void;
  send(m: LiveMsg): void;
  uploadPhoto(file: Blob): Promise<string>;
  photoUrl(path: string): Promise<string>;
  passage(book: number, chapter: number, from?: number, to?: number): Promise<Passage>;
  /** Preview only: flip the simulated partner online/offline. */
  setPartnerOnline?(online: boolean): void;
}

export class ActionError extends Error {}
