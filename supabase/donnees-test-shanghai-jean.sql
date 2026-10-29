-- =====================================================================================
-- Pronos Tennis — complément des données de test Shanghai 2026 : paris de Jean (4e faux compte)
-- Exécuté sur le vrai projet le 29 oct. 2026. Faux paris aléatoires (graine 0.262), comme ceux d'André, Paul et Jacques.
-- À jouer APRÈS donnees-test-shanghai-2026.sql et APRÈS la création du profil de Jean (comptes.sql).
-- Rejouable sans danger : ne fait rien si Jean a déjà des paris sur ce tournoi. Une seule transaction.
--
-- Pourquoi ces étapes : le pari tournoi refuse un joueur « déjà éliminé », donc impossible une fois la finale jouée.
-- Les matchs sont remis « à venir » le temps du pari (comme le script d'origine), puis leurs statuts réels sont restaurés.
-- Le tournoi était clos et son archive (tournament_results) ne contenait pas Jean : elle est effacée et le tournoi
-- repasse « en cours » ; la clôture automatique (tâche de synchronisation) ou l'écran Admin > Clôture la recalcule.
-- =====================================================================================
do $$
declare
  t_id bigint;
  jean uuid;
  mt record;
  a bigint;
  b bigint;
begin
  select id into t_id from public.tournaments where annee = 2026 and nom = 'Rolex Shanghai Masters';
  select id into jean from public.profiles where prenom = 'Jean' and is_test and actif;
  if t_id is null or jean is null then raise exception 'Tournoi ou compte Jean introuvable.'; end if;
  if exists (select 1 from public.bets bt join public.matches m on m.id = bt.match_id where m.tournament_id = t_id and bt.joueur_id = jean)
     or exists (select 1 from public.tournament_bets where tournament_id = t_id and joueur_id = jean) then
    raise notice 'Jean a déjà des paris sur ce tournoi : rien à faire.';
    return;
  end if;

  perform setseed(0.262);

  create temp table statuts_avant on commit drop as
    select id, statut from public.matches where tournament_id = t_id;
  update public.matches set statut = 'a_venir' where tournament_id = t_id;

  select x.a, x.b into a, b
  from (select (array_agg(id order by random()))[1] as a, (array_agg(id order by random()))[2] as b
        from (select p1_id as id from public.matches where tournament_id = t_id and tour = 'R16'
              union select p2_id from public.matches where tournament_id = t_id and tour = 'R16') j) x;
  insert into public.tournament_bets (tournament_id, joueur_id, vainqueur_id, finaliste_id) values (t_id, jean, a, b);

  for mt in select id from public.matches where tournament_id = t_id order by id loop
    insert into public.bets (match_id, joueur_id, choix, confiance)
    values (mt.id, jean, 1 + floor(random() * 2)::int, 6 + floor(random() * 5)::int);
  end loop;

  update public.matches m set statut = s.statut from statuts_avant s where m.id = s.id;

  delete from public.tournament_results where tournament_id = t_id;
  update public.tournaments set etat = 'en_cours', vainqueur_id = null, finaliste_id = null where id = t_id;
end $$;
