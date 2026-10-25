-- =====================================================================================
-- Pronos Tennis — migration 0005 : clôture automatique d'un tournoi
-- À exécuter APRÈS 0004. Ne contient aucun secret.
--
-- Règle (Pierre, 23-25 oct. 2026) : un tournoi est clôturé automatiquement quand
--   1. sa finale est terminée avec un vainqueur connu ;
--   2. tous ses matchs ont, pour chaque groupe (réel / test) qui a parié, soit reçu un pari de tous les joueurs du groupe,
--      soit été neutralisés (c'est exactement « paris révélés », voir paris_reveles_match) ;
--   Un groupe qui n'a aucun pari dans ce tournoi est ignoré (sinon le groupe réel, qui ne parie pas avant janvier 2027,
--   empêcherait toute clôture pendant les essais).
-- Le calcul des points se fait dans le moteur JavaScript (src/moteur) : la tâche de synchronisation lit les données
-- (sync_donnees_cloture), calcule, puis les fait enregistrer (sync_cloturer_tournoi), qui revérifie les conditions.
--
-- L'administrateur peut rouvrir un tournoi : dès qu'il le fait, la clôture automatique est désactivée pour ce tournoi
-- (colonne cloture_auto_desactivee), sinon la tâche le reclôturerait aussitôt. Il le reclôture ensuite lui-même.
-- =====================================================================================

alter table public.tournaments add column cloture_auto_desactivee boolean not null default false;

-- Réouverture manuelle : un tournoi qui passe de « clos » à un autre état par une personne connectée n'est plus clôturé automatiquement.
create function public.trg_tournoi_rouvert() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.etat = 'clos' and new.etat <> 'clos' and auth.uid() is not null then
    new.cloture_auto_desactivee := true;
  end if;
  return new;
end $$;
create trigger tournoi_rouvert before update of etat on public.tournaments
  for each row execute function public.trg_tournoi_rouvert();

-- ------------------------------------------------------------------ situation d'un tournoi

create function public.sync_cloture_situation(p_tournoi bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_final boolean; v_groupes jsonb := '[]'::jsonb; g boolean; v_avec boolean; v_non integer; v_eligible boolean := false; v_ok boolean := true;
begin
  select exists (select 1 from public.matches m
                 where m.tournament_id = p_tournoi and m.tour = 'F' and m.statut = 'termine' and m.vainqueur in (1, 2))
    into v_final;
  foreach g in array array[false, true] loop
    v_avec := exists (select 1 from public.bets b join public.matches m on m.id = b.match_id join public.profiles p on p.id = b.joueur_id
                      where m.tournament_id = p_tournoi and p.is_test = g)
           or exists (select 1 from public.tournament_bets tb join public.profiles p on p.id = tb.joueur_id
                      where tb.tournament_id = p_tournoi and p.is_test = g);
    select count(*) into v_non from public.matches m
      where m.tournament_id = p_tournoi and not public.paris_reveles_match(m.id, g);
    v_groupes := v_groupes || jsonb_build_object('test', g, 'avec_paris', v_avec, 'matchs_non_reveles', v_non);
    if v_avec then
      v_eligible := true;
      if v_non > 0 then v_ok := false; end if;
    end if;
  end loop;
  return jsonb_build_object('tournoi_id', p_tournoi, 'finale_comptee', v_final, 'groupes', v_groupes,
                            'eligible', v_final and v_eligible and v_ok);
end $$;

-- Tournois que la tâche automatique peut examiner : non clos, clôture automatique non désactivée.
create function public.sync_cloture_candidats() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public.sync_cloture_situation(t.id) || jsonb_build_object('nom', t.nom) order by t.id), '[]'::jsonb)
  from public.tournaments t
  where t.etat <> 'clos' and not t.cloture_auto_desactivee
$$;

-- ------------------------------------------------------------------ données pour le moteur

create function public.sync_donnees_cloture(p_tournoi bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_sit jsonb; v_cat text; v_res jsonb; v_groupes jsonb := '[]'::jsonb; g boolean;
begin
  v_sit := public.sync_cloture_situation(p_tournoi);
  if not (v_sit ->> 'eligible')::boolean then
    raise exception 'Clôture impossible : conditions non remplies (%)', v_sit;
  end if;
  select categorie into v_cat from public.tournaments where id = p_tournoi;
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

-- ------------------------------------------------------------------ enregistrement de la clôture

-- p_resultats : [{joueur_id, points_matchs, points_pari_tournoi, bonus_classement, score_final, rang}]
-- Revérifie les conditions, exige exactement un résultat par joueur des groupes concernés, archive et clôt, en une seule transaction.
create function public.sync_cloturer_tournoi(p_tournoi bigint, p_resultats jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_etat text; v_desactivee boolean; v_don jsonb; v_attendus uuid[]; v_recus uuid[]; v_groupe jsonb; r jsonb;
begin
  select etat, cloture_auto_desactivee into v_etat, v_desactivee from public.tournaments where id = p_tournoi for update;
  if not found then raise exception 'Tournoi inconnu'; end if;
  if v_etat = 'clos' then return jsonb_build_object('statut', 'deja_clos'); end if;
  if v_desactivee then raise exception 'La clôture automatique est désactivée pour ce tournoi (réouvert par l''administrateur)'; end if;
  if jsonb_typeof(p_resultats) is distinct from 'array' then raise exception 'Résultats invalides'; end if;

  v_don := public.sync_donnees_cloture(p_tournoi); -- revérifie l'éligibilité (exception sinon)
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

  -- Les paris tournoi sont révélés et figés pour les groupes concernés (comme pour les matchs).
  for v_groupe in select * from jsonb_array_elements(v_don -> 'groupes') loop
    insert into public.revelations (kind, ref_id, groupe_test) values ('tournoi', p_tournoi, (v_groupe ->> 'test')::boolean)
      on conflict do nothing;
  end loop;

  update public.tournaments
     set etat = 'clos',
         vainqueur_id = (v_don -> 'resultat' ->> 'vainqueur_id')::bigint,
         finaliste_id = (v_don -> 'resultat' ->> 'finaliste_id')::bigint
   where id = p_tournoi;
  return jsonb_build_object('statut', 'cloture', 'resultats', jsonb_array_length(p_resultats));
end $$;

-- ------------------------------------------------------------------ droits : réservé au rôle « service »

revoke all on function public.trg_tournoi_rouvert()              from public, anon, authenticated;
revoke all on function public.sync_cloture_situation(bigint)     from public, anon, authenticated;
revoke all on function public.sync_cloture_candidats()           from public, anon, authenticated;
revoke all on function public.sync_donnees_cloture(bigint)       from public, anon, authenticated;
revoke all on function public.sync_cloturer_tournoi(bigint, jsonb) from public, anon, authenticated;

grant execute on function public.sync_cloture_situation(bigint)  to service_role;
grant execute on function public.sync_cloture_candidats()        to service_role;
grant execute on function public.sync_donnees_cloture(bigint)    to service_role;
grant execute on function public.sync_cloturer_tournoi(bigint, jsonb) to service_role;
