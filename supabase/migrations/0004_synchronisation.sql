-- =====================================================================================
-- Pronos Tennis — migration 0004 : fonctions de synchronisation avec l'API de tennis
-- À exécuter APRÈS 0003. Ne contient aucun secret.
--
-- La tâche automatique (GitHub Actions) interroge l'API de tennis, met les données en forme (src/sync/), puis appelle
-- UNIQUEMENT ces fonctions avec la clé « service » (secret GitHub). Elles sont fermées au navigateur (anon, authenticated).
-- Toute la logique qui décide de ce qui s'écrit en base est ici, donc testée (tests/securite/synchronisation.test.js).
--
-- Règles de protection :
--   * le début d'un match, une fois détecté, n'est jamais effacé (c'est ce qui verrouille les paris) ;
--   * un match ne « recule » jamais (terminé -> en cours -> à venir) ;
--   * un match corrigé à la main par l'administrateur (modifie_manuellement) n'est plus touché sauf son horaire et son début ;
--   * la synchronisation ne neutralise jamais un match ;
--   * si l'API change les joueurs d'un match qui a déjà des paris, on ne change rien et on signale l'anomalie ;
--   * un tournoi clos n'est plus modifié par la synchronisation ;
--   * une erreur sur un match n'empêche pas les autres (anomalie notée, la tâche continue).
-- =====================================================================================

-- ------------------------------------------------------------------ identifiants API : stables d'une année à l'autre

-- Un identifiant de tournoi de l'API désigne le tournoi (Paris, par exemple), pas une édition : il sert chaque année.
alter table public.tournament_api_ids drop constraint tournament_api_ids_pkey;
alter table public.tournament_api_ids add primary key (tournament_id, api_id);
create index tournament_api_ids_api on public.tournament_api_ids (api_id);

-- Journal : heure de remise à zéro du quota annoncée par l'API (réponse 429 « quota du jour »).
alter table public.sync_log add column reset_a timestamptz;

-- ------------------------------------------------------------------ fonctions d'aide

-- Édition à laquelle rattacher un identifiant de l'API : la plus ancienne édition non clôturée.
create function public.sync_tournoi_pour_api(p_api text) returns bigint
language sql stable security definer set search_path = public as $$
  select t.id
  from public.tournament_api_ids a join public.tournaments t on t.id = a.tournament_id
  where a.api_id = p_api and t.etat <> 'clos'
  order by t.annee, t.id
  limit 1
$$;

create function public.sync_joueur(p jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if coalesce(p->>'api_id', '') = '' or coalesce(btrim(p->>'nom'), '') = '' then
    return null;
  end if;
  insert into public.players (api_id, nom, pays, classement)
  values (p->>'api_id', btrim(p->>'nom'), nullif(p->>'pays', ''), nullif(nullif(p->>'classement', '')::integer, 0))
  on conflict (api_id) do update
    set nom = excluded.nom,
        pays = coalesce(excluded.pays, public.players.pays),
        classement = coalesce(excluded.classement, public.players.classement)
  returning id into v_id;
  return v_id;
end $$;

-- Fait avancer l'état d'un tournoi, jamais en arrière : à venir -> pari tournoi ouvert -> en cours.
-- Le pari tournoi s'ouvre quand toutes les affiches des huitièmes sont connues (8 matchs ; ATP Finals : 4 matchs de poule).
create function public.sync_maj_etat_tournoi(p_tournoi bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_cat text; v_etat text; v_n integer; v_besoin integer; v_demarre boolean; v_tard boolean;
begin
  select categorie, etat into v_cat, v_etat from public.tournaments where id = p_tournoi;
  if v_etat is null or v_etat = 'clos' then return; end if;
  v_besoin := case when v_cat = 'atp_finals' then 4 else 8 end;
  select count(*) into v_n from public.matches
    where tournament_id = p_tournoi and tour = case when v_cat = 'atp_finals' then 'RR' else 'R16' end;
  v_demarre := exists (select 1 from public.matches where tournament_id = p_tournoi and statut <> 'a_venir');
  v_tard := exists (select 1 from public.matches where tournament_id = p_tournoi and tour in ('QF', 'SF', 'F'));
  if v_etat = 'a_venir' and (v_n >= v_besoin or v_demarre or v_tard) then
    v_etat := 'pari_tournoi_ouvert';
  end if;
  if v_etat = 'pari_tournoi_ouvert' and v_demarre then
    v_etat := 'en_cours';
  end if;
  update public.tournaments set etat = v_etat where id = p_tournoi and etat is distinct from v_etat;
end $$;

-- ------------------------------------------------------------------ journal des appels

create function public.sync_enregistrer_appel(
  p_endpoint text, p_http_status integer, p_ok boolean,
  p_quota_restant integer default null, p_message text default null, p_reset_a timestamptz default null
) returns void
language sql security definer set search_path = public as $$
  insert into public.sync_log (endpoint, http_status, ok, quota_restant, message, reset_a)
  values (left(p_endpoint, 300), p_http_status, p_ok, p_quota_restant, left(p_message, 500), p_reset_a)
$$;

-- ------------------------------------------------------------------ état à destination du planificateur

create function public.sync_etat() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'maintenant', now(),
    'appels_aujourdhui', (
      select count(*) from public.sync_log l
      where l.endpoint like '/%' and l.endpoint not like '/usage%'
        and l.date_appel >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')),
    'quota_epuise_jusqua', (
      select max(l.reset_a) from public.sync_log l where l.http_status = 429 and l.reset_a > now()),
    'tournois', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'nom', t.nom, 'categorie', t.categorie, 'etat', t.etat,
        'date_debut', t.date_debut, 'date_fin', t.date_fin,
        'api_ids', (select jsonb_agg(a.api_id order by a.api_id) from public.tournament_api_ids a where a.tournament_id = t.id),
        'derniere_decouverte', (
          select max(l.date_appel) from public.sync_log l
          where l.ok and l.endpoint like '%status=upcoming%'
            and exists (select 1 from public.tournament_api_ids a
                        where a.tournament_id = t.id and l.endpoint like '%tournament_id=' || a.api_id || '&%')),
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

-- ------------------------------------------------------------------ application des matchs lus dans l'API

-- Charge utile : {"matchs": [ {api_id, tournament_api_id, tour, heure_prevue, statut, vainqueur, sets_joues, score,
--                              fin_match, p1:{api_id,nom,pays,classement}, p2:{...}} ... ]}
-- Renvoie un compte rendu : {crees, maj, ignores, anomalies:[{api_id, code, detail}]}.
create function public.sync_appliquer(p_payload jsonb) returns jsonb
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

-- ------------------------------------------------------------------ droits : réservé au rôle « service »

revoke all on function public.sync_tournoi_pour_api(text)  from public, anon, authenticated;
revoke all on function public.sync_joueur(jsonb)           from public, anon, authenticated;
revoke all on function public.sync_maj_etat_tournoi(bigint) from public, anon, authenticated;
revoke all on function public.sync_enregistrer_appel(text, integer, boolean, integer, text, timestamptz) from public, anon, authenticated;
revoke all on function public.sync_etat()                  from public, anon, authenticated;
revoke all on function public.sync_appliquer(jsonb)        from public, anon, authenticated;

grant execute on function public.sync_tournoi_pour_api(text)  to service_role;
grant execute on function public.sync_joueur(jsonb)           to service_role;
grant execute on function public.sync_maj_etat_tournoi(bigint) to service_role;
grant execute on function public.sync_enregistrer_appel(text, integer, boolean, integer, text, timestamptz) to service_role;
grant execute on function public.sync_etat()                  to service_role;
grant execute on function public.sync_appliquer(jsonb)        to service_role;
