-- =====================================================================================
-- Pronos Tennis — fiches des 14 tournois suivis en 2027 (4 Grands Chelems, 9 Masters 1000, ATP Finals)
-- À exécuter UNE FOIS, en JANVIER 2027 (SQL Editor ou connecteur), pas avant. Sans secret. Peut être rejoué sans danger.
--
-- POURQUOI PAS MAINTENANT : la synchronisation suit les tournois de la base ; sans dates elle ne sait pas quand les interroger
-- et pourrait consommer le quota de l'API pour rien. Les dates se saisissent ensuite dans l'application
-- (Admin > Calendrier > tournoi), une par tournoi, quand Pierre les connaît.
--
-- IDENTIFIANTS DE L'API : volontairement NON renseignés ici. Les identifiants du catalogue (reference/api/masters_1000.json)
-- sont ceux des éditions déjà connues : les attacher à un tournoi 2027 ferait importer d'anciens matchs. Pierre (ou Claude) les
-- ajoutera, tournoi par tournoi, dans l'application (Admin > Calendrier > tournoi > Identifiants de l'API) après
-- interrogation de l'API en mode diagnostic, au moment où chaque tournoi approche.
-- =====================================================================================

insert into public.tournaments (annee, nom, ville, surface, indoor, categorie, etat) values
  (2027, 'Open d''Australie',          'Melbourne',     'dur',   false, 'grand_slam',   'a_venir'),
  (2027, 'Indian Wells Masters',       'Indian Wells',  'dur',   false, 'masters_1000', 'a_venir'),
  (2027, 'Miami Open',                 'Miami',         'dur',   false, 'masters_1000', 'a_venir'),
  (2027, 'Monte-Carlo Masters',        'Monaco',        'terre', false, 'masters_1000', 'a_venir'),
  (2027, 'Madrid Open',                'Madrid',        'terre', false, 'masters_1000', 'a_venir'),
  (2027, 'Masters de Rome',            'Rome',          'terre', false, 'masters_1000', 'a_venir'),
  (2027, 'Roland-Garros',              'Paris',         'terre', false, 'grand_slam',   'a_venir'),
  (2027, 'Wimbledon',                  'Londres',       'gazon', false, 'grand_slam',   'a_venir'),
  (2027, 'Masters du Canada',          'Toronto / Montréal', 'dur', false, 'masters_1000', 'a_venir'),
  (2027, 'Cincinnati Masters',         'Cincinnati',    'dur',   false, 'masters_1000', 'a_venir'),
  (2027, 'US Open',                    'New York',      'dur',   false, 'grand_slam',   'a_venir'),
  (2027, 'Rolex Shanghai Masters',     'Shanghai',      'dur',   false, 'masters_1000', 'a_venir'),
  (2027, 'Rolex Paris Masters',        'Paris',         'dur',   true,  'masters_1000', 'a_venir'),
  (2027, 'Nitto ATP Finals',           'Turin',         'dur',   true,  'atp_finals',   'a_venir')
on conflict (annee, nom) do nothing;

-- Contrôle : 14 tournois, aucun identifiant d'API pour l'instant.
select t.nom, t.categorie, count(a.api_id) as identifiants_api
from public.tournaments t left join public.tournament_api_ids a on a.tournament_id = t.id
where t.annee = 2027 group by t.id, t.nom, t.categorie order by t.categorie, t.nom;
