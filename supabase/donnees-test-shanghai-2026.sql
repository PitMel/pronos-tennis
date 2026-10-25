-- =====================================================================================
-- Pronos Tennis — tournoi de test : Rolex Shanghai Masters 2026 (7-18 octobre 2026)
-- VRAI tableau (huitièmes, quarts, demi-finales, finale) et vrais résultats, relevés dans la presse le 25 oct. 2026.
-- FAUX paris : valeurs aléatoires (graine fixe) pour les comptes de test (André, Paul, Jacques) ; rien pour Pierre.
-- Sans secret. Rejouable sans danger (ne fait rien si le tournoi existe déjà). Une seule transaction.
--
-- Limites connues des données (à ne pas prendre pour des erreurs) :
--  * heures de match inconnues (heure_prevue vide) ; classements ATP inconnus (vides) ;
--  * deux abandons : Ruud – Auger-Aliassime (huitième, 5-2 au 1er set) et Davidovich Fokina – Gea (quart, 4-1 au 1er set) ;
--  * le tournoi n'a aucun identifiant d'API : la synchronisation n'y touche pas ; sa clôture automatique, elle, s'applique.
-- Pour tout supprimer : delete from public.tournaments where annee = 2026 and nom = 'Rolex Shanghai Masters';
--   (les matchs, paris et résultats partent avec ; les joueurs de tennis restent, sans gêne).
-- =====================================================================================
do $$
declare
  t_id bigint;
  pj record;
  pr record;
  mt record;
begin
  if exists (select 1 from public.tournaments where annee = 2026 and nom = 'Rolex Shanghai Masters') then
    raise notice 'Rolex Shanghai Masters 2026 existe déjà : rien à faire.';
    return;
  end if;

  perform setseed(0.261);

  -- 1) le tournoi, ouvert aux paris
  insert into public.tournaments (annee, nom, ville, surface, indoor, categorie, date_debut, date_fin, etat)
  values (2026, 'Rolex Shanghai Masters', 'Shanghai', 'dur', false, 'masters_1000', '2026-10-07', '2026-10-18', 'pari_tournoi_ouvert')
  returning id into t_id;

  -- 2) les joueurs de tennis (créés s'ils n'existent pas déjà)
  for pj in select * from (values
    ('Alexander Zverev', 'ger'), ('Alex de Minaur', 'aus'), ('Alejandro Davidovich Fokina', 'esp'), ('Rafael Jódar', 'esp'),
    ('Casper Ruud', 'nor'), ('Daniil Medvedev', 'rus'), ('Tommy Paul', 'usa'), ('Jakub Mensik', 'cze'),
    ('Karen Khachanov', 'rus'), ('Arthur Gea', 'fra'), ('Alexander Bublik', 'kaz'), ('Hubert Hurkacz', 'pol'),
    ('Stefanos Tsitsipas', 'gre'), ('Botic van de Zandschulp', 'ned'), ('Felix Auger-Aliassime', 'can'), ('Zizou Bergs', 'bel')
  ) as v (nom, pays) loop
    if not exists (select 1 from public.players where nom = pj.nom) then
      insert into public.players (nom, pays) values (pj.nom, pj.pays);
    end if;
  end loop;

  -- 3) le tableau réel : p1 / p2 = ordre d'affichage ; score vu du côté de p1 ; vainqueur 1 ou 2
  create temp table m_def (
    ordre int, tour text, p1 text, p2 text, vainqueur int, sets_joues int, jeux jsonb, sets jsonb, fin text
  ) on commit drop;
  insert into m_def values
    ( 1, 'R16', 'Alex de Minaur',               'Karen Khachanov',          1, 2, '[[6,3],[6,4]]',            '[2,0]', 'normal'),
    ( 2, 'R16', 'Jakub Mensik',                 'Arthur Gea',               2, 2, '[[6,7],[4,6]]',            '[0,2]', 'normal'),
    ( 3, 'R16', 'Alexander Zverev',             'Alexander Bublik',         1, 3, '[[7,6],[4,6],[7,6]]',      '[2,1]', 'normal'),
    ( 4, 'R16', 'Alejandro Davidovich Fokina',  'Hubert Hurkacz',           1, 3, '[[1,6],[6,3],[7,6]]',      '[2,1]', 'normal'),
    ( 5, 'R16', 'Daniil Medvedev',              'Stefanos Tsitsipas',       1, 2, '[[6,4],[7,5]]',            '[2,0]', 'normal'),
    ( 6, 'R16', 'Rafael Jódar',                 'Botic van de Zandschulp',  1, 3, '[[6,7],[6,4],[6,2]]',      '[2,1]', 'normal'),
    ( 7, 'R16', 'Casper Ruud',                  'Felix Auger-Aliassime',    1, 1, '[[5,2]]',                  '[0,0]', 'abandon'),
    ( 8, 'R16', 'Tommy Paul',                   'Zizou Bergs',              1, 2, '[[7,6],[6,4]]',            '[2,0]', 'normal'),
    ( 9, 'QF',  'Alexander Zverev',             'Alex de Minaur',           1, 2, '[[6,4],[6,4]]',            '[2,0]', 'normal'),
    (10, 'QF',  'Alejandro Davidovich Fokina',  'Arthur Gea',               1, 1, '[[4,1]]',                  '[0,0]', 'abandon'),
    (11, 'QF',  'Rafael Jódar',                 'Casper Ruud',              1, 3, '[[4,6],[6,4],[6,3]]',      '[2,1]', 'normal'),
    (12, 'QF',  'Daniil Medvedev',              'Tommy Paul',               1, 3, '[[6,3],[1,6],[6,3]]',      '[2,1]', 'normal'),
    (13, 'SF',  'Alexander Zverev',             'Alejandro Davidovich Fokina', 2, 3, '[[7,5],[4,6],[3,6]]',   '[1,2]', 'normal'),
    (14, 'SF',  'Rafael Jódar',                 'Daniil Medvedev',          1, 2, '[[6,3],[6,4]]',            '[2,0]', 'normal'),
    (15, 'F',   'Alejandro Davidovich Fokina',  'Rafael Jódar',             1, 3, '[[1,6],[7,6],[6,4]]',      '[2,1]', 'normal');

  -- les matchs sont d'abord créés « à venir » (c'est ainsi que les paris sont possibles), dans l'ordre chronologique
  insert into public.matches (tournament_id, tour, p1_id, p2_id)
  select t_id, d.tour,
         (select min(id) from public.players where nom = d.p1),
         (select min(id) from public.players where nom = d.p2)
  from m_def d order by d.ordre;

  -- 4) paris du tournoi des comptes de test : vainqueur et finaliste tirés au hasard parmi les 16 joueurs
  for pr in select id from public.profiles where is_test and actif order by prenom loop
    insert into public.tournament_bets (tournament_id, joueur_id, vainqueur_id, finaliste_id)
    select t_id, pr.id, x.a, x.b
    from (select (array_agg(id order by random()))[1] as a, (array_agg(id order by random()))[2] as b
          from (select distinct p1_id as id from public.matches where tournament_id = t_id and tour = 'R16'
                union select p2_id from public.matches where tournament_id = t_id and tour = 'R16') j) y,
         lateral (select y.a, y.b) x;
  end loop;

  -- 5) paris de match des comptes de test : choix et confiance (6 à 10) au hasard ; pas de sets (Masters 1000)
  for pr in select id from public.profiles where is_test and actif order by prenom loop
    for mt in select id from public.matches where tournament_id = t_id order by id loop
      insert into public.bets (match_id, joueur_id, choix, confiance)
      values (mt.id, pr.id, 1 + floor(random() * 2)::int, 6 + floor(random() * 5)::int);
    end loop;
  end loop;

  -- 6) les résultats réels
  update public.matches m
  set statut = 'termine', vainqueur = d.vainqueur, sets_joues = d.sets_joues, fin_match = d.fin,
      score = jsonb_build_object('sets', d.sets, 'games', d.jeux)
  from m_def d
  where m.tournament_id = t_id and d.tour = m.tour
    and m.p1_id = (select min(id) from public.players where nom = d.p1)
    and m.p2_id = (select min(id) from public.players where nom = d.p2);

  update public.tournaments set etat = 'en_cours' where id = t_id;
  raise notice 'Rolex Shanghai Masters 2026 créé (tournoi %).', t_id;
end $$;

-- Contrôle : 15 matchs terminés, 45 paris de match, 3 paris de tournoi (rejouable)
select
  (select count(*) from public.matches m join public.tournaments t on t.id = m.tournament_id
    where t.nom = 'Rolex Shanghai Masters' and t.annee = 2026 and m.statut = 'termine') as matchs_termines,
  (select count(*) from public.bets b join public.matches m on m.id = b.match_id join public.tournaments t on t.id = m.tournament_id
    where t.nom = 'Rolex Shanghai Masters' and t.annee = 2026) as paris_de_match,
  (select count(*) from public.tournament_bets b join public.tournaments t on t.id = b.tournament_id
    where t.nom = 'Rolex Shanghai Masters' and t.annee = 2026) as paris_de_tournoi;
