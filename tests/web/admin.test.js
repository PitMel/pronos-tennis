// Administration : résumé de la synchronisation (4.1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { depuisDuree } from '../../web/js/outils.js';
import { libelleEndpoint, resumerSynchro, htmlAdminAccueil, htmlAccesRefuse } from '../../web/js/admin.js';

const maintenant = new Date('2026-10-27T10:00:00Z');
const ligne = (id, minutesAvant, extra = {}) => ({
  id, date_appel: new Date(maintenant.getTime() - minutesAvant * 60000).toISOString(), endpoint: '/usage', http_status: 200, ok: true, quota_restant: null, message: '', reset_a: null, ...extra,
});

test('depuisDuree : minutes, heures, jours', () => {
  assert.equal(depuisDuree(new Date(maintenant - 20000).toISOString(), maintenant), 'à l’instant');
  assert.equal(depuisDuree(new Date(maintenant - 5 * 60000).toISOString(), maintenant), 'il y a 5 min');
  assert.equal(depuisDuree(new Date(maintenant - 200 * 60000).toISOString(), maintenant), 'il y a 3 h 20');
  assert.equal(depuisDuree(new Date(maintenant - 120 * 60000).toISOString(), maintenant), 'il y a 2 h');
  assert.equal(depuisDuree(new Date(maintenant - 3 * 24 * 3600000).toISOString(), maintenant), 'il y a 3 j');
  assert.equal(depuisDuree(null, maintenant), '');
  assert.equal(depuisDuree('pas une date', maintenant), '');
});

test('libelleEndpoint : chemin lisible', () => {
  assert.equal(libelleEndpoint('/usage'), '/usage');
  assert.equal(libelleEndpoint('/matches?tournament_id=1725&status=upcoming&draw=singles&limit=200'), '/matches · tournoi 1725 · upcoming');
  assert.equal(libelleEndpoint(null), '');
});

test('resumerSynchro : dernier appel, quota connu le plus récent, comptes sur 24 h, tri', () => {
  const lignes = [
    ligne(1, 3000), // plus de 24 h
    ligne(3, 60, { ok: false, http_status: 500, message: 'boom' }),
    ligne(2, 600, { quota_restant: 92, reset_a: '2026-10-28T00:00:00Z' }),
    ligne(4, 10),
  ];
  const r = resumerSynchro(lignes, maintenant);
  assert.equal(r.dernier.id, 4);
  assert.equal(r.dernierEchec.id, 3);
  assert.equal(r.dernierSucces.id, 4);
  assert.equal(r.quotaRestant, 92);
  assert.equal(r.appels24h, 3);
  assert.equal(r.appelsJour, 3); // depuis minuit UTC (10 h UTC) : les appels d'il y a 10, 60 et 600 minutes
  assert.equal(r.limiteJour, 100);
  assert.equal(r.echecs24h, 1);
  assert.deepEqual(r.recents.map((l) => l.id), [4, 3, 2, 1]);
  assert.deepEqual(r.alertes, []);
});

test('resumerSynchro : alertes (journal vide, dernier appel en échec, silence de plus de 48 h)', () => {
  assert.match(resumerSynchro([], maintenant).alertes[0], /jamais tourné/);
  assert.match(resumerSynchro([ligne(1, 5, { ok: false })], maintenant).alertes[0], /dernier appel a échoué/);
  assert.match(resumerSynchro([ligne(1, 60 * 49)], maintenant).alertes[0], /plus de 48 heures/);
  assert.equal(resumerSynchro([ligne(1, 60 * 47)], maintenant).alertes.length, 0);
  assert.equal(resumerSynchro(null, maintenant).quotaRestant, null);
});

test('page admin : chiffres, journal échappé, quota inconnu', () => {
  const html = htmlAdminAccueil({ synchro: [ligne(1, 5, { ok: false, message: '<script>x</script>' }), ligne(2, 30)], maintenant });
  assert.match(html, /Administration/);
  assert.match(html, /il y a 5 min/);
  assert.match(html, /<b>2 \/ 100<\/b>/);
  assert.doesNotMatch(html, /Quota annoncé/);
  assert.match(html, /Le dernier appel a échoué/);
  assert.doesNotMatch(html, /<script>x/);
  assert.match(html, /&lt;script&gt;x/);
  assert.match(htmlAdminAccueil({ synchro: [], maintenant }), /Le journal est vide/);
  assert.match(htmlAccesRefuse(), /réservée à l’administrateur/);
});
