-- Simulation MINIMALE de ce que Supabase fournit déjà, pour rejouer les migrations dans une base de test locale (PGlite).
-- N'est JAMAIS exécuté sur le vrai projet Supabase.

create role anon          nologin;
create role authenticated nologin;
create role service_role  nologin bypassrls;

create schema auth;
create table auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

-- Comme dans Supabase : l'identité de la personne connectée vient du jeton, ici d'un réglage de session.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema auth   to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Réglage par défaut de Supabase : toute nouvelle table/fonction/séquence de « public » est ouverte aux 3 rôles
-- (c'est la migration qui doit ensuite tout refermer — c'est justement ce que les tests vérifient).
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- Stockage de fichiers (minimal) : buckets et objets, avec RLS comme dans Supabase.
create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id),
  name text, owner uuid default auth.uid(), unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects to authenticated, service_role;
grant select on storage.buckets to authenticated, service_role;
