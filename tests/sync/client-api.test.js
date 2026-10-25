import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creerClientApi, construireChemin, interpreterUsage, ErreurApi, ErreurQuotaJour } from '../../src/sync/client-api.js';

/** Faux fetch : rejoue une liste de réponses {status, json, headers} ou d'erreurs. */
function faux(reponses) {
  const appels = [];
  const f = async (url, opts) => {
    appels.push({ url, opts });
    const r = reponses[Math.min(appels.length - 1, reponses.length - 1)];
    if (r instanceof Error) throw r;
    return { status: r.status, json: async () => { if (r.json === 'invalide') throw new SyntaxError('x'); return r.json; }, headers: { get: (k) => r.headers?.[k] ?? null } };
  };
  return { f, appels };
}
const client = (reponses, extra = {}) => {
  const { f, appels } = faux(reponses);
  const pauses = [];
  const journal = [];
  const c = creerClientApi({
    cle: 'CLE-SECRETE', fetchImpl: f, dormirImpl: async (ms) => { pauses.push(ms); }, surAppel: async (x) => { journal.push(x); }, ...extra,
  });
  return { c, appels, pauses, journal };
};

test('construireChemin garde l\'ordre et ignore les valeurs vides', () => {
  assert.equal(construireChemin('/matches', { tournament_id: 1725, status: 'upcoming', x: undefined, y: null, z: '' }), '/matches?tournament_id=1725&status=upcoming');
  assert.equal(construireChemin('/usage'), '/usage');
  assert.equal(construireChemin('/matches', { q: 'a b&c' }), '/matches?q=a%20b%26c');
});

test('succès : clé dans l\'en-tête Authorization, jamais dans l\'adresse', async () => {
  const { c, appels, journal } = client([{ status: 200, json: { data: [1] } }]);
  const r = await c.get('/matches', { status: 'live' });
  assert.deepEqual(r, { status: 200, json: { data: [1] } });
  assert.equal(appels.length, 1);
  assert.match(appels[0].url, /^https:\/\/api\.livetennisapi\.com\/api\/public\/v1\/matches\?status=live$/);
  assert.equal(appels[0].opts.headers.Authorization, 'Bearer CLE-SECRETE');
  assert.ok(!appels[0].url.includes('CLE-SECRETE'));
  assert.deepEqual(journal.map((j) => [j.chemin, j.status, j.ok]), [['/matches?status=live', 200, true]]);
});

test('erreur 5xx : nouvelles tentatives à pause croissante puis succès ; chaque tentative est journalisée', async () => {
  const { c, appels, pauses, journal } = client([{ status: 503, json: {} }, { status: 502, json: {} }, { status: 200, json: { ok: 1 } }]);
  const r = await c.get('/x');
  assert.equal(r.json.ok, 1);
  assert.equal(appels.length, 3);
  assert.deepEqual(pauses, [2000, 6000]);
  assert.deepEqual(journal.map((j) => [j.status, j.ok]), [[503, false], [502, false], [200, true]]);
});

test('erreur réseau : réessai, puis échec après épuisement des tentatives', async () => {
  const { c, appels, pauses, journal } = client([new TypeError('fetch failed')]);
  await assert.rejects(c.get('/x'), (e) => e instanceof ErreurApi && /réseau/.test(e.message));
  assert.equal(appels.length, 4);
  assert.deepEqual(pauses, [2000, 6000, 15000]);
  assert.equal(journal.length, 4);
  assert.ok(journal.every((j) => j.status === 0 && j.ok === false));
});

test('erreurs définitives (400, 401, 403, 404) : aucune nouvelle tentative, message clair', async () => {
  for (const [st, motif] of [[400, /réponse 400/], [401, /clé d'API refusée/], [403, /offre insuffisante/], [404, /introuvable/]]) {
    const { c, appels, pauses } = client([{ status: st, json: { error: 'x' } }]);
    await assert.rejects(c.get('/x'), (e) => e instanceof ErreurApi && !(e instanceof ErreurQuotaJour) && e.status === st && motif.test(e.message));
    assert.equal(appels.length, 1, `HTTP ${st}`);
    assert.equal(pauses.length, 0);
  }
});

test('429 « par minute » : on patiente (Retry-After respecté, plafonné) et on réessaie', async () => {
  const { c, appels, pauses } = client([
    { status: 429, json: { error: 'rate_limited', scope: 'minute' }, headers: { 'retry-after': '10' } },
    { status: 429, json: { error: 'rate_limited', scope: 'minute' }, headers: { 'retry-after': '900' } },
    { status: 200, json: { ok: 1 } },
  ]);
  await c.get('/x');
  assert.equal(appels.length, 3);
  assert.deepEqual(pauses, [10000, 70000]);
});

test('429 « jour » : arrêt immédiat avec l\'heure de remise à zéro, sans nouvelle tentative', async () => {
  const { c, appels, journal } = client([{ status: 429, json: { error: 'quota_exceeded', scope: 'day', resets_at: '2026-10-26T00:00:00Z' } }]);
  await assert.rejects(c.get('/x'), (e) => e instanceof ErreurQuotaJour && e.resetA.toISOString() === '2026-10-26T00:00:00.000Z');
  assert.equal(appels.length, 1);
  assert.equal(journal[0].resetA.toISOString(), '2026-10-26T00:00:00.000Z');
  assert.equal(journal[0].ok, false);
});

test('429 abuse_throttled : traité comme un blocage du jour ; retry_at_epoch accepté', async () => {
  const { c, appels } = client([{ status: 429, json: { error: 'abuse_throttled', retry_at_epoch: 1790000000 } }]);
  await assert.rejects(c.get('/x'), (e) => e instanceof ErreurQuotaJour && e.resetA.getTime() === 1790000000000);
  assert.equal(appels.length, 1);
});

test('corps illisible : traité comme vide (succès sans contenu, ou échec selon le statut)', async () => {
  const { c } = client([{ status: 200, json: 'invalide' }]);
  assert.deepEqual(await c.get('/x'), { status: 200, json: null });
  const { c: c2 } = client([{ status: 404, json: 'invalide' }]);
  await assert.rejects(c2.get('/x'), /introuvable/);
});

test('la clé est obligatoire', () => {
  assert.throws(() => creerClientApi({}), /Clé d'API absente/);
});

test('interpreterUsage : forme RÉELLE de /usage (constatée le 25 oct. 2026)', () => {
  const reel = {
    as_of: '2026-10-25T13:45:43Z', base_tier: 'free', channel: 'key',
    history: [{ calls: 45, day: '2026-10-22', errors: 0 }, { calls: 2, day: '2026-10-23', errors: 0 }],
    limits: { per_day: 100, per_minute: 30 }, principal: 'key:3587', tier: 'free',
    today: { calls: 6, errors: 0, remaining_day: 94 },
  };
  const u = interpreterUsage(reel);
  assert.equal(u.utilise_jour, 6);
  assert.equal(u.restant_jour, 94);
  assert.equal(u.limite_jour, 100, 'la limite du jour est lue dans limits.per_day (et non celle de la minute)');
  assert.equal(interpreterUsage({ ...reel, today: { calls: 0, errors: 0, remaining_day: 100 } }).utilise_jour, 0);
});

test('interpreterUsage : formes plausibles de /usage', () => {
  assert.deepEqual(interpreterUsage({ day: { used: 12, limit: 100, remaining: 88 }, minute: { used: 1, limit: 10, remaining: 9 } }),
    { utilise_jour: 12, limite_jour: 100, restant_jour: 88 });
  assert.deepEqual(interpreterUsage({ data: { daily: { used: 30, limit: 100 } } }),
    { utilise_jour: 30, limite_jour: 100, restant_jour: 70 });
  assert.deepEqual(interpreterUsage({ requests_today: 5, limit_per_day: 100 }).limite_jour, 100);
  assert.deepEqual(interpreterUsage({ plan: 'free' }), { utilise_jour: null, limite_jour: null, restant_jour: null });
  assert.deepEqual(interpreterUsage(null), { utilise_jour: null, limite_jour: null, restant_jour: null });
  assert.deepEqual(interpreterUsage('texte'), { utilise_jour: null, limite_jour: null, restant_jour: null });
  // Les compteurs « par minute » ne doivent jamais être pris pour ceux du jour.
  assert.equal(interpreterUsage({ minute: { used: 3, limit: 10, remaining: 7 } }).utilise_jour, null);
});
