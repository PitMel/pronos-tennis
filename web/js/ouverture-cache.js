// Écran d'ouverture : copie des contenus gardée sur l'appareil (localStorage), pour afficher la citation / l'info / l'image
// immédiatement au lancement, sans attendre le chargement de l'appli ni le réseau (21 nov. 2026, demandé par Pierre).
// Fonctions pures : le stockage est injecté (localStorage dans le navigateur, un faux dans les tests). Jamais d'exception.
import { contenuValide } from './ecran-ouverture.js';

export const CLE_CACHE = 'pronos-ouverture-v1';
const MAX_CONTENUS = 300; // garde-fou : la copie reste petite

/** Copie les contenus valides (liste vide : on efface, par ex. interrupteur éteint dans la base). */
export function ecrireCache(stockage, contenus) {
  try {
    const liste = (contenus ?? []).filter(contenuValide).slice(0, MAX_CONTENUS)
      .map(({ id, type, texte, auteur, source, image_url: imageUrl }) => ({ id, type, texte, auteur, source, image_url: imageUrl, actif: true }));
    if (liste.length === 0) stockage.removeItem(CLE_CACHE);
    else stockage.setItem(CLE_CACHE, JSON.stringify(liste));
  } catch { /* stockage plein ou interdit : l'appli fonctionne sans */ }
}

/** Contenus copiés (valides seulement) ; liste vide si rien, si la copie est illisible ou si le stockage est inaccessible. */
export function lireCache(stockage) {
  try {
    const liste = JSON.parse(stockage.getItem(CLE_CACHE) ?? '[]');
    return Array.isArray(liste) ? liste.filter(contenuValide) : [];
  } catch { return []; }
}

/** Une session Supabase est-elle mémorisée sur l'appareil ? (jamais d'écran d'ouverture avant la connexion) */
export function sessionMemorisee(stockage) {
  try {
    for (let i = 0; i < stockage.length; i += 1) {
      const cle = stockage.key(i);
      if (/^sb-.+-auth-token$/.test(cle) && stockage.getItem(cle)) return true;
    }
  } catch { /* inaccessible : comme sans session */ }
  return false;
}
