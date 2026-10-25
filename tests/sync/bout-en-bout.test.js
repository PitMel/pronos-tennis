// Le programme de synchronisation (cli.js) de bout en bout : fausse API + vraie base PostgreSQL embarquée (migrations réelles).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { lancer, masquer } from '../../src/sync/cli.js';
import { creerMonde, ENV, CLE_API, CLE_SUPABASE, PARAMETRES_TEST } from './monde.js';
import { matchApi, termine } from './fixtures.js';

let w;
before(async () => { w = await creerMonde(); });

const dans = (minutes) => new Date(Date.now() + minutes * 60000).toISOString();
async function passer(argv = [], env = ENV) {
  const sortie = [];
  const code = await lancer({ argv, env, fetchImpl: w.fetchImpl.bind(w), sortie: (t) => sortie.push(t), parametres: PARAMETRES_TEST, dormirImpl: async () => {} });
  return { code, sortie, texte: sortie.join('\n') };
}
const matchsBase = async () => (await w.b.admin('select api_id, statut, vainqueur, sets_joues, tour from public.matches order by api_id')).rows;
const journal = async () => (await w.b.admin('select endpoint, http_status, ok, message from public.sync_log order by id')).rows;
const vieillir = (h) => w.b.admin(`update public.sync_log set date_appel = date_appel - interval '${h} hours'`);

const Q = (id, o = {}) => matchApi({ id, round_code: 'QF', tournament_id: '1725', scheduled_time: dans(180), ...o });

test('1. première passe : relit les affiches de chaque tournoi suivi, crée les matchs utiles, ignore le reste', async () => {
  w.upcoming['1725'] = [Q('Q1'), Q('Q2'), Q('Q3'), Q('Q4'),
    Q('W1', { tour: 'wta' }), Q('R1', { round_code: 'R32' }), Q('D1', { draw: 'doubles' }), Q('X1', { is_qualifying: true })];
  const r = await passer();
  assert.equal(r.code, 0, r.texte);
  assert.deepEqual(w.chemins().map((c) => c.split('&')[0]), ['/matches?tournament_id=1725', '/matches?tournament_id=1726', '/matches?tournament_id=2794']);
  assert.ok(w.appelsApi.includes('/usage'));
  assert.deepEqual((await matchsBase()).map((m) => [m.api_id, m.statut]), [['Q1', 'a_venir'], ['Q2', 'a_venir'], ['Q3', 'a_venir'], ['Q4', 'a_venir']]);
  const j = await journal();
  assert.equal(j.filter((x) => x.endpoint.startsWith('/matches')).length, 3, 'chaque requête HTTP est journalisée');
  assert.ok(j.every((x) => x.ok));
  assert.match(r.texte, /régime actif/);
});

test('2. deuxième passe aussitôt : rien n\'est dû, aucun appel à l\'API', async () => {
  w.reinitialiserAppels();
  const r = await passer();
  assert.equal(r.code, 0);
  assert.deepEqual(w.appelsApi, []);
  assert.match(r.texte, /rien à faire/);
});

test('3. un match va commencer : lecture du direct, passage « en cours » ; la base ne recule jamais', async () => {
  await w.b.admin(`update public.matches set heure_prevue = now() + interval '10 minutes' where api_id = 'Q1'`);
  w.live = [Q('Q1', { status: 'live', scheduled_time: dans(10), score: { sets: [1, 0], games: [[6, 3], [2, 0]] } })];
  w.reinitialiserAppels();
  const r = await passer();
  assert.equal(r.code, 0, r.texte);
  assert.deepEqual(w.chemins().map((c) => c.split('&')[0]), ['/matches?status=live']);
  assert.equal((await matchsBase()).find((m) => m.api_id === 'Q1').statut, 'en_cours');
});

test('4. le match disparaît du direct : son détail est demandé et confirme la fin (vainqueur, sets joués)', async () => {
  w.live = [];
  w.details.Q1 = termine({ id: 'Q1', round_code: 'QF', tournament_id: '1725', winner: 2, score: { sets: [1, 2], games: [[6, 3, 4], [2, 6, 6]] } });
  w.reinitialiserAppels();
  const r = await passer();
  assert.equal(r.code, 0, r.texte);
  assert.deepEqual(w.chemins().map((c) => c.split('?')[0]), ['/matches', '/matches/Q1']);
  const q1 = (await matchsBase()).find((m) => m.api_id === 'Q1');
  assert.deepEqual([q1.statut, q1.vainqueur, q1.sets_joues], ['termine', 2, 3]);
});

test('5. une incohérence de l\'API est signalée dans le journal sans rien casser', async () => {
  await w.b.admin(`update public.matches set heure_prevue = now() + interval '5 minutes' where api_id = 'Q2'`);
  w.live = [];
  w.details.Q2 = termine({ id: 'Q2', round_code: 'QF', tournament_id: '1725', outcome: 'abandoned' });
  await w.b.admin(`update public.matches set statut = 'en_cours' where api_id = 'Q2'`);
  w.reinitialiserAppels();
  const r = await passer();
  assert.equal(r.code, 0, r.texte);
  assert.match(r.texte, /anomalie sans_resultat \(match Q2\)/);
  assert.equal((await matchsBase()).find((m) => m.api_id === 'Q2').statut, 'en_cours', 'laissé en l\'état');
  assert.ok((await journal()).some((x) => !x.ok && /anomalie sans_resultat \(match Q2\)/.test(x.message ?? '')));
});

test('6. panne de l\'API : la tâche ne plante pas, signale l\'erreur, ne modifie rien', async () => {
  const avant = JSON.stringify(await matchsBase());
  w.pannes['/matches'] = { status: 503, json: {} };
  w.reinitialiserAppels();
  const r = await passer();
  assert.equal(r.code, 0, r.texte);
  assert.match(r.texte, /erreur/);
  assert.equal(JSON.stringify(await matchsBase()), avant);
  assert.ok(w.chemins().length >= 4, 'plusieurs tentatives');
  assert.ok((await journal()).some((x) => x.http_status === 503 && !x.ok));
  delete w.pannes['/matches'];
});

test('7. quota du jour épuisé annoncé par l\'API : on s\'arrête, puis plus aucun appel jusqu\'à la remise à zéro', async () => {
  await vieillir(4); // les affiches redeviennent dues
  w.pannes['/matches'] = { status: 429, json: { error: 'quota_exceeded', scope: 'day', resets_at: dans(120) } };
  w.reinitialiserAppels();
  const r1 = await passer();
  assert.equal(r1.code, 0, r1.texte);
  assert.equal(w.chemins().length, 1, 'arrêt dès le premier 429 du jour');
  assert.match(r1.texte, /quota/i);
  delete w.pannes['/matches'];
  w.reinitialiserAppels();
  const r2 = await passer();
  assert.equal(r2.code, 0);
  assert.deepEqual(w.appelsApi, [], 'même pas /usage');
  assert.match(r2.texte, /quota de l'API épuisé/);
});

test('8. budget du jour : au-delà de 90 appels (100 moins la réserve), plus aucun appel', async () => {
  await w.b.admin('delete from public.sync_log');
  await w.b.admin(`insert into public.sync_log (endpoint, http_status, ok) select '/matches?n=' || g, 200, true from generate_series(1, 90) g`);
  w.reinitialiserAppels();
  const r = await passer();
  assert.equal(r.code, 0);
  assert.deepEqual(w.appelsApi, []);
  assert.match(r.texte, /budget du jour atteint/);
});

test('9. le compteur /usage de l\'API peut réduire le budget (appels faits ailleurs)', async () => {
  await w.b.admin('delete from public.sync_log');
  w.usage = { day: { used: 96, limit: 100, remaining: 4 } };
  w.reinitialiserAppels();
  const r = await passer();
  assert.equal(r.code, 0, r.texte);
  assert.deepEqual(w.appelsApi, ['/usage'], 'on consulte /usage puis on s\'arrête : réserve de 10 non entamée');
  assert.match(r.texte, /budget/);
  w.usage = { day: { used: 0, limit: 100, remaining: 100 } };
});

test('10. mode simulation : l\'API est interrogée mais RIEN n\'est écrit dans la base', async () => {
  await w.b.admin('delete from public.sync_log');
  w.upcoming['1725'] = [Q('Q1'), Q('Q2'), Q('Q3'), Q('Q4'), Q('Q5')];
  const avant = JSON.stringify(await matchsBase());
  w.reinitialiserAppels();
  const r = await passer(['--simulation']);
  assert.equal(r.code, 0, r.texte);
  assert.ok(w.chemins().length > 0);
  assert.equal(JSON.stringify(await matchsBase()), avant, 'aucun match créé');
  assert.deepEqual(await journal(), [], 'aucun appel journalisé');
  assert.deepEqual(w.appelsBase.map((a) => a.fonction), ['sync_etat'], 'seule la lecture de l\'état est faite');
});

test('11. les secrets ne sont jamais affichés et sont envoyés dans les bons en-têtes', async () => {
  w.pannes['/matches'] = { status: 401, json: { error: `clé ${CLE_API} invalide`, key: CLE_SUPABASE } };
  await vieillir(10);
  const r = await passer();
  delete w.pannes['/matches'];
  assert.ok(!r.texte.includes(CLE_API) && !r.texte.includes(CLE_SUPABASE));
  for (const a of w.appelsBase) {
    assert.equal(a.apikey, CLE_SUPABASE);
    assert.equal(a.authorization, undefined, 'clé « sb_secret_ » : uniquement dans apikey');
  }
  assert.equal(masquer(`a ${CLE_API} b`, [CLE_API]), 'a *** b');
  assert.equal(masquer('abc', ['abc']), 'abc', 'valeurs trop courtes ignorées');
});

test('12. configuration incomplète : arrêt net avec un message clair, aucun appel', async () => {
  w.reinitialiserAppels();
  let r = await passer([], { ...ENV, LIVETENNIS_API_KEY: '' });
  assert.equal(r.code, 1);
  assert.match(r.texte, /LIVETENNIS_API_KEY/);
  r = await passer([], { ...ENV, SUPABASE_SERVICE_ROLE_KEY: '' });
  assert.equal(r.code, 1);
  assert.match(r.texte, /SUPABASE_SERVICE_ROLE_KEY/);
  r = await passer([], { ...ENV, SUPABASE_URL: undefined });
  assert.equal(r.code, 1);
  assert.deepEqual([w.appelsApi, w.appelsBase], [[], []]);
});

test('13. base injoignable ou clé refusée : code d\'erreur 1 (la tâche GitHub apparaît en échec)', async () => {
  const r = await passer([], { ...ENV, SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_mauvaise-cle' });
  assert.equal(r.code, 1);
  assert.match(r.texte, /ERREUR/);
  assert.ok(!r.texte.includes('mauvaise-cle'));
});

test('14. mode diagnostic : quelques appels à l\'API seulement, structure affichée, aucune écriture ni accès à la base', async () => {
  w.upcoming['1725'] = [Q('Q1'), Q('Q2')];
  w.live = [];
  w.reinitialiserAppels();
  const r = await passer(['--diagnostic'], { LIVETENNIS_API_KEY: CLE_API });
  assert.equal(r.code, 0, r.texte);
  assert.deepEqual(w.appelsBase, []);
  assert.equal(w.appelsApi.filter((c) => c === '/usage').length, 2, '/usage avant et après');
  assert.equal(w.chemins().filter((c) => c.startsWith('/matches?tournament_id=')).length, 4);
  assert.ok(w.chemins().includes('/matches/Q1'), 'détail d\'un match pour savoir s\'il coûte un appel');
  assert.match(r.texte, /\[avant\]/);
  assert.match(r.texte, /\[après\]/);
  assert.match(r.texte, /round_code/);
  assert.match(r.texte, /"QF": 2/);
  assert.ok(!r.texte.includes(CLE_API));
});
