-- =====================================================================================
-- Pronos Tennis — vérification de la clôture par l'administrateur (migration 0006) sur la VRAIE base
-- (SQL Editor de Supabase, ou Claude via le connecteur). Aucun secret. Tout est annulé à la fin
-- (l'« erreur » finale est volontaire : elle contient le rapport et annule les données fictives).
-- Résultat attendu : « RAPPORT — N vérifications OK, 0 échec ».
-- =====================================================================================

create temp table rapport (ok boolean, libelle text, attendu text, obtenu text);

create function pg_temp.comme(p_uid uuid, p_role text, p_sql text) returns text
language plpgsql as $f$
declare n bigint;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    get diagnostics n = row_count;
    reset role;
    return n::text;
  exception when others then
    reset role;
    return 'ERR:' || sqlerrm;
  end;
end $f$;

create function pg_temp.v(p_libelle text, p_attendu text, p_obtenu text) returns void
language plpgsql as $f$
begin
  insert into rapport values (
    case when p_attendu = 'ERR' then p_obtenu like 'ERR:%' else p_obtenu = p_attendu end,
    p_libelle, p_attendu, p_obtenu);
end $f$;

do $verif$
declare
  u_pierre uuid := 'cccccccc-0000-4000-8000-000000000001';
  u_a uuid := 'cccccccc-0000-4000-8000-000000000011';
  u_b uuid := 'cccccccc-0000-4000-8000-000000000012';
  u_c uuid := 'cccccccc-0000-4000-8000-000000000013';
  t_id bigint; p1 bigint; p2 bigint; p3 bigint; m_sf bigint; m_f bigint; n int; i int; s text; res jsonb; d jsonb;
begin
  insert into auth.users (id, email) values (u_pierre, 'vc-pierre@verif.invalid'), (u_a, 'vc-a@verif.invalid'), (u_b, 'vc-b@verif.invalid'), (u_c, 'vc-c@verif.invalid');
  insert into public.profiles (id, prenom, is_admin, is_test) values (u_pierre, 'VC-Pierre', true, false), (u_a, 'VC-A', false, true), (u_b, 'VC-B', false, true), (u_c, 'VC-C', false, true);
  insert into public.players (api_id, nom) values ('vc-1', 'VC Joueur 1') returning id into p1;
  insert into public.players (api_id, nom) values ('vc-2', 'VC Joueur 2') returning id into p2;
  insert into public.players (api_id, nom) values ('vc-3', 'VC Joueur 3') returning id into p3;
  insert into public.tournaments (annee, nom, categorie, etat) values (2098, 'VERIF CLOTURE ADMIN', 'masters_1000', 'en_cours') returning id into t_id;
  insert into public.exclusions (joueur_id, tournament_id) select id, t_id from public.profiles where id not in (u_pierre, u_a, u_b, u_c);
  insert into public.matches (tournament_id, tour, p1_id, p2_id, heure_prevue) values (t_id, 'SF', p1, p2, now() + interval '3 hours') returning id into m_sf;
  insert into public.matches (tournament_id, tour, p1_id, p2_id, heure_prevue) values (t_id, 'F', p1, p3, now() + interval '3 hours') returning id into m_f;
  -- A et B parient sur les deux matchs ; C n'a rien parié : la clôture automatique serait impossible
  insert into public.bets (match_id, joueur_id, choix, confiance) select m, u, 1, 8 from unnest(array[m_sf, m_f]) m, unnest(array[u_a, u_b]) u;
  update public.matches set statut = 'termine', vainqueur = 1, sets_joues = 2, debut_detecte = now() where id in (m_sf, m_f);
  perform pg_temp.v('situation : pas éligible automatiquement (C n''a pas parié)', 'false', (public.sync_cloture_situation(t_id) ->> 'eligible'));

  -- droits
  perform pg_temp.v('anon : pas de admin_donnees_cloture', 'ERR', pg_temp.comme(null, 'anon', format('select public.admin_donnees_cloture(%s)', t_id)));
  perform pg_temp.v('joueur : refusé (admin_donnees_cloture)', 'ERR', pg_temp.comme(u_a, 'authenticated', format('select public.admin_donnees_cloture(%s)', t_id)));
  perform pg_temp.v('joueur : refusé (admin_cloturer_tournoi)', 'ERR', pg_temp.comme(u_a, 'authenticated', format('select public.admin_cloturer_tournoi(%s, ''[]''::jsonb, %s, %s)', t_id, p1, p3)));
  perform pg_temp.v('joueur : refusé (admin_rouvrir_tournoi)', 'ERR', pg_temp.comme(u_b, 'authenticated', format('select public.admin_rouvrir_tournoi(%s)', t_id)));
  perform pg_temp.v('service_role : pas de admin_cloturer_tournoi (pas d''identité)', 'ERR', pg_temp.comme(null, 'service_role', format('select public.admin_cloturer_tournoi(%s, ''[]''::jsonb, %s, %s)', t_id, p1, p3)));
  perform pg_temp.v('joueur : pas de donnees_cloture_brutes', 'ERR', pg_temp.comme(u_a, 'authenticated', format('select public.donnees_cloture_brutes(%s)', t_id)));
  perform pg_temp.v('la clôture automatique refuse toujours (sync_donnees_cloture)', 'ERR', pg_temp.comme(null, 'service_role', format('select public.sync_donnees_cloture(%s)', t_id)));

  -- lecture par l'administrateur (même sans éligibilité)
  perform pg_temp.v('admin : lecture des données', '1', pg_temp.comme(u_pierre, 'authenticated', format('select public.admin_donnees_cloture(%s)', t_id)));
  perform set_config('request.jwt.claim.sub', u_pierre::text, true);
  set local role authenticated;
  d := public.admin_donnees_cloture(t_id);
  reset role;
  perform pg_temp.v('… un seul groupe (test) a des paris', '1', jsonb_array_length(d -> 'groupes')::text);
  perform pg_temp.v('… 3 joueurs concernés (A, B et C, participants actifs du groupe test)', '3', jsonb_array_length(d -> 'groupes' -> 0 -> 'joueurs')::text);
  perform pg_temp.v('… résultat de la finale', format('%s/%s', p1, p3), format('%s/%s', d -> 'resultat' ->> 'vainqueur_id', d -> 'resultat' ->> 'finaliste_id'));

  -- clôture forcée : résultat incomplet refusé, puis complet accepté
  res := (select jsonb_agg(jsonb_build_object('joueur_id', u, 'points_matchs', '32', 'points_pari_tournoi', '0', 'bonus_classement', '4', 'score_final', '36', 'rang', 1)) from unnest(array[u_a, u_b]) u);
  perform pg_temp.v('résultat incomplet refusé', 'ERR', pg_temp.comme(u_pierre, 'authenticated', format('select public.admin_cloturer_tournoi(%s, %L::jsonb, %s, %s)', t_id, res::text, p1, p3)));
  perform pg_temp.v('… rien n''a été écrit', '0', (select count(*)::text from public.tournament_results where tournament_id = t_id));
  res := (select jsonb_agg(jsonb_build_object('joueur_id', u, 'points_matchs', '32', 'points_pari_tournoi', '0', 'bonus_classement', '4', 'score_final', '36', 'rang', 1)) from unnest(array[u_a, u_b, u_c]) u);
  perform pg_temp.v('même vainqueur et finaliste refusés', 'ERR', pg_temp.comme(u_pierre, 'authenticated', format('select public.admin_cloturer_tournoi(%s, %L::jsonb, %s, %s)', t_id, res::text, p1, p1)));
  perform pg_temp.v('clôture forcée acceptée', '1', pg_temp.comme(u_pierre, 'authenticated', format('select public.admin_cloturer_tournoi(%s, %L::jsonb, %s, %s)', t_id, res::text, p1, p3)));
  perform pg_temp.v('tournoi clos', 'clos', (select etat from public.tournaments where id = t_id));
  perform pg_temp.v('vainqueur et finaliste enregistrés', format('%s/%s', p1, p3), (select format('%s/%s', vainqueur_id, finaliste_id) from public.tournaments where id = t_id));
  perform pg_temp.v('3 résultats archivés', '3', (select count(*)::text from public.tournament_results where tournament_id = t_id));
  perform pg_temp.v('paris de tous les matchs révélés (groupe test)', '2', (select count(*)::text from public.revelations where kind = 'match' and groupe_test and ref_id in (m_sf, m_f)));
  perform pg_temp.v('pari tournoi révélé (groupe test)', '1', (select count(*)::text from public.revelations where kind = 'tournoi' and groupe_test and ref_id = t_id));
  perform pg_temp.v('clôture automatique désactivée', 'true', (select cloture_auto_desactivee::text from public.tournaments where id = t_id));

  -- correction d'une clôture : l'archive est remplacée, l'état reste clos
  res := (select jsonb_agg(jsonb_build_object('joueur_id', u, 'points_matchs', '10', 'points_pari_tournoi', '0', 'bonus_classement', '0', 'score_final', '10', 'rang', 1)) from unnest(array[u_a, u_b, u_c]) u);
  perform pg_temp.v('correction acceptée', '1', pg_temp.comme(u_pierre, 'authenticated', format('select public.admin_cloturer_tournoi(%s, %L::jsonb, %s, %s)', t_id, res::text, p3, p1)));
  perform pg_temp.v('… archive remplacée', '10', (select score_final from public.tournament_results where tournament_id = t_id and joueur_id = u_a));
  perform pg_temp.v('… toujours 3 résultats', '3', (select count(*)::text from public.tournament_results where tournament_id = t_id));
  perform pg_temp.v('… vainqueur corrigé', format('%s/%s', p3, p1), (select format('%s/%s', vainqueur_id, finaliste_id) from public.tournaments where id = t_id));

  -- réouverture
  perform pg_temp.v('l''administrateur rouvre le tournoi', '1', pg_temp.comme(u_pierre, 'authenticated', format('select public.admin_rouvrir_tournoi(%s)', t_id)));
  perform pg_temp.v('… état en cours', 'en_cours', (select etat from public.tournaments where id = t_id));
  perform pg_temp.v('… archive effacée', '0', (select count(*)::text from public.tournament_results where tournament_id = t_id));
  perform pg_temp.v('… vainqueur effacé', 'null', (select coalesce(vainqueur_id::text, 'null') from public.tournaments where id = t_id));
  perform pg_temp.v('… clôture automatique refusée', 'ERR', pg_temp.comme(null, 'service_role', format('select public.sync_cloturer_tournoi(%s, %L::jsonb)', t_id, res::text)));
  perform pg_temp.v('rouvrir un tournoi déjà ouvert ne fait rien', '1', pg_temp.comme(u_pierre, 'authenticated', format('select public.admin_rouvrir_tournoi(%s)', t_id)));

  select count(*) filter (where ok), count(*) filter (where not ok) into n, i from rapport;
  select coalesce(string_agg(format(E'  ECHEC : %s (attendu %s, obtenu %s)', libelle, attendu, obtenu), E'\n'), '  aucun') into s from rapport where not ok;
  raise exception E'RAPPORT — % vérifications OK, % échec(s). Détail des échecs :\n%\n(cette « erreur » est volontaire : elle annule toutes les données fictives)', n, i, s;
end
$verif$;
