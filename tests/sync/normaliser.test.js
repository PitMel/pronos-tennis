import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compterSets, interpreterStatut, normaliserMatch, normaliserListe } from '../../src/sync/normaliser.js';
import { matchApi, termine } from './fixtures.js';

const suivis = new Set(['1725', '1726']);

test('compterSets : sets joués d\'après les jeux, un set entamé compte, plafonné à 5', () => {
  // forme réelle de l'API : un couple [jeux p1, jeux p2] par set
  assert.equal(compterSets({ games: [[6, 4], [3, 6], [7, 5]] }), 3);
  assert.equal(compterSets({ games: [[1, 6], [6, 6]], sets: [0, 1] }), 2, 'exemple réel : 2e set en cours à 6-6');
  assert.equal(compterSets({ games: [[6, 0], [6, 0]] }), 2, 'deux sets blancs');
  assert.equal(compterSets({ games: [[6, 3], [4, 6], [2, 0]] }), 3, 'troisième set entamé (abandon)');
  assert.equal(compterSets({ games: [[6, 3], [4, 6], [0, 0]] }), 2, 'set à 0-0 non joué');
  assert.equal(compterSets({ games: [[6, 3], [3, 6], [6, 4], [4, 6], [7, 5], [1, 0]] }), 5, 'plafonné à 5');
  assert.equal(compterSets({ sets: [2, 0] }), 2, 'à défaut : score en sets');
  assert.equal(compterSets({ games: [], sets: [1, 1] }), 2);
  assert.equal(compterSets({ games: [[0, 0]], sets: [0, 0] }), null);
  assert.equal(compterSets(null), null);
  assert.equal(compterSets({}), null);
});

test('interpreterStatut : tous les cas de status / outcome', () => {
  assert.deepEqual(interpreterStatut({ status: 'upcoming' }).statut, 'a_venir');
  assert.equal(interpreterStatut({ status: 'live' }).statut, 'en_cours');
  const ok = interpreterStatut({ status: 'completed', outcome: 'completed' });
  assert.deepEqual([ok.statut, ok.fin_match, ok.anomalies.length], ['termine', 'normal', 0]);
  assert.equal(interpreterStatut({ status: 'completed' }).statut, 'termine', 'outcome absent = normal');
  const ab = interpreterStatut({ status: 'completed', outcome: 'retired' });
  assert.deepEqual([ab.statut, ab.fin_match, ab.anomalies.length], ['termine', 'abandon', 0]);
  const wo = interpreterStatut({ status: 'completed', outcome: 'walkover' });
  assert.deepEqual([wo.statut, wo.fin_match], ['termine', 'forfait']);
  const woAvenir = interpreterStatut({ status: 'upcoming', event_status: 'Walk Over' });
  assert.deepEqual([woAvenir.statut, woAvenir.fin_match], ['termine', 'forfait'], 'forfait resté « upcoming » côté API');
  const df = interpreterStatut({ status: 'completed', outcome: 'default' });
  assert.deepEqual([df.statut, df.fin_match, df.anomalies[0].code], ['termine', 'abandon', 'defaut']);
  for (const o of ['abandoned', 'unresolved']) {
    const r = interpreterStatut({ status: 'completed', outcome: o });
    assert.deepEqual([r.statut, r.anomalies[0].code], [null, 'sans_resultat']);
  }
  assert.equal(interpreterStatut({ status: 'cancelled' }).anomalies[0].code, 'match_annule');
  assert.equal(interpreterStatut({ status: 'cancelled' }).statut, null);
  assert.equal(interpreterStatut({ status: 'completed', outcome: 'bizarre' }).anomalies[0].code, 'outcome_inconnu');
  const inconnu = interpreterStatut({ status: 'postponed' });
  assert.deepEqual([inconnu.statut, inconnu.anomalies[0].code], [null, 'status_inconnu']);
  assert.equal(interpreterStatut({ status: 'live', outcome: 'walkover' }).statut, 'en_cours', 'un match en direct n\'est jamais un forfait');
});

test('normaliserMatch : match terminé complet', () => {
  const r = normaliserMatch(termine({ id: 'A1', winner: 2 }), suivis);
  assert.equal(r.ignore, undefined);
  assert.equal(r.match.api_id, 'A1');
  assert.equal(r.match.tournament_api_id, '1725');
  assert.equal(r.match.tour, 'QF');
  assert.equal(r.match.statut, 'termine');
  assert.equal(r.match.vainqueur, 2);
  assert.equal(r.match.sets_joues, 3);
  assert.equal(r.match.fin_match, 'normal');
  assert.equal(r.match.heure_prevue, '2026-10-30T14:00:00.000Z');
  assert.deepEqual(r.match.score, { sets: [2, 1], games: [[6, 4], [3, 6], [7, 5]] });
  assert.equal(r.match.p1.nom, 'Joueur 1a'.replace('1', String(r.match.p1.api_id.match(/\d+/)[0])));
  assert.equal(typeof r.match.p1.classement, 'number');
  assert.deepEqual(r.anomalies, []);
});

test('normaliserMatch : sets_joues et vainqueur seulement pour un match terminé', () => {
  const enCours = normaliserMatch(matchApi({ status: 'live', winner: 1, score: { sets: [1, 0], games: [[6, 2], [3, 0]] } }), suivis).match;
  assert.equal(enCours.statut, 'en_cours');
  assert.equal(enCours.sets_joues, null);
  const avenir = normaliserMatch(matchApi(), suivis).match;
  assert.deepEqual([avenir.statut, avenir.vainqueur, avenir.sets_joues, avenir.score], ['a_venir', null, null, null]);
});

test('normaliserMatch : filtres (ATP, messieurs, simple, hors qualifs, tournoi suivi, tours suivis)', () => {
  const ign = (m) => normaliserMatch(m, suivis).ignore;
  assert.equal(ign(matchApi({ tour: 'wta' })), 'pas_atp');
  assert.equal(ign(matchApi({ gender: 'women' })), 'pas_messieurs');
  assert.equal(ign(matchApi({ draw: 'doubles' })), 'double');
  assert.equal(ign(matchApi({ is_doubles: true })), 'double');
  assert.equal(ign(matchApi({ draw: 'mixed' })), 'pas_simple');
  assert.equal(ign(matchApi({ is_qualifying: true })), 'qualification');
  assert.equal(ign(matchApi({ tournament_id: '999' })), 'tournoi_non_suivi');
  assert.equal(ign(matchApi({ tournament_id: null })), 'tournoi_non_suivi');
  assert.equal(ign(matchApi({ round_code: 'R32' })), 'tour_non_suivi');
  assert.equal(ign(matchApi({ round_code: null })), 'tour_non_suivi');
  assert.equal(ign({ tour: 'atp' }), 'sans_identifiant');
  assert.equal(ign(null), 'sans_identifiant');
  for (const t of ['R16', 'QF', 'SF', 'F', 'RR', 'qf']) assert.equal(ign(matchApi({ round_code: t })), undefined, t);
  assert.equal(normaliserMatch(matchApi({ round_code: 'qf' }), suivis).match.tour, 'QF');
  assert.equal(normaliserMatch(matchApi({ tournament_id: 1726 }), suivis).match.tournament_api_id, '1726', 'identifiant numérique accepté');
});

test('normaliserMatch : vainqueur invalide, joueurs manquants, heure invalide', () => {
  const r = normaliserMatch(termine({ winner: 3, scheduled_time: 'pas une date', players: { p1: { id: 'x', name: 'X' }, p2: null } }), suivis).match;
  assert.equal(r.vainqueur, null);
  assert.equal(r.heure_prevue, null);
  assert.equal(r.p2, null);
  assert.deepEqual(r.p1, { api_id: 'x', nom: 'X', pays: null, classement: null });
  const r2 = normaliserMatch(matchApi({ players: { p1: { id: '', name: 'Z' }, p2: { id: 7, name: 'Y', ranking: '12' } } }), suivis).match;
  assert.equal(r2.p1, null);
  assert.deepEqual(r2.p2, { api_id: '7', nom: 'Y', pays: null, classement: 12 });
});

test('normaliserListe : doublons d\'identifiant (le dernier gagne), compte des ignorés, anomalies avec identifiant', () => {
  const liste = [
    matchApi({ id: 'D1', status: 'upcoming' }),
    matchApi({ id: 'D1', status: 'live' }),
    matchApi({ id: 'D2', tour: 'wta' }),
    matchApi({ id: 'D3', draw: 'doubles' }),
    matchApi({ id: 'D4', draw: 'doubles' }),
    termine({ id: 'D5', outcome: 'abandoned' }),
  ];
  const r = normaliserListe(liste, suivis);
  assert.deepEqual(r.matchs.map((m) => [m.api_id, m.statut]), [['D1', 'en_cours'], ['D5', null]]);
  assert.deepEqual(r.ignores, { pas_atp: 1, double: 2 });
  assert.deepEqual(r.anomalies.map((a) => [a.api_id, a.code]), [['D5', 'sans_resultat']]);
  assert.deepEqual(normaliserListe(null, suivis), { matchs: [], anomalies: [], ignores: {} });
  assert.deepEqual(normaliserListe({ data: [] }, suivis).matchs, []);
});
