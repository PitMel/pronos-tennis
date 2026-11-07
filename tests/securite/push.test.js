// Migration 0018 — notifications push : abonnements privés, clés VAPID fermées, mêmes événements que le courriel, gel au premier abonnement.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { creerBase, ID, TOURNOI, REFUSE } from './base.js';

let b;
before(async () => { b = await creerBase(); });

const service = (sql, params = []) => b.comme(null, sql, params, 'service_role');
const afaire = async () => (await service('select public.notif_a_faire() as r')).rows[0].r;
const refuse = (p) => assert.rejects(p, REFUSE);
const abonner = (uid, n) => b.comme(uid, 'select public.push_abonner($1, $2, $3, $4)', [`https://push.example/${n}`, `p256dh-${n}`, `auth-${n}`, 'Test']);

test('clés VAPID : la clé privée n’est lisible que du rôle service ; la clé publique de tout joueur connecté', async () => {
  assert.equal((await b.comme(ID.lea, 'select public.push_cle_publique() as c')).rows[0].c, null, 'pas encore créée');
  await service("select public.push_cles_enregistrer('PUB', 'PRIV')");
  await service("select public.push_cles_enregistrer('AUTRE', 'AUTRE')"); // la première paire fait foi
  assert.equal((await b.comme(ID.lea, 'select public.push_cle_publique() as c')).rows[0].c, 'PUB');
  assert.deepEqual((await service('select public.push_cles_lire() as c')).rows[0].c, { publique: 'PUB', privee: 'PRIV' });
  await refuse(b.comme(ID.lea, 'select public.push_cles_lire()'));
  await refuse(b.comme(ID.lea, 'select * from public.push_cles'));
  await refuse(b.anonyme('select public.push_cle_publique()'));
});

test('abonnements : chacun voit et supprime les siens, l’administrateur voit tout, pas d’écriture directe', async () => {
  await abonner(ID.lea, 'lea-1');
  await abonner(ID.marc, 'marc-1');
  assert.deepEqual((await b.comme(ID.lea, 'select endpoint from public.push_abonnements')).rows.map((r) => r.endpoint), ['https://push.example/lea-1']);
  assert.equal((await b.comme(ID.pierre, 'select * from public.push_abonnements')).rows.length, 2);
  await refuse(b.comme(ID.lea, "insert into public.push_abonnements (joueur_id, endpoint, p256dh, auth) values ($1, 'https://x.example/1', 'a', 'b')", [ID.lea]));
  await refuse(b.comme(ID.lea, "select public.push_abonner('http://pas-https.example/1', 'a', 'b', null)"));
  await refuse(b.anonyme("select public.push_abonner('https://x.example/2', 'a', 'b', null)"));
  assert.equal((await b.comme(ID.lea, "delete from public.push_abonnements where endpoint = 'https://push.example/marc-1'")).affectedRows, 0);
  await refuse(b.comme(ID.lea, "select public.push_supprimer('https://push.example/lea-1')"));
});

const dest = (ev) => ev.push_destinataires.map((d) => d.prenom).sort();

test('mêmes événements que le courriel : destinataires push, préférences par défaut cochées, journal propre au push', async () => {
  const ids = [];
  for (let i = 0; i < 8; i += 1) ids.push(await b.nouveauMatch({ tournoi: TOURNOI.masters, tour: 'R16' }));
  let ev = await afaire();
  assert.equal(ev.length, 1);
  assert.equal(ev[0].type, 'tour_ouvert');
  assert.deepEqual(ev[0].destinataires, [], 'personne n’a d’adresse e-mail : aucun courriel');
  assert.deepEqual(dest(ev[0]), ['Léa', 'Marc'], 'sans préférences enregistrées, toutes les cases sont cochées');
  assert.deepEqual(ev[0].push_destinataires[0].abonnements, [{ endpoint: 'https://push.example/lea-1', p256dh: 'p256dh-lea-1', auth: 'auth-lea-1' }]);
  // Marc retire cette notification
  await b.comme(ID.marc, 'insert into public.notif_preferences (joueur_id, tour_ouvert) values ($1, false)', [ID.marc]);
  assert.deepEqual(dest((await afaire())[0]), ['Léa']);
  // envoyé à Léa : le journal push ne touche pas au journal des courriels
  const cle = ev[0].cle;
  await service('select public.notif_marquer($1, $2)', [`push:${cle}`, ID.lea]);
  assert.deepEqual(await afaire(), [], 'ni Léa (déjà prévenue) ni Marc (case décochée)');
  assert.equal((await service('select count(*)::int as n from public.notif_envoyees where cle = $1', [cle])).rows[0].n, 0);
  b.r16 = ids;
});

test('premier abonnement : les événements déjà en cours sont figés ; un deuxième appareil ne fige rien', async () => {
  // nouvel événement (4 quarts connus), avant l'abonnement de Pierre
  for (let i = 0; i < 4; i += 1) await b.nouveauMatch({ tournoi: TOURNOI.masters, tour: 'QF' });
  assert.deepEqual(dest((await afaire())[0]), ['Léa']);
  await abonner(ID.pierre, 'pierre-1');
  const ev = await afaire();
  assert.deepEqual(dest(ev[0]), ['Léa'], 'Pierre vient de s’abonner : les quarts déjà connus ne lui sont pas notifiés');
  const cle = `push:${ev[0].cle}`;
  assert.equal((await service('select count(*)::int as n from public.notif_envoyees where cle = $1 and joueur_id = $2', [cle, ID.pierre])).rows[0].n, 1);
  // Léa ajoute un deuxième appareil alors que l'événement l'attend encore : elle le reçoit toujours, sur les deux
  await abonner(ID.lea, 'lea-2');
  const apres = (await afaire())[0];
  assert.deepEqual(apres.push_destinataires[0].abonnements.map((a) => a.endpoint), ['https://push.example/lea-1', 'https://push.example/lea-2']);
});

test('suppression d’un abonnement refusé : Léa n’est plus destinataire quand elle n’a plus d’appareil', async () => {
  await service("select public.push_supprimer('https://push.example/lea-1')");
  await b.comme(ID.lea, "delete from public.push_abonnements where endpoint = 'https://push.example/lea-2'");
  assert.deepEqual(await afaire(), []);
});

test('match terminé : seulement si tout le monde a parié et que le résultat est connu ; porte les paris ; case décochable ; jamais de courriel', async () => {
  await abonner(ID.lea, 'lea-3');
  const m = await b.nouveauMatch({ tournoi: TOURNOI.masters, tour: 'QF' });
  const types = async () => (await afaire()).filter((e) => e.type === 'match_termine');
  await b.admin("update public.matches set statut = 'termine', vainqueur = 1, sets_joues = 2 where id = $1", [m]);
  assert.deepEqual(await types(), [], 'personne n’a parié');
  for (const uid of [ID.lea, ID.marc]) await b.parier(uid, m, 1, 8);
  assert.deepEqual(await types(), [], 'Pierre n’a pas encore parié');
  await b.parier(ID.pierre, m, 2, 6);
  let ev = await types();
  assert.equal(ev.length, 1);
  assert.equal(ev[0].cle, `match_termine:${m}`);
  assert.deepEqual(ev[0].destinataires, [], 'push seulement : aucun courriel');
  assert.deepEqual(ev[0].push_destinataires.map((d) => d.prenom), ['Léa', 'Marc', 'Pierre'], 'tous les abonnés dont la case est cochée');
  assert.equal(ev[0].match.vainqueur, 1);
  assert.deepEqual(ev[0].paris.map((x) => [x.prenom, x.choix, x.confiance]).sort(), [['Léa', 1, 8], ['Marc', 1, 8], ['Pierre', 2, 6]]);
  // forfait : pas de notification ; case décochée : pas de destinataire
  await b.admin("update public.matches set fin_match = 'forfait' where id = $1", [m]);
  assert.deepEqual(await types(), []);
  await b.admin("update public.matches set fin_match = 'normal' where id = $1", [m]);
  await b.comme(ID.lea, 'insert into public.notif_preferences (joueur_id, match_termine) values ($1, false) on conflict (joueur_id) do update set match_termine = false', [ID.lea]);
  assert.deepEqual((await types())[0].push_destinataires.map((d) => d.prenom), ['Marc', 'Pierre'], 'Léa a décoché la case');
  for (const uid of [ID.marc, ID.pierre]) await service('select public.notif_marquer($1, $2)', [`push:match_termine:${m}`, uid]);
  assert.deepEqual(await types(), [], 'déjà envoyé à Marc et Pierre, Léa ne veut pas la notification');
});
