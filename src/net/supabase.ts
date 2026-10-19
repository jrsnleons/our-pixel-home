// The real backend. Every change goes through a SECURITY DEFINER function (api_*) that
// enforces the same rules as rules.ts; tables are read-only to clients through RLS. One
// realtime channel per couple carries presence, live moves, and table changes.

import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { Placement } from '../core/grid';
import type { AvatarLook } from '../engine/art/avatar';
import { ActionError, type AuthUser, type Backend, type Handlers, type Passage, type RpcName, type RpcResult, type Rpcs } from './backend';
import { fetchPassage } from './passage';
import type { Couple, Devotion, FeedEvent, Game, InvRow, LiveMsg, Notebook, Page, Patch, Prayer, Profile, QuestState, Snapshot } from './types';

type Slice = 'me' | 'partner' | 'couple' | 'placements' | 'inventory' | 'unlocks' | 'notebooks' | 'pages' | 'prayers' | 'devotions' | 'events' | 'quests' | 'games' | 'today';

/** Which parts of the snapshot each action can change, so only those are refetched. */
const REFRESH: Record<RpcName, Slice[]> = {
  buy: ['couple', 'inventory', 'unlocks', 'quests'],
  place: ['placements', 'inventory', 'quests'],
  move: ['placements'],
  store: ['placements', 'inventory', 'quests'],
  set_style: ['couple'],
  set_look: ['me'],
  set_profile: ['me'],
  set_couple: ['couple'],
  placement_data: ['placements'],
  water: ['placements'],
  claim_daily: ['couple', 'me', 'today'],
  together_tick: ['couple', 'today'],
  heart: ['couple', 'quests', 'today'],
  interaction: [],
  nudge: ['events'],
  notebook_create: ['notebooks'],
  page_write: ['pages', 'couple', 'quests', 'today'],
  page_edit: ['pages'],
  page_delete: ['pages'],
  prayer_add: ['prayers'],
  prayer_pray: ['prayers'],
  prayer_answer: ['prayers'],
  prayer_delete: ['prayers'],
  devotion: ['devotions', 'me', 'couple', 'quests', 'today'],
  quest_claim: ['couple', 'quests'],
  game_start: ['games'],
  game_move: ['games', 'couple', 'quests', 'today'],
  game_resign: ['games'],
  draw_word: [],
  draw_guess: ['games', 'couple', 'quests', 'today'],
  draw_skip: ['games', 'couple', 'quests', 'today'],
  shift_start: [],
  shift_finish: ['couple', 'today'],
  unpair: ['couple'],
  restore: ['couple'],
};

/** Table → slice, for realtime changes made by the partner. */
const TABLE_SLICE: Record<string, Slice[]> = {
  couples: ['couple', 'quests'], placements: ['placements', 'quests'], inventory: ['inventory'], unlocks: ['unlocks'],
  notebooks: ['notebooks'], pages: ['pages', 'quests'], prayers: ['prayers'], devotions: ['devotions', 'quests'],
  events: ['events'], games: ['games', 'quests'], profiles: ['partner'],
};

const iso = (v: unknown) => (v == null ? null : String(v));

/* eslint-disable @typescript-eslint/no-explicit-any */
const toProfile = (r: any): Profile => ({ id: r.id, name: r.name, look: r.look, city: r.city, tz: r.tz, lastSeen: iso(r.last_seen), visitStreak: r.visit_streak ?? 0, devotionStreak: r.devotion_streak ?? 0 });
const toCouple = (r: any): Couple => ({ id: r.id, a: r.a, b: r.b, inviteCode: r.invite_code, since: r.since, nextVisit: r.next_visit, coins: r.coins, slots: r.slots, style: r.style, cafeXp: r.cafe_xp, archivedAt: iso(r.archived_at) });
const toPlacement = (r: any): Placement => ({ id: r.id, item: r.item, surface: r.surface, x: r.x, y: r.y, rot: r.rot, data: r.data });
const toInv = (r: any): InvRow => ({ id: r.id, item: r.item, qty: r.qty, data: r.data });
const toNotebook = (r: any): Notebook => ({ id: r.id, title: r.title, color: r.color, createdBy: r.created_by, createdAt: r.created_at });
const toPage = (r: any): Page => ({ id: r.id, notebookId: r.notebook_id, author: r.author, title: r.title, body: r.body, createdAt: r.created_at, updatedAt: r.updated_at });
const toPrayer = (r: any): Prayer => ({ id: r.id, author: r.author, text: r.text, createdAt: r.created_at, prayedBy: r.prayed_by ?? [], answeredAt: iso(r.answered_at), answerNote: r.answer_note });
const toDevotion = (r: any): Devotion => ({ id: r.id, author: r.author, day: r.day, passage: r.passage, reflection: r.reflection, shared: r.shared, createdAt: r.created_at });
const toEvent = (r: any): FeedEvent => ({ id: String(r.id), actor: r.actor, kind: r.kind, payload: r.payload ?? {}, createdAt: r.created_at });
const toGame = (r: any): Game => ({ id: r.id, kind: r.kind, p1: r.p1, p2: r.p2, board: r.board ?? [], turn: r.turn, status: r.status, winner: r.winner, winCells: r.win_cells ?? [], drawer: r.drawer, wordLength: r.word_length, round: r.round, scores: r.scores, updatedAt: r.updated_at });
/* eslint-enable @typescript-eslint/no-explicit-any */

export class SupabaseBackend implements Backend {
  readonly mode = 'online' as const;
  private sb: SupabaseClient;
  private uid: string | null = null;
  private coupleId: string | null = null;
  private partnerId: string | null = null;
  private ch: RealtimeChannel | null = null;
  private signed = new Map<string, { url: string; until: number }>();
  private beat = 0;

  constructor(url: string, key: string) {
    this.sb = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } });
  }

  async user(): Promise<AuthUser | null> {
    const { data } = await this.sb.auth.getSession();
    const u = data.session?.user;
    if (!u) return null;
    this.uid = u.id;
    const meta = u.user_metadata as { full_name?: string; name?: string; avatar_url?: string };
    return { id: u.id, email: u.email, name: meta.full_name ?? meta.name ?? null, avatarUrl: meta.avatar_url ?? null };
  }

  async signIn() {
    const { error } = await this.sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin } });
    if (error) throw error;
  }

  async signOut() { this.ch?.unsubscribe(); await this.sb.auth.signOut(); }

  private async rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await this.sb.rpc(fn, { args });
    if (error) {
      // Rule violations come back as exceptions with a friendly message (SQLSTATE P0001).
      if (error.code === 'P0001') throw new ActionError(error.message);
      throw new Error(error.message);
    }
    return data as T;
  }

  private async fetch(slices: Slice[]): Promise<Patch> {
    const out: Patch = {};
    const cid = this.coupleId!;
    const q = this.sb;
    await Promise.all(slices.map(async (s) => {
      switch (s) {
        case 'me': { const { data } = await q.from('profiles').select('*').eq('id', this.uid!).single(); if (data) out.me = toProfile(data); break; }
        case 'partner': { if (!this.partnerId) { out.partner = null; break; } const { data } = await q.from('profiles').select('*').eq('id', this.partnerId).maybeSingle(); out.partner = data ? toProfile(data) : null; break; }
        case 'couple': { const { data } = await q.from('couples').select('*').eq('id', cid).single(); if (data) { out.couple = toCouple(data); this.partnerId = data.a === this.uid ? data.b : data.a; } break; }
        case 'placements': { const { data } = await q.from('placements').select('*').eq('couple_id', cid); out.placements = (data ?? []).map(toPlacement); break; }
        case 'inventory': { const { data } = await q.from('inventory').select('*').eq('couple_id', cid).order('created_at'); out.inventory = (data ?? []).map(toInv); break; }
        case 'unlocks': { const { data } = await q.from('unlocks').select('item').eq('couple_id', cid); out.unlocks = (data ?? []).map((r) => r.item as string); break; }
        case 'notebooks': { const { data } = await q.from('notebooks').select('*').eq('couple_id', cid).order('created_at'); out.notebooks = (data ?? []).map(toNotebook); break; }
        case 'pages': { const { data } = await q.from('pages').select('*').eq('couple_id', cid).order('created_at'); out.pages = (data ?? []).map(toPage); break; }
        case 'prayers': { const { data } = await q.from('prayers').select('*').eq('couple_id', cid).order('created_at'); out.prayers = (data ?? []).map(toPrayer); break; }
        case 'devotions': { const { data } = await q.from('devotions').select('*').eq('couple_id', cid).order('day', { ascending: false }).limit(120); out.devotions = (data ?? []).map(toDevotion); break; }
        case 'events': { const { data } = await q.from('events').select('*').eq('couple_id', cid).order('created_at', { ascending: false }).limit(100); out.events = (data ?? []).map(toEvent).reverse(); break; }
        case 'quests': out.quests = await this.rpc<QuestState[]>('api_quests'); break;
        case 'games': { const { data } = await q.from('games').select('*').eq('couple_id', cid).order('updated_at', { ascending: false }).limit(10); out.games = (data ?? []).map(toGame).reverse(); break; }
        case 'today': out.today = await this.rpc<Record<string, number>>('api_today'); break;
      }
    }));
    return out;
  }

  async load(): Promise<Snapshot | null> {
    if (!this.uid) await this.user();
    if (!this.uid) return null;
    const { data: me } = await this.sb.from('profiles').select('*').eq('id', this.uid).maybeSingle();
    if (!me) return null;
    void this.rpc('api_touch');
    this.coupleId = me.couple_id;
    const empty: Snapshot = { me: toProfile(me), partner: null, couple: null, placements: [], inventory: [], unlocks: [], notebooks: [], pages: [], prayers: [], devotions: [], events: [], quests: [], games: [], today: {} };
    if (!this.coupleId) return empty;
    const c = await this.fetch(['couple']);
    const rest = await this.fetch(['partner', 'placements', 'inventory', 'unlocks', 'notebooks', 'pages', 'prayers', 'devotions', 'events', 'quests', 'games', 'today']);
    return { ...empty, ...c, ...rest } as Snapshot;
  }

  async createProfile(name: string, look: AvatarLook, tz: string): Promise<Profile> {
    const r = await this.rpc('api_create_profile', { name, look, tz });
    return toProfile(r);
  }

  async createCouple(): Promise<Snapshot> {
    await this.rpc('api_create_couple');
    return (await this.load())!;
  }

  async joinCouple(code: string): Promise<Snapshot> {
    await this.rpc('api_join_couple', { code: code.trim().toUpperCase() });
    return (await this.load())!;
  }

  async call<K extends RpcName>(name: K, args: Rpcs[K]): Promise<RpcResult> {
    const r = await this.rpc<{ result?: unknown; coins?: number; toast?: string } | null>(`api_${name}`, args as Record<string, unknown>);
    const patch = REFRESH[name].length ? await this.fetch(REFRESH[name]) : {};
    return { ...patch, result: r?.result, coinsEarned: r?.coins ?? 0, toast: r?.toast };
  }

  subscribe(h: Handlers) {
    const cid = this.coupleId;
    if (!cid || !this.uid) return () => {};
    const pending = new Set<Slice>();
    let timer = 0;
    const refresh = (slices: Slice[]) => {
      slices.forEach((s) => pending.add(s));
      clearTimeout(timer);
      timer = window.setTimeout(async () => { const s = [...pending]; pending.clear(); h.patch(await this.fetch(s)); }, 250);
    };
    const ch = this.sb.channel(`couple:${cid}`, { config: { presence: { key: this.uid }, broadcast: { self: false } } });
    for (const table of Object.keys(TABLE_SLICE)) {
      const filter = table === 'couples' ? `id=eq.${cid}` : table === 'profiles' ? `couple_id=eq.${cid}` : `couple_id=eq.${cid}`;
      ch.on('postgres_changes', { event: '*', schema: 'public', table, filter }, () => refresh(TABLE_SLICE[table]));
    }
    ch.on('broadcast', { event: 'live' }, ({ payload }) => h.live(payload as LiveMsg));
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<{ at: string }>();
      const theirs = this.partnerId ? state[this.partnerId] : undefined;
      h.presence(!!theirs?.length, theirs?.[0]?.at ?? null);
    });
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await ch.track({ at: new Date().toISOString() });
    });
    this.ch = ch;
    // Last-seen heartbeat: the server uses it to check "both online" rewards.
    this.beat = window.setInterval(() => { if (document.visibilityState === 'visible') void this.rpc('api_touch'); }, 60_000);
    const vis = () => { if (document.visibilityState === 'visible') { void ch.track({ at: new Date().toISOString() }); void this.rpc('api_touch'); } else void ch.untrack(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(this.beat); document.removeEventListener('visibilitychange', vis); void ch.unsubscribe(); this.ch = null; };
  }

  send(m: LiveMsg) {
    void this.ch?.send({ type: 'broadcast', event: 'live', payload: m });
  }

  async uploadPhoto(file: Blob): Promise<string> {
    const path = `${this.coupleId}/${crypto.randomUUID()}.jpg`;
    const { error } = await this.sb.storage.from('photos').upload(path, file, { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
    return path;
  }

  async photoUrl(path: string): Promise<string> {
    const hit = this.signed.get(path);
    if (hit && hit.until > Date.now()) return hit.url;
    const { data, error } = await this.sb.storage.from('photos').createSignedUrl(path, 3600);
    if (error || !data) return '';
    this.signed.set(path, { url: data.signedUrl, until: Date.now() + 3_300_000 });
    return data.signedUrl;
  }

  passage(book: number, chapter: number, from?: number, to?: number): Promise<Passage> {
    return fetchPassage(book, chapter, from, to);
  }
}
