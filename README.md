# Our Pixel Home

A cozy pixel-art studio apartment for long-distance couples. Each of you has a little avatar in
the same room; you decorate it together, play games at the table, work café shifts for coins,
keep shared notebooks and prayer requests, and encourage each other's quiet time with the Lord.

It is a phone-first PWA (portrait only) with a custom Three.js renderer for the HD-2D look:
billboarded pixel sprites in a lit 3D room with bloom, tilt-shift and a dithered glow. Every
sprite is drawn in code, so there are no image assets to manage.

## Running it

```sh
npm install
npm run dev        # http://localhost:5173
```

With no Supabase settings the app runs in **preview mode**: everything works offline against a
stand-in partner ("Sam") who joins your home, plays games and reacts to what you do. That is the
quickest way to try every screen.

| Command | What it does |
| --- | --- |
| `npm run build` | Typecheck and build the PWA into `dist/` |
| `npm test` | Unit tests (rules, economy, grid, games) |
| `npm run test:db` | Server tests against a real Postgres (see below) |
| `npm run build:api` | Rebuild the edge function bundle after changing shared rules |
| `npm run gen:icons` | Redraw the app icons in `public/icons` |

`/gallery.html` and `/scene.html` (dev server only) show every sprite and a bare room scene.

## How it fits together

- **Rules live in one place.** `src/net/rules.ts` and `src/net/dispatch.ts` hold every rule
  (prices, daily caps, placement, games, café pay). The preview backend runs them in the
  browser; the server runs the exact same code.
- **Server.** One Supabase edge function, `api`, checks the signed-in user and runs
  `server/handler.ts`. Each couple's home is a single `couples.world` JSON row that is locked
  for every action, so two phones tapping at once can't double-spend coins.
  `supabase/functions/api/handler.js` is that file bundled by esbuild; it is committed so the
  function can be deployed as-is, and CI fails if it is out of date.
- **Privacy.** Clients can't read the tables at all (RLS on, no policies); everything goes
  through the function, which only returns what that person may see. Unshared quiet-time
  entries stay private, and only the artist gets the Draw & Guess word.
- **Realtime.** Each couple has a private channel `couple:<id>`. It carries presence, live
  moves and emotes, and a "something changed" ping from the server, after which the other phone
  reloads its own view. "Both here" coin rewards use server-side heartbeats, not the phone's
  word.
- **Photos** go to a private `photos` bucket, one folder per couple, shown with signed URLs.

## Setting up the backend

The production project is `our-pixel-home` on Supabase. To set up a fresh one:

1. Create a Supabase project and apply `supabase/migrations/*.sql` in order
   (`supabase db push`, or paste them into the SQL editor).
2. Deploy the function: `supabase functions deploy api --no-verify-jwt`
   (`supabase/config.toml` already sets `verify_jwt = false`; the function checks the token itself).
3. **Google sign-in:** in Google Cloud Console create an OAuth client (Web application) with the
   authorized redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`. Then in
   Supabase → Authentication → Sign In / Providers → Google, paste the client ID and secret and
   enable it.
4. In Supabase → Authentication → URL Configuration, set the **Site URL** to your Vercel URL and
   add it (plus `http://localhost:5173` for local testing) to the **Redirect URLs**.

## Deploying the app (Vercel)

Import the repo into Vercel (framework: Vite; `vercel.json` has the rest) and set:

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the project's publishable key (`sb_publishable_…`) |

Both are public by design: the publishable key only lets someone call the `api` function, which
requires a signed-in Google account and enforces every rule. Copy `.env.example` to `.env.local`
to use them locally.

`api/passage.ts` is a small Vercel function that fetches one ESV chapter at a time from
[bolls.life](https://bolls.life) for quiet time. Responses are not cached on the CDN, and the
app never stores Bible text.

## Server tests

`tests/server.test.ts` runs the real handler against Postgres 16 with small stand-ins for
Supabase's `auth`, `realtime` and `storage` schemas (`supabase/tests/stubs.sql`). It checks
pairing, concurrent coin taps, privacy, heartbeats, the Realtime/Storage policies and archiving.
It needs an empty database:

```sh
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:db
```

CI starts a Postgres service and runs it on every push.

## Scripture

Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®),
© 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission.
All rights reserved. The notice is also shown in the app under Me → Settings, and passages are labeled (ESV).
