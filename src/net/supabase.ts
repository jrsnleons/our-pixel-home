// The real backend. Every read and write goes through the `api` edge function, which runs the
// same rules as the preview (src/net/dispatch.ts) on the server and returns this person's
// view of the home. One private Realtime channel per couple carries presence, live moves and
// the server's "something changed" pings.

import { createClient, FunctionsHttpError, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { AvatarLook } from '../engine/art/avatar';
import { ActionError, type AuthUser, type Backend, type Handlers, type Passage, type RpcName, type RpcResult, type Rpcs } from './backend';
import { fetchPassage } from './passage';
import type { LiveMsg, Profile, Snapshot } from './types';

export class SupabaseBackend implements Backend {
  readonly mode = 'online' as const;
  private sb: SupabaseClient;
  private uid: string | null = null;
  private coupleId: string | null = null;
  private partnerId: string | null = null;
  private ch: RealtimeChannel | null = null;
  private signed = new Map<string, { url: string; until: number }>();

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

  async signOut() { await this.ch?.unsubscribe(); await this.sb.auth.signOut(); }

  private async api<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await this.sb.functions.invoke('api', { body: { name, args } });
    if (error) {
      // Rule refusals come back as 400 with a friendly message to show as-is.
      if (error instanceof FunctionsHttpError) {
        const res = error.context as Response;
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        if (res.status === 400 && body?.error) throw new ActionError(body.error);
        if (res.status === 401) throw new ActionError('Your sign-in expired. Sign in again.');
        throw new Error(body?.error ?? `api ${name} failed (${res.status})`);
      }
      throw new ActionError('Couldn’t reach the server. Check your connection.');
    }
    return data as T;
  }

  private remember(s: Snapshot | null) {
    if (!s?.couple) return;
    this.coupleId = s.couple.id;
    this.partnerId = s.couple.a === this.uid ? s.couple.b : s.couple.a;
  }

  async load(): Promise<Snapshot | null> {
    if (!this.uid) await this.user();
    if (!this.uid) return null;
    const { snapshot } = await this.api<{ snapshot: Snapshot | null }>('load');
    this.remember(snapshot);
    if (snapshot) void this.api('touch');
    return snapshot;
  }

  async createProfile(name: string, look: AvatarLook, tz: string): Promise<Profile> {
    return (await this.api<{ profile: Profile }>('create_profile', { name, look, tz })).profile;
  }

  async createCouple(): Promise<Snapshot> {
    const { snapshot } = await this.api<{ snapshot: Snapshot }>('create_couple');
    this.remember(snapshot);
    return snapshot;
  }

  async joinCouple(code: string): Promise<Snapshot> {
    const { snapshot } = await this.api<{ snapshot: Snapshot }>('join_couple', { code });
    this.remember(snapshot);
    return snapshot;
  }

  async call<K extends RpcName>(name: K, args: Rpcs[K]): Promise<RpcResult> {
    const r = await this.api<{ snapshot: Snapshot; result: unknown; coins: number }>(name, args as Record<string, unknown>);
    this.remember(r.snapshot);
    return { ...r.snapshot, result: r.result ?? undefined, coinsEarned: r.coins };
  }

  subscribe(h: Handlers) {
    const cid = this.coupleId;
    if (!cid || !this.uid) return () => {};
    let alive = true;
    let timer = 0;
    // The partner (or the server on their behalf) changed something: fetch our view again.
    const resync = () => {
      clearTimeout(timer);
      timer = window.setTimeout(async () => {
        try { const s = await this.load(); if (s && alive) h.patch(s); } catch (e) { console.warn('resync failed', e); }
      }, 200);
    };
    const ch = this.sb.channel(`couple:${cid}`, { config: { private: true, presence: { key: this.uid }, broadcast: { self: false } } });
    ch.on('broadcast', { event: 'live' }, ({ payload }) => h.live(payload as LiveMsg));
    ch.on('broadcast', { event: 'sync' }, ({ payload }) => { if ((payload as { by?: string })?.by !== this.uid) resync(); });
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<{ at: string }>();
      const theirs = this.partnerId ? state[this.partnerId] : undefined;
      h.presence(!!theirs?.length, theirs?.[0]?.at ?? null);
    });
    void (async () => {
      // Private channels authorize with the signed-in user's token.
      await this.sb.realtime.setAuth();
      if (!alive) return;
      ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') { await ch.track({ at: new Date().toISOString() }); resync(); }
      });
    })();
    this.ch = ch;
    // Heartbeat: the server decides "both here" rewards from it.
    const beat = window.setInterval(() => { if (document.visibilityState === 'visible') void this.api('touch').catch(() => {}); }, 60_000);
    const vis = () => {
      if (document.visibilityState === 'visible') { void ch.track({ at: new Date().toISOString() }); void this.api('touch').catch(() => {}); resync(); }
      else void ch.untrack();
    };
    document.addEventListener('visibilitychange', vis);
    return () => {
      alive = false;
      clearInterval(beat); clearTimeout(timer);
      document.removeEventListener('visibilitychange', vis);
      void ch.unsubscribe();
      this.ch = null;
    };
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
