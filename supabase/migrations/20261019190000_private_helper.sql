-- Keep the policy helper out of the public API: in `public`, PostgREST would serve it as
-- /rest/v1/rpc/my_couple_id. Policies can still call it from a schema the API doesn't expose.

create schema if not exists private;
grant usage on schema private to authenticated;

alter function public.my_couple_id() set schema private;

alter policy "couple members can listen" on realtime.messages
  using ((select realtime.topic()) = 'couple:' || (select private.my_couple_id())::text);
alter policy "couple members can send" on realtime.messages
  with check ((select realtime.topic()) = 'couple:' || (select private.my_couple_id())::text);
alter policy "couple can see their photos" on storage.objects
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select private.my_couple_id())::text);
alter policy "couple can add photos" on storage.objects
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select private.my_couple_id())::text);
alter policy "couple can remove their photos" on storage.objects
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select private.my_couple_id())::text);
