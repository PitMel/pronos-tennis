-- =====================================================================================
-- Pronos Tennis — migration 0006 : clôture, correction et réouverture d'un tournoi par l'administrateur
-- À exécuter APRÈS 0005. Ne contient aucun secret.
--
-- La clôture automatique (0005) est réservée au rôle « service ». L'administrateur doit pouvoir, depuis l'application :
--   * lire les données d'un tournoi pour calculer ses points (admin_donnees_cloture), même si les conditions automatiques
--     ne sont pas remplies (joueur qui n'a pas parié, match jamais révélé…) ;
--   * clôturer le tournoi de force, ou corriger une clôture déjà faite après avoir rectifié un match (admin_cloturer_tournoi) ;
--   * rouvrir un tournoi clos (admin_rouvrir_tournoi) : son archive est effacée, il se reclôture ensuite.
-- Le calcul des points reste dans le moteur JavaScript (src/moteur) : la fonction enregistre ce que l'application calcule,
-- après avoir vérifié qu'il y a exactement un résultat par joueur concerné.
-- Un joueur sans pari marque 0 point (comportement du moteur) ; une clôture forcée révèle les paris de tous les matchs
-- du tournoi pour les groupes qui ont parié (le tournoi est terminé : plus rien à cacher).
-- =====================================================================================

-- ------------------------------------------------------------------ données de clôture sans condition (interne)

create function public.donnees_cloture_brutes(p_tournoi bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_sit jsonb; v_cat text; v_res jsonb; v_groupes jsonb := '[]'::jsonb; g boolean;
begin
  select categorie into v_cat from public.tournaments where id = p_tournoi;
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
    'tournoi_id', p_tournoi, 'categorie', v_cat, 'resultat', v_res, 'groupes', v_groupes,
    'matchs', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'tour', m.tour, 'vainqueur', m.vainqueur,
                  'sets_joues', m.sets_joues, 'fin_match', m.fin_match, 'neutralise', m.neutralise) order by m.id), '[]'::jsonb)
               from public.matches m where m.tournament_id = p_tournoi));
end $$;

-- La clôture automatique garde ses conditions, puis réutilise la même lecture.
create or replace function public.sync_donnees_cloture(p_tournoi bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_sit jsonb;
begin
  v_sit := public.sync_cloture_situation(p_tournoi);
  if not (v_sit ->> 'eligible')::boolean then
    raise exception 'Clôture impossible : conditions non remplies (%)', v_sit;
  end if;
  return public.donnees_cloture_brutes(p_tournoi);
end $$;

-- ------------------------------------------------------------------ administrateur

create function public.admin_donnees_cloture(p_tournoi bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.est_admin() then raise exception 'Réservé à l''administrateur'; end if;
  return public.donnees_cloture_brutes(p_tournoi)
      || jsonb_build_object('situation', public.sync_cloture_situation(p_tournoi),
                            'etat', (select t.etat from public.tournaments t where t.id = p_tournoi),
                            'cloture_auto_desactivee', (select t.cloture_auto_desactivee from public.tournaments t where t.id = p_tournoi));
end $$;

-- p_resultats : [{joueur_id, points_matchs, points_pari_tournoi, bonus_classement, score_final, rang}], un par joueur concerné.
-- Clôture un tournoi (même si les conditions automatiques ne sont pas remplies) ou remplace l'archive d'un tournoi déjà clos.
create function public.admin_cloturer_tournoi(p_tournoi bigint, p_resultats jsonb, p_vainqueur bigint, p_finaliste bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_etat text; v_don jsonb; v_attendus uuid[]; v_recus uuid[]; v_groupe jsonb; r jsonb;
begin
  if auth.uid() is null or not public.est_admin() then raise exception 'Réservé à l''administrateur'; end if;
  select etat into v_etat from public.tournaments where id = p_tournoi for update;
  if not found then raise exception 'Tournoi inconnu'; end if;
  if jsonb_typeof(p_resultats) is distinct from 'array' then raise exception 'Résultats invalides'; end if;
  if p_vainqueur is null or p_finaliste is null or p_vainqueur = p_finaliste then
    raise exception 'Le vainqueur et le finaliste du tournoi doivent être deux joueurs différents';
  end if;

  v_don := public.donnees_cloture_brutes(p_tournoi);
  select coalesce(array_agg(j::uuid), '{}') into v_attendus
    from jsonb_array_elements(v_don -> 'groupes') gr, jsonb_array_elements_text(gr -> 'joueurs') j;
  select coalesce(array_agg((x ->> 'joueur_id')::uuid), '{}') into v_recus from jsonb_array_elements(p_resultats) x;
  if cardinality(v_recus) <> cardinality(v_attendus)
     or exists (select u from unnest(v_recus) u except select u from unnest(v_attendus) u)
     or exists (select u from unnest(v_attendus) u except select u from unnest(v_recus) u)
     or (select count(distinct u) from unnest(v_recus) u) <> cardinality(v_recus) then
    raise exception 'Résultats incomplets ou inattendus : un résultat exactement par joueur des groupes concernés est exigé';
  end if;

  delete from public.tournament_results where tournament_id = p_tournoi;
  for r in select * from jsonb_array_elements(p_resultats) loop
    insert into public.tournament_results (tournament_id, joueur_id, points_matchs, points_pari_tournoi, bonus_classement, score_final, rang)
    values (p_tournoi, (r ->> 'joueur_id')::uuid, r ->> 'points_matchs', r ->> 'points_pari_tournoi',
            r ->> 'bonus_classement', r ->> 'score_final', (r ->> 'rang')::integer);
  end loop;

  -- Paris du tournoi et de tous ses matchs révélés et figés pour les groupes concernés.
  for v_groupe in select * from jsonb_array_elements(v_don -> 'groupes') loop
    insert into public.revelations (kind, ref_id, groupe_test) values ('tournoi', p_tournoi, (v_groupe ->> 'test')::boolean)
      on conflict do nothing;
    insert into public.revelations (kind, ref_id, groupe_test)
      select 'match', m.id, (v_groupe ->> 'test')::boolean from public.matches m where m.tournament_id = p_tournoi
      on conflict do nothing;
  end loop;

  update public.tournaments
     set etat = 'clos', vainqueur_id = p_vainqueur, finaliste_id = p_finaliste, cloture_auto_desactivee = true
   where id = p_tournoi;
  return jsonb_build_object('statut', case when v_etat = 'clos' then 'corrige' else 'cloture' end, 'resultats', jsonb_array_length(p_resultats));
end $$;

-- Rouvre un tournoi clos : il repasse « en cours », son archive est effacée, la clôture automatique est désactivée pour lui.
create function public.admin_rouvrir_tournoi(p_tournoi bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_etat text;
begin
  if auth.uid() is null or not public.est_admin() then raise exception 'Réservé à l''administrateur'; end if;
  select etat into v_etat from public.tournaments where id = p_tournoi for update;
  if not found then raise exception 'Tournoi inconnu'; end if;
  if v_etat <> 'clos' then return jsonb_build_object('statut', 'deja_ouvert'); end if;
  delete from public.tournament_results where tournament_id = p_tournoi;
  update public.tournaments
     set etat = 'en_cours', vainqueur_id = null, finaliste_id = null, cloture_auto_desactivee = true
   where id = p_tournoi;
  return jsonb_build_object('statut', 'rouvert');
end $$;

-- ------------------------------------------------------------------ droits d'exécution (rien n'est ouvert par défaut)

revoke all on function public.donnees_cloture_brutes(bigint)                          from public, anon, authenticated;
revoke all on function public.admin_donnees_cloture(bigint)                           from public, anon, authenticated;
revoke all on function public.admin_cloturer_tournoi(bigint, jsonb, bigint, bigint)   from public, anon, authenticated;
revoke all on function public.admin_rouvrir_tournoi(bigint)                           from public, anon, authenticated;
grant execute on function public.admin_donnees_cloture(bigint)                        to authenticated;
grant execute on function public.admin_cloturer_tournoi(bigint, jsonb, bigint, bigint) to authenticated;
grant execute on function public.admin_rouvrir_tournoi(bigint)                        to authenticated;
-- sync_donnees_cloture garde ses droits (service_role) : « create or replace » ne les modifie pas.
