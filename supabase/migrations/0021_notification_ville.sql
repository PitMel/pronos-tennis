-- Migration 0021 : notif_a_faire ajoute la ville du tournoi (titre des notifications push = lieu, sauf Grands Chelems et ATP Finals).

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
  -- Quatrième notification (push seulement) : un match sur lequel tout le monde a parié vient de se terminer.
  for r in
    select m.id, m.tour, m.vainqueur, m.sets_joues, m.fin_match, t.id as tid, t.nom, t.ville, t.categorie, t.annee,
           a.nom as nom1, b.nom as nom2
    from public.matches m
      join public.tournaments t on t.id = m.tournament_id
      join public.players a on a.id = m.p1_id
      join public.players b on b.id = m.p2_id
    where t.etat in ('pari_tournoi_ouvert', 'en_cours') and m.statut = 'termine' and not m.neutralise
      and m.fin_match <> 'forfait' and m.vainqueur is not null
      and public.groupe_complet_match(m.id, false)
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
