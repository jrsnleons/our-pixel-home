-- Just enough of Supabase's built-in schemas (auth, realtime, storage) to run our migration
-- on a plain Postgres for tests. Not used in production.

create role anon nologin;
create role authenticated nologin;

create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create schema realtime;
create table realtime.messages (id bigserial primary key, topic text not null, event text, payload jsonb, private boolean, inserted_at timestamptz default now());
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as $$
  select nullif(current_setting('realtime.topic', true), '')
$$;
create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language sql as $$
  insert into realtime.messages (topic, event, payload, private) values (topic, event, payload, private)
$$;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id bigserial primary key, bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

grant usage on schema auth, realtime, storage to anon, authenticated;
grant select, insert on realtime.messages to authenticated;
grant select, insert, delete on storage.objects to authenticated;
grant usage on schema public to anon, authenticated;
grant usage on all sequences in schema realtime, storage to authenticated;
