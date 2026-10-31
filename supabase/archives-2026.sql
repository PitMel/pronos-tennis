-- =====================================================================================
-- Pronos Tennis — ARCHIVES 2026 : 4 Grands Chelems et 7 Masters 1000 déjà joués (hors Shanghai, Paris et ATP Finals).
-- Vrais tableaux à partir des huitièmes de finale (huitièmes, quarts, demi-finales, finale) relevés sur le web le 31 oct. 2026
-- (tennis-db.com, recoupé avec Wikipédia et la presse pour les vainqueurs, finalistes et scores des finales).
-- Tournois « archives » : état « Terminé », vainqueur et finaliste du tennis renseignés, AUCUN pari, AUCUN classement des pronos
-- (la clôture automatique ne les examine pas : ils sont déjà clos). Sans secret. Rejouable sans danger (ignore les tournois existants).
--
-- Limites connues (à ne pas prendre pour des erreurs) :
--  * heures de match et classements ATP inconnus (vides) ; pays des joueurs non renseigné ;
--  * p1 / p2 : ordre alphabétique (l'ordre du programme n'est pas connu) ; score vu du côté de p1 ;
--  * jeux des tie-breaks non conservés (seuls les jeux par set sont stockés) ;
--  * forfaits : Djokovic – Menšík (Open d'Australie, huitième), Cobolli – Arnaldi (Roland-Garros, demi-finale) : sans score ;
--  * abandons : Djokovic – Musetti (OA, quart), Arnaldi – Berrettini (RG, quart), Struff – Hurkacz (Wimbledon, huitième),
--    Khachanov – Blockx (US Open, quart) ; et Auger-Aliassime – Ruud (Monte-Carlo, huitième : score 7-5 2-2 d'après la source,
--    abandon déduit du score, non confirmé par un texte).
-- Pour tout supprimer : delete from public.tournaments where annee = 2026 and nom in ('Open d''Australie', 'Indian Wells Masters', 'Miami Open', 'Monte-Carlo Masters', 'Madrid Open', 'Masters de Rome', 'Roland-Garros', 'Wimbledon', 'Masters du Canada', 'Cincinnati Masters', 'US Open');
-- =====================================================================================
do $$
declare
  nom_j text;
  t record;
  t_id bigint;
begin
  perform 1;
  create temp table t_def (nom text, ville text, surface text, categorie text, debut date, fin date, vainqueur text, finaliste text) on commit drop;
  insert into t_def values
  ('Open d''Australie', 'Melbourne', 'dur', 'grand_slam', '2026-01-18', '2026-02-01', 'Carlos Alcaraz', 'Novak Djokovic'),
  ('Indian Wells Masters', 'Indian Wells', 'dur', 'masters_1000', '2026-03-04', '2026-03-15', 'Jannik Sinner', 'Daniil Medvedev'),
  ('Miami Open', 'Miami', 'dur', 'masters_1000', '2026-03-18', '2026-03-29', 'Jannik Sinner', 'Jiri Lehecka'),
  ('Monte-Carlo Masters', 'Monaco', 'terre', 'masters_1000', '2026-04-05', '2026-04-12', 'Jannik Sinner', 'Carlos Alcaraz'),
  ('Madrid Open', 'Madrid', 'terre', 'masters_1000', '2026-04-22', '2026-05-03', 'Jannik Sinner', 'Alexander Zverev'),
  ('Masters de Rome', 'Rome', 'terre', 'masters_1000', '2026-05-06', '2026-05-17', 'Jannik Sinner', 'Casper Ruud'),
  ('Roland-Garros', 'Paris', 'terre', 'grand_slam', '2026-05-24', '2026-06-07', 'Alexander Zverev', 'Flavio Cobolli'),
  ('Wimbledon', 'Londres', 'gazon', 'grand_slam', '2026-06-29', '2026-07-12', 'Jannik Sinner', 'Alexander Zverev'),
  ('Masters du Canada', 'Montréal', 'dur', 'masters_1000', '2026-08-02', '2026-08-13', 'Ben Shelton', 'Brandon Nakashima'),
  ('Cincinnati Masters', 'Cincinnati', 'dur', 'masters_1000', '2026-08-13', '2026-08-23', 'Arthur Fils', 'Frances Tiafoe'),
  ('US Open', 'New York', 'dur', 'grand_slam', '2026-08-30', '2026-09-13', 'Alexander Zverev', 'Ben Shelton');

  create temp table m_def (nom_t text, ordre int, tour text, p1 text, p2 text, vainqueur int, sets_joues int, jeux jsonb, sets jsonb, fin text) on commit drop;
  insert into m_def values
  ('Open d''Australie', 1, 'R16', 'Carlos Alcaraz', 'Tommy Paul', 1, 3, '[[7, 6], [6, 4], [7, 5]]'::jsonb, '[3, 0]'::jsonb, 'normal'),
  ('Open d''Australie', 2, 'R16', 'Alex de Minaur', 'Alexander Bublik', 1, 3, '[[6, 4], [6, 1], [6, 1]]'::jsonb, '[3, 0]'::jsonb, 'normal'),
  ('Open d''Australie', 3, 'R16', 'Alexander Zverev', 'Francisco Cerundolo', 1, 3, '[[6, 2], [6, 4], [6, 4]]'::jsonb, '[3, 0]'::jsonb, 'normal'),
  ('Open d''Australie', 4, 'R16', 'Daniil Medvedev', 'Learner Tien', 2, 3, '[[4, 6], [0, 6], [3, 6]]'::jsonb, '[0, 3]'::jsonb, 'normal'),
  ('Open d''Australie', 5, 'R16', 'Lorenzo Musetti', 'Taylor Fritz', 1, 3, '[[6, 2], [7, 5], [6, 4]]'::jsonb, '[3, 0]'::jsonb, 'normal'),
  ('Open d''Australie', 6, 'R16', 'Jakub Mensik', 'Novak Djokovic', 2, null, null::jsonb, null::jsonb, 'forfait'),
  ('Open d''Australie', 7, 'R16', 'Ben Shelton', 'Casper Ruud', 1, 4, '[[3, 6], [6, 4], [6, 3], [6, 4]]'::jsonb, '[3, 1]'::jsonb, 'normal'),
  ('Open d''Australie', 8, 'R16', 'Jannik Sinner', 'Luciano Darderi', 1, 3, '[[6, 1], [6, 3], [7, 6]]'::jsonb, '[3, 0]'::jsonb, 'normal'),
  ('Open d''Australie', 9, 'QF', 'Alex de Minaur', 'Carlos Alcaraz', 2, 3, '[[5, 7], [2, 6], [1, 6]]'::jsonb, '[0, 3]'::jsonb, 'normal'),
  ('Open d''Australie', 10, 'QF', 'Alexander Zverev', 'Learner Tien', 1, 4, '[[6, 3], [6, 7], [6, 1], [7, 6]]'::jsonb, '[3, 1]'::jsonb, 'normal'),
  ('Open d''Australie', 11, 'QF', 'Lorenzo Musetti', 'Novak Djokovic', 2, 3, '[[6, 4], [6, 3], [1, 3]]'::jsonb, '[2, 0]'::jsonb, 'abandon'),
  ('Open d''Australie', 12, 'QF', 'Ben Shelton', 'Jannik Sinner', 2, 3, '[[3, 6], [4, 6], [4, 6]]'::jsonb, '[0, 3]'::jsonb, 'normal'),
  ('Open d''Australie', 13, 'SF', 'Alexander Zverev', 'Carlos Alcaraz', 2, 5, '[[4, 6], [6, 7], [7, 6], [7, 6], [5, 7]]'::jsonb, '[2, 3]'::jsonb, 'normal'),
  ('Open d''Australie', 14, 'SF', 'Jannik Sinner', 'Novak Djokovic', 2, 5, '[[6, 3], [3, 6], [6, 4], [4, 6], [4, 6]]'::jsonb, '[2, 3]'::jsonb, 'normal'),
  ('Open d''Australie', 15, 'F', 'Carlos Alcaraz', 'Novak Djokovic', 1, 4, '[[2, 6], [6, 2], [6, 3], [7, 5]]'::jsonb, '[3, 1]'::jsonb, 'normal'),
  ('Indian Wells Masters', 1, 'R16', 'Jannik Sinner', 'Joao Fonseca', 1, 2, '[[7, 6], [7, 6]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Indian Wells Masters', 2, 'R16', 'Alejandro Davidovich Fokina', 'Learner Tien', 2, 3, '[[6, 4], [1, 6], [6, 7]]'::jsonb, '[1, 2]'::jsonb, 'normal'),
  ('Indian Wells Masters', 3, 'R16', 'Alexander Zverev', 'Frances Tiafoe', 1, 2, '[[6, 3], [6, 4]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Indian Wells Masters', 4, 'R16', 'Arthur Fils', 'Felix Auger-Aliassime', 1, 2, '[[6, 3], [7, 6]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Indian Wells Masters', 5, 'R16', 'Alex Michelsen', 'Daniil Medvedev', 2, 2, '[[2, 6], [4, 6]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Indian Wells Masters', 6, 'R16', 'Jack Draper', 'Novak Djokovic', 1, 3, '[[4, 6], [6, 4], [7, 6]]'::jsonb, '[2, 1]'::jsonb, 'normal'),
  ('Indian Wells Masters', 7, 'R16', 'Carlos Alcaraz', 'Casper Ruud', 1, 2, '[[6, 1], [7, 6]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Indian Wells Masters', 8, 'R16', 'Cameron Norrie', 'Rinky Hijikata', 1, 2, '[[6, 4], [6, 2]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Indian Wells Masters', 9, 'QF', 'Jannik Sinner', 'Learner Tien', 1, 2, '[[6, 1], [6, 2]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Indian Wells Masters', 10, 'QF', 'Alexander Zverev', 'Arthur Fils', 1, 2, '[[6, 2], [6, 3]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Indian Wells Masters', 11, 'QF', 'Daniil Medvedev', 'Jack Draper', 1, 2, '[[6, 1], [7, 5]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Indian Wells Masters', 12, 'QF', 'Cameron Norrie', 'Carlos Alcaraz', 2, 2, '[[3, 6], [4, 6]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Indian Wells Masters', 13, 'SF', 'Alexander Zverev', 'Jannik Sinner', 2, 2, '[[2, 6], [4, 6]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Indian Wells Masters', 14, 'SF', 'Carlos Alcaraz', 'Daniil Medvedev', 2, 2, '[[3, 6], [6, 7]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Indian Wells Masters', 15, 'F', 'Daniil Medvedev', 'Jannik Sinner', 2, 2, '[[6, 7], [6, 7]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Miami Open', 1, 'R16', 'Alexander Zverev', 'Quentin Halys', 1, 2, '[[7, 6], [7, 6]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Miami Open', 2, 'R16', 'Francisco Cerundolo', 'Ugo Humbert', 1, 2, '[[6, 4], [6, 3]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Miami Open', 3, 'R16', 'Alex Michelsen', 'Jannik Sinner', 2, 2, '[[5, 7], [6, 7]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Miami Open', 4, 'R16', 'Frances Tiafoe', 'Terence Atmane', 1, 3, '[[6, 4], [1, 6], [6, 4]]'::jsonb, '[2, 1]'::jsonb, 'normal'),
  ('Miami Open', 5, 'R16', 'Tomas Martin Etcheverry', 'Tommy Paul', 2, 2, '[[1, 6], [3, 6]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Miami Open', 6, 'R16', 'Jiri Lehecka', 'Taylor Fritz', 1, 3, '[[6, 4], [6, 7], [6, 2]]'::jsonb, '[2, 1]'::jsonb, 'normal'),
  ('Miami Open', 7, 'R16', 'Martin Landaluce', 'Sebastian Korda', 1, 3, '[[2, 6], [7, 6], [6, 4]]'::jsonb, '[2, 1]'::jsonb, 'normal'),
  ('Miami Open', 8, 'R16', 'Arthur Fils', 'Valentin Vacherot', 1, 3, '[[6, 4], [6, 7], [6, 4]]'::jsonb, '[2, 1]'::jsonb, 'normal'),
  ('Miami Open', 9, 'QF', 'Alexander Zverev', 'Francisco Cerundolo', 1, 2, '[[6, 1], [6, 2]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Miami Open', 10, 'QF', 'Frances Tiafoe', 'Jannik Sinner', 2, 2, '[[2, 6], [2, 6]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Miami Open', 11, 'QF', 'Arthur Fils', 'Tommy Paul', 1, 3, '[[6, 7], [7, 6], [7, 6]]'::jsonb, '[2, 1]'::jsonb, 'normal'),
  ('Miami Open', 12, 'QF', 'Jiri Lehecka', 'Martin Landaluce', 1, 2, '[[7, 6], [7, 5]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Miami Open', 13, 'SF', 'Alexander Zverev', 'Jannik Sinner', 2, 2, '[[3, 6], [6, 7]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Miami Open', 14, 'SF', 'Arthur Fils', 'Jiri Lehecka', 2, 2, '[[2, 6], [2, 6]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Miami Open', 15, 'F', 'Jannik Sinner', 'Jiri Lehecka', 1, 2, '[[6, 4], [6, 4]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Monte-Carlo Masters', 1, 'R16', 'Jannik Sinner', 'Tomas Machac', 1, 3, '[[6, 1], [6, 7], [6, 3]]'::jsonb, '[2, 1]'::jsonb, 'normal'),
  ('Monte-Carlo Masters', 2, 'R16', 'Casper Ruud', 'Felix Auger-Aliassime', 2, 2, '[[5, 7], [2, 2]]'::jsonb, '[0, 1]'::jsonb, 'abandon'),
  ('Monte-Carlo Masters', 3, 'R16', 'Alexander Zverev', 'Zizou Bergs', 1, 2, '[[6, 2], [7, 5]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Monte-Carlo Masters', 4, 'R16', 'Joao Fonseca', 'Matteo Berrettini', 1, 2, '[[6, 3], [6, 2]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Monte-Carlo Masters', 5, 'R16', 'Carlos Alcaraz', 'Tomas Martin Etcheverry', 1, 3, '[[6, 1], [4, 6], [6, 3]]'::jsonb, '[2, 1]'::jsonb, 'normal'),
  ('Monte-Carlo Masters', 6, 'R16', 'Alexander Bublik', 'Jiri Lehecka', 1, 2, '[[6, 2], [7, 5]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Monte-Carlo Masters', 7, 'R16', 'Hubert Hurkacz', 'Valentin Vacherot', 2, 3, '[[7, 6], [3, 6], [4, 6]]'::jsonb, '[1, 2]'::jsonb, 'normal'),
  ('Monte-Carlo Masters', 8, 'R16', 'Alex de Minaur', 'Alexander Blockx', 1, 2, '[[7, 5], [7, 6]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Monte-Carlo Masters', 9, 'QF', 'Felix Auger-Aliassime', 'Jannik Sinner', 2, 2, '[[3, 6], [4, 6]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Monte-Carlo Masters', 10, 'QF', 'Alexander Zverev', 'Joao Fonseca', 1, 3, '[[7, 5], [6, 7], [6, 3]]'::jsonb, '[2, 1]'::jsonb, 'normal'),
  ('Monte-Carlo Masters', 11, 'QF', 'Alexander Bublik', 'Carlos Alcaraz', 2, 2, '[[3, 6], [0, 6]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Monte-Carlo Masters', 12, 'QF', 'Alex de Minaur', 'Valentin Vacherot', 2, 3, '[[4, 6], [6, 3], [3, 6]]'::jsonb, '[1, 2]'::jsonb, 'normal'),
  ('Monte-Carlo Masters', 13, 'SF', 'Alexander Zverev', 'Jannik Sinner', 2, 2, '[[1, 6], [4, 6]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Monte-Carlo Masters', 14, 'SF', 'Carlos Alcaraz', 'Valentin Vacherot', 1, 2, '[[6, 4], [6, 4]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Monte-Carlo Masters', 15, 'F', 'Carlos Alcaraz', 'Jannik Sinner', 2, 2, '[[6, 7], [3, 6]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Madrid Open', 1, 'R16', 'Alexander Blockx', 'Francisco Cerundolo', 1, 2, '[[7, 6], [6, 2]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Madrid Open', 2, 'R16', 'Rafael Jódar', 'Vit Kopriva', 1, 2, '[[7, 5], [6, 0]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Madrid Open', 3, 'R16', 'Cameron Norrie', 'Jannik Sinner', 2, 2, '[[2, 6], [5, 7]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Madrid Open', 4, 'R16', 'Arthur Fils', 'Tomas Martin Etcheverry', 1, 2, '[[6, 3], [6, 4]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Madrid Open', 5, 'R16', 'Alexander Zverev', 'Jakub Mensik', 1, 3, '[[6, 4], [6, 7], [6, 3]]'::jsonb, '[2, 1]'::jsonb, 'normal'),
  ('Madrid Open', 6, 'R16', 'Daniil Medvedev', 'Flavio Cobolli', 2, 3, '[[3, 6], [7, 5], [4, 6]]'::jsonb, '[1, 2]'::jsonb, 'normal'),
  ('Madrid Open', 7, 'R16', 'Casper Ruud', 'Stefanos Tsitsipas', 1, 3, '[[6, 7], [7, 6], [7, 6]]'::jsonb, '[2, 1]'::jsonb, 'normal'),
  ('Madrid Open', 8, 'R16', 'Jiri Lehecka', 'Lorenzo Musetti', 1, 2, '[[6, 3], [6, 3]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Madrid Open', 9, 'QF', 'Alexander Zverev', 'Flavio Cobolli', 1, 2, '[[6, 1], [6, 4]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Madrid Open', 10, 'QF', 'Alexander Blockx', 'Casper Ruud', 1, 2, '[[6, 4], [6, 4]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Madrid Open', 11, 'QF', 'Arthur Fils', 'Jiri Lehecka', 1, 2, '[[6, 3], [6, 4]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Madrid Open', 12, 'QF', 'Jannik Sinner', 'Rafael Jódar', 1, 2, '[[6, 2], [7, 6]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Madrid Open', 13, 'SF', 'Alexander Blockx', 'Alexander Zverev', 2, 2, '[[2, 6], [5, 7]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Madrid Open', 14, 'SF', 'Arthur Fils', 'Jannik Sinner', 2, 2, '[[2, 6], [4, 6]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Madrid Open', 15, 'F', 'Alexander Zverev', 'Jannik Sinner', 2, 2, '[[1, 6], [2, 6]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Masters de Rome', 1, 'R16', 'Daniil Medvedev', 'Thiago Agustin Tirante', 1, 2, '[[6, 3], [6, 2]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Masters de Rome', 2, 'R16', 'Hamad Medjedovic', 'Martin Landaluce', 2, 2, '[[5, 7], [4, 6]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Masters de Rome', 3, 'R16', 'Andrea Pellegrino', 'Jannik Sinner', 2, 2, '[[2, 6], [3, 6]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Masters de Rome', 4, 'R16', 'Alexander Zverev', 'Luciano Darderi', 2, 3, '[[6, 1], [6, 7], [0, 6]]'::jsonb, '[1, 2]'::jsonb, 'normal'),
  ('Masters de Rome', 5, 'R16', 'Dino Prizmic', 'Karen Khachanov', 2, 2, '[[1, 6], [6, 7]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Masters de Rome', 6, 'R16', 'Casper Ruud', 'Lorenzo Musetti', 1, 2, '[[6, 3], [6, 1]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Masters de Rome', 7, 'R16', 'Andrey Rublev', 'Nikoloz Basilashvili', 1, 3, '[[3, 6], [7, 6], [6, 2]]'::jsonb, '[2, 1]'::jsonb, 'normal'),
  ('Masters de Rome', 8, 'R16', 'Learner Tien', 'Rafael Jódar', 2, 2, '[[1, 6], [4, 6]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Masters de Rome', 9, 'QF', 'Daniil Medvedev', 'Martin Landaluce', 1, 3, '[[1, 6], [6, 4], [7, 5]]'::jsonb, '[2, 1]'::jsonb, 'normal'),
  ('Masters de Rome', 10, 'QF', 'Andrey Rublev', 'Jannik Sinner', 2, 2, '[[2, 6], [4, 6]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Masters de Rome', 11, 'QF', 'Luciano Darderi', 'Rafael Jódar', 1, 3, '[[7, 6], [5, 7], [6, 0]]'::jsonb, '[2, 1]'::jsonb, 'normal'),
  ('Masters de Rome', 12, 'QF', 'Casper Ruud', 'Karen Khachanov', 1, 3, '[[6, 1], [1, 6], [6, 2]]'::jsonb, '[2, 1]'::jsonb, 'normal'),
  ('Masters de Rome', 13, 'SF', 'Daniil Medvedev', 'Jannik Sinner', 2, 3, '[[2, 6], [7, 5], [4, 6]]'::jsonb, '[1, 2]'::jsonb, 'normal'),
  ('Masters de Rome', 14, 'SF', 'Casper Ruud', 'Luciano Darderi', 1, 2, '[[6, 1], [6, 1]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Masters de Rome', 15, 'F', 'Casper Ruud', 'Jannik Sinner', 2, 2, '[[4, 6], [4, 6]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Roland-Garros', 1, 'R16', 'Frances Tiafoe', 'Matteo Arnaldi', 2, 5, '[[6, 7], [7, 6], [6, 3], [6, 7], [4, 6]]'::jsonb, '[2, 3]'::jsonb, 'normal'),
  ('Roland-Garros', 2, 'R16', 'Alejandro Tabilo', 'Felix Auger-Aliassime', 2, 3, '[[3, 6], [5, 7], [1, 6]]'::jsonb, '[0, 3]'::jsonb, 'normal'),
  ('Roland-Garros', 3, 'R16', 'Juan Manuel Cerundolo', 'Matteo Berrettini', 2, 3, '[[3, 6], [6, 7], [6, 7]]'::jsonb, '[0, 3]'::jsonb, 'normal'),
  ('Roland-Garros', 4, 'R16', 'Flavio Cobolli', 'Zachary Svajda', 1, 4, '[[6, 2], [6, 3], [6, 7], [7, 6]]'::jsonb, '[3, 1]'::jsonb, 'normal'),
  ('Roland-Garros', 5, 'R16', 'Casper Ruud', 'Joao Fonseca', 2, 4, '[[5, 7], [6, 7], [7, 5], [2, 6]]'::jsonb, '[1, 3]'::jsonb, 'normal'),
  ('Roland-Garros', 6, 'R16', 'Andrey Rublev', 'Jakub Mensik', 2, 5, '[[3, 6], [6, 7], [6, 4], [6, 2], [3, 6]]'::jsonb, '[2, 3]'::jsonb, 'normal'),
  ('Roland-Garros', 7, 'R16', 'Alexander Zverev', 'Jesper de Jong', 1, 3, '[[7, 6], [6, 4], [6, 1]]'::jsonb, '[3, 0]'::jsonb, 'normal'),
  ('Roland-Garros', 8, 'R16', 'Pablo Carreno Busta', 'Rafael Jódar', 2, 5, '[[6, 4], [6, 4], [1, 6], [2, 6], [2, 6]]'::jsonb, '[2, 3]'::jsonb, 'normal'),
  ('Roland-Garros', 9, 'QF', 'Matteo Arnaldi', 'Matteo Berrettini', 1, 2, '[[7, 5], [5, 2]]'::jsonb, '[1, 0]'::jsonb, 'abandon'),
  ('Roland-Garros', 10, 'QF', 'Felix Auger-Aliassime', 'Flavio Cobolli', 2, 4, '[[6, 4], [4, 6], [4, 6], [4, 6]]'::jsonb, '[1, 3]'::jsonb, 'normal'),
  ('Roland-Garros', 11, 'QF', 'Jakub Mensik', 'Joao Fonseca', 1, 3, '[[6, 4], [6, 3], [7, 6]]'::jsonb, '[3, 0]'::jsonb, 'normal'),
  ('Roland-Garros', 12, 'QF', 'Alexander Zverev', 'Rafael Jódar', 1, 3, '[[7, 6], [6, 1], [6, 3]]'::jsonb, '[3, 0]'::jsonb, 'normal'),
  ('Roland-Garros', 13, 'SF', 'Flavio Cobolli', 'Matteo Arnaldi', 1, null, null::jsonb, null::jsonb, 'forfait'),
  ('Roland-Garros', 14, 'SF', 'Alexander Zverev', 'Jakub Mensik', 1, 4, '[[7, 5], [6, 2], [3, 6], [6, 3]]'::jsonb, '[3, 1]'::jsonb, 'normal'),
  ('Roland-Garros', 15, 'F', 'Alexander Zverev', 'Flavio Cobolli', 1, 5, '[[6, 1], [4, 6], [6, 4], [6, 7], [6, 1]]'::jsonb, '[3, 2]'::jsonb, 'normal'),
  ('Wimbledon', 1, 'R16', 'Alexander Zverev', 'Jiri Lehecka', 1, 4, '[[6, 4], [7, 5], [3, 6], [7, 6]]'::jsonb, '[3, 1]'::jsonb, 'normal'),
  ('Wimbledon', 2, 'R16', 'Alexander Bublik', 'Taylor Fritz', 2, 3, '[[6, 7], [4, 6], [4, 6]]'::jsonb, '[0, 3]'::jsonb, 'normal'),
  ('Wimbledon', 3, 'R16', 'Arthur Fery', 'Grigor Dimitrov', 1, 5, '[[7, 5], [3, 6], [4, 6], [6, 4], [7, 6]]'::jsonb, '[3, 2]'::jsonb, 'normal'),
  ('Wimbledon', 4, 'R16', 'Alex de Minaur', 'Flavio Cobolli', 2, 3, '[[5, 7], [6, 7], [3, 6]]'::jsonb, '[0, 3]'::jsonb, 'normal'),
  ('Wimbledon', 5, 'R16', 'Jannik Sinner', 'Shintaro Mochizuki', 1, 3, '[[6, 3], [7, 6], [6, 3]]'::jsonb, '[3, 0]'::jsonb, 'normal'),
  ('Wimbledon', 6, 'R16', 'Hubert Hurkacz', 'Jan-Lennard Struff', 2, 5, '[[6, 3], [7, 6], [6, 7], [5, 7], [2, 4]]'::jsonb, '[2, 2]'::jsonb, 'abandon'),
  ('Wimbledon', 7, 'R16', 'Alejandro Davidovich Fokina', 'Felix Auger-Aliassime', 2, 5, '[[7, 6], [6, 7], [3, 6], [7, 6], [1, 6]]'::jsonb, '[2, 3]'::jsonb, 'normal'),
  ('Wimbledon', 8, 'R16', 'Novak Djokovic', 'Roman Safiullin', 1, 4, '[[7, 6], [6, 3], [3, 6], [6, 3]]'::jsonb, '[3, 1]'::jsonb, 'normal'),
  ('Wimbledon', 9, 'QF', 'Alexander Zverev', 'Taylor Fritz', 1, 3, '[[6, 4], [6, 4], [6, 2]]'::jsonb, '[3, 0]'::jsonb, 'normal'),
  ('Wimbledon', 10, 'QF', 'Arthur Fery', 'Flavio Cobolli', 1, 3, '[[6, 4], [7, 6], [6, 0]]'::jsonb, '[3, 0]'::jsonb, 'normal'),
  ('Wimbledon', 11, 'QF', 'Felix Auger-Aliassime', 'Novak Djokovic', 2, 5, '[[6, 7], [6, 3], [3, 6], [7, 6], [6, 7]]'::jsonb, '[2, 3]'::jsonb, 'normal'),
  ('Wimbledon', 12, 'QF', 'Jan-Lennard Struff', 'Jannik Sinner', 2, 3, '[[5, 7], [6, 7], [3, 6]]'::jsonb, '[0, 3]'::jsonb, 'normal'),
  ('Wimbledon', 13, 'SF', 'Jannik Sinner', 'Novak Djokovic', 1, 3, '[[6, 4], [6, 4], [6, 4]]'::jsonb, '[3, 0]'::jsonb, 'normal'),
  ('Wimbledon', 14, 'SF', 'Alexander Zverev', 'Arthur Fery', 1, 3, '[[7, 6], [6, 2], [6, 4]]'::jsonb, '[3, 0]'::jsonb, 'normal'),
  ('Wimbledon', 15, 'F', 'Alexander Zverev', 'Jannik Sinner', 2, 4, '[[7, 6], [6, 7], [3, 6], [4, 6]]'::jsonb, '[1, 3]'::jsonb, 'normal'),
  ('Masters du Canada', 1, 'R16', 'Botic van de Zandschulp', 'Jakub Mensik', 2, 2, '[[4, 6], [5, 7]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Masters du Canada', 2, 'R16', 'Ben Shelton', 'Joao Fonseca', 1, 2, '[[6, 3], [7, 6]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Masters du Canada', 3, 'R16', 'Learner Tien', 'Thiago Agustin Tirante', 1, 2, '[[6, 4], [6, 4]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Masters du Canada', 4, 'R16', 'Daniel Merida', 'Tallon Griekspoor', 1, 2, '[[6, 3], [6, 1]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Masters du Canada', 5, 'R16', 'Jiri Lehecka', 'Rafael Jódar', 2, 2, '[[3, 6], [3, 6]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Masters du Canada', 6, 'R16', 'Arthur Fils', 'Cameron Norrie', 1, 2, '[[6, 2], [7, 6]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Masters du Canada', 7, 'R16', 'Luciano Darderi', 'Nuno Borges', 1, 3, '[[4, 6], [6, 3], [7, 5]]'::jsonb, '[2, 1]'::jsonb, 'normal'),
  ('Masters du Canada', 8, 'R16', 'Arthur Rinderknech', 'Brandon Nakashima', 2, 3, '[[6, 7], [7, 5], [5, 7]]'::jsonb, '[1, 2]'::jsonb, 'normal'),
  ('Masters du Canada', 9, 'QF', 'Ben Shelton', 'Jakub Mensik', 1, 2, '[[6, 3], [6, 1]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Masters du Canada', 10, 'QF', 'Arthur Fils', 'Rafael Jódar', 2, 2, '[[6, 7], [3, 6]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Masters du Canada', 11, 'QF', 'Daniel Merida', 'Learner Tien', 2, 2, '[[3, 6], [2, 6]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Masters du Canada', 12, 'QF', 'Brandon Nakashima', 'Luciano Darderi', 1, 2, '[[6, 2], [6, 3]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Masters du Canada', 13, 'SF', 'Ben Shelton', 'Learner Tien', 1, 2, '[[6, 2], [6, 3]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Masters du Canada', 14, 'SF', 'Brandon Nakashima', 'Rafael Jódar', 1, 2, '[[7, 6], [6, 4]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Masters du Canada', 15, 'F', 'Ben Shelton', 'Brandon Nakashima', 1, 2, '[[6, 3], [7, 6]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Cincinnati Masters', 1, 'R16', 'Alex de Minaur', 'Arthur Fils', 2, 2, '[[3, 6], [4, 6]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Cincinnati Masters', 2, 'R16', 'Jakub Mensik', 'Thiago Agustin Tirante', 2, 3, '[[7, 5], [4, 6], [4, 6]]'::jsonb, '[1, 2]'::jsonb, 'normal'),
  ('Cincinnati Masters', 3, 'R16', 'Flavio Cobolli', 'Rafael Jódar', 1, 3, '[[4, 6], [7, 6], [6, 3]]'::jsonb, '[2, 1]'::jsonb, 'normal'),
  ('Cincinnati Masters', 4, 'R16', 'Alexander Zverev', 'Tommy Paul', 2, 3, '[[6, 4], [6, 7], [4, 6]]'::jsonb, '[1, 2]'::jsonb, 'normal'),
  ('Cincinnati Masters', 5, 'R16', 'Felix Auger-Aliassime', 'Frances Tiafoe', 2, 2, '[[3, 6], [4, 6]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Cincinnati Masters', 6, 'R16', 'Jaime Faria', 'Lorenzo Musetti', 2, 2, '[[5, 7], [2, 6]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Cincinnati Masters', 7, 'R16', 'Brandon Nakashima', 'Nuno Borges', 1, 3, '[[6, 3], [6, 7], [6, 3]]'::jsonb, '[2, 1]'::jsonb, 'normal'),
  ('Cincinnati Masters', 8, 'R16', 'Christopher O''Connell', 'Taylor Fritz', 2, 2, '[[4, 6], [3, 6]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Cincinnati Masters', 9, 'QF', 'Arthur Fils', 'Thiago Agustin Tirante', 1, 2, '[[6, 3], [6, 2]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Cincinnati Masters', 10, 'QF', 'Flavio Cobolli', 'Tommy Paul', 1, 3, '[[2, 6], [6, 3], [6, 4]]'::jsonb, '[2, 1]'::jsonb, 'normal'),
  ('Cincinnati Masters', 11, 'QF', 'Frances Tiafoe', 'Lorenzo Musetti', 1, 2, '[[7, 6], [7, 5]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Cincinnati Masters', 12, 'QF', 'Brandon Nakashima', 'Taylor Fritz', 1, 3, '[[7, 6], [4, 6], [6, 3]]'::jsonb, '[2, 1]'::jsonb, 'normal'),
  ('Cincinnati Masters', 13, 'SF', 'Arthur Fils', 'Flavio Cobolli', 1, 2, '[[6, 3], [6, 4]]'::jsonb, '[2, 0]'::jsonb, 'normal'),
  ('Cincinnati Masters', 14, 'SF', 'Brandon Nakashima', 'Frances Tiafoe', 2, 2, '[[5, 7], [3, 6]]'::jsonb, '[0, 2]'::jsonb, 'normal'),
  ('Cincinnati Masters', 15, 'F', 'Arthur Fils', 'Frances Tiafoe', 1, 3, '[[6, 3], [1, 6], [6, 0]]'::jsonb, '[2, 1]'::jsonb, 'normal'),
  ('US Open', 1, 'R16', 'Alexander Zverev', 'Luciano Darderi', 1, 3, '[[6, 2], [6, 2], [7, 6]]'::jsonb, '[3, 0]'::jsonb, 'normal'),
  ('US Open', 2, 'R16', 'Arthur Gea', 'Botic van de Zandschulp', 2, 5, '[[6, 3], [7, 6], [6, 7], [6, 7], [4, 6]]'::jsonb, '[2, 3]'::jsonb, 'normal'),
  ('US Open', 3, 'R16', 'Karen Khachanov', 'Learner Tien', 1, 5, '[[7, 5], [4, 6], [6, 7], [6, 1], [6, 4]]'::jsonb, '[3, 2]'::jsonb, 'normal'),
  ('US Open', 4, 'R16', 'Alexander Blockx', 'Francisco Cerundolo', 1, 4, '[[6, 3], [4, 6], [7, 5], [7, 5]]'::jsonb, '[3, 1]'::jsonb, 'normal'),
  ('US Open', 5, 'R16', 'Ben Shelton', 'Stefanos Tsitsipas', 1, 3, '[[6, 2], [6, 3], [6, 4]]'::jsonb, '[3, 0]'::jsonb, 'normal'),
  ('US Open', 6, 'R16', 'Carlos Alcaraz', 'Tommy Paul', 1, 3, '[[6, 4], [6, 3], [6, 4]]'::jsonb, '[3, 0]'::jsonb, 'normal'),
  ('US Open', 7, 'R16', 'Daniil Medvedev', 'Frances Tiafoe', 2, 3, '[[6, 7], [4, 6], [6, 7]]'::jsonb, '[0, 3]'::jsonb, 'normal'),
  ('US Open', 8, 'R16', 'Alex Michelsen', 'Tomas Martin Etcheverry', 1, 3, '[[7, 6], [6, 4], [6, 4]]'::jsonb, '[3, 0]'::jsonb, 'normal'),
  ('US Open', 9, 'QF', 'Alexander Zverev', 'Botic van de Zandschulp', 1, 3, '[[6, 2], [7, 5], [6, 1]]'::jsonb, '[3, 0]'::jsonb, 'normal'),
  ('US Open', 10, 'QF', 'Alexander Blockx', 'Karen Khachanov', 2, 3, '[[2, 6], [5, 7], [2, 3]]'::jsonb, '[0, 2]'::jsonb, 'abandon'),
  ('US Open', 11, 'QF', 'Ben Shelton', 'Carlos Alcaraz', 1, 5, '[[6, 7], [6, 1], [6, 3], [1, 6], [7, 6]]'::jsonb, '[3, 2]'::jsonb, 'normal'),
  ('US Open', 12, 'QF', 'Alex Michelsen', 'Frances Tiafoe', 2, 5, '[[7, 5], [6, 3], [5, 7], [3, 6], [6, 7]]'::jsonb, '[2, 3]'::jsonb, 'normal'),
  ('US Open', 13, 'SF', 'Alexander Zverev', 'Karen Khachanov', 1, 3, '[[6, 3], [7, 6], [7, 6]]'::jsonb, '[3, 0]'::jsonb, 'normal'),
  ('US Open', 14, 'SF', 'Ben Shelton', 'Frances Tiafoe', 1, 4, '[[4, 6], [6, 3], [6, 3], [7, 5]]'::jsonb, '[3, 1]'::jsonb, 'normal'),
  ('US Open', 15, 'F', 'Alexander Zverev', 'Ben Shelton', 1, 4, '[[6, 3], [7, 6], [5, 7], [6, 2]]'::jsonb, '[3, 1]'::jsonb, 'normal');

  -- les joueurs de tennis (créés s'ils n'existent pas déjà)
  for nom_j in select distinct n from (select p1 as n from m_def union select p2 from m_def) x order by n loop
    if not exists (select 1 from public.players where nom = nom_j) then
      insert into public.players (nom) values (nom_j);
    end if;
  end loop;

  -- les tournois (ignorés s'ils existent déjà), puis leurs matchs
  for t in select * from t_def order by debut loop
    if exists (select 1 from public.tournaments where annee = 2026 and nom = t.nom) then
      raise notice '% 2026 existe déjà : ignoré.', t.nom;
      continue;
    end if;
    insert into public.tournaments (annee, nom, ville, surface, indoor, categorie, date_debut, date_fin, etat, vainqueur_id, finaliste_id)
    values (2026, t.nom, t.ville, t.surface, false, t.categorie, t.debut, t.fin, 'clos',
            (select min(id) from public.players where nom = t.vainqueur), (select min(id) from public.players where nom = t.finaliste))
    returning id into t_id;

    insert into public.matches (tournament_id, tour, p1_id, p2_id, statut, vainqueur, sets_joues, score, fin_match)
    select t_id, d.tour, (select min(id) from public.players where nom = d.p1), (select min(id) from public.players where nom = d.p2),
           'termine', d.vainqueur, d.sets_joues,
           case when d.jeux is null then null else jsonb_build_object('sets', d.sets, 'games', d.jeux) end, d.fin
    from m_def d where d.nom_t = t.nom order by d.ordre;
    raise notice '% 2026 créé (tournoi %).', t.nom, t_id;
  end loop;
end $$;

-- Contrôle : 11 tournois « clos » de 15 matchs terminés chacun (rejouable)
select t.nom, t.categorie, t.etat, p.nom as vainqueur, count(m.id) as matchs, count(*) filter (where m.statut = 'termine') as termines
from public.tournaments t left join public.matches m on m.tournament_id = t.id left join public.players p on p.id = t.vainqueur_id
where t.annee = 2026 and t.nom in ('Open d''Australie', 'Indian Wells Masters', 'Miami Open', 'Monte-Carlo Masters', 'Madrid Open', 'Masters de Rome', 'Roland-Garros', 'Wimbledon', 'Masters du Canada', 'Cincinnati Masters', 'US Open')
group by t.id, t.nom, t.categorie, t.etat, p.nom order by min(t.date_debut);
