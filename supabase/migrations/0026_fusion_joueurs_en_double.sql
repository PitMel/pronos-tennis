-- =====================================================================================
-- Pronos Tennis — migration 0026 : fin des joueurs en double (même nom, deux numéros).
--
-- Cause : les joueurs des premiers tournois ont été saisis sans identifiant API ; quand la synchronisation a lu le Rolex Paris
-- Masters, sync_joueur cherchait le joueur par identifiant API seulement, n'en trouvait aucun et a CRÉÉ un second « Taylor Fritz »
-- (idem 13 autres joueurs). Conséquence : toutes les statistiques « par joueur de tennis » (Chouchous, Amours impossibles, Vaches à
-- lait, face-à-face…) étaient coupées en deux entre l'ancienne et la nouvelle fiche.
--
-- * nom_joueur_normalise : nom sans accents ni ponctuation, en minuscules, pour rapprocher deux écritures du même nom.
-- * sync_joueur : si l'identifiant API est inconnu mais qu'un joueur SANS identifiant porte le même nom, on lui rattache l'identifiant
--   au lieu de créer un doublon.
-- * joueurs_fusionner_doublons : fusionne chaque paire (une fiche sans identifiant API + une fiche avec) en gardant l'ANCIENNE fiche
--   (celle des anciens tournois), qui reçoit l'identifiant API, l'identifiant ATP, le pays et le classement de la nouvelle ; matchs,
--   vainqueurs/finalistes de tournois, paris tournoi et face-à-face sont rattachés à l'ancienne fiche. Exécutée une fois ici.
-- =====================================================================================

create or replace function public.nom_joueur_normalise(p text) returns text
language sql immutable as $$
  select btrim(regexp_replace(lower(translate(p,
    'ÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝàâäáãåçéèêëíìîïñóòôöõúùûüýÿ',
    'AAAAAACEEEEIIIINOOOOOUUUUYaaaaaaceeeeiiiinooooouuuuyy')), '[^a-z0-9]+', ' ', 'g'))
$$;

create or replace function public.sync_joueur(p jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_nom text := btrim(coalesce(p->>'nom', ''));
begin
  if coalesce(p->>'api_id', '') = '' or v_nom = '' then
    return null;
  end if;
  select id into v_id from public.players where api_id = p->>'api_id';
  if v_id is null then
    -- joueur déjà connu sous ce nom mais sans identifiant API (saisie initiale) : on lui rattache l'identifiant, pas de doublon
    select id into v_id from public.players
      where api_id is null and public.nom_joueur_normalise(nom) = public.nom_joueur_normalise(v_nom)
      order by id limit 1;
    if v_id is not null then
      update public.players set api_id = p->>'api_id' where id = v_id;
    end if;
  end if;
  insert into public.players (api_id, nom, pays, classement)
  values (p->>'api_id', v_nom, nullif(p->>'pays', ''), nullif(nullif(p->>'classement', '')::integer, 0))
  on conflict (api_id) do update
    set nom = excluded.nom,
        pays = coalesce(excluded.pays, public.players.pays),
        classement = coalesce(excluded.classement, public.players.classement)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.joueurs_fusionner_doublons() returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  create temp table fusion on commit drop as
    select o.id as garder, n.id as doublon, n.api_id, n.atp_id, n.pays, n.classement
    from public.players o
    join public.players n on public.nom_joueur_normalise(o.nom) = public.nom_joueur_normalise(n.nom)
                         and o.api_id is null and n.api_id is not null
    where (select count(*) from public.players x where public.nom_joueur_normalise(x.nom) = public.nom_joueur_normalise(o.nom)) = 2;
  select count(*) into v_n from fusion;
  if v_n = 0 then return 0; end if;

  alter table public.matches disable trigger user;
  alter table public.tournament_bets disable trigger user;
  update public.matches m set p1_id = f.garder from fusion f where m.p1_id = f.doublon;
  update public.matches m set p2_id = f.garder from fusion f where m.p2_id = f.doublon;
  update public.tournaments t set vainqueur_id = f.garder from fusion f where t.vainqueur_id = f.doublon;
  update public.tournaments t set finaliste_id = f.garder from fusion f where t.finaliste_id = f.doublon;
  update public.tournament_bets b set vainqueur_id = f.garder from fusion f where b.vainqueur_id = f.doublon;
  update public.tournament_bets b set finaliste_id = f.garder from fusion f where b.finaliste_id = f.doublon;
  alter table public.matches enable trigger user;
  alter table public.tournament_bets enable trigger user;

  -- face-à-face : les lignes touchées sont réécrites avec les anciens identifiants (joueur_a reste le plus petit : on inverse a/b si besoin)
  create temp table h2h_nouveau on commit drop as
    select case when x.na < x.nb then x.na else x.nb end as joueur_a,
           case when x.na < x.nb then x.nb else x.na end as joueur_b,
           x.statut, x.raison, x.calcule_le,
           case when x.na < x.nb then x.victoires_a else x.victoires_b end as victoires_a,
           case when x.na < x.nb then x.victoires_b else x.victoires_a end as victoires_b,
           case when x.na < x.nb then x.par_surface else
             (select coalesce(jsonb_agg(jsonb_build_object('surface', e.v->'surface', 'a', e.v->'b', 'b', e.v->'a') order by e.i), '[]'::jsonb)
              from jsonb_array_elements(x.par_surface) with ordinality as e(v, i)) end as par_surface,
           case when x.na < x.nb then x.rencontres else
             (select coalesce(jsonb_agg(e.v || jsonb_build_object('vainqueur', case e.v->>'vainqueur' when 'a' then to_jsonb('b'::text) when 'b' then to_jsonb('a'::text) else e.v->'vainqueur' end) order by e.i), '[]'::jsonb)
              from jsonb_array_elements(x.rencontres) with ordinality as e(v, i)) end as rencontres
    from (select h.*, coalesce(fa.garder, h.joueur_a) as na, coalesce(fb.garder, h.joueur_b) as nb
          from public.h2h h left join fusion fa on fa.doublon = h.joueur_a left join fusion fb on fb.doublon = h.joueur_b
          where fa.doublon is not null or fb.doublon is not null) x
    where x.na <> x.nb;
  delete from public.h2h where joueur_a in (select doublon from fusion) or joueur_b in (select doublon from fusion);
  insert into public.h2h (joueur_a, joueur_b, statut, victoires_a, victoires_b, par_surface, rencontres, raison, calcule_le)
    select joueur_a, joueur_b, statut, victoires_a, victoires_b, par_surface, rencontres, raison, calcule_le from h2h_nouveau
    on conflict (joueur_a, joueur_b) do nothing;

  -- la fiche récente disparaît, l'ancienne reçoit ses identifiants (l'identifiant API est unique : il faut libérer l'autre fiche d'abord)
  delete from public.players where id in (select doublon from fusion);
  update public.players p set api_id = f.api_id, atp_id = coalesce(p.atp_id, f.atp_id), pays = coalesce(p.pays, f.pays),
         classement = coalesce(f.classement, p.classement)
    from fusion f where p.id = f.garder;
  return v_n;
end $$;
revoke all on function public.joueurs_fusionner_doublons() from public, anon, authenticated;
grant execute on function public.joueurs_fusionner_doublons() to service_role;

select public.joueurs_fusionner_doublons();
