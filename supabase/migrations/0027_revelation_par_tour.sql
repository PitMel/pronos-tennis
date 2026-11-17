-- =====================================================================================
-- Pronos Tennis — migration 0027 : les paris sont révélés TOUR PAR TOUR (Pierre, 17 nov. 2026).
-- À exécuter APRÈS 0026. Ne contient aucun secret.
--
-- Ancienne règle : les paris d'un match devenaient visibles quand tous les joueurs avaient parié SUR CE MATCH.
-- Nouvelle règle : les paris d'un tour (huitièmes, quarts, demi-finales, finale, RR1, RR2, RR3) deviennent visibles,
--   pour tous les matchs du tour en même temps, quand tous les joueurs actifs du groupe (réel / test), hors exclus,
--   ont parié sur TOUS les matchs CONNUS du tour (choix de Pierre : on n'attend pas les matchs pas encore annoncés).
--   * Un match neutralisé compte comme réglé (ses paris sont révélés, il ne bloque pas le tour).
--   * Un match sans aucun joueur concerné (tous exclus) ne bloque pas le tour.
--   * La révélation reste « collante » (table revelations) : ce qui est déjà révélé le reste.
--
-- Résultat d'un match (Pierre, 17 nov. 2026) : visible dès que le match est terminé, SANS attendre la révélation du tour,
--   mais seulement pour qui a déjà parié sur ce match (ou si les paris sont révélés). Un joueur qui n'a pas encore parié
--   peut toujours le faire après la fin du match (migration 0012) : il ne doit donc pas voir le résultat avant son pari.
--
-- 4e notification (push « match terminé », avec les paris de chacun) : seulement quand les paris du match sont révélés.
-- =====================================================================================

-- Tous les joueurs concernés du groupe ont-ils parié sur tous les matchs (non neutralisés) du tour de ce match ?
create function public.groupe_complet_tour(p_match bigint, p_test boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select
    exists (select 1 from public.matches m0 where m0.id = p_match)
    and exists (select 1
                from public.matches m0
                join public.matches x on x.tournament_id = m0.tournament_id and x.tour = m0.tour
                join public.profiles p on p.actif and p.is_test = p_test and public.joueur_participe_match(x.id, p.id)
                where m0.id = p_match)
    and not exists (select 1
                    from public.matches m0
                    join public.matches x on x.tournament_id = m0.tournament_id and x.tour = m0.tour
                    where m0.id = p_match and not x.neutralise
                      and exists (select 1 from public.profiles p
                                  where p.actif and p.is_test = p_test and public.joueur_participe_match(x.id, p.id))
                      and not public.groupe_complet_match(x.id, p_test))
$$;
revoke all on function public.groupe_complet_tour(bigint, boolean) from public, anon, authenticated;
grant execute on function public.groupe_complet_tour(bigint, boolean) to authenticated;

-- Les paris de ce match sont-ils révélés pour ce groupe ? (mémorisé, ou match neutralisé, ou tout le tour est complet)
create or replace function public.paris_reveles_match(p_match bigint, p_test boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.revelations r where r.kind = 'match' and r.ref_id = p_match and r.groupe_test = p_test)
      or coalesce((select m.neutralise from public.matches m where m.id = p_match), false)
      or public.groupe_complet_tour(p_match, p_test)
$$;

-- Mémorisation : un match neutralisé est révélé ; un tour complet est révélé en entier (tous ses matchs en même temps).
create or replace function public.maj_revelations_match(p_match bigint) returns void
language plpgsql security definer set search_path = public as $$
declare g boolean;
begin
  foreach g in array array[false, true] loop
    if coalesce((select m.neutralise from public.matches m where m.id = p_match), false) then
      insert into public.revelations (kind, ref_id, groupe_test) values ('match', p_match, g)
      on conflict do nothing;
    end if;
    if public.groupe_complet_tour(p_match, g) then
      insert into public.revelations (kind, ref_id, groupe_test)
      select 'match', x.id, g
      from public.matches m0 join public.matches x on x.tournament_id = m0.tournament_id and x.tour = m0.tour
      where m0.id = p_match
      on conflict do nothing;
    end if;
  end loop;
end $$;

-- Un match créé, neutralisé ou déplacé d'un tour à l'autre (répartition des poules) peut compléter un tour.
create or replace function public.trg_matches_apres() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.maj_revelations_match(new.id);
  return null;
end $$;
drop trigger matches_apres on public.matches;
create trigger matches_apres after insert or update of neutralise, tour on public.matches
  for each row execute function public.trg_matches_apres();

-- Résultat visible dès la fin du match pour qui a parié sur ce match, ou quand les paris sont révélés.
create or replace view public.matches_visibles with (security_invoker = false) as
select
  m.id, m.tournament_id, m.tour, m.heure_prevue, m.p1_id, m.p2_id, m.statut, m.debut_detecte, m.neutralise,
  r.rev                                                   as paris_reveles,
  not (case when pp.a_parie
            then public.pari_modifiable_match(m.id, g.t)
            else public.pari_saisissable_match(m.id, g.t) end) as verrouille,
  (m.statut = 'termine' and (r.rev or pp.a_parie))        as resultat_visible,
  case when m.statut = 'termine' and (r.rev or pp.a_parie) then m.vainqueur  end as vainqueur,
  case when m.statut = 'termine' and (r.rev or pp.a_parie) then m.sets_joues end as sets_joues,
  case when m.statut = 'termine' and (r.rev or pp.a_parie) then m.score      end as score,
  case when m.statut = 'termine' and (r.rev or pp.a_parie) then m.fin_match  end as fin_match
from public.matches m
cross join lateral (select coalesce(public.est_test(auth.uid()), false) as t) g
cross join lateral (select public.paris_reveles_match(m.id, g.t) as rev) r
cross join lateral (select exists (select 1 from public.bets b where b.match_id = m.id and b.joueur_id = auth.uid()) as a_parie) pp
where auth.uid() is not null;

-- 4e notification (push « match terminé » : le texte donne les paris de chacun) : seulement quand les paris sont révélés.
-- Identique à la migration 0021, sauf la condition « paris révélés » au lieu de « tout le monde a parié sur ce match ».
create or replace function public.notif_a_faire() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r record; v_att integer; v_cle text; v_type text; v_dest jsonb; v_out jsonb := '[]'::jsonb; v_matchs jsonb;
  v_race jsonb; v_clas jsonb; v_vain text; v_fin text; v_push jsonb; v_paris jsonb;
begin
  for r in
    select t.id, t.nom, t.ville, t.categorie, t.annee, m.tour, count(*) as n,
           bool_or(m.statut = 'a_venir') as reste,
           bool_and(m.neutralise or exists (select 1 from public.revelations v
                                            where v.kind = 'match' and v.ref_id = m.id and not v.groupe_test)) as tous_reveles
    from public.tournaments t join public.matches m on m.tournament_id = t.id
    where t.etat in ('pari_tournoi_ouvert', 'en_cours')
    group by t.id, t.nom, t.ville, t.categorie, t.annee, m.tour
  loop
    v_att := case when r.categorie = 'atp_finals' and r.tour in ('RR1', 'RR2', 'RR3') then 4
                  else case r.tour when 'R16' then 8 when 'QF' then 4 when 'SF' then 2 when 'F' then 1 end end;
    continue when v_att is null or r.n < v_att;

    foreach v_type in array array['tour_ouvert', 'paris_visibles'] loop
      continue when (v_type = 'tour_ouvert' and not r.reste) or (v_type = 'paris_visibles' and not r.tous_reveles);
      v_cle := v_type || ':' || r.id || ':' || r.tour;
      v_dest := public.notif_destinataires(v_cle, v_type);
      v_push := public.push_destinataires(v_cle, v_type);
      continue when jsonb_array_length(v_dest) = 0 and jsonb_array_length(v_push) = 0;
      select coalesce(jsonb_agg(jsonb_build_object('p1', a.nom, 'p2', b.nom, 'heure', m.heure_prevue)
                                order by m.heure_prevue nulls last, m.id), '[]'::jsonb) into v_matchs
        from public.matches m join public.players a on a.id = m.p1_id join public.players b on b.id = m.p2_id
        where m.tournament_id = r.id and m.tour = r.tour;
      v_out := v_out || jsonb_build_object('cle', v_cle, 'type', v_type,
        'tournoi', jsonb_build_object('id', r.id, 'nom', r.nom, 'ville', r.ville, 'categorie', r.categorie, 'annee', r.annee),
        'tour', r.tour, 'matchs', v_matchs, 'destinataires', v_dest, 'push_destinataires', v_push);
    end loop;
  end loop;

  for r in
    select t.id, t.nom, t.ville, t.categorie, t.annee, t.vainqueur_id, t.finaliste_id
    from public.tournaments t
    where t.etat = 'clos' and exists (select 1 from public.tournament_results x where x.tournament_id = t.id)
  loop
    v_cle := 'tournoi_termine:' || r.id;
    v_dest := public.notif_destinataires(v_cle, 'tournoi_termine');
    v_push := public.push_destinataires(v_cle, 'tournoi_termine');
    continue when jsonb_array_length(v_dest) = 0 and jsonb_array_length(v_push) = 0;
    select nom into v_vain from public.players where id = r.vainqueur_id;
    select nom into v_fin from public.players where id = r.finaliste_id;
    select coalesce(jsonb_agg(jsonb_build_object('prenom', p.prenom, 'rang', x.rang, 'score_final', x.score_final) order by x.rang, p.prenom), '[]'::jsonb)
      into v_clas
      from public.tournament_results x join public.profiles p on p.id = x.joueur_id
      where x.tournament_id = r.id and not p.is_test and p.actif;
    select jsonb_build_object(
      'tournois', coalesce((select jsonb_agg(jsonb_build_object('id', t2.id, 'annee', t2.annee, 'etat', t2.etat)) from public.tournaments t2 where t2.annee = r.annee), '[]'::jsonb),
      'resultats', coalesce((select jsonb_agg(jsonb_build_object('tournament_id', x.tournament_id, 'joueur_id', x.joueur_id, 'score_final', x.score_final))
                             from public.tournament_results x join public.tournaments t3 on t3.id = x.tournament_id where t3.annee = r.annee), '[]'::jsonb),
      'profils', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'prenom', p.prenom) order by p.prenom) from public.profiles p where p.actif and not p.is_test), '[]'::jsonb))
      into v_race;
    v_out := v_out || jsonb_build_object('cle', v_cle, 'type', 'tournoi_termine',
      'tournoi', jsonb_build_object('id', r.id, 'nom', r.nom, 'ville', r.ville, 'categorie', r.categorie, 'annee', r.annee),
      'vainqueur', v_vain, 'finaliste', v_fin, 'classement', v_clas, 'race_donnees', v_race, 'destinataires', v_dest, 'push_destinataires', v_push);
  end loop;
  -- Quatrième notification (push seulement) : un match dont les paris sont révélés vient de se terminer.
  for r in
    select m.id, m.tour, m.vainqueur, m.sets_joues, m.fin_match, t.id as tid, t.nom, t.ville, t.categorie, t.annee,
           a.nom as nom1, b.nom as nom2
    from public.matches m
      join public.tournaments t on t.id = m.tournament_id
      join public.players a on a.id = m.p1_id
      join public.players b on b.id = m.p2_id
    where t.etat in ('pari_tournoi_ouvert', 'en_cours') and m.statut = 'termine' and not m.neutralise
      and m.fin_match <> 'forfait' and m.vainqueur is not null
      and exists (select 1 from public.revelations v where v.kind = 'match' and v.ref_id = m.id and not v.groupe_test)
  loop
    v_cle := 'match_termine:' || r.id;
    v_push := public.push_destinataires(v_cle, 'match_termine');
    continue when jsonb_array_length(v_push) = 0;
    select coalesce(jsonb_agg(jsonb_build_object('joueur_id', p.id, 'prenom', p.prenom, 'choix', b2.choix, 'confiance', b2.confiance, 'sets', b2.sets)
                              order by p.prenom), '[]'::jsonb) into v_paris
      from public.bets b2 join public.profiles p on p.id = b2.joueur_id
      where b2.match_id = r.id and p.actif and not p.is_test;
    v_out := v_out || jsonb_build_object('cle', v_cle, 'type', 'match_termine',
      'tournoi', jsonb_build_object('id', r.tid, 'nom', r.nom, 'ville', r.ville, 'categorie', r.categorie, 'annee', r.annee),
      'tour', r.tour,
      'match', jsonb_build_object('p1', r.nom1, 'p2', r.nom2, 'vainqueur', r.vainqueur, 'sets_joues', r.sets_joues, 'fin_match', r.fin_match),
      'paris', v_paris, 'destinataires', '[]'::jsonb, 'push_destinataires', v_push);
  end loop;
  return v_out;
end $$;

-- Mémorise les révélations de ce qui est déjà complet au moment de la migration.
select public.maj_toutes_revelations();
