// Pari tournoi (6), classement et bonus (7), score en trois étapes, Race (8) — exemples E, F, G.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pointsPariTournoi,
  validerPariTournoi,
  bonusClassement,
  rangs,
  calculerTournoi,
  calculerRace,
  Fraction,
  ErreurMoteur,
  GRAND_CHELEM,
  MASTERS_1000,
  ATP_FINALS,
} from '../src/moteur/index.js';
import { egal, egalObjet } from './aide.js';

// ------------------------------------------------------------ Exemple E : pari tournoi
// Résultat réel : Sinner gagne, Zverev perd la finale.
const FINALE = { vainqueur: 'Sinner', finaliste: 'Zverev' };

test('Exemple E — Grand Chelem : vainqueur et finaliste exacts = 8 + 8 + 8 = 24', () => {
  egal(pointsPariTournoi({ vainqueur: 'Sinner', finaliste: 'Zverev' }, FINALE, GRAND_CHELEM), 24);
});

test('Exemple E — Grand Chelem : les deux en finale mais inversés = 8 + 8 = 16 (pas de bonus vainqueur)', () => {
  egal(pointsPariTournoi({ vainqueur: 'Zverev', finaliste: 'Sinner' }, FINALE, GRAND_CHELEM), 16);
});

test('Exemple E — Grand Chelem : vainqueur désigné gagne, finaliste désigné éliminé avant la finale = 16', () => {
  egal(pointsPariTournoi({ vainqueur: 'Sinner', finaliste: 'Alcaraz' }, FINALE, GRAND_CHELEM), 16);
});

test('Exemple E — Grand Chelem : seul le finaliste désigné atteint la finale, le vainqueur désigné est éliminé = 8', () => {
  egal(pointsPariTournoi({ vainqueur: 'Alcaraz', finaliste: 'Zverev' }, FINALE, GRAND_CHELEM), 8);
  // le « finaliste » désigné est en fait le champion : il atteint la finale (+8) sans être désigné vainqueur
  egal(pointsPariTournoi({ vainqueur: 'Alcaraz', finaliste: 'Sinner' }, FINALE, GRAND_CHELEM), 8);
});

test('pari tournoi : le vainqueur désigné perd la finale (il atteint la finale) : +8, pas de bonus vainqueur', () => {
  egal(pointsPariTournoi({ vainqueur: 'Zverev', finaliste: 'Alcaraz' }, FINALE, GRAND_CHELEM), 8);
});

test('pari tournoi : aucun joueur choisi en finale = 0', () => {
  egal(pointsPariTournoi({ vainqueur: 'Alcaraz', finaliste: 'Djokovic' }, FINALE, GRAND_CHELEM), 0);
  egal(pointsPariTournoi({ vainqueur: 'Alcaraz', finaliste: 'Djokovic' }, FINALE, MASTERS_1000), 0);
});

test('Exemple E — autres tournois : mêmes cas avec 4 au lieu de 8 (12 / 8 / 8 / 4)', () => {
  for (const categorie of [MASTERS_1000, ATP_FINALS]) {
    egal(pointsPariTournoi({ vainqueur: 'Sinner', finaliste: 'Zverev' }, FINALE, categorie), 12, `${categorie} exact`);
    egal(pointsPariTournoi({ vainqueur: 'Zverev', finaliste: 'Sinner' }, FINALE, categorie), 8, `${categorie} inversé`);
    egal(pointsPariTournoi({ vainqueur: 'Sinner', finaliste: 'Alcaraz' }, FINALE, categorie), 8, `${categorie} vainqueur seul`);
    egal(pointsPariTournoi({ vainqueur: 'Alcaraz', finaliste: 'Zverev' }, FINALE, categorie), 4, `${categorie} finaliste seul`);
  }
});

test('pari tournoi : maximums 24 (Grand Chelem) et 12 (autres), non multipliés', () => {
  const exact = { vainqueur: 'Sinner', finaliste: 'Zverev' };
  assert.ok(pointsPariTournoi(exact, FINALE, GRAND_CHELEM).egal(24));
  assert.ok(pointsPariTournoi(exact, FINALE, MASTERS_1000).egal(12));
  assert.ok(pointsPariTournoi(exact, FINALE, ATP_FINALS).egal(12));
});

test('pari tournoi : validations', () => {
  assert.deepEqual(validerPariTournoi({ vainqueur: 'A', finaliste: 'B' }), []);
  assert.equal(validerPariTournoi({ vainqueur: 'A', finaliste: 'A' }).length, 1);
  assert.equal(validerPariTournoi({ vainqueur: 'A' }).length, 1);
  assert.equal(validerPariTournoi({}).length, 2);
  assert.equal(validerPariTournoi(null).length, 2);
  assert.throws(() => pointsPariTournoi({ vainqueur: 'A', finaliste: 'A' }, FINALE, GRAND_CHELEM), ErreurMoteur);
  assert.throws(() => pointsPariTournoi({ vainqueur: 'A', finaliste: 'B' }, { vainqueur: 'A' }, GRAND_CHELEM), ErreurMoteur);
  assert.throws(() => pointsPariTournoi({ vainqueur: 'A', finaliste: 'B' }, null, GRAND_CHELEM), ErreurMoteur);
  assert.throws(() => pointsPariTournoi({ vainqueur: 'A', finaliste: 'B' }, FINALE, 'wta'), ErreurMoteur);
});

// ------------------------------------------------------------ Exemple F : classement et bonus (Masters 1000 : 12 et 5)
test('Exemple F — Masters 1000 : Léa 47, Pierre 43,5, Thomas 42, Marc 30 → Léa +12, Pierre +5', () => {
  egalObjet(
    bonusClassement({ Léa: 47, Pierre: '43.5', Thomas: 42, Marc: 30 }, MASTERS_1000),
    { Léa: 12, Pierre: 5, Thomas: 0, Marc: 0 },
    'sans égalité',
  );
});

test('Exemple F — Léa et Pierre à 47 : chacun +6, personne +5', () => {
  egalObjet(
    bonusClassement({ Léa: 47, Pierre: 47, Thomas: 42, Marc: 30 }, MASTERS_1000),
    { Léa: 6, Pierre: 6, Thomas: 0, Marc: 0 },
    'égalité à deux pour la 1re place',
  );
});

test('Exemple F — trois à égalité pour la 1re place : chacun +4 (12 ÷ 3), aucun bonus de 2e place', () => {
  egalObjet(
    bonusClassement({ Léa: 47, Pierre: 47, Thomas: 47, Marc: 30 }, MASTERS_1000),
    { Léa: 4, Pierre: 4, Thomas: 4, Marc: 0 },
    'égalité à trois',
  );
});

test('Exemple F — Léa 1re seule, Pierre et Thomas ex aequo 2es : chacun +2,5 (5 ÷ 2)', () => {
  egalObjet(
    bonusClassement({ Léa: 47, Pierre: 40, Thomas: 40, Marc: 30 }, MASTERS_1000),
    { Léa: 12, Pierre: '2.5', Thomas: '2.5', Marc: 0 },
    'égalité pour la 2e place',
  );
});

test('bonus de classement : barèmes Grand Chelem (24 / 10) et ATP Finals (10 / 4)', () => {
  const scores = { A: 50, B: 40, C: 30 };
  egalObjet(bonusClassement(scores, GRAND_CHELEM), { A: 24, B: 10, C: 0 }, 'Grand Chelem');
  egalObjet(bonusClassement(scores, ATP_FINALS), { A: 10, B: 4, C: 0 }, 'ATP Finals');
  egalObjet(bonusClassement(scores, MASTERS_1000), { A: 12, B: 5, C: 0 }, 'Masters 1000');
});

test('bonus de classement : égalités Grand Chelem et ATP Finals', () => {
  egalObjet(bonusClassement({ A: 50, B: 50, C: 30 }, GRAND_CHELEM), { A: 12, B: 12, C: 0 }, 'GC 2 premiers');
  egalObjet(bonusClassement({ A: 50, B: 30, C: 30 }, GRAND_CHELEM), { A: 24, B: 5, C: 5 }, 'GC 2 seconds');
  egalObjet(bonusClassement({ A: 50, B: 50, C: 30 }, ATP_FINALS), { A: 5, B: 5, C: 0 }, 'Finals 2 premiers');
  egalObjet(bonusClassement({ A: 50, B: 30, C: 30 }, ATP_FINALS), { A: 10, B: 2, C: 2 }, 'Finals 2 seconds');
});

test('bonus de classement : quatre joueurs à égalité parfaite = bonus de la 1re place ÷ 4, rien pour la 2e', () => {
  egalObjet(bonusClassement({ A: 10, B: 10, C: 10, D: 10 }, MASTERS_1000), { A: 3, B: 3, C: 3, D: 3 }, 'quatre ex aequo');
  egalObjet(bonusClassement({ A: 0, B: 0, C: 0, D: 0 }, GRAND_CHELEM), { A: 6, B: 6, C: 6, D: 6 }, 'quatre à zéro');
});

test('bonus de classement : trois ex aequo pour la 2e place = bonus partagé EXACTEMENT (5 ÷ 3), la somme redonne 5', () => {
  const b = bonusClassement({ A: 60, B: 40, C: 40, D: 40 }, MASTERS_1000);
  egal(b.A, 12);
  for (const j of ['B', 'C', 'D']) egal(b[j], '5/3', j);
  egal(Fraction.somme([b.B, b.C, b.D]), 5, 'somme des parts');
});

test('bonus de classement : trois ex aequo pour la 1re place aux ATP Finals = 10 ÷ 3 exact', () => {
  const b = bonusClassement({ A: 60, B: 60, C: 60, D: 10 }, ATP_FINALS);
  for (const j of ['A', 'B', 'C']) egal(b[j], '10/3', j);
  egal(b.D, 0);
  egal(Fraction.somme(Object.values(b)), 10, 'somme des parts');
});

test('bonus de classement : égalité détectée sur valeurs exactes (87/2 = 43,5) et sur décimales', () => {
  egalObjet(
    bonusClassement({ A: '87/2', B: '43.5', C: 20 }, MASTERS_1000),
    { A: 6, B: 6, C: 0 },
    'fractions égales',
  );
  egalObjet(
    bonusClassement({ A: '0.1', B: '0.30000', C: '0.3' }, MASTERS_1000),
    { A: 0, B: 6, C: 6 },
    'décimales',
  );
});

test('bonus de classement : scores négatifs, un seul joueur, aucun joueur', () => {
  egalObjet(bonusClassement({ A: -5, B: -20, C: -20 }, MASTERS_1000), { A: 12, B: '5/2', C: '5/2' }, 'négatifs');
  egalObjet(bonusClassement({ A: 7 }, MASTERS_1000), { A: 12 }, 'un seul joueur');
  assert.deepEqual(bonusClassement({}, MASTERS_1000), {});
  assert.throws(() => bonusClassement({ A: 1 }, 'wta'), ErreurMoteur);
});

test('rangs : ex aequo partagent le rang, le suivant est décalé (1, 2, 2, 4)', () => {
  assert.deepEqual(rangs({ A: 9, B: 9, C: '22.5', D: 3 }), { C: 1, A: 2, B: 2, D: 4 });
  assert.deepEqual(rangs({ A: 5 }), { A: 1 });
  assert.deepEqual(rangs({ A: 1, B: 1, C: 1 }), { A: 1, B: 1, C: 1 });
});

// ------------------------------------------------------------ score de tournoi en trois étapes
// Masters 1000, deux quarts (exemples A et B), puis pari tournoi.
const joueurs = ['Pierre', 'Léa', 'Marc', 'Thomas'];
const quartA = {
  match: { categorie: MASTERS_1000, tour: 'QF', vainqueur: 2, setsJoues: 2 },
  paris: {
    Pierre: { choix: 1, confiance: 8 },
    Léa: { choix: 1, confiance: 7 },
    Marc: { choix: 1, confiance: 9 },
    Thomas: { choix: 2, confiance: 6 },
  },
};
const quartB = {
  match: { categorie: MASTERS_1000, tour: 'QF', vainqueur: 1, setsJoues: 2 },
  paris: {
    Pierre: { choix: 1, confiance: 7 },
    Léa: { choix: 2, confiance: 6 },
    Marc: { choix: 1, confiance: 8 },
    Thomas: { choix: 1, confiance: 9 },
  },
};
const pariTournoi = {
  paris: {
    Pierre: { vainqueur: 'Sinner', finaliste: 'Alcaraz' }, // Sinner gagne (+4+4), Alcaraz éliminé
    Léa: { vainqueur: 'Alcaraz', finaliste: 'Sinner' }, // Sinner en finale (+4)
    Marc: { vainqueur: 'Djokovic', finaliste: 'Alcaraz' }, // rien
    Thomas: { vainqueur: 'Sinner', finaliste: 'Zverev' }, // exact (+12)
  },
  resultat: { vainqueur: 'Sinner', finaliste: 'Zverev' },
};

test('tournoi — étape 1 : points des matchs seulement, tournoi non clos', () => {
  const t = calculerTournoi({ categorie: MASTERS_1000, joueurs, matchs: [quartA, quartB], cloture: false, pariTournoi });
  egalObjet(t.pointsMatchs, { Pierre: 9, Léa: 9, Marc: 3, Thomas: '22.5' }, 'étape 1');
  assert.deepEqual(t.rangsMatchs, { Thomas: 1, Pierre: 2, Léa: 2, Marc: 4 });
  // tant que le tournoi n'est pas clos, ni pari tournoi ni bonus ne sont comptés
  assert.equal(t.pointsPariTournoi, null);
  assert.equal(t.apresPariTournoi, null);
  assert.equal(t.bonusClassement, null);
  assert.equal(t.final, null);
});

test('tournoi — trois étapes à la clôture : avant pari tournoi, après pari tournoi, après bonification', () => {
  const t = calculerTournoi({ categorie: MASTERS_1000, joueurs, matchs: [quartA, quartB], cloture: true, pariTournoi });
  egalObjet(t.pointsMatchs, { Pierre: 9, Léa: 9, Marc: 3, Thomas: '22.5' }, 'étape 1');
  egalObjet(t.pointsPariTournoi, { Pierre: 8, Léa: 4, Marc: 0, Thomas: 12 }, 'points du pari tournoi');
  egalObjet(t.apresPariTournoi, { Pierre: 17, Léa: 13, Marc: 3, Thomas: '34.5' }, 'étape 2');
  egalObjet(t.bonusClassement, { Pierre: 5, Léa: 0, Marc: 0, Thomas: 12 }, 'bonus de classement');
  egalObjet(t.final, { Pierre: 22, Léa: 13, Marc: 3, Thomas: '46.5' }, 'étape 3');
  assert.deepEqual(t.rangsApresPariTournoi, { Thomas: 1, Pierre: 2, Léa: 3, Marc: 4 });
  assert.deepEqual(t.rangsFinal, { Thomas: 1, Pierre: 2, Léa: 3, Marc: 4 });
});

test('tournoi : le bonus de classement se calcule sur le score APRÈS pari tournoi, pas avant', () => {
  // Avant pari tournoi : Léa et Pierre sont 2es ex aequo (9). Après : Pierre 17 devant Léa 13.
  const t = calculerTournoi({ categorie: MASTERS_1000, joueurs, matchs: [quartA, quartB], cloture: true, pariTournoi });
  egal(t.bonusClassement.Pierre, 5);
  egal(t.bonusClassement.Léa, 0);
});

test('tournoi : matchs non terminés ignorés, neutralisés et forfaits à 0, abandon ÷ 2', () => {
  const enCours = { match: { categorie: MASTERS_1000, tour: 'SF', vainqueur: null }, paris: { Pierre: { choix: 1, confiance: 10 } } };
  const neutralise = { match: { categorie: MASTERS_1000, tour: 'SF', vainqueur: 1, neutralise: true }, paris: { Pierre: { choix: 2, confiance: 10 } } };
  const forfait = { match: { categorie: MASTERS_1000, tour: 'SF', vainqueur: 1, finMatch: 'forfait' }, paris: { Pierre: { choix: 2, confiance: 10 } } };
  const abandon = { match: { categorie: MASTERS_1000, tour: 'F', vainqueur: 1, finMatch: 'abandon' }, paris: { Pierre: { choix: 1, confiance: 8 } } };
  const t = calculerTournoi({ categorie: MASTERS_1000, joueurs: ['Pierre'], matchs: [enCours, neutralise, forfait, abandon] });
  egalObjet(t.pointsMatchs, { Pierre: 8 }, 'seul l’abandon compte : 8 × 2 ÷ 2 = 8');
});

test('tournoi : un joueur sans pari sur un match marque 0 sur ce match, sans bloquer les autres', () => {
  const t = calculerTournoi({
    categorie: MASTERS_1000,
    joueurs: ['Pierre', 'Léa'],
    matchs: [{ match: { categorie: MASTERS_1000, tour: 'R16', vainqueur: 1 }, paris: { Pierre: { choix: 1, confiance: 6 } } }],
  });
  egalObjet(t.pointsMatchs, { Pierre: 6, Léa: 0 }, 'Léa n’a pas parié');
});

test('tournoi : seuls les comptes du groupe sont comptés (tests et réels jamais mélangés)', () => {
  const t = calculerTournoi({
    categorie: MASTERS_1000,
    joueurs: ['Paul', 'Jacques'],
    matchs: [
      {
        match: { categorie: MASTERS_1000, tour: 'R16', vainqueur: 1 },
        paris: { Paul: { choix: 1, confiance: 8 }, Jacques: { choix: 2, confiance: 6 }, Léa: { choix: 1, confiance: 10 } },
      },
    ],
  });
  egalObjet(t.pointsMatchs, { Paul: 8, Jacques: 4 }, 'Léa (autre groupe) ignorée');
});

test('tournoi : clos sans résultat du pari tournoi, ou match d’une autre catégorie = erreur', () => {
  assert.throws(() => calculerTournoi({ categorie: MASTERS_1000, joueurs, matchs: [], cloture: true }), ErreurMoteur);
  assert.throws(
    () => calculerTournoi({ categorie: MASTERS_1000, joueurs, matchs: [], cloture: true, pariTournoi: { paris: {}, resultat: null } }),
    ErreurMoteur,
  );
  assert.throws(
    () =>
      calculerTournoi({
        categorie: MASTERS_1000,
        joueurs: ['A'],
        matchs: [{ match: { categorie: GRAND_CHELEM, tour: 'R16', vainqueur: 1 }, paris: { A: { choix: 1, confiance: 8, sets: 3 } } }],
      }),
    ErreurMoteur,
  );
});

test('tournoi : un joueur sans pari tournoi touche 0 de ce côté, les autres sont comptés', () => {
  const t = calculerTournoi({
    categorie: GRAND_CHELEM,
    joueurs: ['A', 'B'],
    matchs: [],
    cloture: true,
    pariTournoi: { paris: { A: { vainqueur: 'X', finaliste: 'Y' } }, resultat: { vainqueur: 'X', finaliste: 'Y' } },
  });
  egalObjet(t.pointsPariTournoi, { A: 24, B: 0 }, 'pari tournoi');
  egalObjet(t.bonusClassement, { A: 24, B: 10 }, 'bonus Grand Chelem');
  egalObjet(t.final, { A: 48, B: 10 }, 'final');
});

test('tournoi : une correction d’admin (vainqueur du match changé) se répercute au recalcul', () => {
  const corrige = { ...quartA, match: { ...quartA.match, vainqueur: 1 } };
  const t = calculerTournoi({ categorie: MASTERS_1000, joueurs, matchs: [corrige, quartB] });
  // quart A avec Alcaraz vainqueur : Pierre 12, Léa 10,5, Marc 13,5, Thomas 6 (confiance 6 perdue : 4 × 1,5)
  // + quart B (10,5 / 6 / 12 / 13,5)
  egalObjet(t.pointsMatchs, { Pierre: '22.5', Léa: '16.5', Marc: '25.5', Thomas: '19.5' }, 'après correction');
});

// ------------------------------------------------------------ Exemple G : Race
test('Exemple G — la Race ne bouge pas en cours de tournoi, et s’incrémente du score FINAL à la clôture', () => {
  const enCours = { annee: 2027, clos: false, scoresFinaux: { Pierre: 100, Léa: 50 } };
  assert.deepEqual(calculerRace([enCours], 2027).points, {});
  const clos = { annee: 2027, clos: true, scoresFinaux: { Pierre: 22, Léa: 13, Marc: 3, Thomas: '46.5' } };
  const r = calculerRace([enCours, clos], 2027);
  egalObjet(r.points, { Pierre: 22, Léa: 13, Marc: 3, Thomas: '46.5' }, 'Race après clôture');
  assert.deepEqual(r.rangs, { Thomas: 1, Pierre: 2, Léa: 3, Marc: 4 });
});

test('Race : somme sur plusieurs tournois clos, années indépendantes', () => {
  const tournois = [
    { annee: 2027, clos: true, scoresFinaux: { Pierre: '10.5', Léa: 4 } },
    { annee: 2027, clos: true, scoresFinaux: { Pierre: '-3', Léa: '5/3', Marc: 7 } },
    { annee: 2026, clos: true, scoresFinaux: { Pierre: 999 } },
    { annee: 2028, clos: false, scoresFinaux: { Pierre: 999 } },
  ];
  const r27 = calculerRace(tournois, 2027);
  egalObjet(r27.points, { Pierre: '7.5', Léa: '17/3', Marc: 7 }, 'Race 2027');
  assert.equal(r27.annee, 2027);
  egalObjet(calculerRace(tournois, 2026).points, { Pierre: 999 }, 'Race 2026 indépendante');
  assert.deepEqual(calculerRace(tournois, 2025).points, {});
});
