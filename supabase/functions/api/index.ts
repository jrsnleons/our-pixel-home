// Edge function `api`: checks who is signed in, then hands the request to the shared handler
// (handler.js, bundled from server/handler.ts by `npm run build:api`).

import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { handle } from './handler.js';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 4, idle_timeout: 20 });
const auth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'POST only.' });

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return reply(401, { error: 'Sign in again.' });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) return reply(401, { error: 'Sign in again.' });

  const text = await req.text();
  if (text.length > 64 * 1024) return reply(413, { error: 'That’s too much at once.' });
  let body: unknown;
  try { body = JSON.parse(text || '{}'); } catch { return reply(400, { error: 'Bad request.' }); }

  const r = await handle(sql, data.user.id, body, new Date(), { godCode: Deno.env.get('GOD_CODE') ?? '' });
  return reply(r.status, r.body);
});
