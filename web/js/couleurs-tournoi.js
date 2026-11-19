// Couleurs propres à chaque tournoi (Pierre, 19 nov. 2026). Trois couleurs :
//  - « fond » : bandeau de la page du tournoi, fond des cartes de match, page de fin de tournoi ;
//  - « terrain » : le terrain sur lequel on parie (sans valeur : le bleu habituel) ;
//  - « barème » : encadré Barème, une nuance plus sombre du fond (calculée ici, sauf si une couleur « bareme » est donnée).
// Tournoi reconnu par son nom (le même d'une année à l'autre). Sans entrée : couleurs habituelles de l'appli.

const sansAccent = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const cle = (nom) => sansAccent(nom).toLowerCase().replace(/\b(?:19|20)\d{2}\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const ORANGE = { fond: '#EB6510', terrain: '#EB6510' };
/** Couleurs choisies, par nom de tournoi (sans accent ni année, en minuscules). */
export const COULEURS = {
  'monte carlo masters': ORANGE,
  'madrid open': ORANGE,
  'masters de rome': ORANGE,
  'roland garros': ORANGE,
  'wimbledon': { fond: '#8AA74B', terrain: '#8AA74B' },
  'nitto atp finals': { fond: '#6BA7ED', bareme: '#1F4E96' }, // barème plus bleu et plus foncé que le calcul automatique
  'open d australie': { fond: '#0091D2' },
};

/** Part de noir mélangée au fond pour obtenir le barème. */
const PART_NOIR_BAREME = 0.32;

const hex = (n) => `#${[n >> 16, (n >> 8) & 255, n & 255].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
/** Mélange d'une couleur #rrggbb avec du noir : `part` = proportion de noir (0 à 1). */
export function assombrir(couleur, part) {
  const n = parseInt(couleur.slice(1), 16);
  const f = (v) => Math.round(v * (1 - part));
  return hex((f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255));
}

/** @returns {{fond:string, terrain:string|null, bareme:string}|null} null si le tournoi n'a pas de couleurs choisies */
export function couleursTournoi(tournoi) {
  const c = COULEURS[cle(tournoi?.nom)];
  return c ? { fond: c.fond, terrain: c.terrain ?? null, bareme: c.bareme ?? assombrir(c.fond, PART_NOIR_BAREME) } : null;
}

/** Attribut style (variables CSS) à poser sur la page ou l'écran du tournoi ; '' sans couleurs choisies. */
export function styleCouleursTournoi(tournoi) {
  const c = couleursTournoi(tournoi);
  if (!c) return '';
  return `--fond-tournoi:${c.fond};--bareme-tournoi:${c.bareme}${c.terrain ? `;--terrain:${c.terrain}` : ''}`;
}
