// App state as signals. Every server action goes through `act`, which merges what changed,
// shows earned coins, and turns rule errors into a friendly toast.

import { batch, computed, effect, signal } from '@preact/signals';
import { ITEM_BY_KEY } from '../data/catalog';
import { PIECE_BY_KEY } from '../data/clothes';
import { daysTogether } from '../data/economy';
import type { ThemeKey } from '../data/themes';
import { ActionError, type Backend, type RpcName, type Rpcs } from '../net/backend';
import type { FeedEvent, Patch, Snapshot } from '../net/types';
import { forgetHome, keepHome, keptHome } from './offline';

export type Phase = 'boot' | 'signin' | 'profile' | 'pair' | 'home' | 'archived';
export type Sheet = 'shop' | 'work' | 'decorate' | 'notes' | 'me' | 'quests' | 'feed' | 'wardrobe' | 'realty' | 'bakery' | null;

export interface Prefs {
  theme: ThemeKey;
  effects: boolean;
  battery: boolean;
  sfx: boolean;
  music: number;
  /** Long text and Bible passages in the phone's own fonts instead of pixel. */
  easyRead: boolean;
  /** The town's camera: straight on, or high above. */
  townView: 'front' | 'top';
  /** Town weather: follow the calendar, or pick one. */
  weather: 'auto' | 'clear' | 'rain' | 'snow' | 'mist';
  /** Seen the first-run hints. */
  hints: Record<string, boolean>;
}

const PREFS_KEY = 'oph.prefs';
const defaults: Prefs = { theme: 'honey', effects: true, battery: false, sfx: true, music: 0.5, easyRead: false, townView: 'front', weather: 'auto', hints: {} };

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

/**
 * Pick the screen for where this person is: signed out, no avatar yet, unpaired, or home. The
 * installed app opens straight into the home kept from last time and swaps in the server's copy
 * when it arrives; with no signal, the kept home is what you get until there is one.
 */
export async function route() {
  const online = backend.mode === 'online';
  const u = await backend.user().catch(() => null);
  const kept = !online ? null : u ? keptHome(u.id) : navigator.onLine ? null : keptHome(null);
  const showKept = () => {
    if (!kept?.couple || kept.couple.archivedAt || phase.value === 'home') return false;
    backend.adopt?.(kept);
    snap.value = kept;
    phase.value = 'home';
    return true;
  };
  if (!u) {
    // Signed in before but can't check right now (offline with an expired sign-in): the kept home, until there's signal.
    if (!navigator.onLine && showKept()) { addEventListener('online', () => location.reload(), { once: true }); return; }
    phase.value = 'signin';
    return;
  }
  suggestedName.value = u.name ?? null;
  showKept();
  let s: Snapshot | null;
  try { s = await backend.load(); } catch (e) {
    if (phase.value !== 'home') throw e;
    toast('You’re offline. This is your home as you last saw it.', 'info');
    addEventListener('online', () => void route(), { once: true });
    return;
  }
  if (!s) { phase.value = 'profile'; return; }
  snap.value = s;
  if (!s.couple) phase.value = 'pair';
  else if (s.couple.archivedAt) phase.value = 'archived';
  else phase.value = 'home';
}

/** Sign out, and take this account's kept home off the phone. */
export async function signOut() {
  forgetHome();
  await backend.signOut();
}

export const snap = signal<Snapshot | null>(null);

// Keep the latest home on the phone for the next start (a moment after it settles, not on every change).
let keepTimer = 0;
effect(() => {
  const s = snap.value;
  if (!s?.couple || backend?.mode !== 'online') return;
  clearTimeout(keepTimer);
  keepTimer = window.setTimeout(() => keepHome(s.me.id, s), 1500);
});
export const partnerOnline = signal(false);
export const partnerLastSeen = signal<string | null>(null);
export const sheet = signal<Sheet>(null);
/** Set from Settings to walk through the home screen tour again. */
export const tourReplay = signal(false);
export const busy = signal(false);

/** How many full-screen sheets are open over the room (which isn't drawn while any are). */
export const sceneCovers = signal(0);

/** What the pixel loading screen says while it's up (null: hidden). */
export const loading = signal<string | null>(null);
let loadingDepth = 0;

/** Two frames from now, by which point anything just put on screen has really been painted. */
export const painted = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

/**
 * Show the loading screen while `work` runs. The screen is painted before the work starts, so
 * even work that keeps the phone busy for a moment shows a little walking heart, never a
 * frozen picture. Its animation runs off the main thread, so it keeps moving meanwhile.
 */
export async function withLoading<T>(label: string, work: () => T | Promise<T>): Promise<T> {
  loadingDepth++;
  loading.value = label;
  try {
    await painted();
    return await work();
  } finally {
    if (--loadingDepth === 0) loading.value = null;
  }
}

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

/**
 * Show a change right away, before the server answers: apply `change` to the snapshot now, and
 * put the old one back if the action is refused. Returns what `act` returns.
 */
export async function actOptimistic<K extends RpcName>(name: K, args: Rpcs[K], change: (s: Snapshot) => Snapshot): Promise<unknown> {
  const before = snap.value;
  if (before) snap.value = change(before);
  const r = await act(name, args);
  if (r === undefined && before && snap.value) {
    // Only roll back what we changed; anything that arrived meanwhile stays.
    snap.value = { ...snap.value, placements: before.placements, inventory: before.inventory };
  }
  return r;
}

export function itemName(key: string) { return ITEM_BY_KEY[key]?.name ?? PIECE_BY_KEY[key]?.name.toLowerCase() ?? key; }

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
