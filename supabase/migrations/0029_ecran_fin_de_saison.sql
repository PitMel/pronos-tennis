-- =====================================================================================
-- Pronos Tennis — migration 0029 : écran « la saison est terminée », affiché UNE FOIS par joueur (Pierre, 18 nov. 2026).
-- À exécuter APRÈS 0028. Ne contient aucun secret.
--
-- Même principe que l'écran de fin de tournoi (0028) : une saison est terminée quand TOUS ses tournois sont clos ; le joueur qui y a
-- participé voit l'écran avant l'accès normal, une seule fois (après l'écran du dernier tournoi, s'il y en a un).
--   * Chacun ne lit et n'écrit que SES lignes (pas de modification, pas de suppression).
--   * Une saison déjà terminée au moment de la migration n'a pas d'écran (aucune aujourd'hui : la saison 2026 attend les ATP Finals),
--     et un compte créé plus tard ne voit pas les saisons déjà terminées.
-- =====================================================================================

create table public.ecrans_fin_saison_vus (
  joueur_id uuid        not null references public.profiles (id) on delete cascade,
  annee     integer     not null,
  vu_le     timestamptz not null default now(),
  primary key (joueur_id, annee)
);
comment on table public.ecrans_fin_saison_vus is 'Écran de fin de saison déjà montré à ce joueur (une seule fois par joueur et par saison).';

alter table public.ecrans_fin_saison_vus enable row level security;

create policy ecrans_saison_vus_lecture on public.ecrans_fin_saison_vus
  for select to authenticated using (joueur_id = auth.uid());
create policy ecrans_saison_vus_insertion on public.ecrans_fin_saison_vus
  for insert to authenticated with check (joueur_id = auth.uid());

revoke all on public.ecrans_fin_saison_vus from public, anon, authenticated;
grant select, insert on public.ecrans_fin_saison_vus to authenticated;

-- Saisons déjà terminées : jamais d'écran.
insert into public.ecrans_fin_saison_vus (joueur_id, annee)
select p.id, s.annee
from public.profiles p
cross join (select annee from public.tournaments group by annee having bool_and(etat = 'clos')) s
on conflict do nothing;

-- Compte créé plus tard : les saisons déjà terminées sont considérées comme vues.
create function public.trg_profil_ecrans_saison_deja_vus() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.ecrans_fin_saison_vus (joueur_id, annee)
  select new.id, s.annee
  from (select annee from public.tournaments group by annee having bool_and(etat = 'clos')) s
  on conflict do nothing;
  return null;
end $$;
create trigger profiles_ecrans_saison_deja_vus after insert on public.profiles
  for each row execute function public.trg_profil_ecrans_saison_deja_vus();
