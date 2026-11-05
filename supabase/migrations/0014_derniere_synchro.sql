-- =====================================================================================
-- Pronos Tennis — migration 0014 : heure du dernier appel à l'API, visible de tous les comptes
-- À exécuter APRÈS 0013. Ne contient aucun secret.
--
-- Le journal sync_log reste réservé à l'administrateur. Cette fonction n'en révèle qu'UNE information :
-- la date du dernier appel enregistré (le bandeau affiche « MAJ HH:MM »). Aucun endpoint, aucun quota, aucun message.
-- =====================================================================================

create or replace function public.derniere_synchro() returns timestamptz
language sql stable security definer set search_path = public as $$
  select max(date_appel) from public.sync_log;
$$;

revoke all on function public.derniere_synchro() from public, anon;
grant execute on function public.derniere_synchro() to authenticated;
