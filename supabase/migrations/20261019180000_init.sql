-- Our Pixel Home: storage for profiles and each couple's world.
--
-- Clients never read or write these tables directly. Every action goes through the `api`
-- edge function, which runs the shared game rules (src/net/dispatch.ts) inside a transaction
-- and returns each person their own view (a partner's private quiet-time notes and the
-- Draw & Guess word stay on the server). RLS is on with no policies, so the anon and
-- authenticated roles see nothing; the function connects as the database owner.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  couple_id uuid,
  -- The profile as set up before pairing. Once paired, the couple's world holds the live copy.
  data jsonb not null,
  -- Heartbeat from the app (every minute while open). "Both here" rewards check it.
  last_seen timestamptz,
  created_at timestamptz not null default now()
);

create table public.couples (
  id uuid primary key,
  invite_code text not null unique check (invite_code ~ '^[A-Z]{4}-[0-9]{4}$'),
  a uuid not null references auth.users (id) on delete cascade,
  b uuid references auth.users (id) on delete set null,
  -- Everything about the home: placements, inventory, notes, prayers, games, wallet, ledger.
  world jsonb not null,
  version integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_couple_id_fkey foreign key (couple_id) references public.couples (id) on delete set null;

create index profiles_couple_id_idx on public.profiles (couple_id);
create index couples_a_idx on public.couples (a);
create index couples_b_idx on public.couples (b);

alter table public.profiles enable row level security;
alter table public.couples enable row level security;
revoke all on public.profiles, public.couples from anon, authenticated;

-- The signed-in person's couple, for the Realtime and Storage policies below. SECURITY DEFINER
-- because those policies run as the caller, who can't read profiles.
create function public.my_couple_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.couple_id
  from public.profiles p
  join public.couples c on c.id = p.couple_id
  where p.id = (select auth.uid()) and c.archived_at is null
$$;

revoke execute on function public.my_couple_id() from public, anon;
grant execute on function public.my_couple_id() to authenticated;

-- Realtime: each couple has one private channel, `couple:<id>`, for presence, live moves and
-- the server's "something changed" pings. Only the two people in the home may join it.
create policy "couple members can listen"
  on realtime.messages for select to authenticated
  using ((select realtime.topic()) = 'couple:' || (select public.my_couple_id())::text);

create policy "couple members can send"
  on realtime.messages for insert to authenticated
  with check ((select realtime.topic()) = 'couple:' || (select public.my_couple_id())::text);

-- Photos for frames live in a private bucket, one folder per couple; the app shows them
-- through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 3145728, array['image/jpeg'])
on conflict (id) do nothing;

create policy "couple can see their photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select public.my_couple_id())::text);

create policy "couple can add photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select public.my_couple_id())::text);

create policy "couple can remove their photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select public.my_couple_id())::text);
