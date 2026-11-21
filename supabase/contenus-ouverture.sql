-- Contenus de l'écran d'ouverture (migration 0031). À exécuter dans le SQL Editor de Supabase APRÈS la migration 0031.
-- Ne contient aucun secret. Ajouter une ligne par contenu ; l'écran n'apparaît que si l'interrupteur est allumé :
--   update public.ecran_ouverture_reglage set actif = true;

-- Image fournie par Pierre (21 nov. 2026) : le fichier est dans web/images/ouverture/, publié avec le site.
insert into public.ecran_ouverture_contenus (type, texte, image_url) values
  ('image', 'Medvedev-Tiafoe, ATPF 2026', './images/ouverture/medvedev-tiafoe-atpf-2026.jpg');

-- Image fournie par Pierre (21 nov. 2026).
insert into public.ecran_ouverture_contenus (type, texte, image_url) values
  ('image', 'Roger Federer - Wimbledon 2003', './images/ouverture/federer-wimbledon-2003.jpg');
