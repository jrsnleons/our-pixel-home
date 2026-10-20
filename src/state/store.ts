// App state as signals. Every server action goes through `act`, which merges what changed,
// shows earned coins, and turns rule errors into a friendly toast.

import { batch, computed, signal } from '@preact/signals';
import { ITEM_BY_KEY } from '../data/catalog';
import { daysTogether } from '../data/economy';
import type { ThemeKey } from '../data/themes';
import { ActionError, type Backend, type RpcName, type Rpcs } from '../net/backend';
import type { FeedEvent, Patch, Snapshot } from '../net/types';

export type Phase = 'boot' | 'signin' | 'profile' | 'pair' | 'home' | 'archived';
export type Sheet = 'store' | 'work' | 'decorate' | 'notes' | 'me' | 'quests' | 'feed' | null;

export interface Prefs {
  theme: ThemeKey;
  effects: boolean;
  battery: boolean;
  sfx: boolean;
  music: number;
  /** Seen the first-run hints. */
  hints: Record<string, boolean>;
}

const PREFS_KEY = 'oph.prefs';
const defaults: Prefs = { theme: 'honey', effects: true, battery: false, sfx: true, music: 0.5, hints: {} };

function loadPrefs(): Prefs {
  try { return { ...defaults, ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>) }; } catch { return { ...defaults }; }
}

export const prefs = signal<Prefs>(loadPrefs());
export function setPrefs(p: Partial<Prefs>) {
  prefs.value = { ...prefs.value, ...p };
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs.value)); } catch { /* ignore */ }
}

export let backend: Backend;
export function setBackend(b: Backend) { backend = b; }

export const phase = signal<Phase>('boot');
/** A name to prefill when making the avatar, from the account if it has one. */
export const suggestedName = signal<string | null>(null);

/** Pick the screen for where this person is: signed out, no avatar yet, unpaired, or home. */
export async function route() {
  const u = await backend.user();
  if (!u) { phase.value = 'signin'; return; }
  suggestedName.value = u.name ?? null;
  const s = await backend.load();
  if (!s) { phase.value = 'profile'; return; }
  snap.value = s;
  if (!s.couple) phase.value = 'pair';
  else if (s.couple.archivedAt) phase.value = 'archived';
  else phase.value = 'home';
}
export const snap = signal<Snapshot | null>(null);
export const partnerOnline = signal(false);
export const partnerLastSeen = signal<string | null>(null);
export const sheet = signal<Sheet>(null);
export const busy = signal(false);

export interface Toast { id: number; text: string; kind: 'info' | 'coins' | 'error' | 'love'; coins?: number }
export const toasts = signal<Toast[]>([]);
let toastId = 0;
export function toast(text: string, kind: Toast['kind'] = 'info', coins?: number) {
  const t = { id: ++toastId, text, kind, coins };
  toasts.value = [...toasts.value.slice(-2), t];
  setTimeout(() => { toasts.value = toasts.value.filter((x) => x.id !== t.id); }, kind === 'error' ? 3600 : 2600);
}

export const me = computed(() => snap.value?.me ?? null);
export const partner = computed(() => snap.value?.partner ?? null);
export const couple = computed(() => snap.value?.couple ?? null);
/** Changes only when the couple itself does, so realtime isn't torn down on every patch. */
export const coupleId = computed(() => snap.value?.couple?.id ?? null);
export const coins = computed(() => snap.value?.couple?.coins ?? 0);
export const day = computed(() => daysTogether(snap.value?.couple?.since ?? null));
export const placedKeys = computed(() => new Set((snap.value?.placements ?? []).map((p) => p.item)));

/** Events from the partner that arrived since I last looked at the feed. */
const SEEN_KEY = 'oph.feedSeen';
export const feedSeen = signal<string>(localStorage.getItem(SEEN_KEY) ?? '');
export const unseen = computed<FeedEvent[]>(() => {
  const s = snap.value;
  if (!s?.partner) return [];
  return s.events.filter((e) => e.actor === s.partner!.id && e.createdAt > feedSeen.value);
});
export function markFeedSeen() {
  const last = snap.value?.events.at(-1)?.createdAt ?? new Date().toISOString();
  feedSeen.value = last;
  try { localStorage.setItem(SEEN_KEY, last); } catch { /* ignore */ }
}

export function merge(p: Patch) {
  const cur = snap.value;
  if (!cur) return;
  const { toast: t, coinsEarned, ...rest } = p as Patch & { result?: unknown };
  delete (rest as { result?: unknown }).result;
  batch(() => {
    snap.value = { ...cur, ...rest } as Snapshot;
  });
  if (t) toast(t, 'info');
  if (coinsEarned) toast(`+${coinsEarned}`, 'coins', coinsEarned);
}

/** Run a server action. Returns its result, or undefined if it was refused (a toast explains why). */
export async function act<K extends RpcName>(name: K, args: Rpcs[K], opts: { quiet?: boolean } = {}): Promise<unknown> {
  try {
    const r = await backend.call(name, args);
    const { result, ...patch } = r;
    if (opts.quiet) delete patch.coinsEarned;
    merge(patch);
    return result ?? true;
  } catch (e) {
    const msg = e instanceof ActionError ? e.message : navigator.onLine ? 'Something went wrong. Try again.' : 'You’re offline. Try again when you’re connected.';
    toast(msg, 'error');
    if (!(e instanceof ActionError)) console.error(e);
    return undefined;
  }
}

export function itemName(key: string) { return ITEM_BY_KEY[key]?.name ?? key; }

/** "5 min ago", "yesterday", "3 days ago" */
export function ago(iso: string | null | undefined): string {
  if (!iso) return 'a while ago';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return 'yesterday';
  return `${Math.floor(s / 86400)} days ago`;
}
