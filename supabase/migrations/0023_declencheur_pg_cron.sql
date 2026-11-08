-- =====================================================================================
-- Pronos Tennis — migration 0023 : déclencheur de la synchronisation par le planificateur de Supabase (pg_cron + pg_net).
-- Toutes les 20 minutes, la base demande à GitHub de lancer le workflow « Synchronisation API » (workflow_dispatch). Le cron de GitHub
-- (toutes les 30 min, souvent en retard) reste en secours ; le planificateur espace lui-même les lectures (20 min pour les matchs,
-- 30 min pour les affiches), donc des déclenchements en plus ne coûtent aucun crédit d'API.
-- Le jeton GitHub n'est PAS dans ce fichier : il est rangé par Pierre dans le coffre (Vault) sous le nom « github_token »
-- (jeton à granularité fine, dépôt PitMel/pronos-tennis, permission « Actions : lecture et écriture »). Sans jeton, la fonction ne fait rien.
-- Les extensions n'existent pas dans la base de test locale : leur création est protégée.
-- =====================================================================================

do $$ begin
  create extension if not exists pg_net;
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron / pg_net indisponibles ici : %', sqlerrm;
end $$;

create or replace function public.declencher_synchro() returns text
language plpgsql security definer set search_path = public as $$
declare v_token text; v_id bigint;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'github_token' limit 1;
  if v_token is null or v_token = '' then return 'pas de jeton github_token dans le coffre : rien déclenché'; end if;
  select net.http_post(
    url := 'https://api.github.com/repos/PitMel/pronos-tennis/actions/workflows/synchro.yml/dispatches',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_token, 'Accept', 'application/vnd.github+json',
                                  'X-GitHub-Api-Version', '2022-11-28', 'User-Agent', 'pronos-tennis-supabase', 'Content-Type', 'application/json'),
    body := jsonb_build_object('ref', 'main', 'inputs', jsonb_build_object('mode', 'normal', 'origine', 'supabase')),
    timeout_milliseconds := 5000) into v_id;
  return 'demande envoyée (requête ' || v_id || ')';
end $$;
revoke all on function public.declencher_synchro() from public, anon, authenticated;
grant execute on function public.declencher_synchro() to service_role;

do $$ begin
  perform cron.unschedule('synchro-github') where exists (select 1 from cron.job where jobname = 'synchro-github');
  perform cron.schedule('synchro-github', '*/20 * * * *', 'select public.declencher_synchro()');
exception when others then
  raise notice 'planification pg_cron non créée ici : %', sqlerrm;
end $$;
