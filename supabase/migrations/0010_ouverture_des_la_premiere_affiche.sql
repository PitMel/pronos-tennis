-- =====================================================================================
-- Pronos Tennis — migration 0010 : le pari tournoi ouvre dès la première affiche connue
-- À exécuter APRÈS 0009. Ne contient aucun secret.
--
-- Avant : le tournoi s'ouvrait quand toutes les affiches des huitièmes étaient connues (8 ; ATP Finals : 4).
-- Maintenant : dès qu'UNE affiche des huitièmes est connue (ATP Finals : une affiche de poule).
-- Les joueurs pas encore annoncés ne sont pas sélectionnables tant que leur affiche n'est pas connue.
-- =====================================================================================
create or replace function public.sync_maj_etat_tournoi(p_tournoi bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_cat text; v_etat text; v_n integer; v_demarre boolean; v_tard boolean;
begin
  select categorie, etat into v_cat, v_etat from public.tournaments where id = p_tournoi;
  if v_etat is null or v_etat = 'clos' then return; end if;
  select count(*) into v_n from public.matches
    where tournament_id = p_tournoi and tour = case when v_cat = 'atp_finals' then 'RR' else 'R16' end;
  v_demarre := exists (select 1 from public.matches where tournament_id = p_tournoi and statut <> 'a_venir');
  v_tard := exists (select 1 from public.matches where tournament_id = p_tournoi and tour in ('QF', 'SF', 'F'));
  if v_etat = 'a_venir' and (v_n >= 1 or v_demarre or v_tard) then
    v_etat := 'pari_tournoi_ouvert';
  end if;
  if v_etat = 'pari_tournoi_ouvert' and v_demarre then
    v_etat := 'en_cours';
  end if;
  update public.tournaments set etat = v_etat where id = p_tournoi and etat is distinct from v_etat;
end $$;
