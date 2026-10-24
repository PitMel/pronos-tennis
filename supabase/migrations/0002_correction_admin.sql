-- =====================================================================================
-- Pronos Tennis — migration 0002 : correction par l'administrateur
-- À exécuter APRÈS 0001. Ne contient aucun secret.
--
-- Décisions de Pierre (24 octobre 2026) :
--   * L'administrateur peut « réécrire » par-dessus le pari d'un vrai joueur, ou saisir un pari à la place d'un
--     joueur qui n'en a entré aucun, MÊME APRÈS la fin du match et la révélation des paris.
--   * Le pari corrigé porte la mention « corrigé par l'administrateur » (visible de tous avec le pari).
--   * L'administrateur écrit « à l'aveugle » : il ne peut pas, grâce à ces fonctions, lire un pari non révélé
--     d'un vrai joueur. Le journal des corrections ne montre le contenu (avant / après) que lorsque le pari est
--     révélé (ou appartient à un faux compte).
--   * Un résultat de match modifié à la main par l'administrateur est marqué « modifie_manuellement ».
--
-- Choix de conception (à signaler à Pierre) :
--   * L'administrateur ne corrige pas son propre pari (sinon il pourrait le changer après coup).
--   * Pas de correction dans un tournoi clos : il faut d'abord le rouvrir.
--   * Une correction du pari tournoi peut désigner un joueur de tennis déjà éliminé (le joueur avait parié avant).
--   * Les joueurs ne peuvent plus écrire les colonnes « corrige_* » : droits d'écriture limités par colonne.
-- =====================================================================================

-- ------------------------------------------------------------------ colonnes « corrigé par l'administrateur »

alter table public.bets
  add column corrige_par_admin boolean not null default false,
  add column corrige_le        timestamptz;
alter table public.tournament_bets
  add column corrige_par_admin boolean not null default false,
  add column corrige_le        timestamptz;

-- Écriture par colonne : un joueur (ou l'administrateur pour un faux compte) n'écrit jamais les colonnes « corrige_* ».
revoke insert, update on public.bets, public.tournament_bets from authenticated;
grant insert (match_id, joueur_id, choix, confiance, sets) on public.bets to authenticated;
grant update (choix, confiance, sets)                      on public.bets to authenticated;
grant insert (tournament_id, joueur_id, vainqueur_id, finaliste_id) on public.tournament_bets to authenticated;
grant update (vainqueur_id, finaliste_id)                           on public.tournament_bets to authenticated;

-- ------------------------------------------------------------------ journal des corrections (réservé à l'administrateur)

create table public.corrections_admin (
  id         bigint generated always as identity primary key,
  cree_le    timestamptz not null default now(),
  admin_id   uuid references public.profiles (id) on delete set null,
  joueur_id  uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('match', 'tournoi')),
  ref_id     bigint not null,
  avant      jsonb,
  apres      jsonb not null,
  motif      text check (motif is null or length(motif) <= 300)
);
comment on table public.corrections_admin is 'Journal des paris corrigés ou saisis par l''administrateur. Lecture uniquement via la vue corrections_admin_visibles.';

alter table public.corrections_admin enable row level security;
revoke all on public.corrections_admin from public, anon, authenticated;
grant all on public.corrections_admin to service_role;

-- Vue du journal : l'administrateur seulement ; contenu masqué tant que le pari d'un vrai joueur n'est pas révélé.
create view public.corrections_admin_visibles with (security_invoker = false) as
select c.id, c.cree_le, c.admin_id, c.joueur_id, c.kind, c.ref_id, c.motif,
       v.vu                       as contenu_visible,
       case when v.vu then c.avant end as avant,
       case when v.vu then c.apres end as apres
from public.corrections_admin c
cross join lateral (select public.est_test(c.joueur_id) as t) g
cross join lateral (
  select g.t or case c.kind
                  when 'match'  then public.paris_reveles_match(c.ref_id, g.t)
                  else               public.paris_reveles_tournoi(c.ref_id, g.t)
                end as vu
) v
where public.est_admin();

revoke all on public.corrections_admin_visibles from public, anon, authenticated;
grant select on public.corrections_admin_visibles to authenticated;
grant all on public.corrections_admin_visibles to service_role;

-- ------------------------------------------------------------------ pari tournoi : un éliminé reste permis pour une correction

create or replace function public.trg_tournament_bets_verifier() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not (public.est_admin() and coalesce(current_setting('pronos.correction_admin', true), '') = 'on') then
    if public.joueur_elimine(new.tournament_id, new.vainqueur_id) or public.joueur_elimine(new.tournament_id, new.finaliste_id) then
      raise exception 'Ce joueur est déjà éliminé : choisis un joueur encore en lice.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- ------------------------------------------------------------------ fonctions de correction (administrateur seulement)

-- Saisit ou réécrit le pari d'un joueur sur un match. Renvoie « cree » ou « remplace » (jamais le contenu d'un pari).
create function public.admin_saisir_pari(
  p_match bigint, p_joueur uuid, p_choix smallint, p_confiance smallint,
  p_sets smallint default null, p_motif text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare v_etat text; v_avant jsonb; v_apres jsonb;
begin
  if not public.est_admin() then
    raise exception 'Seul l''administrateur peut corriger un pari.';
  end if;
  if p_joueur = auth.uid() then
    raise exception 'L''administrateur ne corrige pas son propre pari.';
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
create function public.admin_saisir_pari_tournoi(
  p_tournoi bigint, p_joueur uuid, p_vainqueur bigint, p_finaliste bigint, p_motif text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare v_etat text; v_avant jsonb; v_apres jsonb;
begin
  if not public.est_admin() then
    raise exception 'Seul l''administrateur peut corriger un pari.';
  end if;
  if p_joueur = auth.uid() then
    raise exception 'L''administrateur ne corrige pas son propre pari.';
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

-- ------------------------------------------------------------------ résultat modifié à la main

-- Quand l'administrateur (connecté) modifie un résultat, le match est marqué « modifié manuellement ».
-- La synchronisation (rôle service, sans identité) ne marque rien.
create function public.trg_matches_marquer_manuel() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and public.est_admin()
     and (new.statut, new.vainqueur, new.sets_joues, new.score, new.fin_match, new.neutralise)
         is distinct from (old.statut, old.vainqueur, old.sets_joues, old.score, old.fin_match, old.neutralise) then
    new.modifie_manuellement := true;
  end if;
  return new;
end $$;
create trigger matches_marquer_manuel before update on public.matches
  for each row execute function public.trg_matches_marquer_manuel();

-- ------------------------------------------------------------------ droits d'exécution (rien n'est ouvert par défaut)

revoke all on function public.admin_saisir_pari(bigint, uuid, smallint, smallint, smallint, text)       from public, anon, authenticated;
revoke all on function public.admin_saisir_pari_tournoi(bigint, uuid, bigint, bigint, text)             from public, anon, authenticated;
revoke all on function public.trg_matches_marquer_manuel()                                              from public, anon, authenticated;
grant execute on function public.admin_saisir_pari(bigint, uuid, smallint, smallint, smallint, text)   to authenticated, service_role;
grant execute on function public.admin_saisir_pari_tournoi(bigint, uuid, bigint, bigint, text)         to authenticated, service_role;
grant execute on function public.trg_matches_marquer_manuel() to service_role;
