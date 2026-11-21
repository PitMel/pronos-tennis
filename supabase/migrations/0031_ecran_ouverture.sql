-- =====================================================================================
-- Pronos Tennis — migration 0031 : écran d'ouverture (Pierre, 21 nov. 2026).
-- À exécuter APRÈS 0030. Ne contient aucun secret.
--
-- À chaque lancement de l'appli, un écran plein page montre une citation, une info ou une image du tennis tirée au hasard dans une
-- base ; un clic n'importe où le fait disparaître.
--   * Table de contenus : lisible par tout joueur connecté, modifiable par l'administrateur seulement.
--   * Un interrupteur (une seule ligne), DÉSACTIVÉ par défaut : l'écran n'apparaît que quand Pierre l'allume.
--   * Les contenus sont ajoutés à la main (SQL Editor ou plus tard l'espace administrateur) ; rien n'est inséré ici.
-- =====================================================================================

create table public.ecran_ouverture_contenus (
  id         bigint      generated always as identity primary key,
  type       text        not null check (type in ('citation', 'info', 'image')),
  texte      text,                       -- la citation, l'info, ou la légende d'une image (facultative)
  auteur     text,                       -- qui a dit la citation (facultatif)
  source     text,                       -- contexte, année, ou crédit de l'image (facultatif)
  image_url  text,                       -- adresse de l'image (obligatoire pour le type « image »)
  actif      boolean     not null default true,
  cree_le    timestamptz not null default now(),
  constraint contenu_image_a_une_adresse check (type <> 'image' or nullif(trim(image_url), '') is not null),
  constraint contenu_texte_present check (type = 'image' or nullif(trim(texte), '') is not null)
);
comment on table public.ecran_ouverture_contenus is 'Citations, infos et images tirées au hasard sur l''écran d''ouverture de l''appli.';

create table public.ecran_ouverture_reglage (
  id     boolean primary key default true check (id),   -- une seule ligne possible
  actif  boolean not null default false
);
comment on table public.ecran_ouverture_reglage is 'Interrupteur de l''écran d''ouverture (éteint tant que l''administrateur ne l''allume pas).';
insert into public.ecran_ouverture_reglage (id, actif) values (true, false);

alter table public.ecran_ouverture_contenus enable row level security;
alter table public.ecran_ouverture_reglage  enable row level security;

create policy ouverture_contenus_lecture on public.ecran_ouverture_contenus
  for select to authenticated using (true);
create policy ouverture_contenus_admin on public.ecran_ouverture_contenus
  for all to authenticated using (public.est_admin()) with check (public.est_admin());

create policy ouverture_reglage_lecture on public.ecran_ouverture_reglage
  for select to authenticated using (true);
create policy ouverture_reglage_admin on public.ecran_ouverture_reglage
  for update to authenticated using (public.est_admin()) with check (public.est_admin());

revoke all on public.ecran_ouverture_contenus, public.ecran_ouverture_reglage from public, anon, authenticated;
grant select on public.ecran_ouverture_contenus, public.ecran_ouverture_reglage to authenticated;
grant insert, update, delete on public.ecran_ouverture_contenus to authenticated;
grant update (actif) on public.ecran_ouverture_reglage to authenticated;
