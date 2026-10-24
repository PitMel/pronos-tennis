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
