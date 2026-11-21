-- =====================================================================================
-- Migration 0030 — H2H : recalcul après la fin d'un tournoi (21 nov. 2026, demandé par Pierre)
--
-- Problème : un face-à-face n'était calculé qu'une seule fois par paire. Alcaraz–Shelton, calculé pendant le Masters de Paris
-- (avant la finale), ne comptait donc pas cette finale aux ATP Finals.
--
-- Règle : une ligne H2H « ok » redevient « à calculer » quand un tournoi du calendrier s'est terminé depuis son calcul
-- (jour suivant sa date de fin ; sans date de fin : date de début + 7 jours). Une fois recalculée, la ligne est de nouveau à jour
-- jusqu'à la fin du tournoi suivant. Inchangé : « indisponible » n'est pas retenté ; ligne sans classement de l'époque : recalculée.
-- =====================================================================================

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
          -- à jour : indisponible (on ne réessaie pas) ; ou bien (sans rencontre, ou rencontres accompagnées du classement de l'époque)
          -- ET aucun tournoi terminé depuis le calcul
          and (h.statut <> 'ok' or (
                (jsonb_array_length(h.rencontres) = 0 or (h.rencontres -> 0) ? 'classement_vainqueur')
                and not exists (
                  select 1 from public.tournaments t2
                  where (coalesce(t2.date_fin, t2.date_debut + 7) + 1)::timestamptz <= now()
                    and (coalesce(t2.date_fin, t2.date_debut + 7) + 1)::timestamptz > h.calcule_le))))
    group by 1, 2, 3, 4, 5, 6
  ) x
$$;

revoke all on function public.sync_h2h_a_calculer() from public, anon, authenticated;
grant execute on function public.sync_h2h_a_calculer() to service_role;
