// Migration 0013 — notifications par e-mail : préférences privées, événements à notifier, journal anti-doublon.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { creerBase, ID, REELS, TOURNOI, REFUSE } from './base.js';

let b;
before(async () => { b = await creerBase(); });

const service = (sql, params = []) => b.comme(null, sql, params, 'service_role');
const afaire = async () => (await service('select public.notif_a_faire() as r')).rows[0].r;
const refuse = (p) => assert.rejects(p, REFUSE);

test('préférences : privées, valeurs par défaut cochées, adresse contrôlée', async () => {
  await b.comme(ID.lea, 'insert into public.notif_preferences (joueur_id, email) values ($1, $2)', [ID.lea, 'lea@example.org']);
  await b.comme(ID.marc, 'insert into public.notif_preferences (joueur_id, email) values ($1, $2)', [ID.marc, 'marc@example.org']);
  const p = (await b.comme(ID.lea, 'select * from public.notif_preferences')).rows;
  assert.equal(p.length, 1, 'Léa ne voit que sa ligne');
  assert.deepEqual([p[0].tour_ouvert, p[0].paris_visibles, p[0].tournoi_termine], [true, true, true]);
  await refuse(b.comme(ID.lea, 'insert into public.notif_preferences (joueur_id, email) values ($1, $2)', [ID.pierre, 'x@example.org']));
  await refuse(b.comme(ID.pierre, "insert into public.notif_preferences (joueur_id, email) values ($1, 'pas-une-adresse')", [ID.pierre]));
  assert.equal((await b.comme(ID.lea, "update public.notif_preferences set email = 'autre@example.org' where joueur_id = $1", [ID.marc])).affectedRows, 0);
  assert.equal((await b.comme(ID.pierre, 'select * from public.notif_preferences')).rows.length, 2, 'l’administrateur voit tout');
});

test('les fonctions de notification sont fermées au navigateur', async () => {
  await refuse(b.comme(ID.lea, 'select public.notif_a_faire()'));
  await refuse(b.anonyme('select public.notif_a_faire()'));
  await refuse(b.comme(ID.lea, "select public.notif_marquer('x', $1)", [ID.lea]));
  const lu = await b.comme(ID.lea, 'select * from public.notif_envoyees').catch(() => ({ rows: [] }));
  assert.equal(lu.rows.length, 0);
});

test('tour ouvert : seulement quand les 8 huitièmes sont connus ; destinataires filtrés ; jamais deux fois', async () => {
  const ids = [];
  for (let i = 0; i < 7; i += 1) ids.push(await b.nouveauMatch({ tournoi: TOURNOI.masters, tour: 'R16' }));
  assert.deepEqual(await afaire(), []);
  ids.push(await b.nouveauMatch({ tournoi: TOURNOI.masters, tour: 'R16' }));
  let ev = await afaire();
  assert.equal(ev.length, 1);
  assert.equal(ev[0].type, 'tour_ouvert');
  assert.equal(ev[0].tour, 'R16');
  assert.equal(ev[0].matchs.length, 8);
  assert.deepEqual(ev[0].destinataires.map((d) => d.email).sort(), ['lea@example.org', 'marc@example.org'], 'Pierre n’a pas d’adresse');
  await b.comme(ID.marc, 'update public.notif_preferences set tour_ouvert = false where joueur_id = $1', [ID.marc]);
  ev = await afaire();
  assert.deepEqual(ev[0].destinataires.map((d) => d.email), ['lea@example.org']);
  await service('select public.notif_marquer($1, $2)', [ev[0].cle, ID.lea]);
  assert.deepEqual(await afaire(), [], 'déjà envoyé à Léa, Marc ne veut pas la notification');
  b.r16 = ids;
});

test('paris visibles : quand tout le monde a parié sur tous les matchs du tour', async () => {
  for (const m of b.r16.slice(0, 7)) for (const uid of REELS) await b.parier(uid, m, 1, 7);
  assert.deepEqual((await afaire()).filter((e) => e.type === 'paris_visibles'), []);
  for (const uid of REELS) await b.parier(uid, b.r16[7], 1, 7);
  await b.comme(ID.marc, 'update public.notif_preferences set paris_visibles = true where joueur_id = $1', [ID.marc]);
  const ev = (await afaire()).filter((e) => e.type === 'paris_visibles');
  assert.equal(ev.length, 1);
  assert.deepEqual(ev[0].destinataires.map((d) => d.prenom).sort(), ['Léa', 'Marc'].sort());
});

test('tournoi terminé : résultat, classement et données de la Race', async () => {
  await b.admin(`insert into public.tournament_results (tournament_id, joueur_id, points_matchs, points_pari_tournoi, bonus_classement, score_final, rang)
                 values ($1, $2, '10', '0', '2', '12', 1), ($1, $3, '8', '0', '0', '8', 2)`, [TOURNOI.masters, ID.lea, ID.marc]);
  await b.admin("update public.tournaments set etat = 'clos', vainqueur_id = 1, finaliste_id = 2 where id = $1", [TOURNOI.masters]);
  const ev = (await afaire()).filter((e) => e.type === 'tournoi_termine');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].classement[0].prenom, 'Léa');
  assert.ok(ev[0].race_donnees.resultats.length >= 2);
  assert.ok(ev[0].vainqueur && ev[0].finaliste);
});
