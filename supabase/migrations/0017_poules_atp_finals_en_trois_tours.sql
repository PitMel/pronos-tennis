-- =====================================================================================
-- Pronos Tennis — migration 0017 : poules des ATP Finals en trois tours (Round Robin 1, 2, 3)
-- À exécuter APRÈS 0016. Ne contient aucun secret.
--
-- * Le tour « RR » devient RR1, RR2, RR3 (4 matchs chacun, multiplicateur ×1 comme avant). Aucun match de poule n'existait en base.
-- * L'API ne distingue pas ces trois tours (elle envoie « RR ») : la synchronisation range les matchs de poule dans l'ordre de
--   leur horaire prévu : 4 premiers = RR1, 4 suivants = RR2, 4 derniers = RR3. Les matchs sans horaire viennent après ceux qui en ont
--   (dans l'ordre d'arrivée), ce qui remplit RR1, RR2, RR3 dans l'ordre ; quand les horaires arrivent, les matchs changent de tour.
--   Les matchs corrigés à la main ne sont jamais déplacés.
-- * Mises à jour des fonctions qui connaissaient « RR » : vérification du tour, joueur éliminé, ouverture du pari tournoi,
--   notifications (4 matchs attendus par tour de poule), sync_appliquer.
-- =====================================================================================

alter table public.matches drop constraint matches_tour_check;
alter table public.matches add constraint matches_tour_check check (tour in ('R16', 'QF', 'SF', 'F', 'RR1', 'RR2', 'RR3'));

create or replace function public.trg_matches_verifier() returns trigger
language plpgsql security definer set search_path = public as $$
declare cat text;
begin
  select t.categorie into cat from public.tournaments t where t.id = new.tournament_id;
  if not ((cat in ('grand_slam', 'masters_1000') and new.tour in ('R16', 'QF', 'SF', 'F'))
       or (cat = 'atp_finals' and new.tour in ('RR1', 'RR2', 'RR3', 'SF', 'F'))) then
    raise exception 'Le tour « % » n''existe pas dans un tournoi de catégorie « % ».', new.tour, cat;
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.joueur_elimine(p_tournoi bigint, p_joueur bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.matches m
    where m.tournament_id = p_tournoi and m.tour not in ('RR1', 'RR2', 'RR3') and m.statut = 'termine' and not m.neutralise
      and ((m.p1_id = p_joueur and m.vainqueur = 2) or (m.p2_id = p_joueur and m.vainqueur = 1))
  )
$$;

create or replace function public.sync_maj_etat_tournoi(p_tournoi bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_cat text; v_etat text; v_n integer; v_demarre boolean; v_tard boolean;
begin
  select categorie, etat into v_cat, v_etat from public.tournaments where id = p_tournoi;
  if v_etat is null or v_etat = 'clos' then return; end if;
  select count(*) into v_n from public.matches
    where tournament_id = p_tournoi and tour = any (case when v_cat = 'atp_finals' then array['RR1', 'RR2', 'RR3'] else array['R16'] end);
  v_demarre := exists (select 1 from public.matches where tournament_id = p_tournoi and statut <> 'a_venir');
  v_tard := exists (select 1 from public.matches where tournament_id = p_tournoi and tour in ('QF', 'SF', 'F'));
  if v_etat = 'a_venir' and (v_n >= 1 or v_demarre or v_tard) then
    v_etat := 'pari_tournoi_ouvert';
  end if;
  if v_etat = 'pari_tournoi_ouvert' and v_demarre then
    v_etat := 'en_cours';
  end if;
  update public.tournaments set etat = v_etat where id = p_tournoi and etat is distinct from v_etat;
end $$;

-- Range les matchs de poule d'un tournoi : par horaire prévu (les sans-horaire à la fin, dans l'ordre d'arrivée), 4 par tour.
create or replace function public.sync_repartir_poules(p_tournoi bigint) returns void
language sql security definer set search_path = public as $$
  update public.matches m set tour = r.voulu
  from (select id, 'RR' || least(3, (row_number() over (order by heure_prevue nulls last, id) - 1) / 4 + 1) as voulu
        from public.matches where tournament_id = p_tournoi and tour in ('RR1', 'RR2', 'RR3')) r
  where m.id = r.id and not m.modifie_manuellement and m.tour <> r.voulu
$$;
revoke all on function public.sync_repartir_poules(bigint) from public, anon, authenticated;
grant execute on function public.sync_repartir_poules(bigint) to service_role;

create or replace function public.sync_appliquer(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m jsonb; v_api text; v_t bigint; v_cat text;
  v_p1 bigint; v_p2 bigint;
  n_statut text; n_vain smallint; n_fin text; n_sets smallint; n_score jsonb; n_heure timestamptz;
  e public.matches;
  f_statut text; f_debut timestamptz;
  v_crees integer := 0; v_maj integer := 0; v_ign integer := 0;
  v_anom jsonb := '[]'::jsonb;
  v_touches bigint[] := '{}';
  t bigint;
begin
  for m in select * from jsonb_array_elements(coalesce(p_payload->'matchs', '[]'::jsonb)) loop
    v_api := m->>'api_id';
    begin
      -- ---------- validations (on ignore ce qui n'est pas suivi, on signale ce qui est anormal)
      if coalesce(v_api, '') = '' then
        v_ign := v_ign + 1; continue;
      end if;
      v_t := public.sync_tournoi_pour_api(m->>'tournament_api_id');
      if v_t is null then
        v_ign := v_ign + 1; continue;
      end if;
      select categorie into v_cat from public.tournaments where id = v_t;
      if not ((v_cat in ('grand_slam', 'masters_1000') and m->>'tour' in ('R16', 'QF', 'SF', 'F'))
           or (v_cat = 'atp_finals' and m->>'tour' in ('RR', 'SF', 'F'))) then
        v_ign := v_ign + 1; continue;
      end if;
      v_p1 := public.sync_joueur(m->'p1');
      v_p2 := public.sync_joueur(m->'p2');
      if v_p1 is null or v_p2 is null or v_p1 = v_p2 then
        v_anom := v_anom || jsonb_build_object('api_id', v_api, 'code', 'joueurs_incomplets', 'detail', 'affiche incomplète ou incohérente');
        v_ign := v_ign + 1; continue;
      end if;

      n_statut := nullif(m->>'statut', '');
      n_vain   := nullif(m->>'vainqueur', '')::smallint;
      n_fin    := coalesce(nullif(m->>'fin_match', ''), 'normal');
      n_sets   := nullif(m->>'sets_joues', '')::smallint;
      n_score  := case when jsonb_typeof(m->'score') = 'object' then m->'score' end;
      n_heure  := nullif(m->>'heure_prevue', '')::timestamptz;
      if n_statut is not null and n_statut not in ('a_venir', 'en_cours', 'termine') then
        v_anom := v_anom || jsonb_build_object('api_id', v_api, 'code', 'statut_inconnu', 'detail', n_statut);
        n_statut := null;
      end if;
      if n_fin not in ('normal', 'abandon', 'forfait') then n_fin := 'normal'; end if;
      if n_vain is not null and n_vain not in (1, 2) then n_vain := null; end if;
      if n_statut = 'termine' and n_vain is null and n_fin <> 'forfait' then
        -- « Finished » sans vainqueur (cas constaté) : on ne conclut rien, l'administrateur tranchera.
        v_anom := v_anom || jsonb_build_object('api_id', v_api, 'code', 'termine_sans_vainqueur', 'detail', 'match terminé sans vainqueur : laissé en l''état');
        n_statut := null;
      end if;

      select * into e from public.matches where api_id = v_api;

      if not found then
        -- ---------- nouveau match
        f_statut := coalesce(n_statut, 'a_venir');
        insert into public.matches (api_id, tournament_id, tour, heure_prevue, p1_id, p2_id, statut, debut_detecte,
                                    vainqueur, sets_joues, score, fin_match)
        values (v_api, v_t, case when m->>'tour' = 'RR' then 'RR1' else m->>'tour' end, n_heure, v_p1, v_p2, f_statut,
                case when f_statut in ('en_cours', 'termine') then now() end,
                case when f_statut = 'termine' then n_vain end,
                case when f_statut = 'termine' then n_sets end,
                n_score,
                case when f_statut = 'termine' then n_fin else 'normal' end);
        v_crees := v_crees + 1;
      elsif e.modifie_manuellement then
        -- ---------- match corrigé à la main : on ne touche ni au résultat ni au statut
        update public.matches set
          heure_prevue = case when e.statut = 'a_venir' and n_heure is not null then n_heure else e.heure_prevue end,
          debut_detecte = coalesce(e.debut_detecte, case when n_statut in ('en_cours', 'termine') then now() end)
        where id = e.id
          and (heure_prevue, debut_detecte) is distinct from
              (case when e.statut = 'a_venir' and n_heure is not null then n_heure else e.heure_prevue end,
               coalesce(e.debut_detecte, case when n_statut in ('en_cours', 'termine') then now() end));
        v_ign := v_ign + 1;
      else
        -- ---------- match connu : mise à jour sans jamais reculer
        f_statut := e.statut;
        if n_statut is not null
           and (case n_statut when 'a_venir' then 0 when 'en_cours' then 1 else 2 end)
             >= (case e.statut when 'a_venir' then 0 when 'en_cours' then 1 else 2 end) then
          f_statut := n_statut;
        end if;
        f_debut := coalesce(e.debut_detecte, case when f_statut in ('en_cours', 'termine') then now() end);

        -- joueurs : on ne les change pas si des paris existent déjà (les paris portent sur « joueur 1 / joueur 2 »)
        if (e.p1_id, e.p2_id) is distinct from (v_p1, v_p2) then
          if exists (select 1 from public.bets b where b.match_id = e.id) then
            v_anom := v_anom || jsonb_build_object('api_id', v_api, 'code', 'joueurs_changes', 'detail', 'l''API annonce d''autres joueurs alors que des paris existent : non modifié');
            v_p1 := e.p1_id; v_p2 := e.p2_id;
          end if;
        end if;

        if f_statut = 'termine' and e.statut = 'termine' and n_statut = 'termine'
           and (e.vainqueur is distinct from n_vain) then
          v_anom := v_anom || jsonb_build_object('api_id', v_api, 'code', 'resultat_modifie_par_api',
                                                  'detail', format('vainqueur %s -> %s', e.vainqueur, n_vain));
        end if;

        update public.matches set
          p1_id = v_p1, p2_id = v_p2,
          heure_prevue = case when e.statut = 'a_venir' and n_heure is not null then n_heure else e.heure_prevue end,
          statut = f_statut,
          debut_detecte = f_debut,
          score = coalesce(n_score, e.score),
          vainqueur   = case when f_statut = 'termine' and n_statut = 'termine' then n_vain   else e.vainqueur end,
          sets_joues  = case when f_statut = 'termine' and n_statut = 'termine' then n_sets   else e.sets_joues end,
          fin_match   = case when f_statut = 'termine' and n_statut = 'termine' then n_fin    else e.fin_match end
        where id = e.id
          and (p1_id, p2_id, heure_prevue, statut, debut_detecte, score, vainqueur, sets_joues, fin_match) is distinct from
              (v_p1, v_p2,
               case when e.statut = 'a_venir' and n_heure is not null then n_heure else e.heure_prevue end,
               f_statut, f_debut, coalesce(n_score, e.score),
               case when f_statut = 'termine' and n_statut = 'termine' then n_vain  else e.vainqueur end,
               case when f_statut = 'termine' and n_statut = 'termine' then n_sets  else e.sets_joues end,
               case when f_statut = 'termine' and n_statut = 'termine' then n_fin   else e.fin_match end);
        if found then v_maj := v_maj + 1; end if;
      end if;

      -- Identifiant d'API d'origine du match (ex. 1725 ou 1726 pour Paris) : pour savoir comment un tournoi se répartit entre ses identifiants.
      -- Écriture à part : elle ne compte ni dans « crees » ni dans « maj », et n'est faite que si la valeur change.
      update public.matches set api_tournament_id = m->>'tournament_api_id'
        where api_id = v_api and api_tournament_id is distinct from (m->>'tournament_api_id');

      if not (v_t = any (v_touches)) then v_touches := v_touches || v_t; end if;
    exception when others then
      v_anom := v_anom || jsonb_build_object('api_id', v_api, 'code', 'erreur', 'detail', left(sqlerrm, 200));
    end;
  end loop;

  foreach t in array v_touches loop
    perform public.sync_repartir_poules(t);
    perform public.sync_maj_etat_tournoi(t);
  end loop;

  return jsonb_build_object('crees', v_crees, 'maj', v_maj, 'ignores', v_ign, 'anomalies', v_anom);
end $$;

revoke all on function public.sync_appliquer(jsonb) from public, anon, authenticated;
grant execute on function public.sync_appliquer(jsonb) to service_role;

create or replace function public.notif_a_faire() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r record; v_att integer; v_cle text; v_type text; v_dest jsonb; v_out jsonb := '[]'::jsonb; v_matchs jsonb;
  v_race jsonb; v_clas jsonb; v_vain text; v_fin text;
begin
  for r in
    select t.id, t.nom, t.categorie, t.annee, m.tour, count(*) as n,
           bool_or(m.statut = 'a_venir') as reste,
           bool_and(m.neutralise or exists (select 1 from public.revelations v
                                            where v.kind = 'match' and v.ref_id = m.id and not v.groupe_test)) as tous_reveles
    from public.tournaments t join public.matches m on m.tournament_id = t.id
    where t.etat in ('pari_tournoi_ouvert', 'en_cours')
    group by t.id, t.nom, t.categorie, t.annee, m.tour
  loop
    v_att := case when r.categorie = 'atp_finals' and r.tour in ('RR1', 'RR2', 'RR3') then 4
                  else case r.tour when 'R16' then 8 when 'QF' then 4 when 'SF' then 2 when 'F' then 1 end end;
    continue when v_att is null or r.n < v_att;

    foreach v_type in array array['tour_ouvert', 'paris_visibles'] loop
      continue when (v_type = 'tour_ouvert' and not r.reste) or (v_type = 'paris_visibles' and not r.tous_reveles);
      v_cle := v_type || ':' || r.id || ':' || r.tour;
      v_dest := public.notif_destinataires(v_cle, v_type);
      continue when jsonb_array_length(v_dest) = 0;
      select coalesce(jsonb_agg(jsonb_build_object('p1', a.nom, 'p2', b.nom, 'heure', m.heure_prevue)
                                order by m.heure_prevue nulls last, m.id), '[]'::jsonb) into v_matchs
        from public.matches m join public.players a on a.id = m.p1_id join public.players b on b.id = m.p2_id
        where m.tournament_id = r.id and m.tour = r.tour;
      v_out := v_out || jsonb_build_object('cle', v_cle, 'type', v_type,
        'tournoi', jsonb_build_object('id', r.id, 'nom', r.nom, 'categorie', r.categorie, 'annee', r.annee),
        'tour', r.tour, 'matchs', v_matchs, 'destinataires', v_dest);
    end loop;
  end loop;

  for r in
    select t.id, t.nom, t.categorie, t.annee, t.vainqueur_id, t.finaliste_id
    from public.tournaments t
    where t.etat = 'clos' and exists (select 1 from public.tournament_results x where x.tournament_id = t.id)
  loop
    v_cle := 'tournoi_termine:' || r.id;
    v_dest := public.notif_destinataires(v_cle, 'tournoi_termine');
    continue when jsonb_array_length(v_dest) = 0;
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
      'tournoi', jsonb_build_object('id', r.id, 'nom', r.nom, 'categorie', r.categorie, 'annee', r.annee),
      'vainqueur', v_vain, 'finaliste', v_fin, 'classement', v_clas, 'race_donnees', v_race, 'destinataires', v_dest);
  end loop;
  return v_out;
end $$;
