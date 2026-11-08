-- =====================================================================================
-- Pronos Tennis — migration 0025 : notifications immédiates (sans attendre le passage de synchronisation).
-- Quand un pari rend les paris d'un match visibles (révélation d'un match) ou quand un administrateur saisit un résultat à la main,
-- la base demande à GitHub de lancer le workflow « Notifications » (notifications.yml : courriels + push, aucun appel à l'API de tennis).
-- * Les passages de synchronisation (toutes les 20 min) envoient déjà leurs propres notifications : on ne déclenche rien pour eux
--   (auth.uid() est nul pour la tâche de synchronisation, qui passe par le rôle service).
-- * Au plus un déclenchement toutes les 10 secondes (table declenchements) ; en cas d'oubli, le passage suivant rattrape (journal anti-doublon).
-- * Aucun échec ici ne peut empêcher un pari ou une saisie : tout est protégé. Sans jeton « github_token » dans le coffre, rien ne part.
-- =====================================================================================

create table public.declenchements (
  cle      text primary key,
  derniere timestamptz not null default now()
);
alter table public.declenchements enable row level security;
revoke all on public.declenchements from public, anon, authenticated;
grant all on public.declenchements to service_role;

-- Fonction générique : lance un workflow GitHub (fichier + paramètres). Remplace la version de la migration 0023.
create or replace function public.declencher_workflow(p_fichier text, p_inputs jsonb default '{}'::jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_token text; v_id bigint; v_corps jsonb := jsonb_build_object('ref', 'main');
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    return 'vault ou pg_net indisponible : rien déclenché';
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = ''github_token'' limit 1' into v_token;
  if v_token is null or v_token = '' then return 'pas de jeton github_token dans le coffre : rien déclenché'; end if;
  if p_inputs <> '{}'::jsonb then v_corps := v_corps || jsonb_build_object('inputs', p_inputs); end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 5000)'
    into v_id
    using 'https://api.github.com/repos/PitMel/pronos-tennis/actions/workflows/' || p_fichier || '/dispatches',
          jsonb_build_object('Authorization', 'Bearer ' || v_token, 'Accept', 'application/vnd.github+json',
                             'X-GitHub-Api-Version', '2022-11-28', 'User-Agent', 'pronos-tennis-supabase', 'Content-Type', 'application/json'),
          v_corps;
  return 'demande envoyée (requête ' || v_id || ')';
end $$;
revoke all on function public.declencher_workflow(text, jsonb) from public, anon, authenticated;
grant execute on function public.declencher_workflow(text, jsonb) to service_role;

create or replace function public.declencher_synchro() returns text
language sql security definer set search_path = public as $$
  select public.declencher_workflow('synchro.yml', jsonb_build_object('mode', 'normal', 'origine', 'supabase'))
$$;
revoke all on function public.declencher_synchro() from public, anon, authenticated;
grant execute on function public.declencher_synchro() to service_role;

create or replace function public.declencher_notifications() returns text
language plpgsql security definer set search_path = public as $$
declare v_ok integer;
begin
  insert into public.declenchements (cle, derniere) values ('notifications', now())
  on conflict (cle) do update set derniere = now() where public.declenchements.derniere < now() - interval '10 seconds';
  get diagnostics v_ok = row_count;
  if v_ok = 0 then return 'déjà déclenché il y a moins de 10 s'; end if;
  return public.declencher_workflow('notifications.yml');
end $$;
revoke all on function public.declencher_notifications() from public, anon, authenticated;
grant execute on function public.declencher_notifications() to service_role;

-- Déclencheurs : jamais bloquants.
create or replace function public.trg_notifier_immediatement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if tg_table_name = 'revelations' then
      if new.kind = 'match' and not new.groupe_test then perform public.declencher_notifications(); end if;
    elsif tg_table_name = 'matches' then
      -- résultat saisi à la main par un administrateur (la tâche de synchronisation n'a pas d'utilisateur : elle envoie elle-même)
      if auth.uid() is not null and new.statut = 'termine' and old.statut is distinct from 'termine' then perform public.declencher_notifications(); end if;
    end if;
  exception when others then
    null; -- une notification ratée ne doit jamais empêcher un pari ou une saisie
  end;
  return null;
end $$;
revoke all on function public.trg_notifier_immediatement() from public, anon, authenticated;

create trigger trg_notifier_revelation after insert on public.revelations
  for each row execute function public.trg_notifier_immediatement();
create trigger trg_notifier_resultat_manuel after update of statut on public.matches
  for each row execute function public.trg_notifier_immediatement();
