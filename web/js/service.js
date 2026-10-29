// Quand le service ne répond pas : message clair (au lieu d'une page vide ou d'un « Chargement… » sans fin).
import { echapper } from './outils.js';

/**
 * Classe une erreur de chargement.
 *  - 'hors-ligne'    : l'appareil n'a pas de réseau ;
 *  - 'indisponible'  : le réseau marche mais le service ne répond pas (Supabase en pause ou en panne : échec réseau, 5xx, 540, délai dépassé) ;
 *  - 'autre'         : tout le reste (droits, données…), hors sujet ici.
 * @param {any} erreur  erreur levée par supabase-js (objet ou Error)
 * @param {{enLigne?: boolean}} [contexte]
 */
export function classerErreurService(erreur, { enLigne = true } = {}) {
  if (!enLigne) return 'hors-ligne';
  const texte = `${erreur?.message ?? ''} ${erreur?.details ?? ''} ${erreur?.name ?? ''}`.toLowerCase();
  const statut = Number(erreur?.status ?? erreur?.statusCode ?? 0);
  if (statut >= 500 || /failed to fetch|networkerror|network request failed|load failed|timeout|timed out|délai|abort|fetch/.test(texte)) return 'indisponible';
  return 'autre';
}

/** Message affiché à l'utilisateur, ou null si l'erreur n'est pas un problème de service. */
export function messageService(erreur, contexte) {
  switch (classerErreurService(erreur, contexte)) {
    case 'hors-ligne':
      return { titre: 'Pas de connexion', texte: 'Ton appareil n’est pas connecté à internet. Reconnecte-toi puis réessaie.' };
    case 'indisponible':
      return {
        titre: 'Le service est indisponible',
        texte: 'Les données ne répondent pas pour le moment (le service est peut-être en veille). Réessaie dans quelques minutes ; si cela dure, préviens Pierre.',
      };
    default:
      return null;
  }
}

/** Carte d'erreur avec bouton « Réessayer » (le clic est géré par app.js via data-reessayer). */
export function htmlServiceIndisponible({ titre, texte }) {
  return `
    <section class="carte carte-service" role="alert">
      <h2>${echapper(titre)}</h2>
      <p>${echapper(texte)}</p>
      <p><button type="button" class="btn-petit principal" data-reessayer>Réessayer</button></p>
    </section>`;
}
