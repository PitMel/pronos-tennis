import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creerBaseSupabase } from '../../src/sync/base.js';

const rep = (status, corps) => ({ status, ok: status < 300, text: async () => (corps === undefined ? '' : JSON.stringify(corps)) });
function faux(reponses) {
  const appels = [];
  return { appels, f: async (url, o) => { appels.push({ url, o }); const r = reponses[Math.min(appels.length - 1, reponses.length - 1)]; if (r instanceof Error) throw r; return r; } };
}
const mk = (reponses, cle = 'sb_secret_abcdef') => {
  const { f, appels } = faux(reponses);
  const pauses = [];
  return { base: creerBaseSupabase({ url: 'https://x.supabase.co/', cle, fetchImpl: f, dormirImpl: async (ms) => { pauses.push(ms); } }), appels, pauses };
};

test('appel d\'une fonction : adresse, méthode, corps et en-têtes (clé « secrète » uniquement dans apikey)', async () => {
  const { base, appels } = mk([rep(200, { crees: 1 })]);
  assert.deepEqual(await base.appliquer({ matchs: [] }), { crees: 1 });
  assert.equal(appels[0].url, 'https://x.supabase.co/rest/v1/rpc/sync_appliquer');
  assert.equal(appels[0].o.method, 'POST');
  assert.deepEqual(JSON.parse(appels[0].o.body), { p_payload: { matchs: [] } });
  assert.equal(appels[0].o.headers.apikey, 'sb_secret_abcdef');
  assert.equal(appels[0].o.headers.Authorization, undefined);
});

test('ancienne clé « service_role » (jeton eyJ…) : envoyée aussi en Authorization', async () => {
  const { base, appels } = mk([rep(200, {})], 'eyJhbGciOi.xxx.yyy');
  await base.etat();
  assert.equal(appels[0].o.headers.Authorization, 'Bearer eyJhbGciOi.xxx.yyy');
});

test('noms des paramètres de sync_enregistrer_appel', async () => {
  const { base, appels } = mk([rep(200, null)]);
  await base.enregistrerAppel({ endpoint: '/matches', httpStatus: 429, ok: false, message: 'm', resetA: '2026-10-26T00:00:00Z' });
  assert.deepEqual(JSON.parse(appels[0].o.body), {
    p_endpoint: '/matches', p_http_status: 429, p_ok: false, p_quota_restant: null, p_message: 'm', p_reset_a: '2026-10-26T00:00:00Z',
  });
});

test('erreur 5xx ou réseau : nouvelles tentatives ; erreur 4xx : tout de suite', async () => {
  let t = mk([rep(503, { m: 'x' }), new TypeError('fetch failed'), rep(200, { ok: 1 })]);
  assert.deepEqual(await t.base.etat(), { ok: 1 });
  assert.equal(t.appels.length, 3);
  assert.deepEqual(t.pauses, [1000, 4000]);
  t = mk([rep(400, { message: 'mauvais' })]);
  await assert.rejects(t.base.etat(), /sync_etat : réponse 400.*mauvais/);
  assert.equal(t.appels.length, 1);
  t = mk([rep(500, {})]);
  await assert.rejects(t.base.etat(), /réponse 500/);
  assert.equal(t.appels.length, 4);
});

test('configuration absente', () => {
  assert.throws(() => creerBaseSupabase({ url: '', cle: 'x' }), /absente/);
  assert.throws(() => creerBaseSupabase({ url: 'https://x', cle: '' }), /absente/);
});
