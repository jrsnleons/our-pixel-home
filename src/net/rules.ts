// The game's rules as plain functions over a couple's whole world. The preview backend runs
// them in the browser and the `api` edge function runs the very same code on the server
// (via src/net/dispatch.ts); tests/rules.test.ts pins the behaviour.

import { applyMove, emptyBoard, outcome, type GameKind as BoardKind } from '../core/boardgames';
import { canPlace, cellsOf, findFreeSpot, type Placement, type Surface } from '../core/grid';
import { layoutOf } from '../core/layout';
import { ITEM_BY_KEY, SLOT_UPGRADE, STARTER_COINS, STARTER_PLACEMENTS, STARTER_SLOTS, type ItemDef } from '../data/catalog';
import { DAILY_LIMITS, QUESTS, REWARDS, SHIFT, jobLevel, milestone, shiftPayout } from '../data/economy';
import { JOB_KEYS, JOBS, jobLock, jobXp, type JobKey } from '../data/jobs';
import { cleanWear, colorPrice, onSale, ownedClothes, parseWorn, PIECES, wearOf, worn, type Wear } from '../data/clothes';
import { INTERACTION_BY_ID } from '../data/interactions';
import { DRAW_ROUNDS, DRAW_WORDS, normalizeGuess } from '../data/words';
import type { AvatarLook } from '../engine/art/avatar';
import type { Couple, Devotion, EventKind, FeedEvent, Game, GameKind, InvRow, Notebook, Page, Prayer, Profile, QuestKey, QuestState, RoomStyleRow, Shift } from './types';

export class RuleError extends Error {}

export interface LedgerRow { user: string; reason: string; amount: number; day: string; at: string }

export interface World {
  profiles: Record<string, Profile>;
  couple: Couple;
  placements: Placement[];
  inventory: InvRow[];
  unlocks: string[];
  notebooks: Notebook[];
  pages: Page[];
  prayers: Prayer[];
  devotions: Devotion[];
  events: FeedEvent[];
  ledger: LedgerRow[];
  questsClaimed: QuestKey[];
  stats: { gamesFinished: number; hearts: number };
  games: Game[];
  /** Draw & Guess secret words by game id (server-only). */
  words: Record<string, string>;
  shifts: (Shift & { served?: number; missed?: number; finishedBy?: string[] })[];
  lastTogether: string | null;
  /** Day each profile last claimed the daily visit (for streaks). */
  lastVisit: Record<string, string>;
}

export interface Ctx { w: World; me: string; now: Date; id: () => string }

// ---------- helpers ----------

/** Calendar day in a time zone, YYYY-MM-DD. */
export function dayIn(tz: string, d: Date): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function prevDay(day: string): string {
  const t = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) - 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

const today = (c: Ctx, user = c.me) => dayIn(c.w.profiles[user]?.tz ?? 'UTC', c.now);
const partnerOf = (c: Ctx) => (c.w.couple.a === c.me ? c.w.couple.b : c.w.couple.a);

function event(c: Ctx, kind: EventKind, payload: Record<string, unknown> = {}) {
  c.w.events.push({ id: c.id(), actor: c.me, kind, payload, createdAt: c.now.toISOString() });
  if (c.w.events.length > 200) c.w.events.splice(0, c.w.events.length - 200);
}

/** Today's total for a capped reason, counted per person or for the couple. */
export function earnedToday(w: World, user: string, reason: string, day: string): { count: number; coins: number } {
  const scope = DAILY_LIMITS[reason]?.scope ?? 'user';
  let count = 0, coins = 0;
  for (const l of w.ledger) {
    if (l.reason !== reason || l.day !== day) continue;
    if (scope === 'user' && l.user !== user) continue;
    count++; coins += l.amount;
  }
  return { count, coins };
}

/** Pay into the shared wallet, respecting daily limits. Returns what was actually paid. */
function award(c: Ctx, reason: string, coins: number): number {
  const day = today(c);
  const lim = DAILY_LIMITS[reason];
  if (lim) {
    const got = earnedToday(c.w, c.me, reason, day);
    if (lim.count != null && got.count >= lim.count) return 0;
    if (lim.coins != null) coins = Math.min(coins, lim.coins - got.coins);
  }
  if (coins <= 0) return 0;
  c.w.couple.coins += coins;
  c.w.ledger.push({ user: c.me, reason, amount: coins, day, at: c.now.toISOString() });
  return coins;
}

function spend(c: Ctx, coins: number, reason: string) {
  if (c.w.couple.coins < coins) throw new RuleError('Not enough coins yet.');
  c.w.couple.coins -= coins;
  c.w.ledger.push({ user: c.me, reason, amount: -coins, day: today(c), at: c.now.toISOString() });
}

export function slotsUsed(inv: InvRow[]): number {
  return inv.reduce((n, r) => n + (ITEM_BY_KEY[r.item]?.stacks ? 1 : r.qty), 0);
}

function def(key: string): ItemDef {
  const d = ITEM_BY_KEY[key];
  if (!d) throw new RuleError('That item doesn’t exist.');
  return d;
}

// ---------- setup ----------

export function newWorld(me: Profile, coupleId: string, inviteCode: string, id: () => string): World {
  const placements: Placement[] = STARTER_PLACEMENTS.map((p) => ({ id: id(), item: p.item, surface: 'floor', x: p.x, y: p.z, rot: p.rot, data: null }));
  return {
    profiles: { [me.id]: me },
    couple: { id: coupleId, a: me.id, b: null, inviteCode, since: null, nextVisit: null, coins: STARTER_COINS, slots: STARTER_SLOTS, style: { wallpaper: 'wp_plain', wallTint: '', floor: 'fl_plywood', floorTint: null }, cafeXp: 0, archivedAt: null },
    placements,
    inventory: [],
    unlocks: Object.values(ITEM_BY_KEY).filter((d) => d.kind === 'style' && d.starter).map((d) => d.key),
    notebooks: [{ id: id(), title: 'Our dates', color: '#E8A0A8', createdBy: me.id, createdAt: new Date().toISOString() }, { id: id(), title: 'Letters', color: '#A8C8E8', createdBy: me.id, createdAt: new Date().toISOString() }],
    pages: [], prayers: [], devotions: [], events: [], ledger: [], questsClaimed: [],
    stats: { gamesFinished: 0, hearts: 0 }, games: [], words: {}, shifts: [], lastTogether: null, lastVisit: {},
  };
}

export function joinCouple(c: Ctx, profile: Profile) {
  if (c.w.couple.b && c.w.couple.b !== profile.id) throw new RuleError('This home already has two people.');
  c.w.couple.b = profile.id;
  c.w.profiles[profile.id] = profile;
  event({ ...c, me: profile.id }, 'joined');
}

export function setCouple(c: Ctx, patch: { since?: string | null; nextVisit?: string | null }) {
  const ok = (d: string | null | undefined) => d == null || /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (!ok(patch.since) || !ok(patch.nextVisit)) throw new RuleError('Pick a date.');
  if (patch.since !== undefined) c.w.couple.since = patch.since;
  if (patch.nextVisit !== undefined) c.w.couple.nextVisit = patch.nextVisit;
}

// ---------- store & inventory ----------

export function buy(c: Ctx, key: string): { invId?: string } {
  const d = def(key);
  if (d.starter && d.price === 0) throw new RuleError('You already have this.');
  if (d.kind === 'style' || (d.kind === 'upgrade' && d.unique)) {
    if (c.w.unlocks.includes(key)) throw new RuleError('You already own this.');
    spend(c, d.price, `buy:${key}`);
    c.w.unlocks.push(key);
    event(c, 'buy', { item: key });
    return {};
  }
  if (d.kind === 'upgrade') {
    spend(c, d.price, `buy:${key}`);
    if (key === 'up_slots') c.w.couple.slots += SLOT_UPGRADE;
    event(c, 'buy', { item: key });
    return {};
  }
  const stackRow = d.stacks ? c.w.inventory.find((r) => r.item === key) : undefined;
  if (!stackRow && slotsUsed(c.w.inventory) >= c.w.couple.slots) throw new RuleError('Your storage box is full. Place something or buy more space.');
  spend(c, d.price, `buy:${key}`);
  let invId: string;
  if (stackRow) { stackRow.qty++; invId = stackRow.id; }
  else { invId = c.id(); c.w.inventory.push({ id: invId, item: key, qty: 1, data: null }); }
  event(c, 'buy', { item: key });
  return { invId };
}

export function place(c: Ctx, invId: string, spot: { surface: Surface; x: number; y: number; rot: number }): string {
  const row = c.w.inventory.find((r) => r.id === invId);
  if (!row) throw new RuleError('That item isn’t in your storage box.');
  const d = def(row.item);
  const fit = canPlace(d, spot, c.w.placements, { layout: layoutOf(c.w.couple.home) });
  if (!fit.ok) throw new RuleError(fit.reason);
  const id = c.id();
  c.w.placements.push({ id, item: row.item, surface: spot.surface, x: spot.x, y: spot.y, rot: ((spot.rot % 4) + 4) % 4, data: row.data });
  if (row.qty > 1) row.qty--; else c.w.inventory.splice(c.w.inventory.indexOf(row), 1);
  return id;
}

export function move(c: Ctx, pid: string, spot: { surface: Surface; x: number; y: number; rot: number }) {
  const p = c.w.placements.find((q) => q.id === pid);
  if (!p) throw new RuleError('That item was moved or stored.');
  const fit = canPlace(def(p.item), spot, c.w.placements, { ignoreId: pid, layout: layoutOf(c.w.couple.home) });
  if (!fit.ok) throw new RuleError(fit.reason);
  Object.assign(p, { surface: spot.surface, x: spot.x, y: spot.y, rot: ((spot.rot % 4) + 4) % 4 });
}

export function store(c: Ctx, pid: string) {
  const i = c.w.placements.findIndex((q) => q.id === pid);
  if (i < 0) throw new RuleError('That item was already stored.');
  const p = c.w.placements[i];
  const d = def(p.item);
  const stackRow = d.stacks ? c.w.inventory.find((r) => r.item === p.item) : undefined;
  if (!stackRow && slotsUsed(c.w.inventory) >= c.w.couple.slots) throw new RuleError('Your storage box is full.');
  c.w.placements.splice(i, 1);
  if (stackRow) stackRow.qty++;
  else c.w.inventory.push({ id: c.id(), item: p.item, qty: 1, data: p.data ?? null });
}

/** Put a stored item into the room at the first free spot (used by "Place" in the box). */
export function autoSpot(w: World, item: string) {
  return findFreeSpot(def(item), w.placements, [], layoutOf(w.couple.home));
}

export function setStyle(c: Ctx, style: RoomStyleRow) {
  for (const k of [style.wallpaper, style.floor]) if (!c.w.unlocks.includes(k)) throw new RuleError('Buy that style in the store first.');
  if (!/^(#[0-9a-fA-F]{6})?$/.test(style.wallTint) || !(style.floorTint == null || /^#[0-9a-fA-F]{6}$/.test(style.floorTint))) throw new RuleError('Pick a swatch.');
  c.w.couple.style = { wallpaper: style.wallpaper, wallTint: style.wallTint, floor: style.floor, floorTint: style.floorTint ?? null };
  event(c, 'decor', {});
}

export function setProfile(c: Ctx, patch: { name?: string; city?: string | null; tz?: string; tourDone?: boolean }) {
  const me = c.w.profiles[c.me];
  if (patch.name !== undefined) {
    const n = patch.name.trim().slice(0, 24);
    if (!n) throw new RuleError('What should your partner call you?');
    me.name = n;
  }
  if (patch.city !== undefined) me.city = patch.city ? patch.city.trim().slice(0, 40) || null : null;
  if (patch.tz !== undefined) {
    if (!validTz(patch.tz)) throw new RuleError('That time zone isn’t right.');
    me.tz = patch.tz;
  }
  if (patch.tourDone === true) me.tourDone = true;
}

export function validTz(tz: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz.length <= 64; } catch { return false; }
}

/** Changing clothes happens at a clothes rack, mirror or wardrobe in the room. */
export function hasWardrobe(w: { placements: Placement[] }): boolean {
  return w.placements.some((p) => ITEM_BY_KEY[p.item]?.actions?.includes('wardrobe'));
}

function needWardrobe(c: Ctx) {
  if (!hasWardrobe(c.w)) throw new RuleError('Put a clothes rack, mirror or wardrobe in your room first.');
}

/** Every piece must be bought, or already on the person wearing it (so nobody is made to undress). */
function mustOwn(w: World, wear: Wear, on: AvatarLook) {
  const own = ownedClothes(w.unlocks);
  const already = Object.values(wearOf(on));
  for (const v of Object.values(wear)) if (v && !own.has(v) && !already.includes(v)) throw new RuleError('Buy that in the store first.');
}

export function setLook(c: Ctx, look: AvatarLook) {
  needWardrobe(c);
  const l = cleanLook(look);
  mustOwn(c.w, l.wear, c.w.profiles[c.me].look);
  c.w.profiles[c.me].look = l;
}

/** Only the fields an avatar has, in range. Looks arrive from the network on the server. */
export function cleanLook(look: AvatarLook): AvatarLook {
  const n = (v: unknown, max: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max ? (v as number) : 0);
  const k = (v: unknown, fallback: string) => (typeof v === 'string' && /^[a-z0-9_]{1,24}$/.test(v) ? v : fallback);
  if (!look || typeof look !== 'object') throw new RuleError('Pick a look first.');
  return {
    body: look.body === 'girl' ? 'girl' : 'guy',
    skin: n(look.skin, 9), hair: k(look.hair, 'short'), hairColor: n(look.hairColor, 15), wear: wearOf(look), eyes: n(look.eyes, 9),
    freckles: look.freckles === true, blush: look.blush === true,
  };
}

/** One colorway of a piece: on the basics rack or this week's Boutique, half price if you own another color. */
export function buyClothes(c: Ctx, key: string, color: number) {
  const p = parseWorn(worn(key, color));
  if (!p) throw new RuleError('That piece doesn’t exist.');
  if (!onSale(key, c.now)) throw new RuleError('That’s gone from the Boutique. It may come back another week.');
  const own = ownedClothes(c.w.unlocks);
  if (own.has(worn(key, color))) throw new RuleError('You already own this.');
  spend(c, colorPrice(own, key), `buy:${key}`);
  c.w.unlocks.push(worn(key, color));
  event(c, 'buy', { item: key, color });
}

export const SAVED_LOOKS = 4;

export function saveLook(c: Ctx, index: number, wear: Wear | null) {
  needWardrobe(c);
  if (!Number.isInteger(index) || index < 0 || index >= SAVED_LOOKS) throw new RuleError('Pick a slot.');
  const me = c.w.profiles[c.me];
  const saved = (me.saved ?? []).slice(0, SAVED_LOOKS);
  while (saved.length < SAVED_LOOKS) saved.push(null);
  saved[index] = wear ? cleanWear(wear) : null;
  me.saved = saved;
}

/** Pick an outfit for your partner. It waits for them to wear it or say "maybe later". */
export function giftLook(c: Ctx, wear: Wear) {
  needWardrobe(c);
  const them = partnerOf(c);
  if (!them || !c.w.profiles[them]) throw new RuleError('Your partner hasn’t moved in yet.');
  const w = cleanWear(wear);
  mustOwn(c.w, w, c.w.profiles[them].look);
  c.w.profiles[them].gift = { wear: w, from: c.me, at: c.now.toISOString() };
  event(c, 'outfit', {});
}

export function answerGift(c: Ctx, accept: boolean) {
  const me = c.w.profiles[c.me];
  if (!me.gift) throw new RuleError('There’s no outfit waiting.');
  if (accept) {
    mustOwn(c.w, me.gift.wear, me.look);
    me.look = { ...cleanLook(me.look), wear: me.gift.wear };
  }
  me.gift = null;
}

const ALLOWED_DATA = ['photo', 'pixelate', 'verse', 'caption', 'takenAt'];

export function setPlacementData(c: Ctx, pid: string, patch: Record<string, unknown>) {
  const p = c.w.placements.find((q) => q.id === pid);
  if (!p) throw new RuleError('That item was moved or stored.');
  for (const k of Object.keys(patch)) if (!ALLOWED_DATA.includes(k)) throw new RuleError('Can’t change that.');
  p.data = { ...(p.data ?? {}), ...patch };
}

export function water(c: Ctx, pid: string): number {
  const p = c.w.placements.find((q) => q.id === pid);
  if (!p || def(p.item).category !== 'plant') throw new RuleError('That isn’t a plant.');
  const day = today(c);
  const data = (p.data ?? {}) as { water?: number; lastWater?: string };
  if (data.lastWater === day) throw new RuleError('Already watered today. It’ll be thirsty tomorrow.');
  p.data = { ...data, water: (data.water ?? 0) + 1, lastWater: day };
  return (data.water ?? 0) + 1;
}

// ---------- daily rewards & presence ----------

/** The first open of the day: visit reward, streak milestones, and "both online" if the partner is here. */
export function claimDaily(c: Ctx, partnerOnline: boolean): { coins: number; lines: string[] } {
  const lines: string[] = [];
  let coins = 0;
  const day = today(c);
  const me = c.w.profiles[c.me];
  if (c.w.lastVisit[c.me] !== day) {
    me.visitStreak = c.w.lastVisit[c.me] === prevDay(day) ? me.visitStreak + 1 : 1;
    c.w.lastVisit[c.me] = day;
    const v = award(c, 'daily_visit', REWARDS.dailyVisit.coins);
    if (v) { coins += v; lines.push(`Daily visit +${v}`); }
    for (const s of REWARDS.streaks) {
      if (me.visitStreak === s.days && !c.w.ledger.some((l) => l.user === c.me && l.reason === `streak_${s.days}`)) {
        coins += award(c, `streak_${s.days}`, s.coins);
        lines.push(`${s.days}-day streak +${s.coins}`);
      }
    }
  }
  // Anniversaries, hundredth days and monthsaries pay once for the two of you, whoever opens first.
  const ms = c.w.couple.b ? milestone(c.w.couple.since, day) : null;
  const msKey = `milestone_${day}`;
  if (ms && !c.w.ledger.some((l) => l.reason === msKey)) {
    const got = award(c, msKey, ms.coins);
    coins += got;
    lines.push(`${ms.label}! +${got}`);
    event(c, 'milestone', { label: ms.label });
  }
  if (partnerOnline) {
    const b = award(c, 'both_online', REWARDS.bothOnline.coins);
    if (b) { coins += b; lines.push(`Both here today +${b}`); }
  }
  return { coins, lines };
}

/** Together time: called by whoever is online when 10 minutes have passed with both present. */
export function togetherTick(c: Ctx, partnerOnline: boolean): number {
  if (!partnerOnline) return 0;
  const last = c.w.lastTogether ? Date.parse(c.w.lastTogether) : 0;
  if (c.now.getTime() - last < REWARDS.together.everyMinutes * 60_000 - 15_000) return 0;
  c.w.lastTogether = c.now.toISOString();
  return award(c, 'together', REWARDS.together.coins);
}

export function heart(c: Ctx): number {
  c.w.stats.hearts++;
  event(c, 'heart');
  return award(c, 'heart', REWARDS.heart.coins);
}

export function interaction(c: Ctx, id: string, ctx: { day: number; theme: string }) {
  const i = INTERACTION_BY_ID[id];
  if (!i) throw new RuleError('Unknown interaction.');
  const n = i.needs;
  if (n?.items && !n.items.some((k) => c.w.placements.some((p) => p.item === k))) throw new RuleError('You need the right furniture for that.');
  if (n?.day && ctx.day < n.day) throw new RuleError(`Unlocks on day ${n.day}.`);
  if (n?.quests && questStates(c.w).some((q) => !q.claimed)) throw new RuleError('Finish the starter quests first.');
  event(c, 'interaction', { id });
}

export function nudge(c: Ctx, kind: 'encourage' | 'verse', text: string, ref?: string) {
  const t = text.trim().slice(0, 280);
  if (!t) throw new RuleError('Write a few words first.');
  event(c, 'nudge', { kind, text: t, ref: ref?.slice(0, 40) ?? null });
}

// ---------- notes, prayer, quiet time ----------

export function notebookCreate(c: Ctx, title: string, color: string): string {
  const t = title.trim().slice(0, 40);
  if (!t) throw new RuleError('Give it a name.');
  if (c.w.notebooks.length >= 20) throw new RuleError('That’s a lot of notebooks. Reuse one?');
  const id = c.id();
  c.w.notebooks.push({ id, title: t, color, createdBy: c.me, createdAt: c.now.toISOString() });
  return id;
}

export function pageWrite(c: Ctx, notebookId: string, title: string, body: string): { id: string; coins: number } {
  if (!c.w.notebooks.some((n) => n.id === notebookId)) throw new RuleError('That notebook is gone.');
  const b = body.trim().slice(0, 4000);
  if (b.length < 3) throw new RuleError('Write a little more first.');
  const id = c.id();
  const at = c.now.toISOString();
  c.w.pages.push({ id, notebookId, author: c.me, title: title.trim().slice(0, 60), body: b, createdAt: at, updatedAt: at });
  event(c, 'note', { notebookId, pageId: id, title: title.trim().slice(0, 60) });
  // Short pages don't pay, so the reward rewards writing rather than tapping.
  const coins = b.length >= 20 ? award(c, 'notebook_page', REWARDS.notebookPage.coins) : 0;
  return { id, coins };
}

export function pageEdit(c: Ctx, pageId: string, title: string, body: string) {
  const p = c.w.pages.find((q) => q.id === pageId);
  if (!p) throw new RuleError('That page is gone.');
  if (p.author !== c.me) throw new RuleError('Only the writer can edit a page.');
  p.title = title.trim().slice(0, 60);
  p.body = body.trim().slice(0, 4000);
  p.updatedAt = c.now.toISOString();
}

export function pageDelete(c: Ctx, pageId: string) {
  const i = c.w.pages.findIndex((q) => q.id === pageId);
  if (i < 0) return;
  if (c.w.pages[i].author !== c.me) throw new RuleError('Only the writer can delete a page.');
  c.w.pages.splice(i, 1);
}

export function prayerAdd(c: Ctx, text: string): string {
  const t = text.trim().slice(0, 500);
  if (!t) throw new RuleError('What should you pray about?');
  const id = c.id();
  c.w.prayers.push({ id, author: c.me, text: t, createdAt: c.now.toISOString(), prayedBy: [], answeredAt: null, answerNote: null });
  event(c, 'prayer', { id, text: t.slice(0, 80) });
  return id;
}

export function prayerPray(c: Ctx, id: string) {
  const p = c.w.prayers.find((q) => q.id === id);
  if (!p) throw new RuleError('That request is gone.');
  p.prayedBy.push({ by: c.me, at: c.now.toISOString() });
  if (p.prayedBy.length > 100) p.prayedBy.shift();
  event(c, 'prayed', { id, text: p.text.slice(0, 80) });
}

export function prayerAnswer(c: Ctx, id: string, note: string) {
  const p = c.w.prayers.find((q) => q.id === id);
  if (!p) throw new RuleError('That request is gone.');
  p.answeredAt = c.now.toISOString();
  p.answerNote = note.trim().slice(0, 300) || null;
  event(c, 'answered', { id, text: p.text.slice(0, 80) });
}

export function prayerDelete(c: Ctx, id: string) {
  const i = c.w.prayers.findIndex((q) => q.id === id);
  if (i < 0) return;
  if (c.w.prayers[i].author !== c.me) throw new RuleError('Only the person who asked can remove it.');
  c.w.prayers.splice(i, 1);
}

/** Personal quiet time check-in. One per day; the streak counts consecutive days. */
export function devotion(c: Ctx, passage: string, reflection: string, shared: boolean): { coins: number; streak: number } {
  const pas = passage.trim().slice(0, 80);
  if (!pas) throw new RuleError('What did you read?');
  const day = today(c);
  if (c.w.devotions.some((d) => d.author === c.me && d.day === day)) throw new RuleError('You already checked in today. See you tomorrow.');
  const me = c.w.profiles[c.me];
  const yesterday = prevDay(day);
  me.devotionStreak = c.w.devotions.some((d) => d.author === c.me && d.day === yesterday) ? me.devotionStreak + 1 : 1;
  c.w.devotions.push({ id: c.id(), author: c.me, day, passage: pas, reflection: reflection.trim().slice(0, 2000), shared, createdAt: c.now.toISOString() });
  event(c, 'devotion', { passage: pas, shared, streak: me.devotionStreak });
  return { coins: award(c, 'devotion', REWARDS.devotion.coins), streak: me.devotionStreak };
}

// ---------- quests ----------

export function questStates(w: World): QuestState[] {
  const has = (cat: string, minTier = 0) => [...w.placements.map((p) => p.item), ...w.inventory.map((r) => r.item)].some((k) => ITEM_BY_KEY[k]?.category === cat && (ITEM_BY_KEY[k]?.tier ?? 0) >= minTier);
  const done: Record<QuestKey, boolean> = {
    buy_bed: has('bed', 1),
    place_table: w.placements.some((p) => ITEM_BY_KEY[p.item]?.category === 'table'),
    first_game: w.stats.gamesFinished > 0,
    first_note: w.pages.length > 0,
    first_quiet: w.devotions.length > 0,
    first_heart: w.stats.hearts > 0,
  };
  return QUESTS.map((q) => ({ key: q.key, done: done[q.key], claimed: w.questsClaimed.includes(q.key) }));
}

export function questClaim(c: Ctx, key: QuestKey): number {
  const q = questStates(c.w).find((s) => s.key === key);
  if (!q) throw new RuleError('Unknown quest.');
  if (!q.done) throw new RuleError('Not done yet.');
  if (q.claimed) throw new RuleError('Already claimed.');
  c.w.questsClaimed.push(key);
  const coins = award(c, `quest:${key}`, QUESTS.find((x) => x.key === key)!.coins);
  event(c, 'quest', { key, coins });
  return coins;
}

// ---------- games ----------

function needsTable(c: Ctx, kind: GameKind) {
  const ok = kind === 'draw'
    ? c.w.placements.some((p) => p.item === 'easel')
    : c.w.placements.some((p) => ITEM_BY_KEY[p.item]?.actions?.includes('play'));
  if (!ok) throw new RuleError(kind === 'draw' ? 'Place the easel first.' : 'Place a games table first.');
}

export function gameStart(c: Ctx, kind: GameKind): Game {
  const other = partnerOf(c);
  if (!other) throw new RuleError('Games need your partner. Invite them first.');
  needsTable(c, kind);
  for (const g of c.w.games) if (g.status === 'live' && g.kind === kind) g.status = 'resigned';
  const g: Game = {
    id: c.id(), kind, p1: c.me, p2: other,
    board: kind === 'draw' ? [] : emptyBoard(kind as BoardKind), turn: c.me, status: 'live', winner: null, winCells: [], updatedAt: c.now.toISOString(),
  };
  if (kind === 'draw') {
    g.drawer = c.me; g.round = 1; g.scores = { [c.me]: 0, [other]: 0 };
    nextWord(c, g);
  }
  c.w.games.push(g);
  if (c.w.games.length > 20) c.w.games.splice(0, c.w.games.length - 20);
  return g;
}

function nextWord(c: Ctx, g: Game) {
  const prev = c.w.words[g.id];
  const pool = DRAW_WORDS.filter((w) => w !== prev);
  const word = pool[Math.floor(Math.random() * pool.length)] ?? DRAW_WORDS[0];
  c.w.words[g.id] = word;
  g.wordLength = word.length;
}

/** The word, only for the person drawing. */
export function drawWord(c: Ctx, gameId: string): string {
  const g = c.w.games.find((q) => q.id === gameId);
  if (!g || g.kind !== 'draw' || g.drawer !== c.me) throw new RuleError('Only the artist sees the word.');
  return c.w.words[gameId];
}

function finishGame(c: Ctx, g: Game, winner: string | null): number {
  g.winner = winner;
  c.w.stats.gamesFinished++;
  let coins = award(c, 'home_game', REWARDS.homeGame.coins);
  if (coins && winner) {
    c.w.couple.coins += REWARDS.homeGame.winnerBonus;
    c.w.ledger.push({ user: winner, reason: 'game_win', amount: REWARDS.homeGame.winnerBonus, day: today(c), at: c.now.toISOString() });
    coins += REWARDS.homeGame.winnerBonus;
  }
  event(c, 'game', { kind: g.kind, winner, coins });
  return coins;
}

export function gameMove(c: Ctx, gameId: string, mv: number): { game: Game; coins: number } {
  const g = c.w.games.find((q) => q.id === gameId);
  if (!g || g.status !== 'live') throw new RuleError('This game is over.');
  if (g.kind === 'draw') throw new RuleError('Guess with words in Draw & Guess.');
  if (g.turn !== c.me) throw new RuleError('Wait for your turn.');
  const player = g.p1 === c.me ? 1 : 2;
  if (applyMove(g.kind, g.board, mv, player) < 0) throw new RuleError('You can’t play there.');
  const o = outcome(g.kind, g.board);
  let coins = 0;
  if (o === 'draw') { g.status = 'draw'; coins = finishGame(c, g, null); }
  else if (o) { g.status = 'won'; g.winCells = o.cells; coins = finishGame(c, g, o.winner === 1 ? g.p1 : g.p2); }
  else g.turn = g.p1 === c.me ? g.p2 : g.p1;
  g.updatedAt = c.now.toISOString();
  return { game: g, coins };
}

export function gameResign(c: Ctx, gameId: string) {
  const g = c.w.games.find((q) => q.id === gameId);
  if (!g || g.status !== 'live') return;
  g.status = 'resigned';
  g.winner = g.p1 === c.me ? g.p2 : g.p1;
  g.updatedAt = c.now.toISOString();
}

/** Draw & Guess: the guesser tries a word. Right answers score for both of you (it's co-op). */
export function drawGuess(c: Ctx, gameId: string, guess: string): { right: boolean; word?: string; game: Game; coins: number } {
  const g = c.w.games.find((q) => q.id === gameId);
  if (!g || g.kind !== 'draw' || g.status !== 'live') throw new RuleError('This round is over.');
  if (g.drawer === c.me) throw new RuleError('You’re the artist this round.');
  const word = c.w.words[gameId];
  const right = normalizeGuess(guess) === normalizeGuess(word);
  if (!right) return { right, game: g, coins: 0 };
  for (const k of Object.keys(g.scores!)) g.scores![k]++;
  return { right, word, ...advanceDraw(c, g) };
}

/** Skip or time out: move to the next round without a point. */
export function drawSkip(c: Ctx, gameId: string): { word: string; game: Game; coins: number } {
  const g = c.w.games.find((q) => q.id === gameId);
  if (!g || g.kind !== 'draw' || g.status !== 'live') throw new RuleError('This round is over.');
  const word = c.w.words[gameId];
  return { word, ...advanceDraw(c, g) };
}

function advanceDraw(c: Ctx, g: Game): { game: Game; coins: number } {
  let coins = 0;
  if ((g.round ?? 1) >= DRAW_ROUNDS) { g.status = 'won'; coins = finishGame(c, g, null); }
  else {
    g.round = (g.round ?? 1) + 1;
    g.drawer = g.drawer === g.p1 ? g.p2 : g.p1;
    g.turn = g.drawer!;
    nextWord(c, g);
  }
  g.updatedAt = c.now.toISOString();
  return { game: g, coins };
}

// ---------- jobs ----------

export function shiftStart(c: Ctx, together: boolean, job: JobKey = 'cafe'): Shift {
  if (!JOBS[job]) throw new RuleError('That job isn’t hiring.');
  // Together, the one who opens the shift needs the job; their partner can come along.
  const lock = jobLock(c.w.profiles[c.me], job);
  if (lock) throw new RuleError(`Work ${lock.left} more ${JOBS[lock.after].name.toLowerCase()} shift${lock.left === 1 ? '' : 's'} first.`);
  if (together && !partnerOf(c)) throw new RuleError('Invite your partner to work together.');
  const s = { id: c.id(), job, together, startedBy: c.me, startedAt: c.now.toISOString(), status: 'open' as const, finishedBy: [] as string[] };
  c.w.shifts.push(s);
  if (c.w.shifts.length > 60) c.w.shifts.splice(0, c.w.shifts.length - 60);
  return s;
}

/** Shifts this person was paid for today, all jobs together (pay drops after the soft cap). */
export function shiftsToday(w: World, user: string, day: string): number {
  return w.ledger.filter((l) => l.user === user && l.day === day && (JOB_KEYS as string[]).includes(l.reason)).length;
}

/** Each worker finishes their own half; together shifts pay each person and count for both. */
export function shiftFinish(c: Ctx, id: string, served: number, missed: number): { pay: number; level: number; levelUp: boolean; job: JobKey; opened: JobKey | null; openedAll: JobKey[] } {
  const s = c.w.shifts.find((q) => q.id === id);
  if (!s) throw new RuleError('That shift is over.');
  if (s.finishedBy?.includes(c.me)) throw new RuleError('Already paid for this shift.');
  if (!s.together && s.startedBy !== c.me) throw new RuleError('Not your shift.');
  const job = s.job ?? 'cafe';
  const J = JOBS[job];
  const secs = (c.now.getTime() - Date.parse(s.startedAt)) / 1000;
  if (secs < SHIFT.minSeconds) throw new RuleError('That shift was too short to pay.');
  const sv = Math.max(0, Math.min(150, Math.floor(served)));
  const ms = Math.max(0, Math.min(150, Math.floor(missed)));
  // Orders can't come faster than the job allows; anything more is not a real shift.
  const maxOrders = Math.ceil(Math.min(secs, SHIFT.shiftSeconds + 30) / J.orderSeconds);
  const real = Math.min(sv, maxOrders);
  const quality = sv + ms === 0 ? 0 : real / (sv + ms);
  const day = today(c);
  const before = jobLevel(jobXp(c.w.couple, job));
  const pay = shiftPayout({ base: J.pay, together: s.together, quality, level: before, shiftsToday: shiftsToday(c.w, c.me, day) });
  c.w.couple.coins += pay;
  c.w.ledger.push({ user: c.me, reason: job, amount: pay, day, at: c.now.toISOString() });
  const xp = real * J.xpPerOrder;
  if (job === 'cafe') c.w.couple.cafeXp += xp;
  else c.w.couple.jobXp = { ...c.w.couple.jobXp, [job]: jobXp(c.w.couple, job) + xp };
  const me = c.w.profiles[c.me];
  const locked = JOB_KEYS.filter((k) => jobLock(me, k));
  me.jobs = { ...me.jobs, [job]: (me.jobs?.[job] ?? 0) + 1 };
  const openedAll = locked.filter((k) => !jobLock(me, k));
  const opened = openedAll[0] ?? null;
  s.finishedBy = [...(s.finishedBy ?? []), c.me];
  s.served = sv; s.missed = ms;
  if (!s.together || s.finishedBy.length >= 2) s.status = 'done';
  s.pay = pay;
  const level = jobLevel(jobXp(c.w.couple, job));
  event(c, 'shift', { pay, together: s.together, served: sv, job });
  return { pay, level, levelUp: level > before, job, opened, openedAll };
}

// ---------- test mode ----------

/** Coins test mode adds each time it's used. */
export const GOD_COINS = 50_000;

/**
 * Hidden test mode for the app's owner: a pile of coins, every wall and floor style, every
 * clothing piece in every color, and every job open. Furniture is bought with the coins, so
 * placing and storage still work the usual way. The caller has already checked the code.
 */
export function godMode(c: Ctx): { coins: number } {
  const own = new Set(c.w.unlocks);
  for (const d of Object.values(ITEM_BY_KEY)) if (d.kind === 'style') own.add(d.key);
  for (const p of PIECES) p.colors.forEach((_, i) => own.add(worn(p.key, i)));
  c.w.unlocks = [...own];
  c.w.couple.coins += GOD_COINS;
  c.w.ledger.push({ user: c.me, reason: 'god', amount: GOD_COINS, day: today(c), at: c.now.toISOString() });
  const me = c.w.profiles[c.me];
  const jobs = { ...me.jobs };
  for (const k of JOB_KEYS) { const need = JOBS[k].unlock; if (need) jobs[need.after] = Math.max(jobs[need.after] ?? 0, need.shifts); }
  me.jobs = jobs;
  me.god = true;
  return { coins: GOD_COINS };
}

// ---------- unpair ----------

export function unpair(c: Ctx) {
  c.w.couple.archivedAt = c.now.toISOString();
}

export function restore(c: Ctx) {
  const at = c.w.couple.archivedAt;
  if (!at) return;
  if (c.now.getTime() - Date.parse(at) > 30 * 86_400_000) throw new RuleError('This home was archived more than 30 days ago.');
  c.w.couple.archivedAt = null;
}

// ---------- housekeeping ----------

/**
 * Trim what only matters for a while, so a couple's world stays small: old ledger rows (limits
 * only look at today; streak and quest rows are kept because they're once-ever), secret words
 * for games that have been dropped.
 */
export function compact(w: World, now: Date) {
  const cutoff = new Date(now.getTime() - 45 * 86_400_000).toISOString().slice(0, 10);
  w.ledger = w.ledger.filter((l) => l.day >= cutoff || l.reason.startsWith('streak_') || l.reason.startsWith('quest:'));
  const live = new Set(w.games.map((g) => g.id));
  for (const k of Object.keys(w.words)) if (!live.has(k)) delete w.words[k];
}

export function placementCells(p: Placement) {
  return cellsOf(def(p.item), p);
}
