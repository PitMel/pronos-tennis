// Clôture automatique d'un tournoi : lit les données (fonctions SQL réservées au rôle service), calcule les points avec le MOTEUR
// (src/moteur, le même que celui de l'application : un seul endroit pour les règles de points), puis fait enregistrer le résultat.
// Les conditions de clôture (finale comptée, matchs révélés, groupe sans pari ignoré) sont vérifiées en SQL, deux fois.

import { calculerCloture } from '../moteur/cloture.js';

export { calculerCloture };

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
