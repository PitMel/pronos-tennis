-- =====================================================================================
-- Pronos Tennis — migration 0013 : notifications par e-mail
-- À exécuter APRÈS 0012. Ne contient aucun secret (la clé d'envoi Brevo reste dans les secrets GitHub).
--
-- * notif_preferences : adresse e-mail (distincte de l'identifiant de connexion) et trois cases, toutes cochées par défaut.
--   Lisible et modifiable uniquement par son propriétaire (et l'administrateur).
-- * notif_envoyees : journal (événement, joueur) pour ne jamais envoyer deux fois la même notification.
-- * notif_a_faire() / notif_marquer() : réservées au rôle service (tâche GitHub Actions).
-- Trois événements, pour le groupe réel uniquement :
--   tour_ouvert     : toutes les affiches d'un même tour sont connues (8 huitièmes, 4 quarts, 2 demies, 1 finale ; 12 matchs de poule aux ATP Finals) ;
--   paris_visibles  : tous les matchs d'un même tour ont leurs paris révélés (tout le monde a parié) ;
--   tournoi_termine : le tournoi est clos (résultat et état de la Race).
-- =====================================================================================

create table public.notif_preferences (
  joueur_id         uuid primary key references public.profiles (id) on delete cascade,
  email             text check (email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  tour_ouvert       boolean not null default true,
  paris_visibles    boolean not null default true,
  tournoi_termine   boolean not null default true,
  updated_at        timestamptz not null default now()
);

create table public.notif_envoyees (
  cle        text not null,
  joueur_id  uuid not null references public.profiles (id) on delete cascade,
  envoye_le  timestamptz not null default now(),
  primary key (cle, joueur_id)
);

alter table public.notif_preferences enable row level security;
alter table public.notif_envoyees   enable row level security;

create policy notif_pref_lecture on public.notif_preferences for select to authenticated
  using (joueur_id = auth.uid() or public.est_admin());
create policy notif_pref_insertion on public.notif_preferences for insert to authenticated
  with check (joueur_id = auth.uid() or public.est_admin());
create policy notif_pref_modification on public.notif_preferences for update to authenticated
  using (joueur_id = auth.uid() or public.est_admin())
  with check (joueur_id = auth.uid() or public.est_admin());

grant select, insert, update on public.notif_preferences to authenticated;
grant all on public.notif_preferences, public.notif_envoyees to service_role;

-- ------------------------------------------------------------------ fonctions (service uniquement)

create function public.notif_destinataires(p_cle text, p_pref text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('joueur_id', p.id, 'prenom', p.prenom, 'email', n.email) order by p.prenom), '[]'::jsonb)
  from public.profiles p join public.notif_preferences n on n.joueur_id = p.id
  where p.actif and not p.is_test and n.email is not null
    and case p_pref when 'tour_ouvert' then n.tour_ouvert when 'paris_visibles' then n.paris_visibles else n.tournoi_termine end
    and not exists (select 1 from public.notif_envoyees e where e.cle = p_cle and e.joueur_id = p.id)
$$;

create function public.notif_marquer(p_cle text, p_joueur uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.notif_envoyees (cle, joueur_id) values (p_cle, p_joueur) on conflict do nothing
$$;

-- Événements à notifier (avec leurs destinataires restants). Un événement sans destinataire n'est pas renvoyé.
create function public.notif_a_faire() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r record; v_att integer; v_cle text; v_type text; v_dest jsonb; v_out jsonb := '[]'::jsonb; v_matchs jsonb;
  v_race jsonb; v_clas jsonb; v_vain text; v_fin text;
begin
  for r in
    select t.id, t.nom, t.categorie, t.annee, m.tour, count(*) as n,
           bool_or(m.statut = 'a_venir') as reste,
           bool_and(m.neutralise or exists (select 1 from public.revelations v
                                            where v.kind = 'match' and v.ref_id = m.id and not v.groupe_test)) as tous_reveles
    from public.tournaments t join public.matches m on m.tournament_id = t.id
    where t.etat in ('pari_tournoi_ouvert', 'en_cours')
    group by t.id, t.nom, t.categorie, t.annee, m.tour
  loop
    v_att := case when r.categorie = 'atp_finals' and r.tour = 'RR' then 12
                  else case r.tour when 'R16' then 8 when 'QF' then 4 when 'SF' then 2 when 'F' then 1 end end;
    continue when v_att is null or r.n < v_att;

    foreach v_type in array array['tour_ouvert', 'paris_visibles'] loop
      continue when (v_type = 'tour_ouvert' and not r.reste) or (v_type = 'paris_visibles' and not r.tous_reveles);
      v_cle := v_type || ':' || r.id || ':' || r.tour;
      v_dest := public.notif_destinataires(v_cle, v_type);
      continue when jsonb_array_length(v_dest) = 0;
      select coalesce(jsonb_agg(jsonb_build_object('p1', a.nom, 'p2', b.nom, 'heure', m.heure_prevue)
                                order by m.heure_prevue nulls last, m.id), '[]'::jsonb) into v_matchs
        from public.matches m join public.players a on a.id = m.p1_id join public.players b on b.id = m.p2_id
        where m.tournament_id = r.id and m.tour = r.tour;
      v_out := v_out || jsonb_build_object('cle', v_cle, 'type', v_type,
        'tournoi', jsonb_build_object('id', r.id, 'nom', r.nom, 'categorie', r.categorie, 'annee', r.annee),
        'tour', r.tour, 'matchs', v_matchs, 'destinataires', v_dest);
    end loop;
  end loop;

  for r in
    select t.id, t.nom, t.categorie, t.annee, t.vainqueur_id, t.finaliste_id
    from public.tournaments t
    where t.etat = 'clos' and exists (select 1 from public.tournament_results x where x.tournament_id = t.id)
  loop
    v_cle := 'tournoi_termine:' || r.id;
    v_dest := public.notif_destinataires(v_cle, 'tournoi_termine');
    continue when jsonb_array_length(v_dest) = 0;
    select nom into v_vain from public.players where id = r.vainqueur_id;
    select nom into v_fin from public.players where id = r.finaliste_id;
    select coalesce(jsonb_agg(jsonb_build_object('prenom', p.prenom, 'rang', x.rang, 'score_final', x.score_final) order by x.rang, p.prenom), '[]'::jsonb)
      into v_clas
      from public.tournament_results x join public.profiles p on p.id = x.joueur_id
      where x.tournament_id = r.id and not p.is_test and p.actif;
    select jsonb_build_object(
      'tournois', coalesce((select jsonb_agg(jsonb_build_object('id', t2.id, 'annee', t2.annee, 'etat', t2.etat)) from public.tournaments t2 where t2.annee = r.annee), '[]'::jsonb),
      'resultats', coalesce((select jsonb_agg(jsonb_build_object('tournament_id', x.tournament_id, 'joueur_id', x.joueur_id, 'score_final', x.score_final))
                             from public.tournament_results x join public.tournaments t3 on t3.id = x.tournament_id where t3.annee = r.annee), '[]'::jsonb),
      'profils', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'prenom', p.prenom) order by p.prenom) from public.profiles p where p.actif and not p.is_test), '[]'::jsonb))
      into v_race;
    v_out := v_out || jsonb_build_object('cle', v_cle, 'type', 'tournoi_termine',
      'tournoi', jsonb_build_object('id', r.id, 'nom', r.nom, 'categorie', r.categorie, 'annee', r.annee),
      'vainqueur', v_vain, 'finaliste', v_fin, 'classement', v_clas, 'race_donnees', v_race, 'destinataires', v_dest);
  end loop;
  return v_out;
end $$;

revoke all on function public.notif_destinataires(text, text) from public, anon, authenticated;
revoke all on function public.notif_marquer(text, uuid)       from public, anon, authenticated;
revoke all on function public.notif_a_faire()                 from public, anon, authenticated;
grant execute on function public.notif_destinataires(text, text) to service_role;
grant execute on function public.notif_marquer(text, uuid)       to service_role;
grant execute on function public.notif_a_faire()                 to service_role;
