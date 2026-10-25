// Configuration PUBLIQUE de l'application (visible de tous, c'est voulu).
// La clé « publiable » de Supabase est faite pour être dans le navigateur : elle ne donne aucun droit à elle seule.
// Toute la sécurité repose sur les règles RLS de la base (testées dans tests/securite et supabase/verification-*.sql).
// Ne JAMAIS écrire ici la clé « service_role » ni la clé de la Live Tennis API.
export const SUPABASE_URL = 'https://wmqyplehxtafxoilllfd.supabase.co';
export const SUPABASE_CLE_PUBLIABLE = 'sb_publishable_P2mczf_RTk-ADHMfcWfNtw_HfKDtOPx';
