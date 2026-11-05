// Face-à-face (H2H) d'un match : mise en forme du compteur de la carte et de la fenêtre qui liste les rencontres passées.
// Les données viennent de la table h2h (calculée par la synchronisation). Fonctions pures.
import { echapper } from './outils.js';

export const SOURCE_H2H = 'TennisMyLife (stats.tennismylife.org)';
const NBSP = ' ';

/** Clé d'une paire de joueurs : l'identifiant le plus petit d'abord (comme dans la table h2h). */
export const cleH2H = (a, b) => (Number(a) < Number(b) ? `${a}-${b}` : `${b}-${a}`);

/**
 * H2H d'un match, orienté du point de vue de p1 / p2 : null (pas de ligne ou « indisponible »), sinon
 * { v1, v2, parSurface: [{surface, v1, v2}], rencontres: [{annee, tournoi, surface, tour, score, vainqueur: 1|2}] }.
 * @param {Map<string, object>|undefined} h2h  Map(cleH2H → ligne de la table h2h)
 */
export function h2hDuMatch(h2h, match) {
  const l = h2h?.get(cleH2H(match.p1_id, match.p2_id));
  if (!l || l.statut !== 'ok') return null;
  const direct = Number(l.joueur_a) === Number(match.p1_id); // p1 est « a » dans la table
  const cote = (x) => (x === 'a' ? (direct ? 1 : 2) : (direct ? 2 : 1));
  return {
    v1: direct ? l.victoires_a : l.victoires_b,
    v2: direct ? l.victoires_b : l.victoires_a,
    parSurface: (l.par_surface ?? []).map((s) => ({ surface: s.surface, v1: direct ? s.a : s.b, v2: direct ? s.b : s.a })),
    rencontres: (l.rencontres ?? []).map((r) => ({ annee: r.annee, tournoi: r.tournoi, surface: r.surface, tour: r.tour, score: r.score, vainqueur: cote(r.vainqueur) })),
  };
}

/** Centre de la carte, à la place des scores : « 7 [H2H] 10 », ou « H2H indisponible ». h = résultat de h2hDuMatch. */
export function htmlCompteurH2H(match, h) {
  if (!h) return '<div class="h2h-indispo">H2H indisponible</div>';
  return `<div class="sets h2h-nb"><b>${echapper(h.v1)}</b></div>`
    + `<div class="filet-ligne h2h-ligne"><button type="button" class="btn-h2h" data-action="h2h" data-j1="${echapper(match.p1_id)}" data-j2="${echapper(match.p2_id)}" aria-label="Voir le face-à-face détaillé">H2H</button></div>`
    + `<div class="sets h2h-nb"><b>${echapper(h.v2)}</b></div>`;
}

/** Contenu de la fenêtre : H2H en gros, puis les rencontres de la plus récente à la plus ancienne, une couleur par vainqueur. */
/** n1 / n2 : noms courts des joueurs (voir nomCourt dans cartes.js). */
export function htmlFenetreH2H(h, n1, n2) {
  const lignes = h.rencontres.map((r) => `<tr class="h2h-g${r.vainqueur}"><td>${echapper(r.annee ?? '—')}</td><th scope="row">${echapper(r.vainqueur === 1 ? n1 : n2)}</th>`
    + `<td>${echapper(r.tournoi ?? '—')}</td><td>${echapper(r.tour ?? '—')}</td><td>${echapper(r.surface ?? '—')}</td><td class="h2h-score">${r.score ? r.score.split(' ').map((x) => `<span class="h2h-set">${echapper(x)}</span>`).join(' ') : '—'}</td></tr>`).join('');
  const surfaces = h.parSurface.length
    ? `<p class="h2h-surfaces">${h.parSurface.map((s) => `${echapper(s.surface)} : <b>${echapper(s.v1)}${NBSP}–${NBSP}${echapper(s.v2)}</b>`).join(' · ')}</p>` : '';
  return `
    <header class="h2h-entete">
      <h3 id="titre-h2h">H2H</h3>
      <p class="h2h-gros"><span class="h2h-g1">${echapper(n1)} <b>${echapper(h.v1)}</b></span><span class="h2h-tiret" aria-hidden="true">–</span><span class="h2h-g2"><b>${echapper(h.v2)}</b> ${echapper(n2)}</span></p>
      ${surfaces}
    </header>
    ${h.rencontres.length
    ? `<div class="tableau-defilant"><table class="h2h-table"><thead><tr><th scope="col">Année</th><th scope="col">Vainqueur</th><th scope="col">Tournoi</th><th scope="col">Tour</th><th scope="col">Surface</th><th scope="col">Score</th></tr></thead><tbody>${lignes}</tbody></table></div>`
    : '<p class="vide">Première rencontre : aucun match disputé entre ces deux joueurs.</p>'}
    <p class="small">Matchs du circuit ATP. Source : ${echapper(SOURCE_H2H)}.</p>
    <button type="button" class="btn alt" data-action="h2h-fermer">Fermer</button>`;
}
