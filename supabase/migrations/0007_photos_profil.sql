-- =====================================================================================
-- Pronos Tennis — migration 0007 : photos de profil
-- À exécuter APRÈS 0006. Ne contient aucun secret.
--
-- * Un « bucket » de stockage public « avatars » (lecture par adresse directe) : un fichier par compte, nommé <id du compte>.jpg,
--   JPEG de 300 Ko au plus (l'application réduit la photo à 256 px avant l'envoi).
-- * Chacun écrit, remplace ou supprime SA photo ; l'administrateur peut le faire pour n'importe quel compte (décision de Pierre,
--   28 octobre 2026 : il peut modifier ou retirer la photo d'un joueur).
-- * profiles.photo_url ne peut désigner qu'une photo de ce bucket (pas d'adresse externe).
-- La photo est « publique » au sens technique : quiconque connaît l'adresse (qui contient l'identifiant du compte, non devinable)
-- peut la voir. Elle n'est jamais listée par l'application.
-- =====================================================================================

alter table public.profiles add constraint profiles_photo_url_valide check (
  photo_url is null
  or photo_url ~ '^https://wmqyplehxtafxoilllfd\.supabase\.co/storage/v1/object/public/avatars/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg(\?v=[0-9]{1,15})?$'
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 307200, array['image/jpeg'])
on conflict (id) do update
  set public = true, file_size_limit = 307200, allowed_mime_types = array['image/jpeg'];

-- Un fichier d'avatar est nommé <uuid>.jpg ; seul son propriétaire (ou l'administrateur) l'écrit.
create policy avatars_lecture on storage.objects for select to authenticated
  using (bucket_id = 'avatars');

create policy avatars_ajout on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (
    name = auth.uid()::text || '.jpg'
    or (public.est_admin() and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$')));

create policy avatars_remplacement on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (
    name = auth.uid()::text || '.jpg'
    or (public.est_admin() and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$')))
  with check (bucket_id = 'avatars' and (
    name = auth.uid()::text || '.jpg'
    or (public.est_admin() and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$')));

create policy avatars_suppression on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (
    name = auth.uid()::text || '.jpg'
    or (public.est_admin() and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$')));
