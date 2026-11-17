// Migration 0027 — les paris sont révélés TOUR PAR TOUR (Pierre, 17 nov. 2026) :
// tous les joueurs du groupe doivent avoir parié sur TOUS les matchs connus du tour. Le résultat d'un match terminé est visible
// dès la fin du match pour qui a parié dessus. Chaque test joue de VRAIES tentatives d'accès sur les VRAIES migrations.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { creerBase, ID, TESTS, REELS } from './base.js';

let b;
before(async () => { b = await creerBase(); });

const service = (sql, params = []) => b.comme(null, sql, params, 'service_role');
const afaire = async () => (await service('select public.notif_a_faire() as r')).rows[0].r;
const abonner = (uid, n) => b.comme(uid, 'select public.push_abonner($1, $2, $3, $4)', [`https://push.example/${n}`, `p256dh-${n}`, `auth-${n}`, 'Test']);
const vue = async (uid, m) => (await b.comme(uid, 'select * from public.matches_visibles where id = $1', [m])).rows[0];
const reveles = async (uid, m) => (await vue(uid, m)).paris_reveles;
const parierTous = async (uids, m, choix = 1) => { for (const uid of uids) await b.parier(uid, m, choix, 8); };
const [andre, paul, jacques] = TESTS;

/** Un tour (QF d'un tournoi neuf) de `n` matchs. */
async function tour(n, { categorie = 'masters_1000', nom = 'QF' } = {}) {
  const t = await b.nouveauTournoi(categorie);
  const matchs = [];
  for (let i = 0; i < n; i++) matchs.push(await b.nouveauMatch({ tournoi: t, tour: nom }));
  return { t, matchs };
}

test('tout le monde a parié sur UN match mais pas sur tout le tour : rien n’est révélé', async () => {
  const { matchs: [a, c] } = await tour(2);
  await parierTous(TESTS, a); // avec l'ancienne règle, les paris de A seraient déjà visibles
  assert.equal(await reveles(andre, a), false);
  assert.deepEqual((await b.voirParis(andre, a)).map((l) => l.joueur_id), [andre], 'Paul et Jacques restent cachés');
  assert.equal(await reveles(andre, c), false);
});

test('dernier pari du tour : tous les matchs du tour sont révélés en même temps, pour tout le groupe', async () => {
  const { matchs: [a, c, d] } = await tour(3);
  await parierTous(TESTS, a);
  await parierTous(TESTS, c, 2);
  await parierTous([andre, paul], d);
  for (const m of [a, c, d]) assert.equal(await reveles(jacques, m), false, 'il manque le pari de Jacques sur le dernier match');
  await b.parier(jacques, d, 1, 6);
  for (const m of [a, c, d]) {
    assert.equal(await reveles(paul, m), true);
    assert.deepEqual((await b.voirParis(paul, m)).map((l) => l.joueur_id).sort(), [...TESTS].sort());
  }
});

test('un autre tour ou un autre tournoi non parié ne bloque pas le tour', async () => {
  const { t, matchs: [a] } = await tour(1);
  await b.nouveauMatch({ tournoi: t, tour: 'SF' });          // demi-finale annoncée, personne n'a parié
  await tour(1);                                              // autre tournoi
  await parierTous(TESTS, a);
  assert.equal(await reveles(andre, a), true);
});

test('un match neutralisé ne bloque pas le tour ; neutraliser le dernier match manquant révèle le tour', async () => {
  const { matchs: [a, c] } = await tour(2);
  await parierTous(TESTS, a);
  assert.equal(await reveles(andre, a), false, 'C n’a reçu aucun pari');
  await b.comme(ID.pierre, 'update public.matches set neutralise = true where id = $1', [c]);
  assert.equal(await reveles(andre, a), true, 'neutraliser C complète le tour');
  assert.equal((await b.voirParis(paul, a)).length, 3);
});

test('un joueur exclu d’un match, ou de tout le tournoi, n’est pas attendu ; un match sans aucun joueur concerné ne bloque pas', async () => {
  const { t, matchs: [a, c] } = await tour(2);
  await b.admin('insert into public.exclusions (joueur_id, tournament_id, match_id) values ($1, $2, $3)', [jacques, t, c]);
  await parierTous(TESTS, a);
  await parierTous([andre, paul], c);
  assert.equal(await reveles(andre, a), true, 'Jacques est exclu de C : le tour est complet sans lui');
  // tous les joueurs du groupe test exclus de D : D ne bloque rien
  const { t: t2, matchs: [e, f] } = await tour(2);
  for (const uid of TESTS) await b.admin('insert into public.exclusions (joueur_id, tournament_id, match_id) values ($1, $2, $3)', [uid, t2, f]);
  await parierTous(TESTS, e);
  assert.equal(await reveles(andre, e), true);
  // exclusion de tout le tournoi posée après coup : complète le tour
  const { t: t3, matchs: [g] } = await tour(1);
  await parierTous([andre, paul], g);
  assert.equal(await reveles(andre, g), false);
  await b.admin('insert into public.exclusions (joueur_id, tournament_id) values ($1, $2)', [jacques, t3]);
  assert.equal(await reveles(andre, g), true);
  assert.equal((await b.voirParis(andre, g)).length, 2);
});

test('un match annoncé après la révélation ne rouvre rien (révélation collante) et n’est pas révélé lui-même', async () => {
  const { t, matchs: [a] } = await tour(1);
  await parierTous(TESTS, a);
  assert.equal(await reveles(andre, a), true);
  const nouveau = await b.nouveauMatch({ tournoi: t, tour: 'QF' });
  assert.equal(await reveles(andre, a), true, 'A reste révélé');
  assert.equal(await reveles(andre, nouveau), false, 'le nouveau match attend les paris de tous');
  assert.equal((await b.voirParis(andre, a)).length, 3);
});

test('un match déplacé vers un autre tour (répartition des poules) : le tour qu’il quitte peut être complété', async () => {
  const { t, matchs: [a, c] } = await tour(2, { categorie: 'atp_finals', nom: 'RR2' });
  await parierTous(TESTS, a);
  assert.equal(await reveles(andre, a), false);
  await b.admin("update public.matches set tour = 'RR3' where id = $1", [c]);
  assert.equal(await reveles(andre, a), true, 'C est parti en RR3 : RR2 est complet');
  assert.equal(await reveles(andre, c), false, 'RR3 attend encore les paris sur C');
  assert.ok(t);
});

test('groupes étanches : un tour complet pour les vrais joueurs ne révèle rien aux faux comptes, et inversement', async () => {
  const { matchs: [a, c] } = await tour(2);
  await parierTous(REELS, a);
  await parierTous(REELS, c);
  assert.equal(await reveles(ID.lea, a), true);
  assert.equal(await reveles(andre, a), false);
  await parierTous([andre, paul], a);
  assert.equal(await reveles(andre, a), false);
  assert.deepEqual((await b.voirParis(andre, a)).map((l) => l.joueur_id), [andre], 'aucun pari de vrai joueur visible d’un faux compte');
});

test('résultat : visible dès la fin du match pour qui a parié dessus, masqué pour les autres jusqu’à leur pari ou la révélation', async () => {
  const { matchs: [a, c] } = await tour(2);
  await parierTous([andre, paul], a);
  await b.demarrer(a);
  await b.terminer(a, { vainqueur: 2, sets: 3 });
  assert.equal((await vue(andre, a)).vainqueur, 2, 'André a parié : il voit le résultat sans attendre le tour');
  assert.equal((await vue(andre, a)).resultat_visible, true);
  assert.equal((await vue(paul, a)).sets_joues, 3);
  const v = await vue(jacques, a);
  assert.equal(v.resultat_visible, false, 'Jacques n’a pas parié : il pourrait encore le faire, donc pas de résultat');
  assert.equal(v.vainqueur, null);
  assert.equal(v.verrouille, false, 'il peut encore parier');
  // il ne voit toujours pas les paris des autres
  assert.deepEqual(await b.voirParis(andre, a).then((l) => l.map((x) => x.joueur_id)), [andre]);
  // après son pari tardif, il voit le résultat ; les paris des autres attendent la fin du tour (C)
  await b.parier(jacques, a, 1, 6);
  assert.equal((await vue(jacques, a)).vainqueur, 2);
  assert.equal(await reveles(jacques, a), false);
  await parierTous(TESTS, c);
  assert.equal(await reveles(jacques, a), true);
  assert.equal((await b.voirParis(jacques, a)).length, 3);
});

test('résultat : un joueur qui n’a pas parié ne peut pas le deviner en lisant la table des matchs', async () => {
  const { matchs: [a] } = await tour(1);
  await parierTous([andre], a);
  await b.terminer(a, { vainqueur: 1 });
  const lues = await b.comme(jacques, 'select vainqueur from public.matches where id = $1', [a]).then((r) => r.rows, () => []);
  assert.deepEqual(lues, [], 'la table brute des matchs reste réservée à l’administrateur');
});

test('4e notification « match terminé » : seulement quand les paris du match sont révélés (tout le tour a été parié)', async () => {
  await abonner(ID.lea, 'rt-lea');
  const { matchs: [a, c] } = await tour(2);
  const types = async () => (await afaire()).filter((e) => e.type === 'match_termine' && e.cle === `match_termine:${a}`);
  await parierTous(REELS, a);
  await b.terminer(a, { vainqueur: 1, sets: 2 });
  assert.deepEqual(await types(), [], 'tout le monde a parié sur A, mais pas sur C : les paris ne sont pas révélés, donc pas de notification');
  await parierTous([ID.lea, ID.marc], c);
  assert.deepEqual(await types(), [], 'il manque encore le pari de Pierre sur C');
  await b.parier(ID.pierre, c, 2, 6);
  const ev = await types();
  assert.equal(ev.length, 1);
  assert.deepEqual(ev[0].paris.map((x) => x.prenom).sort(), ['Léa', 'Marc', 'Pierre']);
});

test('notification « paris visibles » : une seule fois par tour, quand tous ses matchs sont révélés (inchangé)', async () => {
  await abonner(ID.marc, 'rt-marc');
  const { t, matchs: [a, c] } = await tour(2, { categorie: 'atp_finals', nom: 'RR1' });
  const visibles = async () => (await afaire()).filter((e) => e.type === 'paris_visibles' && e.tournoi.id === t);
  await b.nouveauMatch({ tournoi: t, tour: 'RR1' });
  await b.nouveauMatch({ tournoi: t, tour: 'RR1' });          // 4 matchs connus : le tour est complet
  await parierTous(REELS, a);
  await parierTous(REELS, c);
  assert.deepEqual(await visibles(), []);
  const reste = (await b.admin("select id from public.matches where tournament_id = $1 and tour = 'RR1' and id not in ($2, $3) order by id", [t, a, c])).rows.map((r) => r.id);
  for (const m of reste) await parierTous(REELS, m);
  assert.equal((await visibles()).length, 1);
  assert.equal((await visibles())[0].tour, 'RR1');
});
