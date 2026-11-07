-- =====================================================================================
-- Pronos Tennis — migration 0018 : notifications push (web push)
-- À exécuter APRÈS 0017. Ne contient aucun secret : la clé privée VAPID est créée par la tâche GitHub au premier envoi et
-- rangée dans push_cles, table que personne d'autre que le rôle service ne peut lire.
--
-- * push_cles : une seule ligne (clé publique et privée VAPID).
-- * push_abonnements : un abonnement par appareil et par joueur (adresse du service de push + clés de chiffrement).
--   Chacun voit, ajoute et supprime les siens ; l'administrateur voit tout.
-- * push_cle_publique() : la clé publique, lisible par tout joueur connecté (nécessaire pour s'abonner).
-- * push_abonner() : enregistre l'appareil et, pour un premier abonnement, fige les événements déjà en cours
--   (sinon un nouvel abonné recevrait d'un coup toute l'histoire : un message par tournoi déjà terminé).
-- * push_destinataires() : mêmes événements et mêmes trois cases que le courriel ; journal anti-doublon propre au push
--   (clé « push:… » dans notif_envoyees). Un joueur sans préférences enregistrées reçoit tout (cases cochées par défaut).
-- * notif_a_faire() : renvoie aussi « push_destinataires » ; un événement n'est omis que s'il n'a ni destinataire courriel ni push.
-- =====================================================================================

create table public.push_cles (
  id        smallint primary key default 1 check (id = 1),
  publique  text not null,
  privee    text not null,
  cree_le   timestamptz not null default now()
);
alter table public.push_cles enable row level security;
revoke all on public.push_cles from public, anon, authenticated;
grant all on public.push_cles to service_role;

create table public.push_abonnements (
  id         bigint generated always as identity primary key,
  joueur_id  uuid not null references public.profiles (id) on delete cascade,
  endpoint   text not null unique check (endpoint like 'https://%'),
  p256dh     text not null,
  auth       text not null,
  appareil   text,
  cree_le    timestamptz not null default now()
);
alter table public.push_abonnements enable row level security;
create policy push_abo_lecture on public.push_abonnements for select to authenticated
  using (joueur_id = auth.uid() or public.est_admin());
create policy push_abo_suppression on public.push_abonnements for delete to authenticated
  using (joueur_id = auth.uid() or public.est_admin());
revoke all on public.push_abonnements from public, anon, authenticated;
grant select, delete on public.push_abonnements to authenticated;
grant all on public.push_abonnements to service_role;

create function public.push_cle_publique() returns text
language sql stable security definer set search_path = public as $$
  select publique from public.push_cles where id = 1
$$;
revoke all on function public.push_cle_publique() from public, anon;
grant execute on function public.push_cle_publique() to authenticated;

create function public.push_cles_enregistrer(p_publique text, p_privee text) returns void
language sql security definer set search_path = public as $$
  insert into public.push_cles (id, publique, privee) values (1, p_publique, p_privee) on conflict do nothing
$$;
create function public.push_cles_lire() returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(c) - 'id' - 'cree_le' from public.push_cles c where id = 1
$$;
create function public.push_supprimer(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from public.push_abonnements where endpoint = p_endpoint
$$;
revoke all on function public.push_cles_enregistrer(text, text), public.push_cles_lire(), public.push_supprimer(text) from public, anon, authenticated;
grant execute on function public.push_cles_enregistrer(text, text), public.push_cles_lire(), public.push_supprimer(text) to service_role;

create function public.push_destinataires(p_cle text, p_pref text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'joueur_id', p.id, 'prenom', p.prenom,
           'abonnements', (select jsonb_agg(jsonb_build_object('endpoint', a.endpoint, 'p256dh', a.p256dh, 'auth', a.auth) order by a.id)
                           from public.push_abonnements a where a.joueur_id = p.id)) order by p.prenom), '[]'::jsonb)
  from public.profiles p left join public.notif_preferences n on n.joueur_id = p.id
  where p.actif and not p.is_test
    and exists (select 1 from public.push_abonnements a where a.joueur_id = p.id)
    and case p_pref when 'tour_ouvert' then coalesce(n.tour_ouvert, true) when 'paris_visibles' then coalesce(n.paris_visibles, true)
                    else coalesce(n.tournoi_termine, true) end
    and not exists (select 1 from public.notif_envoyees e where e.cle = 'push:' || p_cle and e.joueur_id = p.id)
$$;
revoke all on function public.push_destinataires(text, text) from public, anon, authenticated;
grant execute on function public.push_destinataires(text, text) to service_role;

create or replace function public.notif_a_faire() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r record; v_att integer; v_cle text; v_type text; v_dest jsonb; v_out jsonb := '[]'::jsonb; v_matchs jsonb;
  v_race jsonb; v_clas jsonb; v_vain text; v_fin text; v_push jsonb;
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
    v_att := case when r.categorie = 'atp_finals' and r.tour in ('RR1', 'RR2', 'RR3') then 4
                  else case r.tour when 'R16' then 8 when 'QF' then 4 when 'SF' then 2 when 'F' then 1 end end;
    continue when v_att is null or r.n < v_att;

    foreach v_type in array array['tour_ouvert', 'paris_visibles'] loop
      continue when (v_type = 'tour_ouvert' and not r.reste) or (v_type = 'paris_visibles' and not r.tous_reveles);
      v_cle := v_type || ':' || r.id || ':' || r.tour;
      v_dest := public.notif_destinataires(v_cle, v_type);
      v_push := public.push_destinataires(v_cle, v_type);
      continue when jsonb_array_length(v_dest) = 0 and jsonb_array_length(v_push) = 0;
      select coalesce(jsonb_agg(jsonb_build_object('p1', a.nom, 'p2', b.nom, 'heure', m.heure_prevue)
                                order by m.heure_prevue nulls last, m.id), '[]'::jsonb) into v_matchs
        from public.matches m join public.players a on a.id = m.p1_id join public.players b on b.id = m.p2_id
        where m.tournament_id = r.id and m.tour = r.tour;
      v_out := v_out || jsonb_build_object('cle', v_cle, 'type', v_type,
        'tournoi', jsonb_build_object('id', r.id, 'nom', r.nom, 'categorie', r.categorie, 'annee', r.annee),
        'tour', r.tour, 'matchs', v_matchs, 'destinataires', v_dest, 'push_destinataires', v_push);
    end loop;
  end loop;

  for r in
    select t.id, t.nom, t.categorie, t.annee, t.vainqueur_id, t.finaliste_id
    from public.tournaments t
    where t.etat = 'clos' and exists (select 1 from public.tournament_results x where x.tournament_id = t.id)
  loop
    v_cle := 'tournoi_termine:' || r.id;
    v_dest := public.notif_destinataires(v_cle, 'tournoi_termine');
    v_push := public.push_destinataires(v_cle, 'tournoi_termine');
    continue when jsonb_array_length(v_dest) = 0 and jsonb_array_length(v_push) = 0;
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
      'vainqueur', v_vain, 'finaliste', v_fin, 'classement', v_clas, 'race_donnees', v_race, 'destinataires', v_dest, 'push_destinataires', v_push);
  end loop;
  return v_out;
end $$;


create function public.push_abonner(p_endpoint text, p_p256dh text, p_auth text, p_appareil text) returns void
language plpgsql security definer set search_path = public as $$
declare v_moi uuid := auth.uid(); v_premier boolean; v_ev jsonb;
begin
  if v_moi is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  v_premier := not exists (select 1 from public.push_abonnements where joueur_id = v_moi);
  insert into public.push_abonnements (joueur_id, endpoint, p256dh, auth, appareil)
  values (v_moi, p_endpoint, p_p256dh, p_auth, left(p_appareil, 120))
  on conflict (endpoint) do update set joueur_id = v_moi, p256dh = excluded.p256dh, auth = excluded.auth, appareil = excluded.appareil;
  if v_premier then
    -- fige tout ce qui est déjà en cours : seuls les événements à venir seront notifiés à cet abonné
    for v_ev in select e from jsonb_array_elements(public.notif_a_faire()) e loop
      if exists (select 1 from jsonb_array_elements(v_ev -> 'push_destinataires') d where (d ->> 'joueur_id')::uuid = v_moi) then
        insert into public.notif_envoyees (cle, joueur_id) values ('push:' || (v_ev ->> 'cle'), v_moi) on conflict do nothing;
      end if;
    end loop;
  end if;
end $$;
revoke all on function public.push_abonner(text, text, text, text) from public, anon;
grant execute on function public.push_abonner(text, text, text, text) to authenticated;
