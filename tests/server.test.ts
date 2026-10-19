// The online backend against a real Postgres: migration, row locking, privacy of what each
// person sees, and the Realtime/Storage policies. Runs when TEST_DATABASE_URL points at an
// empty Postgres 16 database (CI starts one); skipped otherwise.

import { readdirSync, readFileSync } from 'node:fs';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_LOOK } from '../src/engine/art/avatar';
import type { Snapshot } from '../src/net/types';
import { handle, type Sql } from '../server/handler';

const url = process.env.TEST_DATABASE_URL;
const ANA = '00000000-0000-4000-8000-00000000000a';
const BEN = '00000000-0000-4000-8000-00000000000b';
const CAT = '00000000-0000-4000-8000-00000000000c';

describe.skipIf(!url)('api against Postgres', () => {
  let sql: postgres.Sql;
  const call = async (uid: string, name: string, args: Record<string, unknown> = {}, now?: Date) => handle(sql as unknown as Sql, uid, { name, args }, now);
  const snap = async (uid: string) => ((await call(uid, 'load')).body as { snapshot: Snapshot }).snapshot;

  beforeAll(async () => {
    sql = postgres(url!, { onnotice: () => {} });
    await sql.unsafe('drop schema if exists public cascade; drop schema if exists auth cascade; drop schema if exists realtime cascade; drop schema if exists storage cascade; drop schema if exists private cascade; drop role if exists anon; drop role if exists authenticated; create schema public;');
    await sql.unsafe(readFileSync('supabase/tests/stubs.sql', 'utf8'));
    for (const f of readdirSync('supabase/migrations').sort()) await sql.unsafe(readFileSync(`supabase/migrations/${f}`, 'utf8'));
    await sql`insert into auth.users (id) values (${ANA}), (${BEN}), (${CAT})`;
  });
  afterAll(async () => { await sql?.end(); });

  it('sets up profiles, a home and pairing by code', async () => {
    expect(await snap(ANA)).toBeNull();
    let r = await call(ANA, 'create_profile', { name: ' Ana ', look: { ...DEFAULT_LOOK, outfit: 'fit_sweater' }, tz: 'Asia/Manila' });
    expect(r.status).toBe(400); // not a starter outfit
    r = await call(ANA, 'create_profile', { name: ' Ana ', look: { ...DEFAULT_LOOK, hair: 'bob' }, tz: 'Asia/Manila' });
    expect(r.status).toBe(200);
    expect((r.body as { profile: { name: string } }).profile.name).toBe('Ana');
    await call(BEN, 'create_profile', { name: 'Ben', look: DEFAULT_LOOK, tz: 'Europe/London' });
    await call(CAT, 'create_profile', { name: 'Cat', look: DEFAULT_LOOK, tz: 'Not/AZone' });

    r = await call(ANA, 'create_couple');
    const code = ((r.body as { snapshot: Snapshot }).snapshot.couple!).inviteCode;
    expect(code).toMatch(/^[A-Z]{4}-\d{4}$/);
    expect((await call(ANA, 'create_couple')).body).toEqual({ error: 'You already have a home.' });
    expect((await call(ANA, 'join_couple', { code })).status).toBe(400);
    expect((await call(BEN, 'join_couple', { code: 'ZZZZ-0000' })).body).toEqual({ error: 'That code didn’t work. Check it with your partner.' });
    r = await call(BEN, 'join_couple', { code: code.replace('-', '').toLowerCase() });
    expect(r.status).toBe(200);
    expect((r.body as { snapshot: Snapshot }).snapshot.partner?.name).toBe('Ana');
    expect((await call(CAT, 'join_couple', { code })).body).toEqual({ error: 'This home already has two people.' });

    const pings = await sql`select topic, event from realtime.messages`;
    expect(pings.at(-1)).toMatchObject({ topic: `couple:${(await snap(ANA))!.couple!.id}`, event: 'sync' });
  });

  it('runs the shared rules and keeps the wallet consistent under concurrent taps', async () => {
    let r = await call(ANA, 'buy', { item: 'bed_futon' });
    expect(r.status).toBe(200);
    expect((r.body as { snapshot: Snapshot }).snapshot.couple!.coins).toBe(150);
    expect((await call(BEN, 'buy', { item: 'bed_wood' })).body).toEqual({ error: 'Not enough coins yet.' });
    // Ten hearts at once from both phones: the row lock serializes them, the daily cap holds.
    await Promise.all(Array.from({ length: 10 }, (_, i) => call(i % 2 ? ANA : BEN, 'heart')));
    const s = (await snap(ANA))!;
    expect(s.couple!.coins).toBe(150 + 2 * 10);
    expect(s.events.filter((e) => e.kind === 'heart')).toHaveLength(10);
    r = await call(ANA, 'nope');
    expect(r.body).toEqual({ error: 'Unknown action.' });
    r = await call(ANA, 'place', { invId: 42, surface: 'floor', x: 1, y: 1, rot: 0 });
    expect(r.body).toEqual({ error: 'Something was missing. Try again.' });
  });

  it('keeps private quiet time and the drawing word away from the partner', async () => {
    await call(ANA, 'devotion', { passage: 'Psalm 23', reflection: 'just for me', shared: false });
    await call(BEN, 'devotion', { passage: 'John 1', reflection: 'for both of us', shared: true });
    expect((await snap(BEN))!.devotions.map((d) => d.passage)).toEqual(['John 1']);
    expect((await snap(ANA))!.devotions.map((d) => d.passage).sort()).toEqual(['John 1', 'Psalm 23']);

    // Both online so the game can start (heartbeat), then only the artist gets the word.
    await call(ANA, 'touch'); await call(BEN, 'touch');
    await sql`update public.couples set world = jsonb_set(world, '{placements}', world->'placements' || '[{"id":"e1","item":"easel","surface":"floor","x":6,"y":6,"rot":0,"data":null}]'::jsonb)`;
    const g = (await call(ANA, 'game_start', { kind: 'draw' })).body as { result: string };
    expect((await call(ANA, 'draw_word', { gameId: g.result })).status).toBe(200);
    expect((await call(BEN, 'draw_word', { gameId: g.result })).body).toEqual({ error: 'Only the artist sees the word.' });
    expect(JSON.stringify(await snap(BEN))).not.toContain('"words"');
  });

  it('decides "both here" from heartbeats, not from what the phone claims', async () => {
    const later = new Date(Date.now() + 10 * 60_000);
    // Ben's last heartbeat is now more than 150 s old at `later`.
    const r = await call(ANA, 'together_tick', {}, later);
    expect((r.body as { coins: number }).coins).toBe(0);
    await sql`update public.profiles set last_seen = ${later} where id = ${BEN}`;
    expect(((await call(ANA, 'together_tick', {}, later)).body as { coins: number }).coins).toBe(2);
  });

  it('lets only the two of them on their channel and into their photo folder', async () => {
    const cid = (await snap(ANA))!.couple!.id;
    const asUser = async <T>(uid: string, topic: string, q: (tx: postgres.TransactionSql) => Promise<T>) => sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.sub', ${uid}, true), set_config('realtime.topic', ${topic}, true)`;
      await tx`set local role authenticated`;
      return q(tx);
    });
    const canSend = (uid: string, topic: string) => asUser(uid, topic, (tx) => tx`insert into realtime.messages (topic, event) values (${topic}, 'live')`).then(() => true, () => false);
    expect(await canSend(BEN, `couple:${cid}`)).toBe(true);
    expect(await canSend(CAT, `couple:${cid}`)).toBe(false);
    const canUpload = (uid: string) => asUser(uid, '', (tx) => tx`insert into storage.objects (bucket_id, name) values ('photos', ${`${cid}/x.jpg`})`).then(() => true, () => false);
    expect(await canUpload(ANA)).toBe(true);
    expect(await canUpload(CAT)).toBe(false);
    const peek = (uid: string) => asUser(uid, '', (tx) => tx`select * from public.couples`).then(() => 'read', () => 'denied');
    expect(await peek(ANA)).toBe('denied');
  });

  it('archives and restores a home; archived homes refuse other actions', async () => {
    await call(BEN, 'unpair');
    expect((await call(ANA, 'heart')).body).toEqual({ error: 'This home is archived. Restore it first.' });
    expect((await call(ANA, 'restore')).status).toBe(200);
    expect((await snap(ANA))!.couple!.archivedAt).toBeNull();
  });
});
