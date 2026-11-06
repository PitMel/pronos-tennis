-- =====================================================================================
-- Pronos Tennis — migration 0016 : identifiants d'API confirmés + H2H avec classements
-- À exécuter APRÈS 0015. Ne contient aucun secret.
--
-- 1. sync_etat : chaque tournoi expose « api_ids_confirmes », les identifiants d'API qui ont réellement fourni des matchs
--    (matches.api_tournament_id, migration 0015). Le planificateur n'interroge plus que ceux-là dès qu'il y en a au moins un
--    (ex. Paris : 1725 a donné tous les matchs, 1726 rien => on n'appelle plus 1726).
-- 2. sync_h2h_a_calculer : une ligne h2h dont les rencontres n'ont pas encore le classement ATP de l'époque
--    (clé « classement_vainqueur », ajoutée par la tâche H2H) est de nouveau « à calculer » ; l'ancienne ligne reste visible
--    jusqu'à ce que la nouvelle la remplace (sync_h2h_enregistrer fait un « upsert »).
-- =====================================================================================

create or replace function public.sync_etat() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'maintenant', now(),
    'appels_aujourdhui', (
      select count(*) from public.sync_log l
      where l.endpoint like '/%' and l.endpoint not like '/usage%'
        and l.date_appel >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')),
    'quota_epuise_jusqua', (
      select max(l.reset_a) from public.sync_log l where l.http_status = 429 and l.reset_a > now()),
    'tournois', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'nom', t.nom, 'categorie', t.categorie, 'etat', t.etat,
        'date_debut', t.date_debut, 'date_fin', t.date_fin,
        'api_ids', (select jsonb_agg(a.api_id order by a.api_id) from public.tournament_api_ids a where a.tournament_id = t.id),
        'api_ids_confirmes', (
          select jsonb_agg(distinct m2.api_tournament_id order by m2.api_tournament_id)
          from public.matches m2 where m2.tournament_id = t.id and m2.api_tournament_id is not null),
        'derniere_decouverte', (
          select max(l.date_appel) from public.sync_log l
          where l.ok and l.endpoint like '%status=upcoming%'
            and exists (select 1 from public.tournament_api_ids a
                        where a.tournament_id = t.id and l.endpoint like '%tournament_id=' || a.api_id || '&%')),
        'finale_terminee', exists (select 1 from public.matches m where m.tournament_id = t.id and m.tour = 'F' and m.statut = 'termine')
      ) order by t.annee, t.id), '[]'::jsonb)
      from public.tournaments t
      where t.etat <> 'clos' and exists (select 1 from public.tournament_api_ids a where a.tournament_id = t.id)),
    'matchs', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'api_id', m.api_id, 'tournament_id', m.tournament_id, 'tour', m.tour, 'statut', m.statut,
        'heure_prevue', m.heure_prevue, 'debut_detecte', m.debut_detecte, 'modifie_manuellement', m.modifie_manuellement
      ) order by m.heure_prevue nulls last, m.id), '[]'::jsonb)
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
      where m.api_id is not null and m.statut <> 'termine' and t.etat <> 'clos' and not m.neutralise and m.fin_match <> 'forfait')
  )
$$;

revoke all on function public.sync_etat() from public, anon, authenticated;
grant execute on function public.sync_etat() to service_role;

create or replace function public.sync_h2h_a_calculer() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x.nom_a, x.nom_b), '[]'::jsonb)
  from (
    select least(m.p1_id, m.p2_id) as joueur_a, greatest(m.p1_id, m.p2_id) as joueur_b,
           pa.nom as nom_a, pb.nom as nom_b, pa.atp_id as atp_a, pb.atp_id as atp_b,
           (array_agg(distinct t.id order by t.id)) as tournois,
           min(t.date_debut) as date_debut, min(t.annee) as annee
    from public.matches m
    join public.tournaments t on t.id = m.tournament_id
    join public.players pa on pa.id = least(m.p1_id, m.p2_id)
    join public.players pb on pb.id = greatest(m.p1_id, m.p2_id)
    where t.etat <> 'clos' and m.statut <> 'termine' and not m.neutralise
      and not exists (
        select 1 from public.h2h h
        where h.joueur_a = least(m.p1_id, m.p2_id) and h.joueur_b = greatest(m.p1_id, m.p2_id)
          -- à jour : indisponible (on ne réessaie pas), sans rencontre, ou rencontres déjà accompagnées du classement de l'époque
          and (h.statut <> 'ok' or jsonb_array_length(h.rencontres) = 0 or (h.rencontres -> 0) ? 'classement_vainqueur'))
    group by 1, 2, 3, 4, 5, 6
  ) x
$$;

revoke all on function public.sync_h2h_a_calculer() from public, anon, authenticated;
grant execute on function public.sync_h2h_a_calculer() to service_role;
