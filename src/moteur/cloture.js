// Calcul des résultats de clôture d'un tournoi (archive des scores finaux) à partir des données de la base.
// Un seul endroit pour ce calcul : la tâche de clôture automatique (src/sync) et l'administration (navigateur) l'utilisent toutes deux.
// Un joueur sans pari marque 0 point ; un match non terminé (ni neutralisé ni forfait) ne compte pas.
import { calculerTournoi } from './moteur.js';

const texte = (x) => String(x);

/**
 * @param d résultat de sync_donnees_cloture (ou admin_donnees_cloture)
 * @param {{vainqueurId?: number, finalisteId?: number}} [imposes]  vainqueur et finaliste choisis par l'administrateur
 *   (obligatoires quand la finale n'est pas jouée ; ils l'emportent sur ceux de la finale)
 * @returns { resultats: [{joueur_id, points_matchs, points_pari_tournoi, bonus_classement, score_final, rang}], vainqueur_id, finaliste_id }
 */
export function calculerCloture(d, imposes = {}) {
  const vainqueurId = imposes.vainqueurId ?? d.resultat?.vainqueur_id;
  const finalisteId = imposes.finalisteId ?? d.resultat?.finaliste_id;
  if (vainqueurId === undefined || vainqueurId === null || finalisteId === undefined || finalisteId === null) {
    throw new Error('Vainqueur et finaliste du tournoi requis : la finale n’a pas de vainqueur connu.');
  }
  if (String(vainqueurId) === String(finalisteId)) throw new Error('Le vainqueur et le finaliste doivent être deux joueurs différents.');
  const resultat = { vainqueur: texte(vainqueurId), finaliste: texte(finalisteId) };
  const resultats = [];
  for (const g of d.groupes) {
    const matchs = d.matchs.map((m) => ({
      match: {
        categorie: d.categorie, tour: m.tour, vainqueur: m.vainqueur, setsJoues: m.sets_joues, finMatch: m.fin_match, neutralise: m.neutralise,
      },
      paris: Object.fromEntries(g.paris.filter((p) => p.match_id === m.id).map((p) => [p.joueur_id, { choix: p.choix, confiance: p.confiance, sets: p.sets }])),
    }));
    const parisTournoi = Object.fromEntries(g.paris_tournoi.map((p) => [p.joueur_id, { vainqueur: texte(p.vainqueur_id), finaliste: texte(p.finaliste_id) }]));
    const r = calculerTournoi({
      categorie: d.categorie, joueurs: g.joueurs, matchs, cloture: true, pariTournoi: { paris: parisTournoi, resultat },
    });
    for (const j of g.joueurs) {
      resultats.push({
        joueur_id: j,
        points_matchs: r.pointsMatchs[j].toString(),
        points_pari_tournoi: r.pointsPariTournoi[j].toString(),
        bonus_classement: r.bonusClassement[j].toString(),
        score_final: r.final[j].toString(),
        rang: r.rangsFinal[j],
      });
    }
  }
  return { resultats, vainqueur_id: vainqueurId, finaliste_id: finalisteId };
}

