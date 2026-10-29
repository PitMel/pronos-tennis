// Classement annuel « Race » (cahier des charges, section 8), calculé avec le moteur de points.
// Le moteur est passé en paramètre (injection) : dans le navigateur c'est /moteur/index.js, dans les tests c'est src/moteur.
// Jalon 3.5 : classement d'un tournoi en trois temps (matchs, + pari tournoi, + bonus = score final) et détail de la Race.
import { bilanDuTour } from './cartes.js';

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
    .map((p) => ({ id: p.id, prenom: p.prenom, couleur: p.couleur ?? null, photo_url: p.photo_url ?? null, rang: rangs[p.id], points: moteur.formaterPoints(complets[p.id]) }))
    .sort((a, b) => a.rang - b.rang || a.prenom.localeCompare(b.prenom, 'fr'));
  return { annee, tournoisClos: clos.length, lignes };
}

/** Cellule de points : texte français (virgule, vrai moins) et signe, pour la couleur. */
function cellule(moteur, valeur, { signe = true } = {}) {
  const negatif = valeur.comparer(moteur.ZERO) < 0;
  return { texte: moteur.formaterPoints(valeur, { signe }), negatif, positif: valeur.comparer(moteur.ZERO) > 0 };
}

/**
 * Classement d'un tournoi pour le groupe de la personne connectée, en trois temps (cahier §7, décision du 23 oct. 2026) :
 *   1. points des matchs ; 2. + pari tournoi ; 3. + bonus de classement = score final.
 * - Tournoi clos : chiffres figés de l'archive de clôture (`tournament_results`) ; les trois colonnes sont remplies.
 * - Sinon : somme des points des matchs dont le résultat est visible ; pari tournoi et bonus arrivent à la clôture.
 * @param {object} p
 * @param {object} p.moteur
 * @param {{id:number, etat:string, categorie:string}} p.tournoi
 * @param {Array} p.matchs                lignes de matches_visibles
 * @param {Map} p.paris                   Map(idMatch → Map(idProfil → pari)) (ce que la base laisse lire)
 * @param {Array} p.archives              lignes de tournament_results de CE tournoi
 * @param {Array<{id:string, prenom:string, couleur?:string|null}>} p.profils
 * @returns {{cloture:boolean, matchsComptes:number, lignes:Array}}
 */
export function classementTournoi({ moteur, tournoi, matchs, paris, archives, profils }) {
  const { Fraction, ZERO } = moteur;
  const ids = new Set(profils.map((x) => x.id));
  const archive = new Map(archives.filter((r) => ids.has(r.joueur_id)).map((r) => [r.joueur_id, r]));
  const cloture = tournoi.etat === 'clos' && archive.size > 0;

  if (cloture) {
    const finals = Object.fromEntries(profils.map((x) => [x.id, Fraction.de(archive.get(x.id)?.score_final ?? '0')]));
    const rangs = moteur.rangs(finals);
    const lignes = profils.map((x) => {
      const r = archive.get(x.id);
      const v = (texte) => Fraction.de(texte ?? '0');
      return {
        id: x.id, prenom: x.prenom, couleur: x.couleur ?? null, photo_url: x.photo_url ?? null, rang: rangs[x.id],
        matchs: cellule(moteur, v(r?.points_matchs)),
        pari: cellule(moteur, v(r?.points_pari_tournoi)),
        bonus: cellule(moteur, v(r?.bonus_classement)),
        final: cellule(moteur, finals[x.id], { signe: false }),
        // score avant bonification (matchs + pari tournoi), affiché dans le résumé de la Saison avec le bonus entre parenthèses
        avantBonus: cellule(moteur, v(r?.points_matchs).plus(v(r?.points_pari_tournoi)), { signe: false }),
      };
    }).sort((a, b) => a.rang - b.rang || a.prenom.localeCompare(b.prenom, 'fr'));
    return { cloture: true, matchsComptes: matchs.length, lignes };
  }

  const bilan = bilanDuTour(matchs, { moteur, categorie: tournoi.categorie, paris });
  const points = Object.fromEntries(profils.map((x) => [x.id, bilan?.get(x.id) ?? ZERO]));
  const rangs = moteur.rangs(points);
  const lignes = profils.map((x) => ({
    id: x.id, prenom: x.prenom, couleur: x.couleur ?? null, photo_url: x.photo_url ?? null, rang: rangs[x.id],
    matchs: cellule(moteur, points[x.id]), pari: null, bonus: null, final: null, avantBonus: null,
  })).sort((a, b) => a.rang - b.rang || a.prenom.localeCompare(b.prenom, 'fr'));
  const comptes = matchs.filter((m) => m.neutralise || (m.statut === 'termine' && m.resultat_visible)).length;
  return { cloture: false, matchsComptes: comptes, lignes };
}

/**
 * Détail de la Race d'une année : une ligne par tournoi terminé (ordre chronologique), une colonne par joueur
 * (rangés par classement de la Race), et la ligne de total. Les chiffres viennent des archives de clôture.
 * @returns {{annee:number, tournoisClos:number, colonnes:Array, tournois:Array<{id, nom, categorie, date_debut, cellules:Object}>}}
 */
export function detailRace({ moteur, annee, tournois, resultats, profils }) {
  const race = construireRace({ moteur, annee, tournois, resultats, profils });
  const ordre = new Map(race.lignes.map((l, i) => [l.id, i]));
  const colonnes = [...race.lignes];
  const ids = new Set(profils.map((x) => x.id));
  const clos = tournois
    .filter((t) => t.annee === annee && t.etat === 'clos')
    .sort((a, b) => {
      const da = a.date_debut ?? '9999-12-31';
      const db = b.date_debut ?? '9999-12-31';
      return da === db ? String(a.nom).localeCompare(String(b.nom), 'fr') : da.localeCompare(db);
    });
  const lignes = clos.map((t) => {
    const scores = new Map(resultats.filter((r) => r.tournament_id === t.id && ids.has(r.joueur_id)).map((r) => [r.joueur_id, moteur.Fraction.de(r.score_final)]));
    let meilleur = null;
    for (const v of scores.values()) if (meilleur === null || v.comparer(meilleur) > 0) meilleur = v;
    const cellules = {};
    for (const c of colonnes) {
      const v = scores.get(c.id);
      cellules[c.id] = v
        ? { ...cellule(moteur, v, { signe: false }), gagnant: meilleur !== null && v.comparer(meilleur) === 0 }
        : { texte: '—', negatif: false, positif: false, gagnant: false };
    }
    return { id: t.id, nom: t.nom, categorie: t.categorie, date_debut: t.date_debut ?? null, cellules };
  });
  return { annee, tournoisClos: clos.length, colonnes: colonnes.sort((a, b) => ordre.get(a.id) - ordre.get(b.id)), tournois: lignes };
}
