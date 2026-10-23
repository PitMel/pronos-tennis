// Points d'un match — sections 4.2 à 4.6 et exemples A, B, C, D du cahier des charges (section 13).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pointsPari,
  pointsMatch,
  matchCompte,
  gainsPossibles,
  multiplicateurTour,
  validerPari,
  ErreurMoteur,
  GRAND_CHELEM,
  MASTERS_1000,
  ATP_FINALS,
} from '../src/moteur/index.js';
import { egal, egalObjet } from './aide.js';

const match = (o) => ({ categorie: MASTERS_1000, tour: 'QF', vainqueur: 1, finMatch: 'normal', ...o });

// ------------------------------------------------------------ 4.4 : barèmes complets
// confiance -> [gagné ×1, perdu ×1, gagné ×1,5, perdu ×1,5, gagné ×2, perdu ×2] — tableau du cahier des charges
const TABLEAU = {
  6: ['6', '4', '9', '6', '12', '8'],
  7: ['7', '2', '10.5', '3', '14', '4'],
  8: ['8', '-1', '12', '-1.5', '16', '-2'],
  9: ['9', '-6', '13.5', '-9', '18', '-12'],
  10: ['10', '-17', '15', '-25.5', '20', '-34'],
};
const TOURS_MULT = [
  ['R16', 0],
  ['QF', 2],
  ['SF', 4],
  ['F', 4],
];

for (const categorie of [MASTERS_1000, GRAND_CHELEM]) {
  for (const [tour, decalage] of TOURS_MULT) {
    test(`barème complet : ${categorie}, ${tour}`, () => {
      for (const [confiance, valeurs] of Object.entries(TABLEAU)) {
        const c = Number(confiance);
        const m = match({ categorie, tour, vainqueur: 1, setsJoues: 3 });
        // sets volontairement faux (4 ≠ 3) pour isoler le barème de base en Grand Chelem
        const pariGagne = { choix: 1, confiance: c, ...(categorie === GRAND_CHELEM ? { sets: 4 } : {}) };
        const pariPerdu = { choix: 2, confiance: c, ...(categorie === GRAND_CHELEM ? { sets: 4 } : {}) };
        egal(pointsPari(pariGagne, m), valeurs[decalage] ?? valeurs[0], `${tour} conf ${c} gagné`);
        egal(pointsPari(pariPerdu, m), valeurs[decalage + 1] ?? valeurs[1], `${tour} conf ${c} perdu`);
      }
    });
  }
}

test('barème complet : ATP Finals (poules ×1, demi-finales et finale ×2)', () => {
  for (const [confiance, valeurs] of Object.entries(TABLEAU)) {
    const c = Number(confiance);
    const poule = match({ categorie: ATP_FINALS, tour: 'RR' });
    egal(pointsPari({ choix: 1, confiance: c }, poule), valeurs[0], `poule ${c} gagné`);
    egal(pointsPari({ choix: 2, confiance: c }, poule), valeurs[1], `poule ${c} perdu`);
    for (const tour of ['SF', 'F']) {
      const m = match({ categorie: ATP_FINALS, tour });
      egal(pointsPari({ choix: 1, confiance: c }, m), valeurs[4], `${tour} ${c} gagné`);
      egal(pointsPari({ choix: 2, confiance: c }, m), valeurs[5], `${tour} ${c} perdu`);
    }
  }
});

test('multiplicateurs : valeurs du cahier des charges', () => {
  for (const cat of [MASTERS_1000, GRAND_CHELEM]) {
    egal(multiplicateurTour(cat, 'R16'), 1);
    egal(multiplicateurTour(cat, 'QF'), '1.5');
    egal(multiplicateurTour(cat, 'SF'), 2);
    egal(multiplicateurTour(cat, 'F'), 2);
  }
  egal(multiplicateurTour(ATP_FINALS, 'RR'), 1);
  egal(multiplicateurTour(ATP_FINALS, 'SF'), 2);
  egal(multiplicateurTour(ATP_FINALS, 'F'), 2);
});

test('tours invalides pour une catégorie : erreur explicite', () => {
  assert.throws(() => multiplicateurTour(GRAND_CHELEM, 'RR'), ErreurMoteur);
  assert.throws(() => multiplicateurTour(MASTERS_1000, 'RR'), ErreurMoteur);
  assert.throws(() => multiplicateurTour(ATP_FINALS, 'QF'), ErreurMoteur);
  assert.throws(() => multiplicateurTour(ATP_FINALS, 'R16'), ErreurMoteur);
  assert.throws(() => multiplicateurTour('wta', 'QF'), ErreurMoteur);
  assert.throws(() => multiplicateurTour(MASTERS_1000, 'R32'), ErreurMoteur);
});

test('gainsPossibles : barème affichable avant et après le pari', () => {
  const g = gainsPossibles(8, MASTERS_1000, 'QF');
  egal(g.gagne, 12);
  egal(g.perdu, '-1.5');
  const h = gainsPossibles(10, GRAND_CHELEM, 'F');
  egal(h.gagne, 20);
  egal(h.perdu, -34);
  assert.throws(() => gainsPossibles(5, MASTERS_1000, 'QF'), ErreurMoteur);
});

// ------------------------------------------------------------ Exemple A
test('Exemple A — quart ×1,5, Alcaraz–Fritz, Fritz gagne 7-6(4) 6-4', () => {
  const m = match({ vainqueur: 2, setsJoues: 2 }); // joueur 1 = Alcaraz, joueur 2 = Fritz
  const paris = {
    Pierre: { choix: 1, confiance: 8 },
    Léa: { choix: 1, confiance: 7 },
    Marc: { choix: 1, confiance: 9 },
    Thomas: { choix: 2, confiance: 6 },
  };
  egalObjet(pointsMatch(m, paris), { Pierre: '-1.5', Léa: 3, Marc: -9, Thomas: 9 }, 'exemple A');
});

// ------------------------------------------------------------ Exemple B
test('Exemple B — quart ×1,5, Djokovic–Medvedev, scénarios « si… »', () => {
  const paris = {
    Pierre: { choix: 1, confiance: 7 },
    Léa: { choix: 2, confiance: 6 },
    Marc: { choix: 1, confiance: 8 },
    Thomas: { choix: 1, confiance: 9 },
  };
  egalObjet(
    pointsMatch(match({ vainqueur: 1 }), paris),
    { Pierre: '10.5', Léa: 6, Marc: 12, Thomas: '13.5' },
    'Djokovic gagne',
  );
  egalObjet(
    pointsMatch(match({ vainqueur: 2 }), paris),
    { Pierre: 3, Léa: 9, Marc: '-1.5', Thomas: -9 },
    'Medvedev gagne',
  );
});

// ------------------------------------------------------------ Exemple C et bonus de sets
test('Exemple C — Grand Chelem quart ×1,5', () => {
  const gc = (o) => match({ categorie: GRAND_CHELEM, tour: 'QF', ...o });
  // confiance 8, bon vainqueur, bon nombre de sets : (8 + 1) × 1,5 = 13,5
  egal(pointsPari({ choix: 1, confiance: 8, sets: 4 }, gc({ vainqueur: 1, setsJoues: 4 })), '13.5');
  // confiance 8, mauvais vainqueur, pari à 5 sets, match en 5 sets : (−1 + 0,5) × 1,5 = −0,75
  egal(pointsPari({ choix: 1, confiance: 8, sets: 5 }, gc({ vainqueur: 2, setsJoues: 5 })), '-0.75');
  // confiance 8, mauvais vainqueur, pari à 4 sets, 5 sets joués : −1 × 1,5 = −1,5 (pas de bonus)
  egal(pointsPari({ choix: 1, confiance: 8, sets: 4 }, gc({ vainqueur: 2, setsJoues: 5 })), '-1.5');
});

test('bonus de sets : bon vainqueur mais mauvais nombre de sets = pas de bonus', () => {
  const m = match({ categorie: GRAND_CHELEM, tour: 'R16', vainqueur: 1, setsJoues: 5 });
  egal(pointsPari({ choix: 1, confiance: 8, sets: 3 }, m), 8);
  egal(pointsPari({ choix: 1, confiance: 8, sets: 4 }, m), 8);
  egal(pointsPari({ choix: 1, confiance: 8, sets: 5 }, m), 9);
});

test('bonus de sets : 3, 4 et 5 sets sont tous récompensés quand ils sont exacts', () => {
  for (const sets of [3, 4, 5]) {
    const m = match({ categorie: GRAND_CHELEM, tour: 'R16', vainqueur: 2, setsJoues: sets });
    egal(pointsPari({ choix: 2, confiance: 6, sets }, m), 7, `${sets} sets`);
  }
});

test('bonus de sets : mauvais vainqueur — seul le pari à 5 sets sur un match en 5 sets rapporte +0,5', () => {
  const base = { categorie: GRAND_CHELEM, tour: 'R16', vainqueur: 2 };
  egal(pointsPari({ choix: 1, confiance: 8, sets: 5 }, match({ ...base, setsJoues: 5 })), '-0.5');
  egal(pointsPari({ choix: 1, confiance: 8, sets: 5 }, match({ ...base, setsJoues: 4 })), -1);
  egal(pointsPari({ choix: 1, confiance: 8, sets: 4 }, match({ ...base, setsJoues: 4 })), -1); // sets exacts mais vainqueur faux
  egal(pointsPari({ choix: 1, confiance: 8, sets: 3 }, match({ ...base, setsJoues: 3 })), -1);
});

test('bonus de sets : multiplié avec le tour (demi-finale ×2 : (10+1)×2 et (−17+0,5)×2)', () => {
  const sf = (o) => match({ categorie: GRAND_CHELEM, tour: 'SF', ...o });
  egal(pointsPari({ choix: 1, confiance: 10, sets: 3 }, sf({ vainqueur: 1, setsJoues: 3 })), 22);
  egal(pointsPari({ choix: 2, confiance: 10, sets: 5 }, sf({ vainqueur: 1, setsJoues: 5 })), -33);
});

test('bonus de sets : jamais en Masters 1000 ni en ATP Finals', () => {
  egal(pointsPari({ choix: 1, confiance: 8, sets: 3 }, match({ vainqueur: 1, setsJoues: 3 })), 12);
  egal(pointsPari({ choix: 1, confiance: 8, sets: 5 }, match({ categorie: ATP_FINALS, tour: 'SF', vainqueur: 2, setsJoues: 5 })), -2);
});

test('Grand Chelem : points tolérants si le nombre de sets manque (aucun bonus, pas de plantage)', () => {
  egal(pointsPari({ choix: 1, confiance: 8 }, match({ categorie: GRAND_CHELEM, tour: 'QF', vainqueur: 1, setsJoues: 3 })), 12);
});

// ------------------------------------------------------------ Exemple D : abandon, forfait, neutralisation
test('Exemple D — abandon : points ÷ 2 après multiplicateur', () => {
  // Masters 1000, quart ×1,5, confiance 8 gagnée, abandon : 12 / 2 = 6
  egal(pointsPari({ choix: 1, confiance: 8 }, match({ vainqueur: 1, finMatch: 'abandon' })), 6);
  // Masters 1000, quart, confiance 10 perdue, abandon : −25,5 / 2 = −12,75
  egal(pointsPari({ choix: 2, confiance: 10 }, match({ vainqueur: 1, finMatch: 'abandon' })), '-12.75');
});

test('Exemple D — abandon en Grand Chelem : pas de bonus de sets, puis ÷ 2', () => {
  const m = match({ categorie: GRAND_CHELEM, tour: 'QF', vainqueur: 1, setsJoues: 3, finMatch: 'abandon' });
  // bon vainqueur + bon nombre de sets : (8) × 1,5 / 2 = 6, PAS (8+1) × 1,5 / 2
  egal(pointsPari({ choix: 1, confiance: 8, sets: 3 }, m), 6);
  // mauvais vainqueur, pari à 5 sets, 5 sets joués : pas de +0,5 -> (−1) × 1,5 / 2 = −0,75
  const m5 = match({ categorie: GRAND_CHELEM, tour: 'QF', vainqueur: 2, setsJoues: 5, finMatch: 'abandon' });
  egal(pointsPari({ choix: 1, confiance: 8, sets: 5 }, m5), '-0.75');
});

test('abandon : tous les cas de confiance et de tour (÷ 2 exact, jusqu’à 2 décimales)', () => {
  // [confiance, tour, gagné/perdu attendu avec abandon]
  const cas = [
    [6, 'R16', true, '3'],
    [6, 'R16', false, '2'],
    [7, 'QF', false, '1.5'],
    [8, 'QF', false, '-0.75'],
    [9, 'SF', false, '-6'],
    [10, 'F', false, '-17'],
    [10, 'F', true, '10'],
    [7, 'QF', true, '5.25'],
  ];
  for (const [confiance, tour, gagne, attendu] of cas) {
    const m = match({ tour, vainqueur: 1, finMatch: 'abandon' });
    egal(pointsPari({ choix: gagne ? 1 : 2, confiance }, m), attendu, `${tour} conf ${confiance} ${gagne ? 'gagné' : 'perdu'}`);
  }
});

test('Exemple D — forfait avant le début : 0 pour tout le monde', () => {
  const paris = { A: { choix: 1, confiance: 10 }, B: { choix: 2, confiance: 6 } };
  egalObjet(pointsMatch(match({ finMatch: 'forfait', vainqueur: 1 }), paris), { A: 0, B: 0 }, 'forfait avec vainqueur');
  egalObjet(pointsMatch(match({ finMatch: 'forfait', vainqueur: null }), paris), { A: 0, B: 0 }, 'forfait sans vainqueur');
  const gc = match({ categorie: GRAND_CHELEM, finMatch: 'forfait', vainqueur: 2, setsJoues: 0 });
  egal(pointsPari({ choix: 2, confiance: 9, sets: 3 }, gc), 0);
});

test('neutralisation : le match compte 0 pour tous, même terminé ou sans vainqueur', () => {
  const paris = { A: { choix: 1, confiance: 10 }, B: { choix: 2, confiance: 9 } };
  egalObjet(pointsMatch(match({ neutralise: true, vainqueur: 1 }), paris), { A: 0, B: 0 }, 'neutralisé terminé');
  egalObjet(pointsMatch(match({ neutralise: true, vainqueur: null }), paris), { A: 0, B: 0 }, 'neutralisé non joué');
});

// ------------------------------------------------------------ matchs non terminés
test('match non terminé : pas de points (null), aucun résultat prématuré', () => {
  const paris = { A: { choix: 1, confiance: 8 } };
  assert.equal(pointsMatch(match({ vainqueur: null }), paris), null);
  assert.equal(matchCompte(match({ vainqueur: null })), false);
  assert.equal(matchCompte(match({ vainqueur: 1 })), true);
  assert.equal(matchCompte(match({ vainqueur: null, neutralise: true })), true);
  assert.equal(matchCompte(match({ vainqueur: null, finMatch: 'forfait' })), true);
  assert.throws(() => pointsPari({ choix: 1, confiance: 8 }, match({ vainqueur: null })), ErreurMoteur);
});

test('match terminé sans pari : objet vide', () => {
  assert.deepEqual(pointsMatch(match({ vainqueur: 1 }), {}), {});
});

// ------------------------------------------------------------ validations
test('pointsPari : refuse un pari invalide (choix, confiance)', () => {
  const m = match({ vainqueur: 1 });
  for (const mauvais of [
    { choix: 3, confiance: 8 },
    { choix: 0, confiance: 8 },
    { choix: 1, confiance: 5 },
    { choix: 1, confiance: 11 },
    { choix: 1, confiance: 7.5 },
    { choix: 1, confiance: '8' },
    { choix: 1 },
    null,
  ]) {
    assert.throws(() => pointsPari(mauvais, m), ErreurMoteur, JSON.stringify(mauvais));
  }
});

test('pointsPari : refuse un type de fin de match inconnu', () => {
  assert.throws(() => pointsPari({ choix: 1, confiance: 8 }, match({ finMatch: 'disqualification' })), ErreurMoteur);
});

test('validerPari : contrôle de saisie, messages en français', () => {
  assert.deepEqual(validerPari({ choix: 1, confiance: 8 }, MASTERS_1000), []);
  assert.deepEqual(validerPari({ choix: 2, confiance: 10 }, ATP_FINALS), []);
  assert.deepEqual(validerPari({ choix: 1, confiance: 6, sets: 4 }, GRAND_CHELEM), []);
  assert.equal(validerPari({ choix: 1, confiance: 5 }, MASTERS_1000).length, 1);
  assert.equal(validerPari({ choix: 1, confiance: 6.5 }, MASTERS_1000).length, 1);
  assert.equal(validerPari({ choix: 9, confiance: 8 }, MASTERS_1000).length, 1);
  assert.equal(validerPari({ choix: 1, confiance: 8 }, GRAND_CHELEM).length, 1, 'sets obligatoires en Grand Chelem');
  assert.equal(validerPari({ choix: 1, confiance: 8, sets: 2 }, GRAND_CHELEM).length, 1);
  assert.equal(validerPari({ choix: 1, confiance: 8, sets: 6 }, GRAND_CHELEM).length, 1);
  assert.equal(validerPari({ choix: 1, confiance: 8, sets: 3 }, MASTERS_1000).length, 1, 'sets interdits hors Grand Chelem');
  assert.equal(validerPari({ choix: 1, confiance: 8, sets: null }, MASTERS_1000).length, 0);
  assert.ok(validerPari({ choix: 1, confiance: 5 }, MASTERS_1000)[0].includes('6 à 10'));
});

test('pointsMatch : un match d’une autre catégorie que le tour demandé est refusé', () => {
  assert.throws(() => pointsMatch(match({ categorie: GRAND_CHELEM, tour: 'RR', vainqueur: 1 }), { A: { choix: 1, confiance: 8, sets: 3 } }), ErreurMoteur);
});
