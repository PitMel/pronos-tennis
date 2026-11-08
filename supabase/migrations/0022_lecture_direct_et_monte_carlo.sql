-- =====================================================================================
-- Pronos Tennis — migration 0022 : sync_etat expose « derniere_lecture_direct » (dernière lecture réussie des matchs en direct),
-- pour que le planificateur espace les lectures du direct d'au moins ~20 minutes même si plusieurs déclencheurs passent.
-- Le Monte-Carlo Masters s'affiche « Monte Carlo » (et non Monaco) dans les notifications.
-- =====================================================================================

create or replace function public.sync_etat() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'maintenant', now(),
    'appels_aujourdhui', (
      select count(*) from public.sync_log l
      where l.endpoint like '/%' and l.endpoint not like '/usage%'
        and l.date_appel >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')),
    'derniere_lecture_direct', (
      select max(l.date_appel) from public.sync_log l where l.ok and l.endpoint like '%status=live%'),
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
        'tours', (
          select coalesce(jsonb_agg(jsonb_build_object('tour', x.tour, 'total', x.total, 'termines', x.termines) order by x.tour), '[]'::jsonb)
          from (select m3.tour, count(*) as total,
                       count(*) filter (where m3.statut = 'termine' or m3.fin_match = 'forfait' or m3.neutralise) as termines
                from public.matches m3 where m3.tournament_id = t.id group by m3.tour) x),
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

update public.tournaments set ville = 'Monte Carlo' where nom = 'Monte-Carlo Masters';
