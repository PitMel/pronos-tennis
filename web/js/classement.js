// Classement annuel « Race » (cahier des charges, section 8), calculé avec le moteur de points.
// Le moteur est passé en paramètre (injection) : dans le navigateur c'est /moteur/index.js, dans les tests c'est src/moteur.

/**
 * @param {object} p
 * @param {object} p.moteur        module du moteur de points (calculerRace, rangs, formaterPoints, ZERO)
 * @param {number} p.annee
 * @param {Array<{id:number, annee:number, etat:string}>} p.tournois
 * @param {Array<{tournament_id:number, joueur_id:string, score_final:string}>} p.resultats  archives de clôture
 * @param {Array<{id:string, prenom:string, couleur?:string|null}>} p.profils  les joueurs du groupe de la personne connectée
 * @returns {{annee:number, tournoisClos:number, lignes:Array<{id, prenom, couleur, rang:number, points:string}>}}
 */
export function construireRace({ moteur, annee, tournois, resultats, profils }) {
  const ids = new Set(profils.map((p) => p.id));
  const clos = tournois.filter((t) => t.annee === annee && t.etat === 'clos');
  const entrees = clos.map((t) => {
    const scoresFinaux = {};
    for (const r of resultats) {
      if (r.tournament_id === t.id && ids.has(r.joueur_id)) scoresFinaux[r.joueur_id] = r.score_final;
    }
    return { annee: t.annee, clos: true, scoresFinaux };
  });
  const { points } = moteur.calculerRace(entrees, annee);
  const complets = {};
  for (const p of profils) complets[p.id] = points[p.id] ?? moteur.ZERO;
  const rangs = moteur.rangs(complets);
  const lignes = profils
    .map((p) => ({ id: p.id, prenom: p.prenom, couleur: p.couleur ?? null, rang: rangs[p.id], points: moteur.formaterPoints(complets[p.id]) }))
    .sort((a, b) => a.rang - b.rang || a.prenom.localeCompare(b.prenom, 'fr'));
  return { annee, tournoisClos: clos.length, lignes };
}
