// Lancement des notifications push (voir push.js). Variables : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NOTIF_URL_SITE (facultatif).
// Les clés VAPID sont créées ici au premier passage et rangées dans la base (table push_cles, lisible par le seul rôle service) :
// aucun secret à saisir. Seule la clé publique est exposée aux joueurs (fonction push_cle_publique).
import { fileURLToPath } from 'node:url';
import { creerBaseSupabase } from './base.js';
import { executerPush } from './push.js';

const masquer = (t, secrets) => secrets.filter(Boolean).reduce((s, x) => s.split(x).join('***'), String(t));
const URL_SITE = 'https://pitmel.github.io/pronos-tennis/';

/** Envoyeur réel : bibliothèque web-push (chargée à la demande). */
export async function creerEnvoyeur({ base, urlSite, webpush }) {
  const wp = webpush ?? await import('web-push'); // module ESM : fonctions nommées
  let cles = await base.pushCles();
  if (!cles?.publique) {
    const neuves = wp.generateVAPIDKeys();
    await base.pushEnregistrerCles(neuves.publicKey, neuves.privateKey);
    cles = await base.pushCles(); // en cas de passages simultanés, c'est la première paire enregistrée qui fait foi
  }
  const details = { subject: urlSite, publicKey: cles.publique, privateKey: cles.privee };
  return async (abo, contenu) => {
    await wp.sendNotification({ endpoint: abo.endpoint, keys: { p256dh: abo.p256dh, auth: abo.auth } },
      JSON.stringify({ titre: contenu.titre, texte: contenu.texte, url: contenu.url, tag: contenu.tag }),
      { vapidDetails: details, TTL: 60 * 60 * 24, urgency: 'normal' });
  };
}

export async function lancer({ env = {}, fetchImpl = globalThis.fetch, sortie = console.log, webpush } = {}) {
  const ecrire = (t) => sortie(masquer(t, [env.SUPABASE_SERVICE_ROLE_KEY]));
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) { ecrire('ERREUR : SUPABASE_URL et/ou SUPABASE_SERVICE_ROLE_KEY absent.'); return 1; }
  const base = creerBaseSupabase({ url: env.SUPABASE_URL, cle: env.SUPABASE_SERVICE_ROLE_KEY, fetchImpl });
  const urlSite = env.NOTIF_URL_SITE || URL_SITE;
  try {
    // les clés sont créées dès le premier passage : les joueurs en ont besoin pour s'abonner, avant tout événement
    const envoyer = await creerEnvoyeur({ base, urlSite, webpush });
    await executerPush({ base, envoyer, urlSite, journal: ecrire });
    return 0;
  } catch (e) {
    ecrire(`push : ${e.message}`);
    return 0; // ne fait jamais échouer la synchronisation
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await lancer({ env: process.env });
}
