-- =====================================================================================
-- Pronos Tennis — création des profils (à exécuter APRÈS la migration 0001 et après avoir
-- créé les 4 utilisateurs dans Supabase : Authentication > Users > Add user > Create new user).
--
-- Ce script ne contient AUCUN mot de passe : les mots de passe se saisissent uniquement dans
-- l'écran Supabase « Add user ». Les adresses e-mail ci-dessous sont techniques (jamais utilisées pour écrire).
-- Si Supabase refuse l'extension « .invalid », utiliser une autre adresse (par ex. pierre@example.com)
-- dans l'écran « Add user » ET ici, à l'identique.
--
--   pierre@pronos.invalid  -> administrateur ET vrai joueur (groupe réel)
--   andre@pronos.invalid   -> faux compte « André »   (groupe test)
--   paul@pronos.invalid    -> faux compte « Paul »    (groupe test)
--   jacques@pronos.invalid -> faux compte « Jacques » (groupe test)
--   jean@pronos.invalid    -> faux compte « Jean »    (groupe test, ajouté le 29 oct. 2026)
-- =====================================================================================

insert into public.profiles (id, prenom, is_admin, is_test, couleur)
select u.id, v.prenom, v.is_admin, v.is_test, v.couleur
from auth.users u
join (values
  ('pierre@pronos.invalid',  'Pierre',  true,  false, '#2F6CC2'),
  ('andre@pronos.invalid',   'André',   false, true,  '#D8A21E'),
  ('paul@pronos.invalid',    'Paul',    false, true,  '#C2452F'),
  ('jacques@pronos.invalid', 'Jacques', false, true,  '#7A4FC2'),
  ('jean@pronos.invalid',    'Jean',    false, true,  '#0E7490')
) as v (email, prenom, is_admin, is_test, couleur) on u.email = v.email
on conflict (id) do nothing;

-- Contrôle : doit afficher 5 lignes (Pierre administrateur non test ; André, Jacques, Jean, Paul test).
select prenom, is_admin, is_test, actif from public.profiles order by is_test, prenom;
