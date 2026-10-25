import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARAMETRES, heureLocale, dansLaFenetre, matchsASurveiller, afficheDue, decider, selectionnerDetails } from '../../src/sync/planificateur.js';

const d = (s) => new Date(s);
// Heures d'été à Paris = UTC+2 (jusqu'au 25 oct. 2026 à 3 h), heures d'hiver = UTC+1 (ensuite).
const tournoi = (o = {}) => ({ id: 1, nom: 'Paris', categorie: 'masters_1000', etat: 'en_cours', date_debut: '2026-10-26', date_fin: '2026-11-01', api_ids: ['1725', '1726'], derniere_decouverte: null, finale_terminee: false, ...o });
const match = (o = {}) => ({ id: 1, api_id: 'A', tournament_id: 1, tour: 'QF', statut: 'a_venir', heure_prevue: '2026-10-28T13:00:00Z', debut_detecte: null, modifie_manuellement: false, ...o });
const etat = (o = {}) => ({ maintenant: null, appels_aujourdhui: 0, quota_epuise_jusqua: null, tournois: [tournoi()], matchs: [], ...o });

test('heureLocale et fenêtre 7 h – 1 h (heure de Paris), y compris au changement d\'heure', () => {
  assert.deepEqual(heureLocale(d('2026-10-24T12:00:00Z')), { heure: 14, minute: 0, jour: '2026-10-24' }); // été
  assert.deepEqual(heureLocale(d('2026-10-26T12:00:00Z')), { heure: 13, minute: 0, jour: '2026-10-26' }); // hiver
  assert.deepEqual(heureLocale(d('2026-10-24T22:30:00Z')), { heure: 0, minute: 30, jour: '2026-10-25' }); // passage au jour suivant
  // Été : 7 h Paris = 5 h UTC ; 1 h Paris = 23 h UTC
  assert.equal(dansLaFenetre(d('2026-10-24T04:59:00Z')), false);
  assert.equal(dansLaFenetre(d('2026-10-24T05:00:00Z')), true);
  assert.equal(dansLaFenetre(d('2026-10-24T22:59:00Z')), true);
  assert.equal(dansLaFenetre(d('2026-10-24T23:00:00Z')), false);
  // Hiver : 7 h Paris = 6 h UTC ; 1 h Paris = 0 h UTC
  assert.equal(dansLaFenetre(d('2026-10-26T05:59:00Z')), false);
  assert.equal(dansLaFenetre(d('2026-10-26T06:00:00Z')), true);
  assert.equal(dansLaFenetre(d('2026-10-26T23:59:00Z')), true);
  assert.equal(dansLaFenetre(d('2026-10-27T00:00:00Z')), false);
});

test('matchsASurveiller : en cours, bientôt, en retard raisonnable ; pas les matchs lointains ni verrouillés', () => {
  const now = d('2026-10-28T12:50:00Z');
  const e = etat({ matchs: [
    match({ api_id: 'encours', statut: 'en_cours', heure_prevue: '2026-10-28T10:00:00Z' }),
    match({ api_id: 'bientot', heure_prevue: '2026-10-28T13:10:00Z' }),
    match({ api_id: 'lointain', heure_prevue: '2026-10-28T14:00:00Z' }),
    match({ api_id: 'retard', heure_prevue: '2026-10-28T09:00:00Z' }),
    match({ api_id: 'tropretard', heure_prevue: '2026-10-28T03:00:00Z' }),
    match({ api_id: 'sansheure', heure_prevue: null }),
    match({ api_id: 'manuel', statut: 'en_cours', modifie_manuellement: true }),
  ] });
  assert.deepEqual(matchsASurveiller(e, now).map((m) => m.api_id), ['encours', 'bientot', 'retard', 'sansheure']);
});

test('afficheDue : jamais lue = due ; intervalle de 3 h en tournoi, 20 h hors tournoi ; finale terminée = jamais', () => {
  const now = d('2026-10-28T12:00:00Z');
  assert.equal(afficheDue(tournoi(), etat(), now).due, true);
  assert.equal(afficheDue(tournoi({ derniere_decouverte: '2026-10-28T09:30:00Z' }), etat(), now).due, false); // 2 h 30
  assert.equal(afficheDue(tournoi({ derniere_decouverte: '2026-10-28T08:59:00Z' }), etat(), now).due, true); // 3 h 01
  const hors = tournoi({ etat: 'a_venir', date_debut: '2027-03-01', date_fin: '2027-03-08' });
  assert.equal(afficheDue({ ...hors, derniere_decouverte: '2026-10-28T00:00:00Z' }, etat(), now).due, false);
  assert.equal(afficheDue({ ...hors, derniere_decouverte: '2026-10-27T10:00:00Z' }, etat(), now).due, true); // 26 h
  assert.equal(afficheDue(tournoi({ finale_terminee: true }), etat(), now).due, false);
  // la veille et le lendemain du tournoi comptent comme « actif »
  const veille = tournoi({ etat: 'a_venir', date_debut: '2026-10-29', date_fin: '2026-11-01', derniere_decouverte: '2026-10-28T08:00:00Z' });
  assert.equal(afficheDue(veille, etat(), now).due, true);
});

test('decider : hors fenêtre, quota épuisé annoncé, budget épuisé, aucun tournoi', () => {
  const nuit = d('2026-10-28T03:00:00Z');
  assert.deepEqual([decider({ maintenant: nuit, etat: etat() }).regime, decider({ maintenant: nuit, etat: etat() }).actions.length], ['hors_fenetre', 0]);
  const jour = d('2026-10-28T12:00:00Z');
  const ep = decider({ maintenant: jour, etat: etat({ quota_epuise_jusqua: '2026-10-29T00:00:00Z' }) });
  assert.equal(ep.regime, 'quota_epuise');
  assert.equal(decider({ maintenant: jour, etat: etat({ quota_epuise_jusqua: '2026-10-28T11:00:00Z' }) }).regime, 'actif', 'remise à zéro passée');
  assert.equal(decider({ maintenant: jour, etat: etat({ appels_aujourdhui: 90 }) }).regime, 'budget_epuise');
  assert.equal(decider({ maintenant: jour, etat: etat({ appels_aujourdhui: 89 }) }).restant, 1);
  assert.equal(decider({ maintenant: jour, etat: etat(), usage: { utilise_jour: 95, restant_jour: 5 } }).regime, 'budget_epuise', 'le compteur de l\'API prime s\'il est plus élevé');
  assert.equal(decider({ maintenant: jour, etat: etat(), usage: { utilise_jour: null, restant_jour: 12 } }).restant, 2, 'restant API moins réserve');
  const aucun = decider({ maintenant: jour, etat: etat({ tournois: [] }) });
  assert.deepEqual([aucun.regime, aucun.actions.length], ['repos', 0]);
});

test('decider : régime actif = direct si match à surveiller + affiches dues (une action par identifiant d\'API)', () => {
  const jour = d('2026-10-28T12:50:00Z');
  const p = decider({ maintenant: jour, etat: etat({ matchs: [match({ statut: 'en_cours' })] }) });
  assert.equal(p.regime, 'actif');
  assert.deepEqual(p.actions.map((a) => a.type === 'direct' ? 'direct' : `affiches:${a.api_id}`), ['direct', 'affiches:1725', 'affiches:1726']);
  assert.equal(p.restant, 90);
  // affiches déjà lues récemment : le direct seul
  const e2 = etat({ matchs: [match({ statut: 'en_cours' })], tournois: [tournoi({ derniere_decouverte: '2026-10-28T12:30:00Z' })] });
  assert.deepEqual(decider({ maintenant: jour, etat: e2 }).actions.map((a) => a.type), ['direct']);
  // rien à surveiller et affiches récentes : rien
  const e3 = etat({ matchs: [match({ heure_prevue: '2026-10-28T20:00:00Z' })], tournois: [tournoi({ derniere_decouverte: '2026-10-28T12:30:00Z' })] });
  const p3 = decider({ maintenant: jour, etat: e3 });
  assert.deepEqual([p3.actions.length, p3.raison], [0, 'rien à faire pour le moment']);
});

test('decider : régime quotidien hors tournoi, et le tournoi en cours passe en premier', () => {
  const jour = d('2026-10-28T12:00:00Z');
  const loin = tournoi({ id: 2, nom: 'Turin', etat: 'a_venir', date_debut: '2027-03-01', date_fin: '2027-03-08', api_ids: ['2794'] });
  const p = decider({ maintenant: jour, etat: etat({ tournois: [loin] }) });
  assert.deepEqual([p.regime, p.actions.length], ['quotidien', 1]);
  const mix = decider({ maintenant: jour, etat: etat({ tournois: [loin, tournoi()] }) });
  assert.deepEqual(mix.actions.map((a) => a.api_id), ['1725', '1726', '2794']);
});

test('decider : le budget limite le nombre d\'actions', () => {
  const jour = d('2026-10-28T12:00:00Z');
  const p = decider({ maintenant: jour, etat: etat({ appels_aujourdhui: 88, matchs: [match({ statut: 'en_cours' })] }) });
  assert.equal(p.restant, 2);
  assert.equal(p.actions.length, 2);
  assert.match(p.raison, /limités par le budget/);
});

test('selectionnerDetails : seulement les matchs censés être en cours mais absents du direct, dans la limite du budget', () => {
  const now = new Date(Date.parse('2026-10-28T13:00:00Z') - (Math.floor(Date.parse('2026-10-28T13:00:00Z') / 1800000) % 2) * 1800000); // créneau pair
  assert.equal(Math.floor(now.getTime() / 1800000) % 2, 0);
  const e = etat({ matchs: [
    match({ api_id: 'vu', statut: 'en_cours' }),
    match({ api_id: 'disparu', statut: 'en_cours' }),
    match({ api_id: 'enretard', heure_prevue: new Date(now.getTime() - 60 * 60000).toISOString() }),
    match({ api_id: 'futur', heure_prevue: new Date(now.getTime() + 60 * 60000).toISOString() }),
    match({ api_id: 'manuel', statut: 'en_cours', modifie_manuellement: true }),
    match({ api_id: 'sansheure', heure_prevue: null }),
  ] });
  const r = (o = {}) => selectionnerDetails({ etat: e, maintenant: now, vusEnDirect: new Set(['vu']), restant: 10, ...o }).map((m) => m.api_id);
  assert.deepEqual(r().sort(), ['disparu', 'enretard']);
  assert.deepEqual(r({ restant: 1 }).length, 1);
  assert.deepEqual(r({ restant: 0 }), []);
  assert.deepEqual(r({ vusEnDirect: null }), [], 'sans lecture du direct, aucune conclusion');
  // créneau impair : un match « à venir » en retard n'est vérifié qu'une fois par heure ; un match en cours l'est toujours
  const impair = new Date(now.getTime() + 1800000);
  assert.deepEqual(r({ maintenant: impair }), ['disparu']);
});

test('paramètres par défaut conformes au cahier des charges', () => {
  assert.equal(PARAMETRES.quotaJour, 100);
  assert.equal(PARAMETRES.reserve, 10);
  assert.equal(PARAMETRES.heureDebut, 7);
  assert.equal(PARAMETRES.heureFin, 1);
});
