// Lancement des notifications par e-mail (voir notif.js). Variables : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// BREVO_API_KEY (secret), NOTIF_EXPEDITEUR (adresse validée chez Brevo), NOTIF_NOM_EXPEDITEUR (facultatif), NOTIF_URL_SITE (facultatif).
import { fileURLToPath } from 'node:url';
import { creerBaseSupabase } from './base.js';
import { executerNotifications, envoyerBrevo } from './notif.js';

const masquer = (t, secrets) => secrets.filter(Boolean).reduce((s, x) => s.split(x).join('***'), String(t));

export async function lancer({ env = {}, fetchImpl = globalThis.fetch, sortie = console.log } = {}) {
  const ecrire = (t) => sortie(masquer(t, [env.SUPABASE_SERVICE_ROLE_KEY, env.BREVO_API_KEY]));
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) { ecrire('ERREUR : SUPABASE_URL et/ou SUPABASE_SERVICE_ROLE_KEY absent.'); return 1; }
  const configure = Boolean(env.BREVO_API_KEY && env.NOTIF_EXPEDITEUR);
  const base = creerBaseSupabase({ url: env.SUPABASE_URL, cle: env.SUPABASE_SERVICE_ROLE_KEY, fetchImpl });
  const expediteur = { email: env.NOTIF_EXPEDITEUR, name: env.NOTIF_NOM_EXPEDITEUR || 'Pronos Tennis' };
  try {
    const moteur = await import('../moteur/index.js');
    await executerNotifications({
      base, moteur, configure, journal: ecrire,
      urlSite: env.NOTIF_URL_SITE || 'https://pitmel.github.io/pronos-tennis/',
      envoyer: (m) => envoyerBrevo({ cle: env.BREVO_API_KEY, expediteur, fetchImpl, ...m }),
    });
    return 0;
  } catch (e) {
    ecrire(`notifications : ${e.message}`);
    return 0; // ne fait jamais échouer la synchronisation
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await lancer({ env: process.env });
}
