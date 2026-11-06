// « Autres récompenses » détenues actuellement dans une saison, et leur ligne d'affichage (sous les classements de la page Saison).
// Fonctions pures à partir des records de statsRace().
import { echapper } from './outils.js';
import { htmlIconeRecompense, AUTRES_RECOMPENSES } from './trophees.js';

/**
 * @param {object|null} records  statsRace(...).records
 * @param {Array<{id:string, prenom:string}>} profils
 * @returns {Map<string, Array<{cle:string, titre:string, nombre:number}>>} par identifiant de profil, dans l'ordre d'AUTRES_RECOMPENSES
 */
export function recompensesActuelles(records, profils) {
  const parPrenom = new Map(profils.map((p) => [p.prenom, p.id]));
  const compte = new Map(profils.map((p) => [p.id, new Map()]));
  const donner = (cle, id, n = 1) => { if (compte.has(id)) compte.get(id).set(cle, (compte.get(id).get(cle) ?? 0) + n); };
  if (records) {
    for (const x of records.grandChelem ?? []) donner('biggest_gc', parPrenom.get(x.parieur));
    for (const x of records.masters ?? []) donner('biggest_m1000', parPrenom.get(x.parieur));
    for (const n of records.grandFou?.noms ?? []) donner('grand_fou', parPrenom.get(n));
    for (const n of records.gagnePetit?.noms ?? []) donner('gagne_petit', parPrenom.get(n));
    for (const x of records.sniper?.tops ?? []) donner('sniper', x.id);
    for (const id of new Set((records.strike?.tops ?? []).map((x) => x.id))) donner('strike', id);
    for (const x of records.fullStrike ?? []) donner('full_strike', x.id);
    for (const x of records.contradicteur?.tops ?? []) donner('contradicteur', x.id);
  }
  return new Map(profils.map((p) => [p.id, AUTRES_RECOMPENSES.filter((r) => compte.get(p.id).has(r.cle)).map((r) => ({ cle: r.cle, titre: r.titre, nombre: compte.get(p.id).get(r.cle) }))]));
}

/** Ligne en petite police : le prénom de chaque joueur suivi de ses récompenses (miniatures). '' sans records. */
export function htmlLigneRecompenses(records, profils) {
  if (!records) return '';
  const parJoueur = recompensesActuelles(records, profils);
  const items = profils.map((p) => {
    const liste = parJoueur.get(p.id);
    const icones = liste.map((r) => `<span class="mini-recompense">${htmlIconeRecompense(r.cle, 16)}${r.nombre > 1 ? `<small>×${echapper(r.nombre)}</small>` : ''}</span>`).join('');
    return `<span class="joueur-recompenses"><b>${echapper(p.prenom)}</b>${icones}</span>`;
  }).join('');
  return `<p class="ligne-recompenses">${items}</p>`;
}
