// Clôture automatique d'un tournoi : lit les données (fonctions SQL réservées au rôle service), calcule les points avec le MOTEUR
// (src/moteur, le même que celui de l'application : un seul endroit pour les règles de points), puis fait enregistrer le résultat.
// Les conditions de clôture (finale comptée, matchs révélés, groupe sans pari ignoré) sont vérifiées en SQL, deux fois.

import { calculerTournoi } from '../moteur/index.js';

const texte = (x) => String(x);

/**
 * @param d résultat de sync_donnees_cloture
 * @returns { resultats: [{joueur_id, points_matchs, points_pari_tournoi, bonus_classement, score_final, rang}], vainqueur_id, finaliste_id }
 */
export function calculerCloture(d) {
  const resultat = { vainqueur: texte(d.resultat.vainqueur_id), finaliste: texte(d.resultat.finaliste_id) };
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
  return { resultats, vainqueur_id: d.resultat.vainqueur_id, finaliste_id: d.resultat.finaliste_id };
}

/** Examine les tournois non clos et clôt ceux qui remplissent les conditions. Une erreur sur un tournoi n'arrête pas les autres. */
export async function executerClotures({ base, simulation = false, journal = () => {} }) {
  const sortie = { clotures: [], attente: [], erreurs: [] };
  const candidats = await base.clotureCandidats();
  for (const c of candidats) {
    if (!c.eligible) {
      if (c.finale_comptee) {
        const reste = c.groupes.filter((g) => g.avec_paris && g.matchs_non_reveles > 0)
          .map((g) => `${g.matchs_non_reveles} match(s) à compléter ou neutraliser (groupe ${g.test ? 'test' : 'réel'})`);
        sortie.attente.push({ tournoi_id: c.tournoi_id, nom: c.nom, raison: reste.join(' ; ') || 'aucun pari dans le tournoi' });
        journal(`clôture de « ${c.nom} » en attente : ${reste.join(' ; ') || 'aucun pari dans le tournoi'}`);
      }
      continue;
    }
    try {
      const calcul = calculerCloture(await base.donneesCloture(c.tournoi_id));
      if (simulation) {
        journal(`simulation : « ${c.nom} » serait clôturé (${calcul.resultats.length} résultat(s))`);
        continue;
      }
      const r = await base.cloturer(c.tournoi_id, calcul.resultats);
      if (r?.statut === 'cloture') {
        sortie.clotures.push({ tournoi_id: c.tournoi_id, nom: c.nom, resultats: calcul.resultats.length });
        journal(`tournoi « ${c.nom} » CLÔTURÉ (${calcul.resultats.length} résultat(s) archivés)`);
      }
    } catch (e) {
      sortie.erreurs.push(`clôture de « ${c.nom} » : ${e.message}`);
      journal(`ÉCHEC de la clôture de « ${c.nom} » : ${e.message}`);
    }
  }
  return sortie;
}
