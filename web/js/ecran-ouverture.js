// Écran d'ouverture (Pierre, 21 nov. 2026) : une citation, une info ou une image du tennis, tirée au hasard à chaque lancement de
// l'appli ; un clic (ou une touche) n'importe où le ferme. Fonctions pures (testées) ; le branchement est dans app.js.

import { echapper } from './outils.js';

/** Un contenu est affichable s'il est actif et complet (texte pour citation/info, adresse pour image). */
export function contenuValide(c) {
  if (!c || c.actif === false) return false;
  // image : adresse https:// ou chemin du site seulement (jamais « javascript: » ni « data: »)
  if (c.type === 'image') return /^(https:\/\/|\.{0,2}\/)[^\s]+$/.test(String(c.image_url ?? '').trim());
  if (c.type === 'citation' || c.type === 'info') return Boolean(String(c.texte ?? '').trim());
  return false;
}

/** Tire un contenu au hasard parmi les valides ; `hasard` (0 ≤ x < 1) est injectable pour les tests. Aucun contenu valide : null. */
export function choisirContenu(contenus, hasard = Math.random) {
  const liste = (contenus ?? []).filter(contenuValide);
  if (liste.length === 0) return null;
  return liste[Math.min(liste.length - 1, Math.floor(hasard() * liste.length))];
}

/** Taille du texte selon sa longueur : une phrase courte se lit en grand, un long paragraphe reste entièrement visible sur un téléphone. */
export function classeTaille(texte) {
  const n = [...String(texte ?? '')].length;
  return n <= 90 ? 'court' : n <= 180 ? 'moyen' : 'long';
}

/**
 * Légende d'image : chaque « - » entouré d'espaces devient un retour à la ligne (« Roger Federer - Wimbledon 2003 » s'affiche sur deux lignes).
 * Les traits d'union collés aux mots (« Roland-Garros », « Medvedev-Tiafoe ») ne sont pas touchés. Texte échappé.
 */
export function lignesLegende(texte) {
  return String(texte ?? '').trim().split(/\s+[-–—]\s+/).map(echapper).join('<br>');
}

/** Page entière, tout est centré, même fond vert que les écrans de fin. Tout l'écran est cliquable (voir app.js). */
export function htmlEcranOuverture(contenu) {
  const plein = (s) => String(s ?? '').trim();
  const auteur = plein(contenu.auteur) ? `<p class="ouverture-auteur">${echapper(contenu.auteur)}</p>` : '';
  const contexte = plein(contenu.source) ? `<p class="ouverture-source">${echapper(contenu.source)}</p>` : '';
  const signature = auteur || contexte ? `<div class="ouverture-signature">${auteur}${contexte}</div>` : '';
  const taille = `t-${classeTaille(contenu.texte)}`;
  let corps;
  if (contenu.type === 'image') {
    const legende = plein(contenu.texte) ? `<p class="ouverture-legende">${lignesLegende(contenu.texte)}</p>` : '';
    corps = `<img class="ouverture-image" src="${echapper(contenu.image_url)}" alt="${echapper(contenu.texte ?? 'Image du tennis')}">${legende}`;
  } else if (contenu.type === 'citation') {
    corps = `<blockquote class="ouverture-citation ${taille}">« ${echapper(contenu.texte)} »</blockquote>`;
  } else {
    corps = `<p class="ouverture-info-etiquette">Le saviez-vous ?</p><p class="ouverture-info ${taille}">${echapper(contenu.texte)}</p>`;
  }
  return `
    <section class="ecran-ouverture" role="button" tabindex="0" aria-label="Touche l’écran pour continuer" data-action="ecran-ouverture-fermer">
      <h1 class="ouverture-marque">Pronos <span>Tennis</span></h1>
      <div class="ouverture-contenu">${corps}${signature}</div>
      <p class="ouverture-aide">Touche l’écran pour continuer</p>
    </section>`;
}
