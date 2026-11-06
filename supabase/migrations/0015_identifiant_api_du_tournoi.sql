-- =====================================================================================
-- Pronos Tennis — migration 0015 : identifiant d'API d'origine de chaque match
-- À exécuter APRÈS 0014. Ne contient aucun secret.
--
-- Un même tournoi peut avoir deux identifiants dans l'API (Paris : 1725 et 1726, ATP Finals : 2794 et 2795).
-- Jusqu'ici la base gardait l'identifiant du match mais pas celui du tournoi de l'API d'où il venait.
-- * matches.api_tournament_id : renseigné par la synchronisation à chaque passage (vide pour les matchs
--   créés avant cette migration, tant que l'API ne les renvoie plus ; vide aussi pour les archives et les tests).
-- * sync_appliquer : identique à celle de la migration 0004, plus une écriture de cette colonne.
-- =====================================================================================

alter table public.matches add column api_tournament_id text;
comment on column public.matches.api_tournament_id is 'Identifiant du tournoi dans l''API (1725 ou 1726 pour Paris…) d''où vient le match ; renseigné par la synchronisation.';

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
        values (v_api, v_t, m->>'tour', n_heure, v_p1, v_p2, f_statut,
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
    perform public.sync_maj_etat_tournoi(t);
  end loop;

  return jsonb_build_object('crees', v_crees, 'maj', v_maj, 'ignores', v_ign, 'anomalies', v_anom);
end $$;

revoke all on function public.sync_appliquer(jsonb) from public, anon, authenticated;
grant execute on function public.sync_appliquer(jsonb) to service_role;
