-- Migration 0012 : un joueur qui n'a pas encore parié peut le faire même si le match est terminé (Pierre, 5 nov. 2026),
-- tant que les paris ne sont pas révélés (résultat masqué jusque-là) et hors neutralisation / forfait.
create or replace function public.pari_saisissable_match(p_match bigint, p_test boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.matches m
                 where m.id = p_match and not m.neutralise and m.fin_match <> 'forfait')
     and not public.paris_reveles_match(p_match, p_test)
$$;
