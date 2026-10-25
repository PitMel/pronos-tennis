import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculerCloture, executerClotures } from '../../src/sync/cloture.js';

// Tournoi Masters 1000 : demi-finale et finale (multiplicateur 2 chacune), trois joueurs A, B, C.
// Points des matchs (calculés à la main) : SF (vainqueur 1) A 8 gagne = 16 ; B 9 perd = −12 ; C 6 gagne = 12
//                                          F  (vainqueur 1) A 7 gagne = 14 ; B 10 gagne = 20 ; C 6 perd = 4×2 = 8
//   => A 30, B 8, C 20.
// Pari tournoi (Masters : 4) : résultat vainqueur W, finaliste X. A (W, X) : 4 + 4 + 4 = 12 ; B (X, W) : 4 + 4 = 8 ; C : 0
//   => après : A 42, B 16, C 20. Bonus : 1er A +12 ; 2e C +5  => finals A 54, B 16, C 25 ; rangs A 1, C 2, B 3.
const A = 'a', B = 'b', C = 'c';
const donnees = () => ({
  tournoi_id: 1, categorie: 'masters_1000', resultat: { vainqueur_id: 10, finaliste_id: 11 },
  matchs: [
    { id: 1, tour: 'SF', vainqueur: 1, sets_joues: 2, fin_match: 'normal', neutralise: false },
    { id: 2, tour: 'F', vainqueur: 1, sets_joues: 3, fin_match: 'normal', neutralise: false },
  ],
  groupes: [{
    test: true, joueurs: [A, B, C],
    paris: [
      { match_id: 1, joueur_id: A, choix: 1, confiance: 8, sets: null }, { match_id: 1, joueur_id: B, choix: 2, confiance: 9, sets: null },
      { match_id: 1, joueur_id: C, choix: 1, confiance: 6, sets: null },
      { match_id: 2, joueur_id: A, choix: 1, confiance: 7, sets: null }, { match_id: 2, joueur_id: B, choix: 1, confiance: 10, sets: null },
      { match_id: 2, joueur_id: C, choix: 2, confiance: 6, sets: null },
    ],
    paris_tournoi: [{ joueur_id: A, vainqueur_id: 10, finaliste_id: 11 }, { joueur_id: B, vainqueur_id: 11, finaliste_id: 10 }],
  }],
});
const par = (r) => Object.fromEntries(r.resultats.map((x) => [x.joueur_id, x]));

test('calculerCloture : valeurs calculées à la main (points des matchs, pari tournoi, bonus, rangs)', () => {
  const r = calculerCloture(donnees());
  const x = par(r);
  assert.deepEqual([x[A].points_matchs, x[B].points_matchs, x[C].points_matchs], ['30', '8', '20']);
  assert.deepEqual([x[A].points_pari_tournoi, x[B].points_pari_tournoi, x[C].points_pari_tournoi], ['12', '8', '0']);
  assert.deepEqual([x[A].bonus_classement, x[B].bonus_classement, x[C].bonus_classement], ['12', '0', '5']);
  assert.deepEqual([x[A].score_final, x[B].score_final, x[C].score_final], ['54', '16', '25']);
  assert.deepEqual([x[A].rang, x[C].rang, x[B].rang], [1, 2, 3]);
  assert.deepEqual([r.vainqueur_id, r.finaliste_id], [10, 11]);
});

test('calculerCloture : égalité à trois en tête = fractions exactes ; match neutralisé = 0 ; joueur sans pari = 0', () => {
  const d = donnees();
  d.groupes[0].paris = [];
  d.groupes[0].paris_tournoi = [];
  d.matchs[0].neutralise = true;
  const x = par(calculerCloture(d));
  assert.deepEqual([x[A].score_final, x[B].score_final, x[C].score_final], ['4', '4', '4'], 'bonus 1re place partagé entre les trois : 12/3 = 4');
  assert.deepEqual([x[A].rang, x[B].rang, x[C].rang], [1, 1, 1]);
  d.groupes[0].joueurs = [A, B];
  const y = par(calculerCloture(d));
  assert.deepEqual([y[A].bonus_classement, y[B].bonus_classement], ['6', '6']);
});

test('calculerCloture : les groupes sont calculés séparément, un abandon divise par deux, un forfait vaut 0', () => {
  const d = donnees();
  d.matchs[1].fin_match = 'abandon';
  d.groupes.push({ test: false, joueurs: ['z'], paris: [{ match_id: 1, joueur_id: 'z', choix: 1, confiance: 10, sets: null }], paris_tournoi: [] });
  const x = par(calculerCloture(d));
  assert.equal(x[A].points_matchs, '23', 'finale en abandon : 14/2 = 7 ; 16 + 7');
  assert.equal(x.z.points_matchs, '20', 'son groupe n\'est pas mélangé avec l\'autre');
  assert.equal(x.z.rang, 1);
  d.matchs[1].fin_match = 'forfait';
  assert.equal(par(calculerCloture(d))[A].points_matchs, '16');
});

function fausseBase({ candidats, donneesParTournoi = {}, echec = {} }) {
  const appels = { cloturer: [] };
  return {
    appels,
    clotureCandidats: async () => candidats,
    donneesCloture: async (id) => { if (echec[id]) throw new Error('boum'); return donneesParTournoi[id] ?? donnees(); },
    cloturer: async (id, res) => { appels.cloturer.push([id, res.length]); return { statut: 'cloture' }; },
  };
}
const cand = (id, o = {}) => ({ tournoi_id: id, nom: `T${id}`, finale_comptee: true, eligible: true, groupes: [{ test: true, avec_paris: true, matchs_non_reveles: 0 }], ...o });

test('executerClotures : clôt les tournois éligibles, signale ceux en attente, continue après une erreur', async () => {
  const base = fausseBase({
    candidats: [cand(1), cand(2, { eligible: false, groupes: [{ test: true, avec_paris: true, matchs_non_reveles: 2 }] }),
      cand(3, { eligible: false, finale_comptee: false }), cand(4), cand(5, { eligible: false, groupes: [{ test: false, avec_paris: false, matchs_non_reveles: 0 }] })],
    echec: { 4: true },
  });
  const lignes = [];
  const r = await executerClotures({ base, journal: (t) => lignes.push(t) });
  assert.deepEqual(r.clotures.map((c) => c.tournoi_id), [1]);
  assert.deepEqual(base.appels.cloturer, [[1, 3]]);
  assert.deepEqual(r.attente.map((a) => a.tournoi_id), [2, 5], 'T3 (finale non jouée) n\'est pas signalé');
  assert.match(r.attente[0].raison, /2 match\(s\) à compléter ou neutraliser \(groupe test\)/);
  assert.equal(r.erreurs.length, 1);
  assert.match(r.erreurs[0], /T4.*boum/);
  assert.ok(lignes.some((l) => /CLÔTURÉ/.test(l)));
});

test('executerClotures : en simulation, calcule mais n\'enregistre rien', async () => {
  const base = fausseBase({ candidats: [cand(1)] });
  const r = await executerClotures({ base, simulation: true });
  assert.deepEqual(base.appels.cloturer, []);
  assert.deepEqual(r.clotures, []);
});
