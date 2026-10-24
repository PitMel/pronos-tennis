-- =====================================================================================
-- Pronos Tennis — migration 0003 : l'administrateur peut corriger aussi son propre pari
-- À exécuter APRÈS 0002. Ne contient aucun secret.
--
-- Décision de Pierre (24 octobre 2026) : en tant qu'administrateur, il doit pouvoir corriger son propre pari.
-- Garde-fou conservé : la correction pose la mention « corrigé par l'administrateur » (visible de tous les joueurs
-- avec le pari) et s'inscrit dans le journal, comme pour n'importe quel joueur.
-- Seul changement par rapport à 0002 : l'interdiction « p_joueur = auth.uid() » est retirée.
-- =====================================================================================

-- Saisit ou réécrit le pari d'un joueur sur un match. Renvoie « cree » ou « remplace » (jamais le contenu d'un pari).
create or replace function public.admin_saisir_pari(
  p_match bigint, p_joueur uuid, p_choix smallint, p_confiance smallint,
  p_sets smallint default null, p_motif text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare v_etat text; v_avant jsonb; v_apres jsonb;
begin
  if not public.est_admin() then
    raise exception 'Seul l''administrateur peut corriger un pari.';
  end if;
  select t.etat into v_etat from public.matches m join public.tournaments t on t.id = m.tournament_id where m.id = p_match;
  if v_etat is null then raise exception 'Match inconnu.'; end if;
  if v_etat = 'clos' then raise exception 'Tournoi clos : rouvre-le avant de corriger un pari.'; end if;
  if not public.joueur_participe_match(p_match, p_joueur) then
    raise exception 'Ce joueur est inactif ou exclu de ce match.';
  end if;

  select jsonb_build_object('choix', b.choix, 'confiance', b.confiance, 'sets', b.sets) into v_avant
  from public.bets b where b.match_id = p_match and b.joueur_id = p_joueur;

  insert into public.bets (match_id, joueur_id, choix, confiance, sets, corrige_par_admin, corrige_le)
  values (p_match, p_joueur, p_choix, p_confiance, p_sets, true, now())
  on conflict (match_id, joueur_id) do update
    set choix = excluded.choix, confiance = excluded.confiance, sets = excluded.sets,
        corrige_par_admin = true, corrige_le = now();

  v_apres := jsonb_build_object('choix', p_choix, 'confiance', p_confiance, 'sets', p_sets);
  insert into public.corrections_admin (admin_id, joueur_id, kind, ref_id, avant, apres, motif)
  values (auth.uid(), p_joueur, 'match', p_match, v_avant, v_apres, p_motif);

  return case when v_avant is null then 'cree' else 'remplace' end;
end $$;

-- Idem pour le pari de tournoi (vainqueur et finaliste).
create or replace function public.admin_saisir_pari_tournoi(
  p_tournoi bigint, p_joueur uuid, p_vainqueur bigint, p_finaliste bigint, p_motif text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare v_etat text; v_avant jsonb; v_apres jsonb;
begin
  if not public.est_admin() then
    raise exception 'Seul l''administrateur peut corriger un pari.';
  end if;
  select t.etat into v_etat from public.tournaments t where t.id = p_tournoi;
  if v_etat is null then raise exception 'Tournoi inconnu.'; end if;
  if v_etat = 'clos' then raise exception 'Tournoi clos : rouvre-le avant de corriger un pari.'; end if;
  if not public.joueur_participe_tournoi(p_tournoi, p_joueur) then
    raise exception 'Ce joueur est inactif ou exclu de ce tournoi.';
  end if;

  select jsonb_build_object('vainqueur_id', b.vainqueur_id, 'finaliste_id', b.finaliste_id) into v_avant
  from public.tournament_bets b where b.tournament_id = p_tournoi and b.joueur_id = p_joueur;

  perform set_config('pronos.correction_admin', 'on', true);
  insert into public.tournament_bets (tournament_id, joueur_id, vainqueur_id, finaliste_id, corrige_par_admin, corrige_le)
  values (p_tournoi, p_joueur, p_vainqueur, p_finaliste, true, now())
  on conflict (tournament_id, joueur_id) do update
    set vainqueur_id = excluded.vainqueur_id, finaliste_id = excluded.finaliste_id,
        corrige_par_admin = true, corrige_le = now();
  perform set_config('pronos.correction_admin', 'off', true);

  v_apres := jsonb_build_object('vainqueur_id', p_vainqueur, 'finaliste_id', p_finaliste);
  insert into public.corrections_admin (admin_id, joueur_id, kind, ref_id, avant, apres, motif)
  values (auth.uid(), p_joueur, 'tournoi', p_tournoi, v_avant, v_apres, p_motif);

  return case when v_avant is null then 'cree' else 'remplace' end;
end $$;

