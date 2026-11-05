-- =====================================================================================
-- Pronos Tennis — migration 0011 : un premier pari reste possible après le début du match
-- À exécuter APRÈS 0010. Ne contient aucun secret.
--
-- Nouvelle règle (Pierre, 5 nov. 2026) :
--   * un joueur qui n'a PAS encore parié peut saisir son pari tant que le match n'est pas terminé (donc aussi pendant le
--     match), s'il n'est ni neutralisé ni forfait, et tant que les paris ne sont pas révélés ;
--   * un pari déjà posé n'est plus modifiable dès que le match a commencé, ou que les paris sont révélés (inchangé).
-- =====================================================================================

create function public.pari_saisissable_match(p_match bigint, p_test boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.matches m
                 where m.id = p_match and m.statut in ('a_venir', 'en_cours')
                   and not m.neutralise and m.fin_match <> 'forfait')
     and not public.paris_reveles_match(p_match, p_test)
$$;
revoke all on function public.pari_saisissable_match(bigint, boolean) from public, anon, authenticated;
grant execute on function public.pari_saisissable_match(bigint, boolean) to authenticated;

drop policy bets_insertion on public.bets;
create policy bets_insertion on public.bets for insert to authenticated with check (
  (joueur_id = auth.uid() or (public.est_admin() and public.est_test(joueur_id)))
  and public.joueur_participe_match(match_id, joueur_id)
  and public.pari_saisissable_match(match_id, public.est_test(joueur_id))
);

-- « verrouillé » pour la personne connectée : pari déjà posé -> plus modifiable ; pas de pari -> plus saisissable.
create or replace view public.matches_visibles with (security_invoker = false) as
select
  m.id, m.tournament_id, m.tour, m.heure_prevue, m.p1_id, m.p2_id, m.statut, m.debut_detecte, m.neutralise,
  r.rev                                                   as paris_reveles,
  not (case when exists (select 1 from public.bets b where b.match_id = m.id and b.joueur_id = auth.uid())
            then public.pari_modifiable_match(m.id, g.t)
            else public.pari_saisissable_match(m.id, g.t) end) as verrouille,
  (m.statut = 'termine' and r.rev)                        as resultat_visible,
  case when m.statut = 'termine' and r.rev then m.vainqueur  end as vainqueur,
  case when m.statut = 'termine' and r.rev then m.sets_joues end as sets_joues,
  case when m.statut = 'termine' and r.rev then m.score      end as score,
  case when m.statut = 'termine' and r.rev then m.fin_match  end as fin_match
from public.matches m
cross join lateral (select coalesce(public.est_test(auth.uid()), false) as t) g
cross join lateral (select public.paris_reveles_match(m.id, g.t) as rev) r
where auth.uid() is not null;
