-- Ajoute la saison du tournoi aux données de clôture, pour que le moteur applique le barème de bonus de la saison (2026 : 2e place à 12 / 6 / 5).
create or replace function public.donnees_cloture_brutes(p_tournoi bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_sit jsonb; v_cat text; v_annee integer; v_res jsonb; v_groupes jsonb := '[]'::jsonb; g boolean;
begin
  select categorie, annee into v_cat, v_annee from public.tournaments where id = p_tournoi;
  if v_cat is null then raise exception 'Tournoi inconnu'; end if;
  v_sit := public.sync_cloture_situation(p_tournoi);
  select jsonb_build_object('vainqueur_id', case m.vainqueur when 1 then m.p1_id else m.p2_id end,
                            'finaliste_id', case m.vainqueur when 1 then m.p2_id else m.p1_id end)
    into v_res from public.matches m where m.tournament_id = p_tournoi and m.tour = 'F' and m.statut = 'termine' and m.vainqueur in (1, 2)
    order by m.id limit 1;
  foreach g in array array[false, true] loop
    if exists (select 1 from jsonb_array_elements(v_sit -> 'groupes') x where (x ->> 'test')::boolean = g and (x ->> 'avec_paris')::boolean) then
      v_groupes := v_groupes || jsonb_build_object(
        'test', g,
        'joueurs', (select coalesce(jsonb_agg(p.id order by p.prenom), '[]'::jsonb) from public.profiles p
                    where p.is_test = g and public.joueur_participe_tournoi(p_tournoi, p.id)),
        'paris', (select coalesce(jsonb_agg(jsonb_build_object('match_id', b.match_id, 'joueur_id', b.joueur_id,
                          'choix', b.choix, 'confiance', b.confiance, 'sets', b.sets) order by b.id), '[]'::jsonb)
                  from public.bets b join public.matches m on m.id = b.match_id join public.profiles p on p.id = b.joueur_id
                  where m.tournament_id = p_tournoi and p.is_test = g),
        'paris_tournoi', (select coalesce(jsonb_agg(jsonb_build_object('joueur_id', tb.joueur_id,
                          'vainqueur_id', tb.vainqueur_id, 'finaliste_id', tb.finaliste_id) order by tb.id), '[]'::jsonb)
                  from public.tournament_bets tb join public.profiles p on p.id = tb.joueur_id
                  where tb.tournament_id = p_tournoi and p.is_test = g));
    end if;
  end loop;
  return jsonb_build_object(
    'tournoi_id', p_tournoi, 'categorie', v_cat, 'annee', v_annee, 'resultat', v_res, 'groupes', v_groupes,
    'matchs', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'tour', m.tour, 'vainqueur', m.vainqueur,
                  'sets_joues', m.sets_joues, 'fin_match', m.fin_match, 'neutralise', m.neutralise) order by m.id), '[]'::jsonb)
               from public.matches m where m.tournament_id = p_tournoi));
end $$;
