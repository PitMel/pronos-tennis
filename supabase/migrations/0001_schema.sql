-- =====================================================================================
-- Pronos Tennis — migration 0001 : schéma, règles de sécurité (RLS), révélation des paris
-- À exécuter UNE FOIS dans Supabase (SQL Editor) ou par `supabase db push`.
-- Ne contient aucun secret. Tout ce qui est écrit ici est public (dépôt public).
--
-- Principes (cahier des charges, sections 5, 6 et 11) :
--   * Un joueur ne lit les paris des autres QUE lorsqu'ils sont « révélés » : tous les joueurs actifs de son
--     groupe (comptes réels d'un côté, comptes de test de l'autre) ont parié, ou le match est neutralisé.
--     La révélation est « collante » : une fois révélés, les paris restent révélés et figés (table revelations).
--   * Un pari n'est modifiable que tant que le match n'est ni commencé (début détecté) ni révélé.
--   * Le résultat et le score d'un match ne sont visibles (vue matches_visibles) que si le match est terminé
--     ET que les paris sont révélés. La table matches elle-même n'est lisible que par l'administrateur.
--   * Le navigateur n'utilise que la clé « anon » (publique) : toute la sécurité repose sur ces règles.
-- =====================================================================================

-- ------------------------------------------------------------------ tables

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  prenom      text not null check (length(btrim(prenom)) between 1 and 40),
  couleur     text check (couleur ~ '^#[0-9A-Fa-f]{6}$'),
  photo_url   text,
  is_admin    boolean not null default false,
  is_test     boolean not null default false,
  actif       boolean not null default true,
  created_at  timestamptz not null default now()
);
-- un prénom par groupe (le faux compte « André » et le vrai « Pierre » ne se télescopent pas)
create unique index profiles_prenom_par_groupe on public.profiles (lower(prenom), is_test);
comment on table public.profiles is 'Comptes joueurs. is_test = faux compte (exclu des vrais classements, purgeable). Créés par l''administrateur, jamais par l''application.';

create table public.players (
  id          bigint generated always as identity primary key,
  api_id      text unique,
  nom         text not null,
  pays        text,
  classement  integer check (classement > 0)
);
comment on table public.players is 'Joueurs de tennis (cache de l''API). Rien à voir avec profiles (les parieurs).';

create table public.tournaments (
  id            bigint generated always as identity primary key,
  annee         integer not null check (annee between 2020 and 2100),
  nom           text not null,
  ville         text,
  surface       text check (surface in ('dur', 'terre', 'gazon')),
  indoor        boolean not null default false,
  categorie     text not null check (categorie in ('grand_slam', 'masters_1000', 'atp_finals')),
  date_debut    date,
  date_fin      date,
  etat          text not null default 'a_venir' check (etat in ('a_venir', 'pari_tournoi_ouvert', 'en_cours', 'clos')),
  vainqueur_id  bigint references public.players (id),
  finaliste_id  bigint references public.players (id),
  created_at    timestamptz not null default now(),
  unique (annee, nom),
  check (date_debut is null or date_fin is null or date_fin >= date_debut),
  check (vainqueur_id is null or vainqueur_id is distinct from finaliste_id)
);

create table public.tournament_api_ids (
  api_id         text primary key,
  tournament_id  bigint not null references public.tournaments (id) on delete cascade
);
comment on table public.tournament_api_ids is 'Un tournoi peut avoir plusieurs identifiants dans l''API (doublons, Toronto/Montréal).';

create table public.matches (
  id                    bigint generated always as identity primary key,
  api_id                text unique,
  tournament_id         bigint not null references public.tournaments (id) on delete cascade,
  tour                  text not null check (tour in ('R16', 'QF', 'SF', 'F', 'RR')),
  heure_prevue          timestamptz,
  p1_id                 bigint not null references public.players (id),
  p2_id                 bigint not null references public.players (id),
  statut                text not null default 'a_venir' check (statut in ('a_venir', 'en_cours', 'termine')),
  debut_detecte         timestamptz,
  vainqueur             smallint check (vainqueur in (1, 2)),
  sets_joues            smallint check (sets_joues between 0 and 5),
  score                 jsonb,
  fin_match             text not null default 'normal' check (fin_match in ('normal', 'abandon', 'forfait')),
  neutralise            boolean not null default false,
  modifie_manuellement  boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (p1_id <> p2_id),
  check (statut <> 'termine' or vainqueur is not null or fin_match = 'forfait' or neutralise)
);
create index matches_tournoi on public.matches (tournament_id);

create table public.bets (
  id          bigint generated always as identity primary key,
  match_id    bigint not null references public.matches (id) on delete cascade,
  joueur_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  choix       smallint not null check (choix in (1, 2)),
  confiance   smallint not null check (confiance between 6 and 10),
  sets        smallint check (sets in (3, 4, 5)),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (match_id, joueur_id)
);

create table public.tournament_bets (
  id            bigint generated always as identity primary key,
  tournament_id bigint not null references public.tournaments (id) on delete cascade,
  joueur_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  vainqueur_id  bigint not null references public.players (id),
  finaliste_id  bigint not null references public.players (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tournament_id, joueur_id),
  check (vainqueur_id <> finaliste_id)
);

-- Joueur exclu d'un tournoi entier (match_id nul) ou d'un seul match : il ne compte plus dans « tous ont parié ».
create table public.exclusions (
  id             bigint generated always as identity primary key,
  joueur_id      uuid not null references public.profiles (id) on delete cascade,
  tournament_id  bigint not null references public.tournaments (id) on delete cascade,
  match_id       bigint references public.matches (id) on delete cascade,
  created_at     timestamptz not null default now()
);
create unique index exclusions_unique on public.exclusions (joueur_id, tournament_id, coalesce(match_id, 0));

-- Mémoire de la révélation : une fois les paris révélés pour un groupe, ils le restent (« révélés et figés »).
create table public.revelations (
  kind         text not null check (kind in ('match', 'tournoi')),
  ref_id       bigint not null,
  groupe_test  boolean not null,
  revele_le    timestamptz not null default now(),
  primary key (kind, ref_id, groupe_test)
);

-- Instantané figé à la clôture d'un tournoi (alimente la Race et les archives).
-- Les points sont stockés en texte exact (« 13,5 » s'écrit 27/2) : voir Fraction.toString() dans le moteur.
create table public.tournament_results (
  id                    bigint generated always as identity primary key,
  tournament_id         bigint not null references public.tournaments (id) on delete cascade,
  joueur_id             uuid not null references public.profiles (id) on delete cascade,
  points_matchs         text not null check (points_matchs ~ '^-?[0-9]+(/[0-9]+)?$'),
  points_pari_tournoi   text not null check (points_pari_tournoi ~ '^-?[0-9]+(/[0-9]+)?$'),
  bonus_classement      text not null check (bonus_classement ~ '^-?[0-9]+(/[0-9]+)?$'),
  score_final           text not null check (score_final ~ '^-?[0-9]+(/[0-9]+)?$'),
  rang                  integer not null check (rang > 0),
  created_at            timestamptz not null default now(),
  unique (tournament_id, joueur_id)
);

create table public.sync_log (
  id              bigint generated always as identity primary key,
  date_appel      timestamptz not null default now(),
  endpoint        text,
  http_status     integer,
  ok              boolean not null default true,
  quota_restant   integer,
  message         text
);

-- ------------------------------------------------------------------ fonctions d'aide (security definer)
-- Elles lisent des tables que le joueur ne peut pas lire directement. search_path figé contre le détournement.

create function public.est_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin and p.actif from public.profiles p where p.id = auth.uid()), false)
$$;

create function public.est_test(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p.is_test from public.profiles p where p.id = uid
$$;

-- Le joueur est-il actif et non exclu de ce match (ni du tournoi) ?
create function public.joueur_participe_match(p_match bigint, p_joueur uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.profiles p
    join public.matches m on m.id = p_match
    where p.id = p_joueur and p.actif
      and not exists (
        select 1 from public.exclusions e
        where e.joueur_id = p.id and e.tournament_id = m.tournament_id
          and (e.match_id is null or e.match_id = m.id)
      )
  )
$$;

create function public.joueur_participe_tournoi(p_tournoi bigint, p_joueur uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_joueur and p.actif
      and not exists (
        select 1 from public.exclusions e
        where e.joueur_id = p.id and e.tournament_id = p_tournoi and e.match_id is null
      )
  )
$$;

-- Tous les joueurs actifs du groupe (réel ou test), hors exclus, ont-ils parié sur ce match ?
create function public.groupe_complet_match(p_match bigint, p_test boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select
    exists (select 1 from public.profiles p
            where p.actif and p.is_test = p_test and public.joueur_participe_match(p_match, p.id))
    and not exists (select 1 from public.profiles p
            where p.actif and p.is_test = p_test and public.joueur_participe_match(p_match, p.id)
              and not exists (select 1 from public.bets b where b.match_id = p_match and b.joueur_id = p.id))
$$;

create function public.groupe_complet_tournoi(p_tournoi bigint, p_test boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select
    exists (select 1 from public.profiles p
            where p.actif and p.is_test = p_test and public.joueur_participe_tournoi(p_tournoi, p.id))
    and not exists (select 1 from public.profiles p
            where p.actif and p.is_test = p_test and public.joueur_participe_tournoi(p_tournoi, p.id)
              and not exists (select 1 from public.tournament_bets b
                              where b.tournament_id = p_tournoi and b.joueur_id = p.id))
$$;

-- Les paris de ce match sont-ils révélés pour ce groupe ? (mémorisé, ou tous ont parié, ou match neutralisé)
create function public.paris_reveles_match(p_match bigint, p_test boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.revelations r where r.kind = 'match' and r.ref_id = p_match and r.groupe_test = p_test)
      or coalesce((select m.neutralise from public.matches m where m.id = p_match), false)
      or public.groupe_complet_match(p_match, p_test)
$$;

-- Idem pour le pari tournoi ; un tournoi clos révèle aussi tous les paris.
create function public.paris_reveles_tournoi(p_tournoi bigint, p_test boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.revelations r where r.kind = 'tournoi' and r.ref_id = p_tournoi and r.groupe_test = p_test)
      or coalesce((select t.etat = 'clos' from public.tournaments t where t.id = p_tournoi), false)
      or public.groupe_complet_tournoi(p_tournoi, p_test)
$$;

-- Un pari de match est modifiable tant que : match à venir, début non détecté, non neutralisé, pas forfait, non révélé.
create function public.pari_modifiable_match(p_match bigint, p_test boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.matches m
                 where m.id = p_match and m.statut = 'a_venir' and m.debut_detecte is null
                   and not m.neutralise and m.fin_match <> 'forfait')
     and not public.paris_reveles_match(p_match, p_test)
$$;

-- Un pari tournoi est modifiable quand le tournoi est ouvert aux paris et que rien n'est révélé.
create function public.pari_tournoi_modifiable(p_tournoi bigint, p_test boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tournaments t
                 where t.id = p_tournoi and t.etat in ('pari_tournoi_ouvert', 'en_cours'))
     and not public.paris_reveles_tournoi(p_tournoi, p_test)
$$;

-- Un joueur de tennis est « éliminé » s'il a perdu un match terminé (hors poules des ATP Finals) du tournoi.
create function public.joueur_elimine(p_tournoi bigint, p_joueur bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.matches m
    where m.tournament_id = p_tournoi and m.tour <> 'RR' and m.statut = 'termine' and not m.neutralise
      and ((m.p1_id = p_joueur and m.vainqueur = 2) or (m.p2_id = p_joueur and m.vainqueur = 1))
  )
$$;

-- Qui a parié (sans voir quoi), pour le groupe de la personne connectée.
create function public.qui_a_parie(p_match bigint) returns table (joueur_id uuid, a_parie boolean)
language sql stable security definer set search_path = public as $$
  select p.id,
         exists (select 1 from public.bets b where b.match_id = p_match and b.joueur_id = p.id)
  from public.profiles p
  where p.actif and p.is_test = public.est_test(auth.uid())
    and public.joueur_participe_match(p_match, p.id)
$$;

create function public.qui_a_parie_tournoi(p_tournoi bigint) returns table (joueur_id uuid, a_parie boolean)
language sql stable security definer set search_path = public as $$
  select p.id,
         exists (select 1 from public.tournament_bets b where b.tournament_id = p_tournoi and b.joueur_id = p.id)
  from public.profiles p
  where p.actif and p.is_test = public.est_test(auth.uid())
    and public.joueur_participe_tournoi(p_tournoi, p.id)
$$;

-- ------------------------------------------------------------------ mémorisation de la révélation

create function public.maj_revelations_match(p_match bigint) returns void
language plpgsql security definer set search_path = public as $$
declare g boolean;
begin
  foreach g in array array[false, true] loop
    if public.groupe_complet_match(p_match, g)
       or coalesce((select m.neutralise from public.matches m where m.id = p_match), false) then
      insert into public.revelations (kind, ref_id, groupe_test) values ('match', p_match, g)
      on conflict do nothing;
    end if;
  end loop;
end $$;

create function public.maj_revelations_tournoi(p_tournoi bigint) returns void
language plpgsql security definer set search_path = public as $$
declare g boolean;
begin
  foreach g in array array[false, true] loop
    if public.groupe_complet_tournoi(p_tournoi, g) then
      insert into public.revelations (kind, ref_id, groupe_test) values ('tournoi', p_tournoi, g)
      on conflict do nothing;
    end if;
  end loop;
end $$;

create function public.maj_toutes_revelations() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.matches loop perform public.maj_revelations_match(r.id); end loop;
  for r in select id from public.tournaments loop perform public.maj_revelations_tournoi(r.id); end loop;
end $$;

-- ------------------------------------------------------------------ déclencheurs

create function public.trg_bets_verifier() returns trigger
language plpgsql security definer set search_path = public as $$
declare cat text;
begin
  select t.categorie into cat
  from public.matches m join public.tournaments t on t.id = m.tournament_id
  where m.id = new.match_id;
  if cat is null then raise exception 'Match inconnu.'; end if;
  if cat = 'grand_slam' then
    if new.sets is null or new.sets not in (3, 4, 5) then
      raise exception 'En Grand Chelem, indique le nombre de sets (3, 4 ou 5).';
    end if;
  elsif new.sets is not null then
    raise exception 'Le nombre de sets ne se parie qu''en Grand Chelem.';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger bets_verifier before insert or update on public.bets
  for each row execute function public.trg_bets_verifier();

create function public.trg_bets_apres() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.maj_revelations_match(new.match_id);
  return null;
end $$;
create trigger bets_apres after insert on public.bets
  for each row execute function public.trg_bets_apres();

create function public.trg_tournament_bets_verifier() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.joueur_elimine(new.tournament_id, new.vainqueur_id) or public.joueur_elimine(new.tournament_id, new.finaliste_id) then
    raise exception 'Ce joueur est déjà éliminé : choisis un joueur encore en lice.';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger tournament_bets_verifier before insert or update on public.tournament_bets
  for each row execute function public.trg_tournament_bets_verifier();

create function public.trg_tournament_bets_apres() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.maj_revelations_tournoi(new.tournament_id);
  return null;
end $$;
create trigger tournament_bets_apres after insert on public.tournament_bets
  for each row execute function public.trg_tournament_bets_apres();

-- Un tour doit exister dans la catégorie du tournoi (RR = poules des ATP Finals uniquement).
create function public.trg_matches_verifier() returns trigger
language plpgsql security definer set search_path = public as $$
declare cat text;
begin
  select t.categorie into cat from public.tournaments t where t.id = new.tournament_id;
  if not ((cat in ('grand_slam', 'masters_1000') and new.tour in ('R16', 'QF', 'SF', 'F'))
       or (cat = 'atp_finals' and new.tour in ('RR', 'SF', 'F'))) then
    raise exception 'Le tour « % » n''existe pas dans un tournoi de catégorie « % ».', new.tour, cat;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger matches_verifier before insert or update on public.matches
  for each row execute function public.trg_matches_verifier();

create function public.trg_matches_apres() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.neutralise then perform public.maj_revelations_match(new.id); end if;
  return null;
end $$;
create trigger matches_apres after insert or update of neutralise on public.matches
  for each row execute function public.trg_matches_apres();

create function public.trg_exclusions_verifier() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.match_id is not null
     and not exists (select 1 from public.matches m where m.id = new.match_id and m.tournament_id = new.tournament_id) then
    raise exception 'Ce match n''appartient pas à ce tournoi.';
  end if;
  return new;
end $$;
create trigger exclusions_verifier before insert or update on public.exclusions
  for each row execute function public.trg_exclusions_verifier();

-- Une exclusion, un compte désactivé ou un changement de groupe peut compléter un groupe : on mémorise la révélation.
create function public.trg_recalcul_revelations() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.maj_toutes_revelations();
  return null;
end $$;
create trigger exclusions_apres after insert or delete on public.exclusions
  for each statement execute function public.trg_recalcul_revelations();
create trigger profiles_apres after insert or update of actif, is_test on public.profiles
  for each statement execute function public.trg_recalcul_revelations();

-- Un joueur ne peut changer que sa couleur et sa photo ; prénom, actif, groupe test et droits : administrateur.
create function public.trg_profiles_proteger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.est_admin()
     and (new.prenom, new.actif, new.is_test, new.is_admin) is distinct from (old.prenom, old.actif, old.is_test, old.is_admin) then
    raise exception 'Seul l''administrateur peut modifier ces informations.';
  end if;
  return new;
end $$;
create trigger profiles_proteger before update on public.profiles
  for each row execute function public.trg_profiles_proteger();

-- ------------------------------------------------------------------ vue : résultats masqués

-- Vue exécutée avec les droits du propriétaire (security_invoker = false) : c'est elle qui masque le résultat.
create view public.matches_visibles with (security_invoker = false) as
select
  m.id, m.tournament_id, m.tour, m.heure_prevue, m.p1_id, m.p2_id, m.statut, m.debut_detecte, m.neutralise,
  r.rev                                                   as paris_reveles,
  not public.pari_modifiable_match(m.id, g.t)             as verrouille,
  (m.statut = 'termine' and r.rev)                        as resultat_visible,
  case when m.statut = 'termine' and r.rev then m.vainqueur  end as vainqueur,
  case when m.statut = 'termine' and r.rev then m.sets_joues end as sets_joues,
  case when m.statut = 'termine' and r.rev then m.score      end as score,
  case when m.statut = 'termine' and r.rev then m.fin_match  end as fin_match
from public.matches m
cross join lateral (select coalesce(public.est_test(auth.uid()), false) as t) g
cross join lateral (select public.paris_reveles_match(m.id, g.t) as rev) r
where auth.uid() is not null;

-- ------------------------------------------------------------------ droits d'accès (privilèges)

alter table public.profiles           enable row level security;
alter table public.players            enable row level security;
alter table public.tournaments        enable row level security;
alter table public.tournament_api_ids enable row level security;
alter table public.matches            enable row level security;
alter table public.bets               enable row level security;
alter table public.tournament_bets    enable row level security;
alter table public.exclusions         enable row level security;
alter table public.revelations        enable row level security;
alter table public.tournament_results enable row level security;
alter table public.sync_log           enable row level security;

-- On part de zéro : rien pour le public ni pour les visiteurs non connectés.
revoke all on all tables    in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

-- Personne ne touche aux révélations depuis le navigateur ; seuls les déclencheurs (security definer) les écrivent.
grant select on public.profiles, public.players, public.tournaments, public.tournament_api_ids,
                public.exclusions, public.tournament_results, public.bets, public.tournament_bets,
                public.sync_log, public.matches_visibles to authenticated;
grant select, insert, update, delete on public.matches to authenticated;          -- lignes réservées à l'administrateur (RLS)
grant insert, update, delete on public.players, public.tournaments, public.tournament_api_ids,
                public.exclusions, public.tournament_results to authenticated;    -- idem
grant insert, update on public.bets, public.tournament_bets to authenticated;     -- jamais de suppression
grant update (prenom, couleur, photo_url, actif, is_test) on public.profiles to authenticated;

grant execute on function public.est_admin(), public.est_test(uuid),
                          public.paris_reveles_match(bigint, boolean), public.paris_reveles_tournoi(bigint, boolean),
                          public.pari_modifiable_match(bigint, boolean), public.pari_tournoi_modifiable(bigint, boolean),
                          public.joueur_participe_match(bigint, uuid), public.joueur_participe_tournoi(bigint, uuid),
                          public.qui_a_parie(bigint), public.qui_a_parie_tournoi(bigint)
  to authenticated;

-- La tâche de synchronisation et l'administration technique utilisent le rôle « service » (contourne la RLS).
grant all on all tables    in schema public to service_role;
grant all on all functions in schema public to service_role;

-- ------------------------------------------------------------------ règles de ligne (RLS)

-- profiles : tout le monde (connecté) voit les prénoms ; chacun modifie le sien (limité par droits + déclencheur).
create policy profiles_lecture on public.profiles for select to authenticated using (true);
create policy profiles_maj on public.profiles for update to authenticated
  using (id = auth.uid() or public.est_admin()) with check (id = auth.uid() or public.est_admin());

-- données de référence : lecture pour tous les comptes connectés, écriture administrateur seulement.
create policy players_lecture   on public.players            for select to authenticated using (true);
create policy players_ecriture  on public.players            for all    to authenticated using (public.est_admin()) with check (public.est_admin());
create policy tournois_lecture  on public.tournaments        for select to authenticated using (true);
create policy tournois_ecriture on public.tournaments        for all    to authenticated using (public.est_admin()) with check (public.est_admin());
create policy apiids_lecture    on public.tournament_api_ids for select to authenticated using (true);
create policy apiids_ecriture   on public.tournament_api_ids for all    to authenticated using (public.est_admin()) with check (public.est_admin());
create policy exclusions_lecture  on public.exclusions       for select to authenticated using (true);
create policy exclusions_ecriture on public.exclusions       for all    to authenticated using (public.est_admin()) with check (public.est_admin());
create policy resultats_lecture   on public.tournament_results for select to authenticated using (true);
create policy resultats_ecriture  on public.tournament_results for all    to authenticated using (public.est_admin()) with check (public.est_admin());
create policy synclog_lecture     on public.sync_log         for select to authenticated using (public.est_admin());

-- matches : table brute réservée à l'administrateur ; les joueurs passent par la vue matches_visibles.
create policy matches_admin on public.matches for all to authenticated
  using (public.est_admin()) with check (public.est_admin());

-- bets : on lit les siens ; ceux des autres seulement une fois révélés et dans le même groupe ;
-- l'administrateur lit et écrit ceux des comptes de TEST uniquement (jamais les paris non révélés des vrais joueurs).
create policy bets_lecture on public.bets for select to authenticated using (
  joueur_id = auth.uid()
  or (public.est_test(joueur_id) = public.est_test(auth.uid())
      and public.paris_reveles_match(match_id, public.est_test(joueur_id)))
  or (public.est_admin() and public.est_test(joueur_id))
);
create policy bets_insertion on public.bets for insert to authenticated with check (
  (joueur_id = auth.uid() or (public.est_admin() and public.est_test(joueur_id)))
  and public.joueur_participe_match(match_id, joueur_id)
  and public.pari_modifiable_match(match_id, public.est_test(joueur_id))
);
create policy bets_modification on public.bets for update to authenticated
using (
  (joueur_id = auth.uid() or (public.est_admin() and public.est_test(joueur_id)))
  and public.pari_modifiable_match(match_id, public.est_test(joueur_id))
)
with check (
  (joueur_id = auth.uid() or (public.est_admin() and public.est_test(joueur_id)))
  and public.joueur_participe_match(match_id, joueur_id)
  and public.pari_modifiable_match(match_id, public.est_test(joueur_id))
);

-- tournament_bets : même logique.
create policy tbets_lecture on public.tournament_bets for select to authenticated using (
  joueur_id = auth.uid()
  or (public.est_test(joueur_id) = public.est_test(auth.uid())
      and public.paris_reveles_tournoi(tournament_id, public.est_test(joueur_id)))
  or (public.est_admin() and public.est_test(joueur_id))
);
create policy tbets_insertion on public.tournament_bets for insert to authenticated with check (
  (joueur_id = auth.uid() or (public.est_admin() and public.est_test(joueur_id)))
  and public.joueur_participe_tournoi(tournament_id, joueur_id)
  and public.pari_tournoi_modifiable(tournament_id, public.est_test(joueur_id))
);
create policy tbets_modification on public.tournament_bets for update to authenticated
using (
  (joueur_id = auth.uid() or (public.est_admin() and public.est_test(joueur_id)))
  and public.pari_tournoi_modifiable(tournament_id, public.est_test(joueur_id))
)
with check (
  (joueur_id = auth.uid() or (public.est_admin() and public.est_test(joueur_id)))
  and public.joueur_participe_tournoi(tournament_id, joueur_id)
  and public.pari_tournoi_modifiable(tournament_id, public.est_test(joueur_id))
);

-- revelations : aucune règle = aucun accès depuis le navigateur (les fonctions security definer y accèdent).
