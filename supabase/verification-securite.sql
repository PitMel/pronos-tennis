-- =====================================================================================
-- Pronos Tennis — vérification de sécurité sur la VRAIE base (à exécuter dans le SQL Editor de Supabase,
-- ou par Claude via le connecteur Supabase). Ne contient aucun secret.
--
-- Principe : le script crée des comptes et des matchs FICTIFS, puis joue de vraies tentatives d'accès
-- (rôle « anon » ou « authenticated » avec l'identité de chaque compte fictif) : lire les paris des autres,
-- lire un résultat caché, modifier un pari verrouillé, se donner les droits d'administrateur, etc.
-- À la fin il s'arrête volontairement par une « erreur » qui contient le rapport : cela ANNULE tout.
-- Aucune donnée n'est conservée, vos vrais comptes ne sont pas touchés.
--
-- Résultat attendu : un message « RAPPORT … 0 échec ». Chaque ligne « OK » est une attaque bien refusée
-- (ou une action légitime bien acceptée).
-- =====================================================================================

create temp table rapport (ok boolean, libelle text, attendu text, obtenu text);

-- Exécute une requête avec le rôle et l'identité d'un compte, comme le ferait le navigateur.
-- Renvoie le nombre de lignes lues/modifiées, ou « ERR:message » si la base a refusé.
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

-- Note le résultat : attendu = nombre de lignes (texte) ou « ERR » (refus attendu).
create function pg_temp.v(p_libelle text, p_attendu text, p_obtenu text) returns void
language plpgsql as $f$
begin
  insert into rapport values (
    case when p_attendu = 'ERR' then p_obtenu like 'ERR:%' else p_obtenu = p_attendu end,
    p_libelle, p_attendu, p_obtenu);
end $f$;

do $verif$
declare
  u_pierre  uuid := 'aaaaaaaa-0000-4000-8000-000000000001';  -- administrateur (groupe réel)
  u_lea     uuid := 'aaaaaaaa-0000-4000-8000-000000000002';  -- vrai joueur
  u_marc    uuid := 'aaaaaaaa-0000-4000-8000-000000000003';  -- vrai joueur
  u_andre   uuid := 'aaaaaaaa-0000-4000-8000-000000000011';  -- faux comptes (groupe test)
  u_paul    uuid := 'aaaaaaaa-0000-4000-8000-000000000012';
  u_jacques uuid := 'aaaaaaaa-0000-4000-8000-000000000013';
  p1 bigint; p2 bigint; p3 bigint; p4 bigint;
  t_masters bigint; t_chelem bigint; t_avenir bigint;
  m1 bigint; m2 bigint; m3 bigint; m4 bigint; m_gc bigint;
  nb_ok int; nb_ko int; echecs text;
begin
  -- les vrais comptes éventuels sont mis de côté le temps de la vérification (tout est annulé à la fin)
  update public.profiles set actif = false;

  insert into auth.users (id, email) values
    (u_pierre, 'verif-pierre@verif.invalid'), (u_lea, 'verif-lea@verif.invalid'), (u_marc, 'verif-marc@verif.invalid'),
    (u_andre, 'verif-andre@verif.invalid'), (u_paul, 'verif-paul@verif.invalid'), (u_jacques, 'verif-jacques@verif.invalid');
  insert into public.profiles (id, prenom, is_admin, is_test) values
    (u_pierre, 'V-Pierre', true, false), (u_lea, 'V-Léa', false, false), (u_marc, 'V-Marc', false, false),
    (u_andre, 'V-André', false, true), (u_paul, 'V-Paul', false, true), (u_jacques, 'V-Jacques', false, true);

  insert into public.players (api_id, nom) values ('verif-1', 'V Un') returning id into p1;
  insert into public.players (api_id, nom) values ('verif-2', 'V Deux') returning id into p2;
  insert into public.players (api_id, nom) values ('verif-3', 'V Trois') returning id into p3;
  insert into public.players (api_id, nom) values ('verif-4', 'V Quatre') returning id into p4;
  insert into public.tournaments (annee, nom, categorie, etat) values (2099, 'VERIF masters', 'masters_1000', 'en_cours') returning id into t_masters;
  insert into public.tournaments (annee, nom, categorie, etat) values (2099, 'VERIF chelem', 'grand_slam', 'en_cours') returning id into t_chelem;
  insert into public.tournaments (annee, nom, categorie, etat) values (2099, 'VERIF futur', 'masters_1000', 'a_venir') returning id into t_avenir;
  insert into public.matches (tournament_id, tour, p1_id, p2_id) values (t_masters, 'QF', p1, p2) returning id into m1;
  insert into public.matches (tournament_id, tour, p1_id, p2_id) values (t_masters, 'QF', p3, p4) returning id into m2;
  insert into public.matches (tournament_id, tour, p1_id, p2_id) values (t_masters, 'SF', p1, p3) returning id into m3;
  insert into public.matches (tournament_id, tour, p1_id, p2_id) values (t_masters, 'SF', p2, p4) returning id into m4;
  insert into public.matches (tournament_id, tour, p1_id, p2_id) values (t_chelem, 'QF', p1, p2) returning id into m_gc;

  -- ---------------------------------------------------------------- 1. visiteur non connecté
  perform pg_temp.v('anon ne lit pas les paris', 'ERR', pg_temp.comme(null, 'anon', 'select 1 from public.bets'));
  perform pg_temp.v('anon ne lit pas les matchs (vue)', 'ERR', pg_temp.comme(null, 'anon', 'select 1 from public.matches_visibles'));
  perform pg_temp.v('anon ne lit pas la table des matchs', 'ERR', pg_temp.comme(null, 'anon', 'select 1 from public.matches'));
  perform pg_temp.v('anon ne lit pas les profils', 'ERR', pg_temp.comme(null, 'anon', 'select 1 from public.profiles'));
  perform pg_temp.v('anon ne peut pas parier', 'ERR', pg_temp.comme(null, 'anon', format('insert into public.bets (match_id, joueur_id, choix, confiance) values (%s, %L, 1, 8)', m1, u_andre)));
  perform pg_temp.v('anon n''appelle pas qui_a_parie', 'ERR', pg_temp.comme(null, 'anon', format('select * from public.qui_a_parie(%s)', m1)));

  -- ---------------------------------------------------------------- 2. paris cachés tant que le groupe n'est pas complet
  perform pg_temp.v('André parie', '1', pg_temp.comme(u_andre, 'authenticated', format('insert into public.bets (match_id, joueur_id, choix, confiance) values (%s, %L, 1, 8)', m1, u_andre)));
  perform pg_temp.v('Paul parie', '1', pg_temp.comme(u_paul, 'authenticated', format('insert into public.bets (match_id, joueur_id, choix, confiance) values (%s, %L, 2, 7)', m1, u_paul)));
  perform pg_temp.v('André ne voit que son pari', '1', pg_temp.comme(u_andre, 'authenticated', format('select 1 from public.bets where match_id = %s', m1)));
  perform pg_temp.v('Paul ne voit que son pari', '1', pg_temp.comme(u_paul, 'authenticated', format('select 1 from public.bets where match_id = %s', m1)));
  perform pg_temp.v('Jacques (pas parié) ne voit aucun pari', '0', pg_temp.comme(u_jacques, 'authenticated', format('select 1 from public.bets where match_id = %s', m1)));
  perform pg_temp.v('Paul ne lit pas le pari d''André par son identifiant', '0', pg_temp.comme(u_paul, 'authenticated', format('select 1 from public.bets where joueur_id = %L', u_andre)));
  perform pg_temp.v('un vrai joueur ne voit pas les paris de test', '0', pg_temp.comme(u_lea, 'authenticated', format('select 1 from public.bets where match_id = %s', m1)));
  perform pg_temp.v('qui_a_parie : 3 comptes du groupe test, rien d''autre', '3', pg_temp.comme(u_paul, 'authenticated', format('select * from public.qui_a_parie(%s)', m1)));

  -- ---------------------------------------------------------------- 3. administrateur : jamais les paris non révélés des vrais joueurs
  perform pg_temp.v('Léa parie', '1', pg_temp.comme(u_lea, 'authenticated', format('insert into public.bets (match_id, joueur_id, choix, confiance) values (%s, %L, 1, 10)', m1, u_lea)));
  perform pg_temp.v('l''administrateur ne lit pas le pari non révélé de Léa', '0', pg_temp.comme(u_pierre, 'authenticated', format('select 1 from public.bets where joueur_id = %L', u_lea)));
  perform pg_temp.v('l''administrateur lit les paris des faux comptes', '2', pg_temp.comme(u_pierre, 'authenticated', format('select 1 from public.bets where match_id = %s and joueur_id in (%L, %L)', m1, u_andre, u_paul)));
  perform pg_temp.v('l''administrateur ne parie pas pour un vrai joueur (écriture directe)', 'ERR', pg_temp.comme(u_pierre, 'authenticated', format('insert into public.bets (match_id, joueur_id, choix, confiance) values (%s, %L, 1, 8)', m1, u_marc)));
  perform pg_temp.v('l''administrateur parie pour un faux compte', '1', pg_temp.comme(u_pierre, 'authenticated', format('insert into public.bets (match_id, joueur_id, choix, confiance) values (%s, %L, 1, 6)', m2, u_jacques)));

  -- ---------------------------------------------------------------- 4. écriture : pas d'usurpation, contraintes
  perform pg_temp.v('André ne parie pas au nom de Paul', 'ERR', pg_temp.comme(u_andre, 'authenticated', format('insert into public.bets (match_id, joueur_id, choix, confiance) values (%s, %L, 1, 8)', m3, u_paul)));
  perform pg_temp.v('confiance 5 refusée', 'ERR', pg_temp.comme(u_andre, 'authenticated', format('insert into public.bets (match_id, joueur_id, choix, confiance) values (%s, %L, 1, 5)', m3, u_andre)));
  perform pg_temp.v('choix 3 refusé', 'ERR', pg_temp.comme(u_andre, 'authenticated', format('insert into public.bets (match_id, joueur_id, choix, confiance) values (%s, %L, 3, 8)', m3, u_andre)));
  perform pg_temp.v('Grand Chelem sans nombre de sets refusé', 'ERR', pg_temp.comme(u_andre, 'authenticated', format('insert into public.bets (match_id, joueur_id, choix, confiance) values (%s, %L, 1, 8)', m_gc, u_andre)));
  perform pg_temp.v('Grand Chelem avec 4 sets accepté', '1', pg_temp.comme(u_andre, 'authenticated', format('insert into public.bets (match_id, joueur_id, choix, confiance, sets) values (%s, %L, 1, 8, 4)', m_gc, u_andre)));
  perform pg_temp.v('sets interdits hors Grand Chelem', 'ERR', pg_temp.comme(u_andre, 'authenticated', format('insert into public.bets (match_id, joueur_id, choix, confiance, sets) values (%s, %L, 1, 8, 3)', m3, u_andre)));
  perform pg_temp.v('André ne modifie pas le pari de Paul', '0', pg_temp.comme(u_andre, 'authenticated', format('update public.bets set confiance = 6 where joueur_id = %L', u_paul)));
  perform pg_temp.v('André modifie son propre pari (non verrouillé)', '1', pg_temp.comme(u_andre, 'authenticated', format('update public.bets set confiance = 9 where joueur_id = %L and match_id = %s', u_andre, m1)));
  perform pg_temp.v('aucun pari ne peut être supprimé', 'ERR', pg_temp.comme(u_andre, 'authenticated', format('delete from public.bets where match_id = %s', m1)));

  -- ---------------------------------------------------------------- 5. révélation quand tout le groupe a parié, puis paris figés
  perform pg_temp.v('Jacques parie (dernier du groupe)', '1', pg_temp.comme(u_jacques, 'authenticated', format('insert into public.bets (match_id, joueur_id, choix, confiance) values (%s, %L, 1, 9)', m1, u_jacques)));
  perform pg_temp.v('groupe complet : André voit les 3 paris', '3', pg_temp.comme(u_andre, 'authenticated', format('select 1 from public.bets where match_id = %s', m1)));
  perform pg_temp.v('les vrais joueurs ne voient toujours pas les paris de test', '1', pg_temp.comme(u_lea, 'authenticated', format('select 1 from public.bets where match_id = %s', m1)));
  perform pg_temp.v('paris révélés : plus de modification', '0', pg_temp.comme(u_andre, 'authenticated', format('update public.bets set confiance = 6 where joueur_id = %L and match_id = %s', u_andre, m1)));
  perform pg_temp.v('même l''administrateur ne modifie pas directement un pari révélé', '0', pg_temp.comme(u_pierre, 'authenticated', format('update public.bets set confiance = 6 where joueur_id = %L and match_id = %s', u_andre, m1)));
  perform pg_temp.v('pas de second pari pour un même match', 'ERR', pg_temp.comme(u_jacques, 'authenticated', format('insert into public.bets (match_id, joueur_id, choix, confiance) values (%s, %L, 2, 8)', m1, u_jacques)));

  -- ---------------------------------------------------------------- 6. résultats masqués
  update public.matches set statut = 'termine', vainqueur = 1, sets_joues = 2 where id in (m1, m2);
  perform pg_temp.v('match terminé + paris révélés : résultat visible', '1', pg_temp.comme(u_andre, 'authenticated', format('select 1 from public.matches_visibles where id = %s and vainqueur is not null', m1)));
  perform pg_temp.v('match terminé mais groupe réel incomplet : résultat caché (vrai joueur)', '0', pg_temp.comme(u_lea, 'authenticated', format('select 1 from public.matches_visibles where id = %s and vainqueur is not null', m1)));
  perform pg_temp.v('match terminé mais paris non révélés : résultat caché', '0', pg_temp.comme(u_andre, 'authenticated', format('select 1 from public.matches_visibles where id = %s and vainqueur is not null', m2)));
  perform pg_temp.v('le joueur ne lit pas la table brute des matchs', '0', pg_temp.comme(u_andre, 'authenticated', format('select 1 from public.matches where id = %s', m1)));
  perform pg_temp.v('l''administrateur lit la table brute des matchs', '1', pg_temp.comme(u_pierre, 'authenticated', format('select 1 from public.matches where id = %s', m1)));
  perform pg_temp.v('un joueur ne modifie pas un résultat', '0', pg_temp.comme(u_andre, 'authenticated', format('update public.matches set vainqueur = 2 where id = %s', m1)));
  perform pg_temp.v('un joueur ne crée pas de match', 'ERR', pg_temp.comme(u_andre, 'authenticated', format('insert into public.matches (tournament_id, tour, p1_id, p2_id) values (%s, %L, %s, %s)', t_masters, 'QF', p1, p2)));
  perform pg_temp.v('l''administrateur modifie un match', '1', pg_temp.comme(u_pierre, 'authenticated', format('update public.matches set heure_prevue = now() where id = %s', m1)));

  -- ---------------------------------------------------------------- 7. verrouillage au début du match
  update public.matches set statut = 'en_cours', debut_detecte = now() where id = m3;
  perform pg_temp.v('pari impossible une fois le match commencé', 'ERR', pg_temp.comme(u_andre, 'authenticated', format('insert into public.bets (match_id, joueur_id, choix, confiance) values (%s, %L, 1, 8)', m3, u_andre)));

  -- ---------------------------------------------------------------- 8. neutralisation = révélation
  perform pg_temp.v('André parie sur le match 4', '1', pg_temp.comme(u_andre, 'authenticated', format('insert into public.bets (match_id, joueur_id, choix, confiance) values (%s, %L, 1, 8)', m4, u_andre)));
  perform pg_temp.v('avant neutralisation : Paul ne voit pas le pari d''André', '0', pg_temp.comme(u_paul, 'authenticated', format('select 1 from public.bets where match_id = %s', m4)));
  perform pg_temp.v('l''administrateur neutralise le match', '1', pg_temp.comme(u_pierre, 'authenticated', format('update public.matches set neutralise = true where id = %s', m4)));
  perform pg_temp.v('après neutralisation : Paul voit le pari d''André', '1', pg_temp.comme(u_paul, 'authenticated', format('select 1 from public.bets where match_id = %s', m4)));
  perform pg_temp.v('un joueur ne neutralise pas un match', '0', pg_temp.comme(u_paul, 'authenticated', format('update public.matches set neutralise = true where id = %s', m2)));

  -- ---------------------------------------------------------------- 9. comptes : pas d'élévation de privilèges
  perform pg_temp.v('André ne se donne pas les droits d''administrateur', 'ERR', pg_temp.comme(u_andre, 'authenticated', format('update public.profiles set is_admin = true where id = %L', u_andre)));
  perform pg_temp.v('un vrai joueur ne change pas de groupe', 'ERR', pg_temp.comme(u_lea, 'authenticated', format('update public.profiles set is_test = true where id = %L', u_lea)));
  perform pg_temp.v('un joueur ne change pas son prénom', 'ERR', pg_temp.comme(u_lea, 'authenticated', format('update public.profiles set prenom = %L where id = %L', 'Pirate', u_lea)));
  perform pg_temp.v('un joueur change sa couleur', '1', pg_temp.comme(u_lea, 'authenticated', format('update public.profiles set couleur = %L where id = %L', '#112233', u_lea)));
  perform pg_temp.v('un joueur ne change pas la couleur d''un autre', '0', pg_temp.comme(u_lea, 'authenticated', format('update public.profiles set couleur = %L where id = %L', '#000000', u_marc)));
  perform pg_temp.v('personne ne crée de profil depuis le navigateur', 'ERR', pg_temp.comme(u_pierre, 'authenticated', format('insert into public.profiles (id, prenom) values (gen_random_uuid(), %L)', 'Fantôme')));

  -- ---------------------------------------------------------------- 10. données de référence et tables internes
  perform pg_temp.v('un joueur ne crée pas de joueur de tennis', 'ERR', pg_temp.comme(u_andre, 'authenticated', 'insert into public.players (nom) values (''Intrus'')'));
  perform pg_temp.v('l''administrateur crée un joueur de tennis', '1', pg_temp.comme(u_pierre, 'authenticated', 'insert into public.players (nom) values (''Nouveau'')'));
  perform pg_temp.v('un joueur ne clôt pas un tournoi', '0', pg_temp.comme(u_andre, 'authenticated', format('update public.tournaments set etat = %L where id = %s', 'clos', t_masters)));
  perform pg_temp.v('un joueur ne crée pas d''exclusion', 'ERR', pg_temp.comme(u_andre, 'authenticated', format('insert into public.exclusions (joueur_id, tournament_id) values (%L, %s)', u_paul, t_masters)));
  perform pg_temp.v('la table des révélations est fermée', 'ERR', pg_temp.comme(u_andre, 'authenticated', 'select 1 from public.revelations'));
  perform pg_temp.v('on ne force pas une révélation', 'ERR', pg_temp.comme(u_andre, 'authenticated', format('insert into public.revelations (kind, ref_id, groupe_test) values (%L, %s, true)', 'match', m2)));
  perform pg_temp.v('fonction interne fermée (groupe_complet_match)', 'ERR', pg_temp.comme(u_andre, 'authenticated', format('select public.groupe_complet_match(%s, true)', m2)));
  perform pg_temp.v('fonction interne fermée (maj_toutes_revelations)', 'ERR', pg_temp.comme(u_andre, 'authenticated', 'select public.maj_toutes_revelations()'));
  perform pg_temp.v('journal de synchronisation fermé aux joueurs', '0', pg_temp.comme(u_andre, 'authenticated', 'select 1 from public.sync_log'));

  -- ---------------------------------------------------------------- 11. pari tournoi
  perform pg_temp.v('pari tournoi : André parie', '1', pg_temp.comme(u_andre, 'authenticated', format('insert into public.tournament_bets (tournament_id, joueur_id, vainqueur_id, finaliste_id) values (%s, %L, %s, %s)', t_masters, u_andre, p1, p3)));
  perform pg_temp.v('pari tournoi caché tant que le groupe n''est pas complet', '0', pg_temp.comme(u_paul, 'authenticated', format('select 1 from public.tournament_bets where tournament_id = %s', t_masters)));
  perform pg_temp.v('vainqueur = finaliste refusé', 'ERR', pg_temp.comme(u_paul, 'authenticated', format('insert into public.tournament_bets (tournament_id, joueur_id, vainqueur_id, finaliste_id) values (%s, %L, %s, %s)', t_masters, u_paul, p3, p3)));
  perform pg_temp.v('pari tournoi refusé avant l''ouverture', 'ERR', pg_temp.comme(u_paul, 'authenticated', format('insert into public.tournament_bets (tournament_id, joueur_id, vainqueur_id, finaliste_id) values (%s, %L, %s, %s)', t_avenir, u_paul, p3, p4)));

  -- ---------------------------------------------------------------- bilan (l'« erreur » finale annule tout)
  select count(*) filter (where ok), count(*) filter (where not ok) into nb_ok, nb_ko from rapport;
  select coalesce(string_agg(format(E'  ECHEC : %s (attendu %s, obtenu %s)', libelle, attendu, obtenu), E'\n'), '  aucun') into echecs from rapport where not ok;
  raise exception E'RAPPORT — % vérifications OK, % échec(s). Détail des échecs :\n%\n(cette « erreur » est volontaire : elle annule toutes les données fictives)', nb_ok, nb_ko, echecs;
end
$verif$;
