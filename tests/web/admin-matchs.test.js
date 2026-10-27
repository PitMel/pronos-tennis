// Matchs admin (4.3) : lecture des sets, validation, conversion vers la base, HTML, écriture via faux Supabase, heures de Paris.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lireSetsFormulaire, interpreterSets, setsGagnes, validerMatch, matchPourBase, messageErreurMatch, htmlMatchsAdmin, htmlFormulaireMatch, valeursDepuisMatch } from '../../web/js/admin-matchs.js';
import { heureParisVersChamp, champVersHeureParis } from '../../web/js/outils.js';
import { creerDonnees } from '../../web/js/donnees.js';

const fini = { statut: 'termine', fin_match: 'normal', vainqueur: '1', set1_1: '6', set1_2: '4', set2_1: '7', set2_2: '6' };
const MASTERS = { categorie: 'masters_1000', creation: false };

test('heures de Paris : aller-retour, été, hiver, heure inexistante', () => {
  assert.equal(champVersHeureParis('2026-11-02T14:30'), '2026-11-02T13:30:00.000Z');
  assert.equal(champVersHeureParis('2026-07-02T14:30'), '2026-07-02T12:30:00.000Z');
  assert.equal(heureParisVersChamp('2026-11-02T13:30:00Z'), '2026-11-02T14:30');
  assert.equal(champVersHeureParis('2026-03-29T02:30'), null);
  assert.equal(champVersHeureParis(''), null);
  assert.equal(champVersHeureParis('n’importe quoi'), null);
  assert.equal(heureParisVersChamp(null), '');
});

test('lireSetsFormulaire / interpreterSets', () => {
  assert.equal(lireSetsFormulaire({}).length, 5);
  assert.deepEqual(interpreterSets(lireSetsFormulaire(fini)), { sets: [[6, 4], [7, 6]], erreur: null });
  assert.match(interpreterSets([['6', ''], ['', ''], ['', ''], ['', ''], ['', '']]).erreur, /deux joueurs/);
  assert.match(interpreterSets([['x', '3'], ['', ''], ['', ''], ['', ''], ['', '']]).erreur, /nombres/);
  assert.match(interpreterSets([['6', '4'], ['', ''], ['6', '3'], ['', ''], ['', '']]).erreur, /vide/);
  assert.match(interpreterSets([['-1', '4'], ['', ''], ['', ''], ['', ''], ['', '']]).erreur, /nombres/);
});

test('setsGagnes : le set entamé et l’égalité ne comptent pour personne', () => {
  assert.deepEqual(setsGagnes([[6, 4], [3, 6], [6, 6]]), { p1: 1, p2: 1 });
});

test('validerMatch : match terminé correct', () => {
  assert.deepEqual(validerMatch(fini, MASTERS), []);
  assert.deepEqual(validerMatch({ ...fini, vainqueur: '' , neutralise: true }, MASTERS), []);
});

test('validerMatch : vainqueur obligatoire, cohérence du score, nombre de sets', () => {
  assert.match(validerMatch({ ...fini, vainqueur: '' }, MASTERS).join(), /vainqueur/);
  assert.match(validerMatch({ ...fini, vainqueur: '2' }, MASTERS).join(), /ne correspond pas/);
  assert.match(validerMatch({ ...fini, set2_1: '', set2_2: '' }, MASTERS).join(), /au moins 2 sets/);
  const quatre = { ...fini, set3_1: '6', set3_2: '3', set4_1: '6', set4_2: '1' };
  assert.match(validerMatch(quatre, MASTERS).join(), /3 sets au plus/);
  assert.deepEqual(validerMatch({ ...quatre, vainqueur: '1', set3_1: '3', set3_2: '6', set4_1: '6', set4_2: '3', set5_1: '', set5_2: '' }, { categorie: 'grand_slam', creation: false }), []);
});

test('validerMatch : abandon, forfait, à venir, en cours', () => {
  assert.deepEqual(validerMatch({ statut: 'termine', fin_match: 'abandon', vainqueur: '2', set1_1: '3', set1_2: '2' }, MASTERS), []);
  assert.match(validerMatch({ statut: 'termine', fin_match: 'abandon', vainqueur: '2' }, MASTERS).join(), /au moins un set/);
  assert.deepEqual(validerMatch({ statut: 'termine', fin_match: 'forfait', vainqueur: '' }, MASTERS), []);
  assert.match(validerMatch({ statut: 'termine', fin_match: 'forfait', set1_1: '6', set1_2: '0' }, MASTERS).join(), /forfait/i);
  assert.match(validerMatch({ statut: 'a_venir', fin_match: 'normal', vainqueur: '1' }, MASTERS).join(), /à venir/);
  assert.match(validerMatch({ statut: 'a_venir', fin_match: 'normal', set1_1: '1', set1_2: '0' }, MASTERS).join(), /score/);
  assert.deepEqual(validerMatch({ statut: 'en_cours', fin_match: 'normal', set1_1: '3', set1_2: '2' }, MASTERS), []);
  assert.match(validerMatch({ statut: 'en_cours', fin_match: 'normal', vainqueur: '1' }, MASTERS).join(), /terminé/);
});

test('validerMatch : création (tour, joueurs), statut et heure', () => {
  const base = { tour: 'QF', p1_id: '1', p2_id: '2', statut: 'a_venir', fin_match: 'normal' };
  assert.deepEqual(validerMatch(base, { categorie: 'masters_1000', creation: true }), []);
  assert.match(validerMatch({ ...base, tour: 'RR' }, { categorie: 'masters_1000', creation: true }).join(), /tour/);
  assert.deepEqual(validerMatch({ ...base, tour: 'RR' }, { categorie: 'atp_finals', creation: true }), []);
  assert.match(validerMatch({ ...base, p2_id: '1' }, { categorie: 'masters_1000', creation: true }).join(), /différents/);
  assert.match(validerMatch({ ...base, p1_id: '' }, { categorie: 'masters_1000', creation: true }).join(), /deux joueurs/);
  assert.match(validerMatch({ ...base, statut: 'x' }, { categorie: 'masters_1000', creation: true }).join(), /statut/);
  assert.match(validerMatch({ ...base, heure_prevue: '2026-03-29T02:30' }, { categorie: 'masters_1000', creation: true }).join(), /heure/);
});

test('matchPourBase : terminé avec score', () => {
  assert.deepEqual(matchPourBase({ ...fini, heure_prevue: '2026-11-02T14:30' }), {
    heure_prevue: '2026-11-02T13:30:00.000Z', statut: 'termine', vainqueur: 1, fin_match: 'normal', sets_joues: 2, score: { games: [[6, 4], [7, 6]] }, neutralise: false,
  });
});

test('matchPourBase : forfait sans score, à venir sans résultat, création', () => {
  const f = matchPourBase({ statut: 'termine', fin_match: 'forfait', vainqueur: '2', set1_1: '6', set1_2: '0' });
  assert.equal(f.score, null); assert.equal(f.sets_joues, null); assert.equal(f.vainqueur, 2); assert.equal(f.fin_match, 'forfait');
  const a = matchPourBase({ statut: 'a_venir', fin_match: 'abandon', vainqueur: '1', neutralise: 'on' });
  assert.equal(a.vainqueur, null); assert.equal(a.fin_match, 'normal'); assert.equal(a.neutralise, true); assert.equal(a.heure_prevue, null);
  const c = matchPourBase({ tour: 'SF', p1_id: '4', p2_id: '9', statut: 'a_venir', fin_match: 'normal' }, { tournoiId: 10, creation: true });
  assert.deepEqual([c.tournament_id, c.tour, c.p1_id, c.p2_id], [10, 'SF', 4, 9]);
});

test('matchPourBase : en cours garde le score en direct sans vainqueur ni sets joués', () => {
  const e = matchPourBase({ statut: 'en_cours', fin_match: 'normal', set1_1: '3', set1_2: '2' });
  assert.deepEqual(e.score, { games: [[3, 2]] }); assert.equal(e.sets_joues, null); assert.equal(e.vainqueur, null);
});

test('messageErreurMatch', () => {
  assert.match(messageErreurMatch({ code: '23514' }), /refusée/);
  assert.match(messageErreurMatch({ code: '42501' }), /administrateur/);
  assert.match(messageErreurMatch({ message: "Le tour « RR » n'existe pas dans un tournoi de catégorie « masters_1000 »." }), /tour/);
  assert.match(messageErreurMatch(new TypeError('Failed to fetch')), /connexion/);
  assert.match(messageErreurMatch(null), /échoué/);
});

const tournoi = { id: 10, nom: 'Masters de Paris', categorie: 'masters_1000' };
const joueurs = new Map([[1, { nom: 'Alcaraz' }], [2, { nom: 'Sinner' }], [3, { nom: 'Zverev <i>' }]]);
const matchs = [
  { id: 5, tour: 'QF', p1_id: 1, p2_id: 2, statut: 'termine', vainqueur: 2, fin_match: 'normal', score: { games: [[4, 6], [3, 6]] }, neutralise: false, modifie_manuellement: true, heure_prevue: null },
  { id: 6, tour: 'R16', p1_id: 3, p2_id: 1, statut: 'a_venir', vainqueur: null, fin_match: 'normal', score: null, neutralise: true, modifie_manuellement: false, heure_prevue: '2026-11-02T13:30:00Z' },
];

test('htmlMatchsAdmin : tours dans l’ordre, résultat du côté du vainqueur, étiquettes, échappement', () => {
  const h = htmlMatchsAdmin({ tournoi, matchs, joueurs });
  assert.ok(h.indexOf('Huitièmes') < h.indexOf('Quarts'));
  assert.match(h, /href="#\/admin\/match\/5"/);
  assert.match(h, /Victoire : Sinner · 6-4 6-3/);
  assert.match(h, /Neutralisé/);
  assert.match(h, /À la main/);
  assert.match(h, /Zverev &lt;i&gt;/);
  assert.match(h, /href="#\/admin\/tournoi\/10\/match\/nouveau"/);
  assert.match(htmlMatchsAdmin({ tournoi, matchs: [], joueurs }), /Aucun match/);
});

test('valeursDepuisMatch : sets et heure de Paris', () => {
  const v = valeursDepuisMatch({ ...matchs[0], heure_prevue: '2026-11-02T13:30:00Z' });
  assert.equal(v.set1_1, '4'); assert.equal(v.set2_2, '6'); assert.equal(v.set3_1, ''); assert.equal(v.vainqueur, '2'); assert.equal(v.heure_prevue, '2026-11-02T14:30');
});

test('htmlFormulaireMatch : modification = joueurs figés, suppression avec nombre de paris', () => {
  const h = htmlFormulaireMatch({ tournoi, match: matchs[0], joueurs, nbParis: 3 });
  assert.match(h, /data-id="5"/);
  assert.ok(!h.includes('name="p1_id"'));
  assert.match(h, /<b>Alcaraz<\/b> contre <b>Sinner<\/b>/);
  assert.match(h, /<b>3 paris<\/b>/);
  assert.match(h, /data-action="ad-supprimer-match" data-match="5"/);
  assert.match(h, /<option value="2" selected>Sinner/);
  assert.match(htmlFormulaireMatch({ tournoi, match: matchs[0], joueurs, nbParis: 0 }), /Aucun pari/);
});

test('htmlFormulaireMatch : création = choix de tour et de joueurs triés, pas de suppression', () => {
  const h = htmlFormulaireMatch({ tournoi, joueurs: [{ id: 2, nom: 'Sinner' }, { id: 1, nom: 'Alcaraz' }] });
  assert.match(h, /data-id="nouveau"/);
  assert.ok(h.indexOf('Alcaraz') < h.indexOf('Sinner'));
  assert.ok(!h.includes('ad-supprimer-match'));
  assert.match(h, /name="p2_id"/);
  assert.ok(!h.includes('value="RR"'));
});

test('htmlFormulaireMatch : erreurs et saisie conservée', () => {
  const h = htmlFormulaireMatch({ tournoi, match: matchs[0], joueurs, valeurs: { ...valeursDepuisMatch(matchs[0]), set1_1: '9' }, erreurs: ['Oups'] });
  assert.match(h, /name="set1_1"[^>]*value="9"/);
  assert.match(h, /role="alert">Oups/);
});

// --- écriture (faux client Supabase) ---
function faux({ data = [{ id: 7 }], error = null } = {}) {
  const appels = [];
  const chaine = (op, table, valeurs) => {
    const c = { eq(col, v) { appels.push(['eq', col, v]); return c; }, select() { appels.push([op, table, valeurs]); return Promise.resolve({ data, error }); } };
    return c;
  };
  return { appels, from: (t) => ({ insert: (v) => chaine('insert', t, v), update: (v) => chaine('update', t, v), delete: () => chaine('delete', t) }) };
}

test('enregistrerMatch : création, modification, refus (0 ligne), erreur', async () => {
  const c = faux();
  assert.equal(await creerDonnees(c).enregistrerMatch({ valeurs: { tour: 'QF' } }), 7);
  assert.deepEqual(c.appels[0], ['insert', 'matches', { tour: 'QF' }]);
  const d = faux();
  assert.equal(await creerDonnees(d).enregistrerMatch({ id: 5, valeurs: { statut: 'termine' } }), 5);
  assert.deepEqual(d.appels, [['eq', 'id', 5], ['update', 'matches', { statut: 'termine' }]]);
  await assert.rejects(creerDonnees(faux({ data: [] })).enregistrerMatch({ id: 5, valeurs: {} }), { code: '42501' });
  await assert.rejects(creerDonnees(faux({ data: null, error: { code: '23514' } })).enregistrerMatch({ valeurs: {} }), { code: '23514' });
});

test('supprimerMatch : suppression et refus', async () => {
  const c = faux({ data: [{ id: 5 }] });
  await creerDonnees(c).supprimerMatch(5);
  assert.deepEqual(c.appels, [['eq', 'id', 5], ['delete', 'matches', undefined]]);
  await assert.rejects(creerDonnees(faux({ data: [] })).supprimerMatch(5), { code: '42501' });
});
