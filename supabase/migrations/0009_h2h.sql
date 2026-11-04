-- Face-à-face (H2H) entre deux joueurs de tennis, calculé par la tâche de synchronisation à partir des fichiers de résultats ATP
-- (TennisMyLife). Seul le résultat calculé est stocké (bilan, surfaces, rencontres) : jamais les fichiers bruts.

-- Identifiant ATP du joueur (rapprochement par le nom, corrigeable à la main par l'administrateur).
alter table public.players add column atp_id text;
comment on column public.players.atp_id is 'Identifiant ATP (fichiers de résultats TennisMyLife) ; rempli par la synchronisation, corrigeable par l''administrateur.';

-- Une ligne par paire de joueurs : joueur_a est toujours l'identifiant le plus petit.
create table public.h2h (
  joueur_a     bigint not null references public.players (id) on delete cascade,
  joueur_b     bigint not null references public.players (id) on delete cascade,
  statut       text   not null check (statut in ('ok', 'indisponible')),
  victoires_a  integer not null default 0 check (victoires_a >= 0),
  victoires_b  integer not null default 0 check (victoires_b >= 0),
  par_surface  jsonb  not null default '[]'::jsonb,   -- [{surface, a, b}]
  rencontres   jsonb  not null default '[]'::jsonb,   -- [{annee, tournoi, surface, tour, score, vainqueur: 'a'|'b'}], la plus récente d'abord
  raison       text,                                   -- pourquoi « indisponible »
  calcule_le   timestamptz not null default now(),
  primary key (joueur_a, joueur_b),
  check (joueur_a < joueur_b)
);
comment on table public.h2h is 'Face-à-face entre deux joueurs de tennis (calcul de la synchronisation). Lecture pour tous les comptes connectés ; écriture réservée au rôle service.';
alter table public.h2h enable row level security;
create policy h2h_lecture on public.h2h for select to authenticated using (true);

-- Paires à calculer : matchs non terminés de tournois non clos dont la paire n'a pas encore de ligne dans h2h.
create function public.sync_h2h_a_calculer() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x.nom_a, x.nom_b), '[]'::jsonb)
  from (
    select least(m.p1_id, m.p2_id) as joueur_a, greatest(m.p1_id, m.p2_id) as joueur_b,
           pa.nom as nom_a, pb.nom as nom_b, pa.atp_id as atp_a, pb.atp_id as atp_b,
           (array_agg(distinct t.id order by t.id)) as tournois,
           min(t.date_debut) as date_debut, min(t.annee) as annee
    from public.matches m
    join public.tournaments t on t.id = m.tournament_id
    join public.players pa on pa.id = least(m.p1_id, m.p2_id)
    join public.players pb on pb.id = greatest(m.p1_id, m.p2_id)
    where t.etat <> 'clos' and m.statut <> 'termine' and not m.neutralise
      and not exists (select 1 from public.h2h h where h.joueur_a = least(m.p1_id, m.p2_id) and h.joueur_b = greatest(m.p1_id, m.p2_id))
    group by 1, 2, 3, 4, 5, 6
  ) x
$$;

-- Enregistre le résultat : {"joueurs": [{"id", "atp_id"}], "paires": [{"joueur_a", "joueur_b", "statut", "victoires_a", "victoires_b", "par_surface", "rencontres", "raison"}]}
-- Compte rendu : {joueurs, paires}. Un atp_id déjà présent n'est jamais écrasé (correction manuelle de l'administrateur).
create function public.sync_h2h_enregistrer(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  j jsonb; p jsonb; nj integer := 0; np integer := 0;
begin
  for j in select * from jsonb_array_elements(coalesce(p_payload->'joueurs', '[]'::jsonb)) loop
    update public.players set atp_id = j->>'atp_id' where id = (j->>'id')::bigint and atp_id is null and nullif(j->>'atp_id', '') is not null;
    nj := nj + 1;
  end loop;
  for p in select * from jsonb_array_elements(coalesce(p_payload->'paires', '[]'::jsonb)) loop
    insert into public.h2h (joueur_a, joueur_b, statut, victoires_a, victoires_b, par_surface, rencontres, raison, calcule_le)
    values ((p->>'joueur_a')::bigint, (p->>'joueur_b')::bigint, p->>'statut',
            coalesce((p->>'victoires_a')::integer, 0), coalesce((p->>'victoires_b')::integer, 0),
            coalesce(p->'par_surface', '[]'::jsonb), coalesce(p->'rencontres', '[]'::jsonb), p->>'raison', now())
    on conflict (joueur_a, joueur_b) do update set
      statut = excluded.statut, victoires_a = excluded.victoires_a, victoires_b = excluded.victoires_b,
      par_surface = excluded.par_surface, rencontres = excluded.rencontres, raison = excluded.raison, calcule_le = now();
    np := np + 1;
  end loop;
  return jsonb_build_object('joueurs', nj, 'paires', np);
end
$$;

revoke all on function public.sync_h2h_a_calculer()      from public, anon, authenticated;
revoke all on function public.sync_h2h_enregistrer(jsonb) from public, anon, authenticated;
grant execute on function public.sync_h2h_a_calculer()      to service_role;
grant execute on function public.sync_h2h_enregistrer(jsonb) to service_role;
