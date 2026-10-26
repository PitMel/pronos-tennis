-- =====================================================================================
-- Pronos Tennis — fiches des deux derniers tournois suivis de 2026 (tests en conditions réelles)
-- À exécuter une fois (SQL Editor ou connecteur). Sans secret. Peut être rejoué sans danger.
--
-- Les DATES ne sont pas renseignées : c'est Pierre qui les saisit (cahier des charges, section 2). La synchronisation
-- n'en a pas besoin pour fonctionner.
-- Identifiants de l'API : Paris = 1725 et 1726 (catalogue de reference/api/masters_1000.json) ;
-- ATP Finals = 2794 et 2795 (« Finals - Turin », observés ; à confirmer avec le mode diagnostic de la synchronisation).
-- =====================================================================================

insert into public.tournaments (annee, nom, ville, surface, indoor, categorie, etat) values
  (2026, 'Rolex Paris Masters', 'Paris', 'dur', true, 'masters_1000', 'a_venir'),
  (2026, 'Nitto ATP Finals',    'Turin', 'dur', true, 'atp_finals',   'a_venir')
on conflict (annee, nom) do nothing;

insert into public.tournament_api_ids (api_id, tournament_id)
select v.api_id, t.id
from (values ('1725', 'Rolex Paris Masters'), ('1726', 'Rolex Paris Masters'),
             ('2794', 'Nitto ATP Finals'),    ('2795', 'Nitto ATP Finals')) as v (api_id, nom)
join public.tournaments t on t.annee = 2026 and t.nom = v.nom
on conflict do nothing;

select t.nom, t.categorie, t.etat, array_agg(a.api_id order by a.api_id) as identifiants_api
from public.tournaments t join public.tournament_api_ids a on a.tournament_id = t.id
group by t.id, t.nom, t.categorie, t.etat order by t.nom;

-- Dates des ATP Finals confirmées par Pierre le 26 oct. 2026 : 15 au 22 novembre 2026 (elles servent à la fenêtre de synchronisation).
update public.tournaments set date_debut = '2026-11-15', date_fin = '2026-11-22'
where annee = 2026 and nom = 'Nitto ATP Finals' and categorie = 'atp_finals';
