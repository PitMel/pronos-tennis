// Sécurité des paris de match : lecture, écriture, révélation, verrouillage, groupes, exclusions.
// Chaque test joue de VRAIES tentatives d'accès (rôle « authenticated », identité du jeton) sur les VRAIES migrations.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { creerBase, ID, TESTS, REELS, TOURNOI, REFUSE } from './base.js';

let b;
before(async () => {
  b = await creerBase();
});

const refuse = (promesse) => assert.rejects(promesse, REFUSE);
const joueursVus = (lignes) => lignes.map((l) => l.joueur_id).sort();

// ------------------------------------------------------------------ accès non connecté

test('visiteur non connecté (rôle anon) : aucune table ni vue lisible', async () => {
  for (const t of ['profiles', 'players', 'tournaments', 'matches', 'matches_visibles', 'bets', 'tournament_bets',
    'exclusions', 'revelations', 'tournament_results', 'sync_log', 'tournament_api_ids']) {
    await refuse(b.anonyme(`select count(*) from public.${t}`));
  }
});

test('visiteur non connecté : impossible de parier ni d’appeler les fonctions', async () => {
  const m = await b.nouveauMatch();
  await refuse(b.anonyme('insert into public.bets (match_id, joueur_id, choix, confiance) values ($1, $2, 1, 8)', [m, ID.andre]));
  await refuse(b.anonyme('select * from public.qui_a_parie($1)', [m]));
  await refuse(b.anonyme('select public.est_admin()'));
});

// ------------------------------------------------------------------ lecture des paris des autres

test('avant que tous aient parié : chacun ne voit que son pari', async () => {
  const m = await b.nouveauMatch();
  await b.parier(ID.andre, m, 1, 8);
  await b.parier(ID.paul, m, 2, 7);
  assert.deepEqual(joueursVus(await b.voirParis(ID.andre, m)), [ID.andre]);
  assert.deepEqual(joueursVus(await b.voirParis(ID.paul, m)), [ID.paul]);
  assert.deepEqual(await b.voirParis(ID.jacques, m), [], 'Jacques n’a pas parié et ne voit rien');
});

test('requête directe sur un pari d’un autre par identifiant : aucune ligne tant que non révélé', async () => {
  const m = await b.nouveauMatch();
  await b.parier(ID.andre, m, 1, 10);
  const r = await b.comme(ID.paul, 'select * from public.bets where joueur_id = $1', [ID.andre]);
  assert.equal(r.rows.length, 0);
  const r2 = await b.comme(ID.paul, 'select count(*)::int as n from public.bets where match_id = $1', [m]);
  assert.equal(r2.rows[0].n, 0, 'même en comptant, rien n’est visible (Paul n’a pas parié)');
});

test('quand tout le groupe a parié : les paris sont révélés à tout le groupe', async () => {
  const m = await b.nouveauMatch();
  await b.parier(ID.andre, m, 1, 8);
  await b.parier(ID.paul, m, 2, 7);
  await b.parier(ID.jacques, m, 1, 9);
  for (const uid of TESTS) assert.deepEqual(joueursVus(await b.voirParis(uid, m)), [...TESTS].sort());
  const vus = await b.voirParis(ID.andre, m);
  assert.deepEqual(vus.map((l) => [l.choix, l.confiance]).sort(), [[1, 8], [1, 9], [2, 7]].sort());
});

test('groupes étanches : les paris des faux comptes ne sont jamais visibles des vrais joueurs, et inversement', async () => {
  const m = await b.nouveauMatch();
  for (const uid of TESTS) await b.parier(uid, m, 1, 8);
  for (const uid of [ID.lea, ID.marc]) assert.deepEqual(await b.voirParis(uid, m), [], 'un vrai joueur ne voit pas les paris de test');
  // le groupe réel complète à son tour : révélé entre vrais joueurs seulement
  for (const uid of REELS) await b.parier(uid, m, 2, 6);
  for (const uid of [ID.lea, ID.marc]) assert.deepEqual(joueursVus(await b.voirParis(uid, m)), [...REELS].sort());
  for (const uid of TESTS) {
    assert.deepEqual(joueursVus(await b.voirParis(uid, m)).filter((j) => REELS.includes(j)), [], 'un faux compte ne voit pas les vrais paris');
  }
});

test('groupes étanches : un vrai joueur ordinaire ne voit pas les paris de test, même révélés ; seul l’administrateur y a accès', async () => {
  const m = await b.nouveauMatch();
  for (const uid of TESTS) await b.parier(uid, m, 1, 8);
  for (const uid of [ID.lea, ID.marc]) assert.deepEqual(await b.voirParis(uid, m), []);
  assert.deepEqual(joueursVus(await b.voirParis(ID.pierre, m)), [...TESTS].sort(), 'l’administrateur joue les faux comptes');
});

test('administrateur : voit et écrit les paris des faux comptes, JAMAIS les paris non révélés des vrais joueurs', async () => {
  const m = await b.nouveauMatch();
  await b.parier(ID.lea, m, 1, 10);
  assert.deepEqual(await b.voirParis(ID.pierre, m), [], 'Pierre (admin) ne voit pas le pari non révélé de Léa');
  await b.parier(ID.andre, m, 2, 6);
  assert.deepEqual(joueursVus(await b.voirParis(ID.pierre, m)), [ID.andre], 'Pierre voit les paris de test');
  // il peut jouer à la place d'un faux compte...
  await b.comme(ID.pierre, 'insert into public.bets (match_id, joueur_id, choix, confiance) values ($1, $2, 1, 7)', [m, ID.paul]);
  // ...mais pas à la place d'un vrai joueur
  await refuse(b.comme(ID.pierre, 'insert into public.bets (match_id, joueur_id, choix, confiance) values ($1, $2, 1, 7)', [m, ID.marc]));
});

// ------------------------------------------------------------------ écriture

test('impossible de parier au nom d’un autre joueur', async () => {
  const m = await b.nouveauMatch();
  await refuse(b.comme(ID.andre, 'insert into public.bets (match_id, joueur_id, choix, confiance) values ($1, $2, 1, 8)', [m, ID.paul]));
  await refuse(b.comme(ID.lea, 'insert into public.bets (match_id, joueur_id, choix, confiance) values ($1, $2, 1, 8)', [m, ID.andre]));
});

test('le joueur identifié par son jeton est utilisé si joueur_id est omis', async () => {
  const m = await b.nouveauMatch();
  await b.comme(ID.andre, 'insert into public.bets (match_id, choix, confiance) values ($1, 1, 8)', [m]);
  assert.deepEqual(joueursVus(await b.voirParis(ID.andre, m)), [ID.andre]);
});

test('on peut modifier son pari tant que rien n’est verrouillé ni révélé', async () => {
  const m = await b.nouveauMatch();
  await b.parier(ID.andre, m, 1, 8);
  const r = await b.comme(ID.andre, 'update public.bets set choix = 2, confiance = 6 where match_id = $1 and joueur_id = $2', [m, ID.andre]);
  assert.equal(r.affectedRows, 1);
  assert.deepEqual((await b.voirParis(ID.andre, m)).map((l) => [l.choix, l.confiance]), [[2, 6]]);
});

test('impossible de modifier le pari d’un autre', async () => {
  const m = await b.nouveauMatch();
  await b.parier(ID.andre, m, 1, 8);
  const r = await b.comme(ID.paul, 'update public.bets set confiance = 6 where joueur_id = $1', [ID.andre]);
  assert.equal(r.affectedRows, 0);
  const r2 = await b.comme(ID.andre, 'select confiance from public.bets where match_id = $1', [m]);
  assert.equal(r2.rows[0].confiance, 8);
});

test('impossible de transférer son pari à un autre joueur', async () => {
  const m = await b.nouveauMatch();
  await b.parier(ID.andre, m, 1, 8);
  await refuse(b.comme(ID.andre, 'update public.bets set joueur_id = $1 where joueur_id = $2 and match_id = $3', [ID.paul, ID.andre, m]));
});

test('impossible de supprimer un pari', async () => {
  const m = await b.nouveauMatch();
  await b.parier(ID.andre, m, 1, 8);
  await refuse(b.comme(ID.andre, 'delete from public.bets where match_id = $1', [m]));
  await refuse(b.comme(ID.pierre, 'delete from public.bets where match_id = $1', [m]));
});

test('après révélation : paris figés (le dernier joueur a pu parier, plus personne ne peut modifier)', async () => {
  const m = await b.nouveauMatch();
  await b.parier(ID.andre, m, 1, 8);
  await b.parier(ID.paul, m, 2, 7);
  await b.parier(ID.jacques, m, 1, 9); // dernier pari : autorisé, déclenche la révélation
  for (const uid of TESTS) {
    const r = await b.comme(uid, 'update public.bets set confiance = 10, choix = 1 where joueur_id = $1 and match_id = $2', [uid, m]);
    assert.equal(r.affectedRows, 0, 'modification refusée après révélation');
  }
  const admin = await b.comme(ID.pierre, 'update public.bets set confiance = 10 where match_id = $1 and joueur_id = $2', [m, ID.andre]);
  assert.equal(admin.affectedRows, 0, 'même l’administrateur ne modifie pas un pari révélé');
  assert.deepEqual((await b.comme(ID.andre, 'select confiance from public.bets where joueur_id = $1 and match_id = $2', [ID.andre, m])).rows, [{ confiance: 8 }]);
  // on ne peut pas non plus parier une seconde fois (doublon) ni parier tard
  await refuse(b.parier(ID.andre, m, 2, 6));
});

// ------------------------------------------------------------------ verrouillage au début du match

test('début du match détecté : plus aucun pari ni modification, et les paris restent cachés si tout le monde n’a pas parié', async () => {
  const m = await b.nouveauMatch();
  await b.parier(ID.andre, m, 1, 8);
  await b.demarrer(m);
  await refuse(b.parier(ID.paul, m, 2, 7));
  const r = await b.comme(ID.andre, 'update public.bets set confiance = 6 where joueur_id = $1 and match_id = $2', [ID.andre, m]);
  assert.equal(r.affectedRows, 0);
  assert.deepEqual(await b.voirParis(ID.paul, m), [], 'paris toujours cachés (Paul n’a pas parié)');
  assert.deepEqual(joueursVus(await b.voirParis(ID.andre, m)), [ID.andre], 'André ne voit que le sien');
});

test('verrouillage : statut « en_cours », « terminé » ou forfait interdisent tout nouveau pari', async () => {
  for (const modif of [
    "statut = 'en_cours'",
    "statut = 'termine', vainqueur = 1, sets_joues = 2",
    "fin_match = 'forfait'",
  ]) {
    const m = await b.nouveauMatch();
    await b.admin(`update public.matches set ${modif} where id = $1`, [m]);
    await refuse(b.parier(ID.andre, m, 1, 8));
  }
});

test('neutralisation : les paris saisis sont révélés (et figés), même si un joueur n’a pas parié', async () => {
  const m = await b.nouveauMatch();
  await b.parier(ID.andre, m, 1, 8);
  await b.parier(ID.paul, m, 2, 7);
  await b.demarrer(m); // Jacques n'a jamais parié
  assert.deepEqual(joueursVus(await b.voirParis(ID.paul, m)), [ID.paul], 'avant neutralisation : Paul ne voit que le sien');
  assert.deepEqual(await b.voirParis(ID.jacques, m), [], 'Jacques n’a pas parié : il ne voit rien');
  await b.comme(ID.pierre, 'update public.matches set neutralise = true where id = $1', [m]);
  assert.deepEqual(joueursVus(await b.voirParis(ID.paul, m)), [ID.andre, ID.paul].sort());
  assert.deepEqual(joueursVus(await b.voirParis(ID.jacques, m)), [ID.andre, ID.paul].sort());
  await refuse(b.parier(ID.jacques, m, 1, 8));
  // la neutralisation d'un match révèle aussi pour le groupe réel, mais seulement les paris qui existent
  assert.deepEqual(await b.voirParis(ID.lea, m), []);
});

test('révélation mémorisée : annuler la neutralisation ne recache pas les paris', async () => {
  const m = await b.nouveauMatch();
  await b.parier(ID.andre, m, 1, 8);
  await b.admin('update public.matches set neutralise = true where id = $1', [m]);
  await b.admin('update public.matches set neutralise = false where id = $1', [m]);
  assert.deepEqual(joueursVus(await b.voirParis(ID.paul, m)), [ID.andre]);
});

// ------------------------------------------------------------------ groupe : actifs, exclusions, retardataires

test('compte désactivé : ne compte plus dans « tous ont parié » et ne peut plus parier', async () => {
  const m = await b.nouveauMatch();
  await b.admin('update public.profiles set actif = false where id = $1', [ID.jacques]);
  await b.parier(ID.andre, m, 1, 8);
  await b.parier(ID.paul, m, 2, 7);
  assert.deepEqual(joueursVus(await b.voirParis(ID.andre, m)), [ID.andre, ID.paul].sort(), 'groupe complet sans Jacques');
  await refuse(b.parier(ID.jacques, m, 1, 8));
  await b.admin('update public.profiles set actif = true where id = $1', [ID.jacques]);
});

test('exclusion d’un joueur d’un match : le groupe se complète sans lui, et il ne peut plus parier', async () => {
  const m = await b.nouveauMatch();
  await b.comme(ID.pierre, 'insert into public.exclusions (joueur_id, tournament_id, match_id) values ($1, $2, $3)', [ID.jacques, TOURNOI.masters, m]);
  await refuse(b.parier(ID.jacques, m, 1, 8));
  await b.parier(ID.andre, m, 1, 8);
  await b.parier(ID.paul, m, 2, 7);
  assert.deepEqual(joueursVus(await b.voirParis(ID.paul, m)), [ID.andre, ID.paul].sort());
  // il reste libre de parier sur les autres matchs
  const autre = await b.nouveauMatch();
  await b.parier(ID.jacques, autre, 1, 8);
});

test('exclusion d’un tournoi entier : valable pour tous ses matchs ; et exclusion posée après coup complète le groupe', async () => {
  const m = await b.nouveauMatch({ tournoi: TOURNOI.finals, tour: 'RR' });
  await b.parier(ID.andre, m, 1, 8);
  await b.parier(ID.paul, m, 2, 7);
  assert.equal((await b.voirParis(ID.paul, m)).length, 1, 'pas encore complet : Paul ne voit que le sien');
  await b.comme(ID.pierre, 'insert into public.exclusions (joueur_id, tournament_id) values ($1, $2)', [ID.jacques, TOURNOI.finals]);
  assert.equal((await b.voirParis(ID.paul, m)).length, 2, 'Jacques exclu du tournoi : le groupe est complet');
  const autre = await b.nouveauMatch({ tournoi: TOURNOI.finals, tour: 'SF' });
  await refuse(b.parier(ID.jacques, autre, 1, 8));
});

test('seul l’administrateur crée une exclusion', async () => {
  const m = await b.nouveauMatch();
  await refuse(b.comme(ID.andre, 'insert into public.exclusions (joueur_id, tournament_id, match_id) values ($1, $2, $3)', [ID.paul, TOURNOI.masters, m]));
  await refuse(b.comme(ID.lea, 'insert into public.exclusions (joueur_id, tournament_id) values ($1, $2)', [ID.marc, TOURNOI.masters]));
});

test('une exclusion ne peut pas viser un match d’un autre tournoi', async () => {
  const m = await b.nouveauMatch({ tournoi: TOURNOI.masters });
  await refuse(b.comme(ID.pierre, 'insert into public.exclusions (joueur_id, tournament_id, match_id) values ($1, $2, $3)', [ID.paul, TOURNOI.chelem, m]));
});

test('retardataire : un compte créé après la révélation ne rouvre ni ne recache rien', async () => {
  const m = await b.nouveauMatch();
  for (const uid of TESTS) await b.parier(uid, m, 1, 8);
  const nouveau = '00000000-0000-4000-8000-0000000000aa';
  await b.admin("insert into auth.users (id, email) values ($1, 'nouveau@pronos.invalid')", [nouveau]);
  await b.admin("insert into public.profiles (id, prenom, is_test) values ($1, 'Nouveau', true)", [nouveau]);
  try {
    assert.deepEqual(joueursVus(await b.voirParis(ID.andre, m)), [...TESTS].sort(), 'toujours révélés');
    const r = await b.comme(ID.andre, 'update public.bets set confiance = 10 where joueur_id = $1 and match_id = $2', [ID.andre, m]);
    assert.equal(r.affectedRows, 0, 'toujours figés');
    await refuse(b.parier(nouveau, m, 1, 8)); // trop tard pour ce match
  } finally {
    await b.admin('delete from public.profiles where id = $1', [nouveau]);
    await b.admin('delete from auth.users where id = $1', [nouveau]);
  }
});

// ------------------------------------------------------------------ contraintes de saisie

test('contraintes : confiance 6 à 10, choix 1 ou 2', async () => {
  const m = await b.nouveauMatch();
  for (const [choix, conf] of [[1, 5], [1, 11], [1, 0], [3, 8], [0, 8], [2, -1]]) {
    await refuse(b.parier(ID.andre, m, choix, conf));
  }
  await b.parier(ID.andre, m, 2, 10);
});

test('contraintes : un seul pari par joueur et par match', async () => {
  const m = await b.nouveauMatch();
  await b.parier(ID.andre, m, 1, 8);
  await refuse(b.parier(ID.andre, m, 2, 9));
});

test('contraintes : le nombre de sets est obligatoire (3, 4 ou 5) en Grand Chelem et interdit ailleurs', async () => {
  const gc = await b.nouveauMatch({ tournoi: TOURNOI.chelem });
  await refuse(b.parier(ID.andre, gc, 1, 8)); // sets manquant
  await refuse(b.parier(ID.andre, gc, 1, 8, 2));
  await refuse(b.parier(ID.andre, gc, 1, 8, 6));
  await b.parier(ID.andre, gc, 1, 8, 4);
  const mm = await b.nouveauMatch({ tournoi: TOURNOI.masters });
  await refuse(b.parier(ID.andre, mm, 1, 8, 3));
  await b.parier(ID.andre, mm, 1, 8);
  const af = await b.nouveauMatch({ tournoi: TOURNOI.finals, tour: 'RR' });
  await refuse(b.parier(ID.andre, af, 1, 8, 3));
  await b.parier(ID.andre, af, 1, 8);
});

test('contraintes : modifier un pari de Grand Chelem sans sets valides est refusé', async () => {
  const gc = await b.nouveauMatch({ tournoi: TOURNOI.chelem });
  await b.parier(ID.andre, gc, 1, 8, 4);
  await refuse(b.comme(ID.andre, 'update public.bets set sets = null where match_id = $1 and joueur_id = $2', [gc, ID.andre]));
  const ok = await b.comme(ID.andre, 'update public.bets set sets = 5 where match_id = $1 and joueur_id = $2', [gc, ID.andre]);
  assert.equal(ok.affectedRows, 1);
});

test('pari sur un match inexistant refusé', async () => {
  await refuse(b.parier(ID.andre, 999999, 1, 8));
});

// ------------------------------------------------------------------ « qui a parié »

test('qui_a_parie : indique qui a parié, sans jamais révéler le choix ni la confiance', async () => {
  const m = await b.nouveauMatch();
  await b.parier(ID.andre, m, 1, 8);
  const r = await b.comme(ID.paul, 'select * from public.qui_a_parie($1)', [m]);
  assert.deepEqual(Object.keys(r.rows[0]).sort(), ['a_parie', 'joueur_id']);
  const etat = Object.fromEntries(r.rows.map((l) => [l.joueur_id, l.a_parie]));
  assert.deepEqual(etat, { [ID.andre]: true, [ID.paul]: false, [ID.jacques]: false });
});

test('qui_a_parie : limité au groupe de la personne connectée', async () => {
  const m = await b.nouveauMatch();
  await b.parier(ID.lea, m, 1, 8);
  const vuParTest = await b.comme(ID.andre, 'select joueur_id from public.qui_a_parie($1)', [m]);
  assert.deepEqual(joueursVus(vuParTest.rows), [...TESTS].sort());
  const vuParReel = await b.comme(ID.marc, 'select joueur_id, a_parie from public.qui_a_parie($1)', [m]);
  assert.deepEqual(joueursVus(vuParReel.rows), [...REELS].sort());
  assert.equal(vuParReel.rows.find((l) => l.joueur_id === ID.lea).a_parie, true);
});

test('qui_a_parie : un joueur exclu n’apparaît plus', async () => {
  const m = await b.nouveauMatch();
  await b.admin('insert into public.exclusions (joueur_id, tournament_id, match_id) values ($1, $2, $3)', [ID.paul, TOURNOI.masters, m]);
  const r = await b.comme(ID.andre, 'select joueur_id from public.qui_a_parie($1)', [m]);
  assert.deepEqual(joueursVus(r.rows), [ID.andre, ID.jacques].sort());
});
