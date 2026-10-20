// The online backend's one endpoint. Each request locks the couple's row, runs the shared
// rules (src/net/dispatch.ts) on their world, saves it, and pings both phones over Realtime.
// This file is bundled into supabase/functions/api/handler.js; the Deno entry next to it only
// checks the sign-in and hands over a Postgres connection, so the logic here is tested in
// Node against a real Postgres (tests/server.test.ts).

import { ownedClothes } from '../src/data/clothes';
import type { AvatarLook } from '../src/engine/art/avatar';
import type { RpcName, Rpcs } from '../src/net/backend';
import { dispatch, snapshotOf } from '../src/net/dispatch';
import * as R from '../src/net/rules';
import type { Profile, Snapshot } from '../src/net/types';

/** The slice of the `postgres` client this uses (tagged-template queries and transactions). */
export interface Sql {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  <T = any>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
  begin<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
}

export interface Reply { status: number; body: unknown }

/** Seconds since the partner's last heartbeat that still counts as "here". */
const ONLINE_WINDOW = 150;

const ACTIONS = new Set<RpcName>([
  'buy', 'place', 'move', 'store', 'set_style', 'set_look', 'buy_clothes', 'save_look', 'gift_look', 'answer_gift', 'set_profile', 'set_couple', 'placement_data', 'water',
  'claim_daily', 'together_tick', 'heart', 'interaction', 'nudge', 'notebook_create', 'page_write', 'page_edit',
  'page_delete', 'prayer_add', 'prayer_pray', 'prayer_answer', 'prayer_delete', 'devotion', 'quest_claim',
  'game_start', 'game_move', 'game_resign', 'draw_word', 'draw_guess', 'draw_skip', 'shift_start', 'shift_finish',
  'unpair', 'restore',
]);
/** Actions that only read, so nothing is saved or broadcast. */
const READ_ONLY = new Set<RpcName>(['draw_word']);

const uuid = () => crypto.randomUUID();
const ok = (body: unknown): Reply => ({ status: 200, body });
const refuse = (message: string): Reply => ({ status: 400, body: { error: message } });

interface ProfileRow { couple_id: string | null; data: Profile; last_seen: string | Date | null }
interface CoupleRow { id: string; a: string; b: string | null; world: R.World; archived_at: string | Date | null }

export async function handle(sql: Sql, uid: string, body: unknown, now = new Date()): Promise<Reply> {
  const req = (body ?? {}) as { name?: unknown; args?: unknown };
  const name = typeof req.name === 'string' ? req.name : '';
  const args = (req.args && typeof req.args === 'object' ? req.args : {}) as Record<string, unknown>;
  try {
    switch (name) {
      case 'load': return ok({ snapshot: await load(sql, uid, now) });
      case 'touch': await sql`update public.profiles set last_seen = ${now} where id = ${uid}`; return ok({});
      case 'create_profile': return ok({ profile: await createProfile(sql, uid, args, now) });
      case 'create_couple': return ok({ snapshot: await createCouple(sql, uid, now) });
      case 'join_couple': return ok({ snapshot: await joinCouple(sql, uid, String(args.code ?? ''), now) });
      default:
        if (!ACTIONS.has(name as RpcName)) return refuse('Unknown action.');
        return ok(await act(sql, uid, name as RpcName, args as never, now));
    }
  } catch (e) {
    if (e instanceof R.RuleError) return refuse(e.message);
    console.error(`[api] ${name} failed`, e);
    return { status: 500, body: { error: 'Something went wrong on our side. Try again in a moment.' } };
  }
}

// ---------- reads ----------

async function load(sql: Sql, uid: string, now: Date): Promise<Snapshot | null> {
  const [p] = await sql<ProfileRow>`select couple_id, data, last_seen from public.profiles where id = ${uid}`;
  if (!p) return null;
  if (!p.couple_id) return bare({ ...p.data, lastSeen: iso(p.last_seen) });
  const [c] = await sql<CoupleRow>`select id, a, b, world, archived_at from public.couples where id = ${p.couple_id}`;
  if (!c) return bare(p.data);
  return view(sql, c.world, uid, now);
}

function bare(me: Profile): Snapshot {
  return { me, partner: null, couple: null, placements: [], inventory: [], unlocks: [], notebooks: [], pages: [], prayers: [], devotions: [], events: [], quests: [], games: [], today: {} };
}

/** One person's view of the world, with last-seen times from the heartbeat column. */
async function view(sql: Sql, w: R.World, uid: string, now: Date): Promise<Snapshot> {
  const ids = [w.couple.a, w.couple.b].filter((x): x is string => !!x);
  const seen = await sql<{ id: string; last_seen: string | Date | null }>`select id, last_seen from public.profiles where id = any(${ids}::uuid[])`;
  for (const r of seen) if (w.profiles[r.id]) w.profiles[r.id].lastSeen = iso(r.last_seen);
  return snapshotOf(w, uid, now);
}

// ---------- first run ----------

async function createProfile(sql: Sql, uid: string, args: Record<string, unknown>, now: Date): Promise<Profile> {
  const name = typeof args.name === 'string' ? args.name.trim().slice(0, 24) : '';
  if (!name) throw new R.RuleError('What should your partner call you?');
  const tz = typeof args.tz === 'string' && R.validTz(args.tz) ? args.tz : 'UTC';
  const look = R.cleanLook(args.look as AvatarLook);
  // Before pairing you only own the starter wardrobe.
  const starters = ownedClothes([]);
  for (const v of Object.values(look.wear)) if (v && !starters.has(v)) throw new R.RuleError('Pick one of the starter outfits for now.');
  const profile: Profile = { id: uid, name, look, city: null, tz, lastSeen: now.toISOString(), visitStreak: 0, devotionStreak: 0 };
  // Re-running setup before pairing just updates it; after pairing the world holds the profile.
  const rows = await sql<{ data: Profile }>`
    insert into public.profiles (id, data, last_seen) values (${uid}, ${JSON.stringify(profile)}::text::jsonb, ${now})
    on conflict (id) do update set data = excluded.data where public.profiles.couple_id is null
    returning data`;
  if (!rows.length) throw new R.RuleError('You already have a home.');
  return rows[0].data;
}

async function createCouple(sql: Sql, uid: string, now: Date): Promise<Snapshot> {
  return sql.begin(async (tx) => {
    const p = await myProfile(tx, uid);
    await mustBeFree(tx, p);
    const id = uuid();
    const profile = { ...p.data, lastSeen: now.toISOString() };
    for (let attempt = 0; ; attempt++) {
      const code = inviteCode();
      const w = R.newWorld(profile, id, code, uuid);
      const rows = await tx`
        insert into public.couples (id, invite_code, a, world) values (${id}, ${code}, ${uid}, ${JSON.stringify(w)}::text::jsonb)
        on conflict (invite_code) do nothing returning id`;
      if (rows.length) {
        await tx`update public.profiles set couple_id = ${id} where id = ${uid}`;
        return snapshotOf(w, uid, now);
      }
      if (attempt > 5) throw new Error('could not find a free invite code');
    }
  });
}

async function joinCouple(sql: Sql, uid: string, raw: string, now: Date): Promise<Snapshot> {
  const code = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z]{4}-?\d{4}$/.test(code)) throw new R.RuleError('That code didn’t work. It looks like ABCD-1234.');
  const normalized = code.includes('-') ? code : `${code.slice(0, 4)}-${code.slice(4)}`;
  return sql.begin(async (tx) => {
    const p = await myProfile(tx, uid);
    await mustBeFree(tx, p);
    const [c] = await tx<CoupleRow>`select id, a, b, world, archived_at from public.couples where invite_code = ${normalized} for update`;
    if (!c || c.archived_at) throw new R.RuleError('That code didn’t work. Check it with your partner.');
    if (c.a === uid) throw new R.RuleError('That’s your own code. Send it to your partner.');
    if (c.b && c.b !== uid) throw new R.RuleError('This home already has two people.');
    const w = c.world;
    R.joinCouple({ w, me: uid, now, id: uuid }, { ...p.data, lastSeen: now.toISOString() });
    await tx`update public.couples set b = ${uid}, world = ${JSON.stringify(w)}::text::jsonb, version = version + 1, updated_at = ${now} where id = ${c.id}`;
    await tx`update public.profiles set couple_id = ${c.id} where id = ${uid}`;
    await ping(tx, c.id, uid);
    return view(tx, w, uid, now);
  });
}

async function myProfile(tx: Sql, uid: string): Promise<ProfileRow> {
  const [p] = await tx<ProfileRow>`select couple_id, data, last_seen from public.profiles where id = ${uid} for update`;
  if (!p) throw new R.RuleError('Make your little you first.');
  return p;
}

/** You can start or join a home unless you're already in one that isn't archived. */
async function mustBeFree(tx: Sql, p: ProfileRow) {
  if (!p.couple_id) return;
  const [c] = await tx<{ archived_at: unknown }>`select archived_at from public.couples where id = ${p.couple_id}`;
  if (c && !c.archived_at) throw new R.RuleError('You already have a home.');
}

// No 0/O or 1/I, so codes survive being read out over a call.
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
function inviteCode(): string {
  const b = crypto.getRandomValues(new Uint32Array(8));
  let s = '';
  for (let i = 0; i < 4; i++) s += LETTERS[b[i] % LETTERS.length];
  s += '-';
  for (let i = 4; i < 8; i++) s += String(b[i] % 10);
  return s;
}

// ---------- actions ----------

async function act<K extends RpcName>(sql: Sql, uid: string, name: K, args: Rpcs[K], now: Date) {
  return sql.begin(async (tx) => {
    const [p] = await tx<{ couple_id: string | null }>`select couple_id from public.profiles where id = ${uid}`;
    if (!p?.couple_id) throw new R.RuleError('Pair up first.');
    // One writer at a time per couple: both phones' actions queue on this row lock.
    const [c] = await tx<CoupleRow>`select id, a, b, world, archived_at from public.couples where id = ${p.couple_id} for update`;
    if (!c) throw new R.RuleError('Pair up first.');
    const w = c.world;
    const partner = c.a === uid ? c.b : c.a;
    let partnerOnline = false;
    if (partner) {
      const [q] = await tx<{ last_seen: string | Date | null }>`select last_seen from public.profiles where id = ${partner}`;
      partnerOnline = !!q?.last_seen && now.getTime() - new Date(q.last_seen).getTime() < ONLINE_WINDOW * 1000;
    }
    const out = dispatch({ w, me: uid, now, id: uuid }, name, args, { partnerOnline });
    if (!READ_ONLY.has(name)) {
      R.compact(w, now);
      await tx`
        update public.couples set world = ${JSON.stringify(w)}::text::jsonb, archived_at = ${w.couple.archivedAt}, version = version + 1, updated_at = ${now}
        where id = ${c.id}`;
      await ping(tx, c.id, uid);
    }
    return { snapshot: await view(tx, w, uid, now), result: out.result ?? null, coins: out.coins };
  });
}

/** Tell the other phone the world changed; it refetches its own (filtered) view. */
async function ping(tx: Sql, coupleId: string, by: string) {
  await tx`select realtime.send(${JSON.stringify({ by })}::text::jsonb, 'sync', ${`couple:${coupleId}`}, true)`;
}

function iso(v: string | Date | null | undefined): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}
