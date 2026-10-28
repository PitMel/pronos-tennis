-- Vérification de la migration 0007 (photos) sur la VRAIE base. Aucun secret. Tout est annulé à la fin (l'« erreur » finale est voulue).
-- Résultat attendu : « RAPPORT — 10 vérifications OK, 0 échec ».
-- Les suppressions de fichiers ne se vérifient pas en SQL : Supabase les interdit hors de son API de stockage (déclencheur protect_objects_delete).
-- Leurs règles (propriétaire ou administrateur) sont testées dans tests/securite/photos.test.js.
create temp table rapport (ok boolean, libelle text);

create function pg_temp.essaie(p_uid uuid, p_sql text) returns text
language plpgsql as $f$
declare n bigint;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  set local role authenticated;
  begin
    execute p_sql; get diagnostics n = row_count; reset role; return n::text;
  exception when others then reset role; return 'ERR:' || sqlerrm; end;
end $f$;

create function pg_temp.v(p_ok boolean, p_libelle text) returns void language plpgsql as $f$
begin insert into rapport values (coalesce(p_ok, false), p_libelle); end $f$;

do $verif$
declare
  u_admin uuid := 'dddddddd-0000-4000-8000-000000000001';
  u_a uuid := 'dddddddd-0000-4000-8000-000000000011';
  u_b uuid := 'dddddddd-0000-4000-8000-000000000012';
  base text := 'https://wmqyplehxtafxoilllfd.supabase.co/storage/v1/object/public/avatars/';
  n int; i int; s text;
begin
  insert into auth.users (id, email) values (u_admin, 'vp-admin@verif.invalid'), (u_a, 'vp-a@verif.invalid'), (u_b, 'vp-b@verif.invalid');
  insert into public.profiles (id, prenom, is_admin, is_test) values (u_admin, 'VP-Admin', true, false), (u_a, 'VP-A', false, true), (u_b, 'VP-B', false, true);
  perform pg_temp.v((select public and file_size_limit = 307200 and allowed_mime_types = array['image/jpeg'] from storage.buckets where id = 'avatars'), 'bucket public, 300 Ko, JPEG');
  perform pg_temp.v(pg_temp.essaie(u_a, format('insert into storage.objects (bucket_id, name) values (''avatars'', ''%s.jpg'')', u_a)) = '1', 'joueur : sa propre photo');
  perform pg_temp.v(pg_temp.essaie(u_a, format('insert into storage.objects (bucket_id, name) values (''avatars'', ''%s.jpg'')', u_b)) like 'ERR:%', 'joueur : pas celle d''un autre');
  perform pg_temp.v(pg_temp.essaie(u_a, 'insert into storage.objects (bucket_id, name) values (''avatars'', ''x.jpg'')') like 'ERR:%', 'joueur : pas un autre nom');
  perform pg_temp.v(pg_temp.essaie(u_admin, format('insert into storage.objects (bucket_id, name) values (''avatars'', ''%s.jpg'')', u_b)) = '1', 'administrateur : la photo d''un autre');
  perform pg_temp.v(pg_temp.essaie(u_admin, 'insert into storage.objects (bucket_id, name) values (''avatars'', ''x.png'')') like 'ERR:%', 'administrateur : seulement <uuid>.jpg');
  perform pg_temp.v(pg_temp.essaie(u_a, format('update public.profiles set photo_url = ''%s%s.jpg?v=1'' where id = ''%s''', base, u_a, u_a)) = '1', 'photo_url valide acceptée');
  perform pg_temp.v(pg_temp.essaie(u_a, format('update public.profiles set photo_url = ''https://exemple.com/x.jpg'' where id = ''%s''', u_a)) like 'ERR:%', 'photo_url externe refusée');
  perform pg_temp.v(pg_temp.essaie(u_a, format('update public.profiles set photo_url = ''%s%s.jpg'' where id = ''%s''', base, u_b, u_b)) = '0', 'joueur : pas la photo_url d''un autre');
  perform pg_temp.v(pg_temp.essaie(u_admin, format('update public.profiles set photo_url = ''%s%s.jpg'' where id = ''%s''', base, u_b, u_b)) = '1', 'administrateur : photo_url d''un autre');
  select count(*) filter (where ok), count(*) filter (where not ok) into n, i from rapport;
  select coalesce(string_agg('  ECHEC : ' || libelle, E'\n'), '  aucun') into s from rapport where not ok;
  raise exception E'RAPPORT — % vérifications OK, % échec(s). Détail :\n%\n(erreur volontaire : annule les données fictives)', n, i, s;
end
$verif$;
