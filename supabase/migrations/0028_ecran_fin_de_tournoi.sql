-- =====================================================================================
-- Pronos Tennis — migration 0028 : écran « le tournoi est terminé », affiché UNE FOIS par joueur (Pierre, 17 nov. 2026).
-- À exécuter APRÈS 0027. Ne contient aucun secret.
--
-- À l'ouverture de l'application, un joueur qui a participé à un tournoi clos qu'il n'a pas encore « vu » voit un écran
-- spécial (classement, trophée du vainqueur) avant l'accès normal ; « Continuer » l'inscrit ici et l'écran ne revient plus.
--   * Chacun ne lit et n'écrit que SES lignes (jamais celles d'un autre joueur, jamais de suppression ni de modification).
--   * Pas d'écran pour les tournois DÉJÀ clos au moment de la migration : ils sont marqués « vus » pour tous les comptes existants.
--   * Un compte créé plus tard ne voit pas non plus les tournois déjà clos (déclencheur sur la création du profil).
-- =====================================================================================

create table public.ecrans_fin_tournoi_vus (
  joueur_id     uuid        not null references public.profiles (id) on delete cascade,
  tournament_id bigint      not null references public.tournaments (id) on delete cascade,
  vu_le         timestamptz not null default now(),
  primary key (joueur_id, tournament_id)
);
comment on table public.ecrans_fin_tournoi_vus is 'Écran de fin de tournoi déjà montré à ce joueur (une seule fois par joueur et par tournoi).';

alter table public.ecrans_fin_tournoi_vus enable row level security;

create policy ecrans_vus_lecture on public.ecrans_fin_tournoi_vus
  for select to authenticated using (joueur_id = auth.uid());
create policy ecrans_vus_insertion on public.ecrans_fin_tournoi_vus
  for insert to authenticated with check (joueur_id = auth.uid());

revoke all on public.ecrans_fin_tournoi_vus from public, anon, authenticated;
grant select, insert on public.ecrans_fin_tournoi_vus to authenticated;

-- Tournois déjà clos : jamais d'écran (décision de Pierre).
insert into public.ecrans_fin_tournoi_vus (joueur_id, tournament_id)
select p.id, t.id from public.profiles p cross join public.tournaments t where t.etat = 'clos'
on conflict do nothing;

-- Compte créé plus tard : les tournois déjà clos sont considérés comme vus.
create function public.trg_profil_ecrans_deja_vus() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.ecrans_fin_tournoi_vus (joueur_id, tournament_id)
  select new.id, t.id from public.tournaments t where t.etat = 'clos'
  on conflict do nothing;
  return null;
end $$;
create trigger profiles_ecrans_deja_vus after insert on public.profiles
  for each row execute function public.trg_profil_ecrans_deja_vus();
