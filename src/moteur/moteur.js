// Moteur de points : module PUR (aucun accès base, réseau, horloge ni DOM). Sous Node et navigateur.
// Toutes les valeurs sont des Fraction exactes ; l'arrondi n'existe qu'à l'affichage (format.js).
// Les points se recalculent à la volée à partir des données brutes : une correction d'admin se
// répercute partout sans migration (les instantanés de clôture figent l'historique).
//
// Conventions de données
//   joueur            : identifiant texte du compte joueur
//   choix / vainqueur : 1 ou 2 (joueur 1 ou 2 de l'affiche, comme dans l'API)
//   pari de match     : { choix: 1|2, confiance: 6..10, sets?: 3|4|5 }   (sets : Grand Chelem seulement)
//   match             : { categorie, tour, vainqueur: 1|2|null, setsJoues?, finMatch?: 'normal'|'abandon'|'forfait',
//                         neutralise?: boolean }
//   pari tournoi      : { vainqueur: idJoueurTennis, finaliste: idJoueurTennis }
import { Fraction, ZERO } from './fraction.js';
import {
  BAREME,
  BONUS_CLASSEMENT,
  BONUS_SETS_BON_VAINQUEUR,
  BONUS_SETS_CINQ_SETS_MAUVAIS_VAINQUEUR,
  CATEGORIES,
  CONFIANCES,
  FINS_DE_MATCH,
  GRAND_CHELEM,
  MULTIPLICATEURS,
  POINTS_PARI_TOURNOI,
  SETS_POSSIBLES_GRAND_CHELEM,
  TOURS_PAR_CATEGORIE,
} from './regles.js';

export class ErreurMoteur extends Error {
  constructor(message) {
    super(message);
    this.name = 'ErreurMoteur';
  }
}

// ---------------------------------------------------------------- validations

function verifierCategorie(categorie) {
  if (!CATEGORIES.includes(categorie)) {
    throw new ErreurMoteur(`Catégorie de tournoi inconnue : « ${categorie} ».`);
  }
}

/** Multiplicateur de tour (4.4). Erreur si le tour n'existe pas dans cette catégorie. */
export function multiplicateurTour(categorie, tour) {
  verifierCategorie(categorie);
  const m = MULTIPLICATEURS[categorie][tour];
  if (!m) {
    throw new ErreurMoteur(
      `Tour « ${tour} » invalide pour la catégorie « ${categorie} » (attendu : ${TOURS_PAR_CATEGORIE[categorie].join(', ')}).`,
    );
  }
  return m;
}

/**
 * Contrôle de SAISIE d'un pari de match (strict). Renvoie la liste des erreurs en français (vide = valide).
 * Le calcul des points (pointsPari) est volontairement plus tolérant sur `sets` pour qu'une donnée
 * incohérente n'empêche jamais de recalculer tout un classement.
 */
export function validerPari(pari, categorie) {
  verifierCategorie(categorie);
  const erreurs = [];
  if (!pari || (pari.choix !== 1 && pari.choix !== 2)) erreurs.push('Choisis un joueur.');
  if (!pari || !CONFIANCES.includes(pari.confiance)) erreurs.push('La confiance doit être un entier de 6 à 10.');
  if (pari) {
    const aDesSets = pari.sets !== undefined && pari.sets !== null;
    if (categorie === GRAND_CHELEM) {
      if (!SETS_POSSIBLES_GRAND_CHELEM.includes(pari.sets)) erreurs.push('En Grand Chelem, indique le nombre de sets (3, 4 ou 5).');
    } else if (aDesSets) {
      erreurs.push('Le nombre de sets ne se parie qu’en Grand Chelem.');
    }
  }
  return erreurs;
}

/** Contrôle de SAISIE d'un pari tournoi : deux joueurs de tennis différents. */
export function validerPariTournoi(pari) {
  const erreurs = [];
  if (!pari || !pari.vainqueur) erreurs.push('Choisis un vainqueur.');
  if (!pari || !pari.finaliste) erreurs.push('Choisis un finaliste.');
  if (pari && pari.vainqueur && pari.vainqueur === pari.finaliste) {
    erreurs.push('Le vainqueur et le finaliste doivent être deux joueurs différents.');
  }
  return erreurs;
}

function verifierPariBase(pari) {
  if (!pari || (pari.choix !== 1 && pari.choix !== 2)) throw new ErreurMoteur('Pari invalide : choix attendu 1 ou 2.');
  if (!CONFIANCES.includes(pari.confiance)) throw new ErreurMoteur('Pari invalide : confiance attendue entre 6 et 10 (entier).');
}

// ---------------------------------------------------------------- match

/** Barème visible sur un pari (4.2 / 4.4) : points si gagné / si perdu pour une confiance, tour et catégorie, hors bonus de sets. */
export function gainsPossibles(confiance, categorie, tour) {
  if (!CONFIANCES.includes(confiance)) throw new ErreurMoteur('Confiance attendue entre 6 et 10 (entier).');
  const m = multiplicateurTour(categorie, tour);
  return { gagne: BAREME[confiance].gagne.fois(m), perdu: BAREME[confiance].perdu.fois(m) };
}

/** Un match est « compté » s'il est neutralisé, forfait, ou terminé avec un vainqueur connu. */
export function matchCompte(match) {
  return Boolean(match.neutralise) || match.finMatch === 'forfait' || match.vainqueur === 1 || match.vainqueur === 2;
}

/**
 * Points d'UN pari sur UN match terminé (4.2 à 4.5) :
 *   (base + bonus de sets) × multiplicateur de tour, puis ÷ 2 en cas d'abandon (sans bonus de sets).
 *   Neutralisé ou forfait : 0.
 */
export function pointsPari(pari, match) {
  verifierPariBase(pari);
  const mult = multiplicateurTour(match.categorie, match.tour);
  const fin = match.finMatch ?? 'normal';
  if (!FINS_DE_MATCH.includes(fin)) throw new ErreurMoteur(`Type de fin de match inconnu : « ${fin} ».`);
  if (match.neutralise || fin === 'forfait') return ZERO;
  if (match.vainqueur !== 1 && match.vainqueur !== 2) {
    throw new ErreurMoteur('Match sans vainqueur : points non calculables (match non terminé).');
  }

  const gagne = pari.choix === match.vainqueur;
  const bareme = BAREME[pari.confiance];
  let points = gagne ? bareme.gagne : bareme.perdu;

  const abandon = fin === 'abandon';
  if (match.categorie === GRAND_CHELEM && !abandon) {
    if (gagne && pari.sets === match.setsJoues) {
      points = points.plus(BONUS_SETS_BON_VAINQUEUR);
    } else if (!gagne && pari.sets === 5 && match.setsJoues === 5) {
      points = points.plus(BONUS_SETS_CINQ_SETS_MAUVAIS_VAINQUEUR);
    }
  }

  points = points.fois(mult);
  return abandon ? points.divise(2) : points;
}

/**
 * Points de tous les paris d'un match : { joueur: Fraction }. Renvoie null si le match n'est pas encore compté.
 * @param {object} match
 * @param {Object<string, object>} paris  { joueur: pari }
 */
export function pointsMatch(match, paris) {
  if (!matchCompte(match)) return null;
  const resultat = {};
  for (const [joueur, pari] of Object.entries(paris)) resultat[joueur] = pointsPari(pari, match);
  return resultat;
}

// ---------------------------------------------------------------- pari tournoi (6)

/**
 * Points du pari tournoi, versés à la clôture, jamais multipliés.
 *   +X par joueur choisi (vainqueur ou finaliste) qui atteint la finale ; +X si le joueur choisi comme vainqueur gagne.
 *   Vainqueur et finaliste inversés : les deux atteignent la finale, mais pas de bonus vainqueur.
 * @param {{vainqueur: string, finaliste: string}} pari
 * @param {{vainqueur: string, finaliste: string}} resultat  vainqueur du tournoi et finaliste perdant
 */
export function pointsPariTournoi(pari, resultat, categorie) {
  verifierCategorie(categorie);
  const erreurs = validerPariTournoi(pari);
  if (erreurs.length) throw new ErreurMoteur(`Pari tournoi invalide : ${erreurs.join(' ')}`);
  if (!resultat || !resultat.vainqueur || !resultat.finaliste) {
    throw new ErreurMoteur('Résultat du tournoi incomplet (vainqueur et finaliste attendus).');
  }
  const x = POINTS_PARI_TOURNOI[categorie];
  const enFinale = (joueur) => joueur === resultat.vainqueur || joueur === resultat.finaliste;
  let points = ZERO;
  if (enFinale(pari.vainqueur)) points = points.plus(x);
  if (enFinale(pari.finaliste)) points = points.plus(x);
  if (pari.vainqueur === resultat.vainqueur) points = points.plus(x);
  return points;
}

// ---------------------------------------------------------------- classement et bonus (7)

/** Rangs « à la compétition » : les ex aequo partagent le rang, le suivant est décalé (1, 2, 2, 4). */
export function rangs(scores) {
  const entrees = Object.entries(scores).map(([joueur, s]) => [joueur, Fraction.de(s)]);
  entrees.sort((a, b) => b[1].comparer(a[1]));
  const resultat = {};
  entrees.forEach(([joueur, s], i) => {
    resultat[joueur] = i > 0 && s.egal(entrees[i - 1][1]) ? resultat[entrees[i - 1][0]] : i + 1;
  });
  return resultat;
}

/**
 * Bonus de classement d'un tournoi : { joueur: Fraction } (0 pour qui ne touche rien).
 *   Premier seul : bonus du 1er ; le(s) 2e(s) se partagent le bonus de la 2e place.
 *   Ex aequo pour la 1re place (2 ou plus) : le bonus de la 1re place est partagé entre eux,
 *   et personne ne touche le bonus de la 2e place.
 * @param {Object<string, Fraction|string>} scores  scores APRÈS pari tournoi, des seuls joueurs du groupe concerné
 */
export function bonusClassement(scores, categorie) {
  verifierCategorie(categorie);
  const [bonus1, bonus2] = BONUS_CLASSEMENT[categorie];
  const entrees = Object.entries(scores).map(([joueur, s]) => [joueur, Fraction.de(s)]);
  const bonus = Object.fromEntries(entrees.map(([joueur]) => [joueur, ZERO]));
  if (entrees.length === 0) return bonus;

  const meilleur = entrees.reduce((m, [, s]) => (s.comparer(m) > 0 ? s : m), entrees[0][1]);
  const premiers = entrees.filter(([, s]) => s.egal(meilleur));
  for (const [joueur] of premiers) bonus[joueur] = bonus1.divise(premiers.length);
  if (premiers.length > 1) return bonus;

  const reste = entrees.filter(([, s]) => !s.egal(meilleur));
  if (reste.length === 0) return bonus;
  const second = reste.reduce((m, [, s]) => (s.comparer(m) > 0 ? s : m), reste[0][1]);
  const seconds = reste.filter(([, s]) => s.egal(second));
  for (const [joueur] of seconds) bonus[joueur] = bonus2.divise(seconds.length);
  return bonus;
}

// ---------------------------------------------------------------- tournoi complet

function additionner(a, b) {
  const resultat = {};
  for (const joueur of Object.keys(a)) resultat[joueur] = a[joueur].plus(b[joueur] ?? ZERO);
  return resultat;
}

/**
 * Score d'un tournoi, en trois étapes visibles (demande de Pierre, 23 oct. 2026) :
 *   1. pointsMatchs      : somme des points des matchs seulement (« avant bonus vainqueur / finaliste »)
 *   2. apresPariTournoi  : + points du pari tournoi (vainqueur / finaliste), versés à la clôture
 *   3. final             : + bonus de classement (1er / 2e) calculé sur l'étape 2
 * Tant que le tournoi n'est pas clos, seules les données de l'étape 1 sont fournies (les autres valent null).
 *
 * `joueurs` définit le groupe concerné (comptes réels OU comptes de test, jamais mélangés) : les paris
 * d'autres comptes sont ignorés.
 *
 * @param {object} p
 * @param {string} p.categorie
 * @param {string[]} p.joueurs
 * @param {Array<{match: object, paris: Object<string, object>}>} p.matchs
 * @param {boolean} [p.cloture]
 * @param {{paris: Object<string, object>, resultat: {vainqueur: string, finaliste: string}|null}} [p.pariTournoi]
 */
export function calculerTournoi({ categorie, joueurs, matchs, cloture = false, pariTournoi = null }) {
  verifierCategorie(categorie);
  const groupe = new Set(joueurs);
  let pointsMatchs = Object.fromEntries(joueurs.map((j) => [j, ZERO]));

  for (const { match, paris } of matchs) {
    if (match.categorie !== categorie) {
      throw new ErreurMoteur(`Match de catégorie « ${match.categorie} » dans un tournoi « ${categorie} ».`);
    }
    const pointsDuMatch = pointsMatch(
      match,
      Object.fromEntries(Object.entries(paris).filter(([joueur]) => groupe.has(joueur))),
    );
    if (pointsDuMatch) pointsMatchs = additionner(pointsMatchs, pointsDuMatch);
  }

  const sortie = {
    categorie,
    pointsMatchs,
    rangsMatchs: rangs(pointsMatchs),
    pointsPariTournoi: null,
    apresPariTournoi: null,
    rangsApresPariTournoi: null,
    bonusClassement: null,
    final: null,
    rangsFinal: null,
  };
  if (!cloture) return sortie;

  if (!pariTournoi || !pariTournoi.resultat) {
    throw new ErreurMoteur('Tournoi clos : le résultat du pari tournoi (vainqueur et finaliste) est obligatoire.');
  }
  const pointsPari = Object.fromEntries(joueurs.map((j) => [j, ZERO]));
  for (const [joueur, pari] of Object.entries(pariTournoi.paris ?? {})) {
    if (groupe.has(joueur)) pointsPari[joueur] = pointsPariTournoi(pari, pariTournoi.resultat, categorie);
  }
  const apres = additionner(pointsMatchs, pointsPari);
  const bonus = bonusClassement(apres, categorie);
  const final = additionner(apres, bonus);

  return {
    ...sortie,
    pointsPariTournoi: pointsPari,
    apresPariTournoi: apres,
    rangsApresPariTournoi: rangs(apres),
    bonusClassement: bonus,
    final,
    rangsFinal: rangs(final),
  };
}

// ---------------------------------------------------------------- Race (8)

/**
 * Race d'une année : somme des scores FINAUX (après bonus) des tournois CLOS de cette année.
 * Un tournoi en cours ne change jamais la Race. Chaque année est indépendante.
 * @param {Array<{annee: number, clos: boolean, scoresFinaux: Object<string, Fraction|string>}>} tournois
 */
export function calculerRace(tournois, annee) {
  const points = {};
  for (const t of tournois) {
    if (t.annee !== annee || !t.clos) continue;
    for (const [joueur, s] of Object.entries(t.scoresFinaux)) {
      points[joueur] = (points[joueur] ?? ZERO).plus(Fraction.de(s));
    }
  }
  return { annee, points, rangs: rangs(points) };
}
