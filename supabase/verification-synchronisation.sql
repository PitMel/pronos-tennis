-- =====================================================================================
-- Pronos Tennis — vérification des fonctions de synchronisation sur la VRAIE base
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

-- Match « API normalisé » fictif.
create function pg_temp.mt(p_api text, p_tournoi text, p_tour text, p_statut text, p_vain int, p_fin text, p_a int) returns jsonb
language sql as $f$
  select jsonb_build_object(
    'api_id', p_api, 'tournament_api_id', p_tournoi, 'tour', p_tour, 'heure_prevue', '2099-01-01T12:00:00Z',
    'statut', p_statut, 'vainqueur', p_vain, 'sets_joues', case when p_statut = 'termine' then 2 end,
    'score', null, 'fin_match', p_fin,
    'p1', jsonb_build_object('api_id', 'vs-' || p_a, 'nom', 'VS Joueur ' || p_a, 'pays', 'FRA', 'classement', 10),
    'p2', jsonb_build_object('api_id', 'vs-' || (p_a + 1), 'nom', 'VS Joueur ' || (p_a + 1), 'pays', 'ESP', 'classement', 20))
$f$;

do $verif$
declare
  u_pierre uuid := 'bbbbbbbb-0000-4000-8000-000000000001';
  u_andre  uuid := 'bbbbbbbb-0000-4000-8000-000000000011';
  t_id bigint; r jsonb; n int; s text; i int;
begin
  insert into auth.users (id, email) values (u_pierre, 'vs-pierre@verif.invalid'), (u_andre, 'vs-andre@verif.invalid');
  insert into public.profiles (id, prenom, is_admin, is_test) values (u_pierre, 'VS-Pierre', true, false), (u_andre, 'VS-André', false, true);
  insert into public.tournaments (annee, nom, categorie, etat) values (2098, 'VERIF SYNC', 'masters_1000', 'a_venir') returning id into t_id;
  insert into public.tournament_api_ids (api_id, tournament_id) values ('vs-9001', t_id);

  -- droits : seule la tâche automatique (rôle service) peut appeler ces fonctions
  perform pg_temp.v('anon ne lit pas sync_etat', 'ERR', pg_temp.comme(null, 'anon', 'select public.sync_etat()'));
  perform pg_temp.v('un joueur ne lit pas sync_etat', 'ERR', pg_temp.comme(u_andre, 'authenticated', 'select public.sync_etat()'));
  perform pg_temp.v('l''administrateur ne lit pas sync_etat', 'ERR', pg_temp.comme(u_pierre, 'authenticated', 'select public.sync_etat()'));
  perform pg_temp.v('anon n''appelle pas sync_appliquer', 'ERR', pg_temp.comme(null, 'anon', 'select public.sync_appliquer(''{}''::jsonb)'));
  perform pg_temp.v('un joueur n''appelle pas sync_appliquer', 'ERR', pg_temp.comme(u_andre, 'authenticated', 'select public.sync_appliquer(''{}''::jsonb)'));
  perform pg_temp.v('l''administrateur n''appelle pas sync_appliquer', 'ERR', pg_temp.comme(u_pierre, 'authenticated', 'select public.sync_appliquer(''{}''::jsonb)'));
  perform pg_temp.v('un joueur n''écrit pas dans le journal d''appels', 'ERR', pg_temp.comme(u_andre, 'authenticated', 'select public.sync_enregistrer_appel(''/x'', 200, true, null, null, null)'));
  perform pg_temp.v('le rôle service lit sync_etat', '1', pg_temp.comme(null, 'service_role', 'select public.sync_etat()'));
  perform pg_temp.v('le rôle service applique une charge vide', '1', pg_temp.comme(null, 'service_role', 'select public.sync_appliquer(''{}''::jsonb)'));

  -- création et idempotence
  r := public.sync_appliquer(jsonb_build_object('matchs', jsonb_build_array(pg_temp.mt('vs-m1', 'vs-9001', 'QF', 'a_venir', null, 'normal', 100))));
  perform pg_temp.v('un match à venir est créé', '1', (r->>'crees'));
  r := public.sync_appliquer(jsonb_build_object('matchs', jsonb_build_array(pg_temp.mt('vs-m1', 'vs-9001', 'QF', 'a_venir', null, 'normal', 100))));
  perform pg_temp.v('rejouer la même charge ne change rien', '00', (r->>'crees') || (r->>'maj'));
  r := public.sync_appliquer(jsonb_build_object('matchs', jsonb_build_array(
        pg_temp.mt('vs-x1', 'inconnu-1', 'QF', 'a_venir', null, 'normal', 110), pg_temp.mt('vs-x2', 'vs-9001', 'R32', 'a_venir', null, 'normal', 112))));
  perform pg_temp.v('tournoi inconnu et tour non suivi ignorés', '2', (r->>'ignores'));

  -- début de match, verrouillage, jamais de recul
  perform public.sync_appliquer(jsonb_build_object('matchs', jsonb_build_array(pg_temp.mt('vs-m1', 'vs-9001', 'QF', 'en_cours', null, 'normal', 100))));
  perform pg_temp.v('début détecté', 'en_cours', (select statut from public.matches where api_id = 'vs-m1'));
  perform pg_temp.v('début daté', 'true', (select (debut_detecte is not null)::text from public.matches where api_id = 'vs-m1'));
  perform pg_temp.v('plus de pari une fois le match commencé', 'ERR', pg_temp.comme(u_andre, 'authenticated',
    format('insert into public.bets (match_id, joueur_id, choix, confiance) values (%s, %L, 1, 8)', (select id from public.matches where api_id = 'vs-m1'), u_andre)));
  perform public.sync_appliquer(jsonb_build_object('matchs', jsonb_build_array(pg_temp.mt('vs-m1', 'vs-9001', 'QF', 'a_venir', null, 'normal', 100))));
  perform pg_temp.v('un match ne recule pas', 'en_cours', (select statut from public.matches where api_id = 'vs-m1'));

  -- fin de match, anomalies
  r := public.sync_appliquer(jsonb_build_object('matchs', jsonb_build_array(pg_temp.mt('vs-m1', 'vs-9001', 'QF', 'termine', null, 'normal', 100))));
  perform pg_temp.v('terminé sans vainqueur : anomalie', 'termine_sans_vainqueur', (r->'anomalies'->0->>'code'));
  perform pg_temp.v('… et le match reste en cours', 'en_cours', (select statut from public.matches where api_id = 'vs-m1'));
  perform public.sync_appliquer(jsonb_build_object('matchs', jsonb_build_array(pg_temp.mt('vs-m1', 'vs-9001', 'QF', 'termine', 2, 'normal', 100))));
  perform pg_temp.v('résultat enregistré', '2', (select vainqueur::text from public.matches where api_id = 'vs-m1'));
  perform public.sync_appliquer(jsonb_build_object('matchs', jsonb_build_array(pg_temp.mt('vs-m2', 'vs-9001', 'SF', 'termine', null, 'forfait', 120))));
  perform pg_temp.v('forfait enregistré', 'forfait', (select fin_match from public.matches where api_id = 'vs-m2'));
  perform public.sync_appliquer(jsonb_build_object('matchs', jsonb_build_array(pg_temp.mt('vs-m3', 'vs-9001', 'SF', 'termine', 1, 'abandon', 130))));
  perform pg_temp.v('abandon enregistré', 'abandon', (select fin_match from public.matches where api_id = 'vs-m3'));

  -- correction manuelle protégée
  perform pg_temp.v('l''administrateur corrige un résultat', '1', pg_temp.comme(u_pierre, 'authenticated',
    format('update public.matches set vainqueur = 1 where api_id = %L', 'vs-m1')));
  perform pg_temp.v('… le match est marqué « modifié manuellement »', 'true', (select modifie_manuellement::text from public.matches where api_id = 'vs-m1'));
  perform public.sync_appliquer(jsonb_build_object('matchs', jsonb_build_array(pg_temp.mt('vs-m1', 'vs-9001', 'QF', 'termine', 2, 'normal', 100))));
  perform pg_temp.v('la synchronisation respecte la correction manuelle', '1', (select vainqueur::text from public.matches where api_id = 'vs-m1'));

  -- état du tournoi
  for i in 1..7 loop
    perform public.sync_appliquer(jsonb_build_object('matchs', jsonb_build_array(pg_temp.mt('vs-r' || i, 'vs-9001', 'R16', 'a_venir', null, 'normal', 200 + i * 2))));
  end loop;
  -- un match a déjà commencé : le tournoi est passé directement de « à venir » à « en cours »
  perform pg_temp.v('tournoi démarré (en cours)', 'en_cours', (select etat from public.tournaments where id = t_id));

  -- état pour le planificateur
  perform pg_temp.v('le planificateur voit le tournoi', '1', (select count(*)::text from jsonb_array_elements(public.sync_etat()->'tournois') x where x->>'nom' = 'VERIF SYNC'));
  perform pg_temp.v('le planificateur ne suit pas les matchs terminés', '0',
    (select count(*)::text from jsonb_array_elements(public.sync_etat()->'matchs') x where x->>'api_id' in ('vs-m1', 'vs-m3')));

  select count(*) filter (where ok), count(*) filter (where not ok) into n, i from rapport;
  select coalesce(string_agg(format(E'  ECHEC : %s (attendu %s, obtenu %s)', libelle, attendu, obtenu), E'\n'), '  aucun') into s from rapport where not ok;
  raise exception E'RAPPORT — % vérifications OK, % échec(s). Détail des échecs :\n%\n(cette « erreur » est volontaire : elle annule toutes les données fictives)', n, i, s;
end
$verif$;
