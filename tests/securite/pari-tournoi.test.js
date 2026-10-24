// Sécurité et règles du pari tournoi (vainqueur + finaliste) : ouverture, révélation, gel, joueurs éliminés.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { creerBase, ID, TESTS, REELS, TENNIS, REFUSE } from './base.js';

let b;
let compteur = 0;
before(async () => {
  b = await creerBase();
});

const refuse = (promesse) => assert.rejects(promesse, REFUSE);
const vus = (lignes) => lignes.map((l) => l.joueur_id).sort();

/** Nouveau tournoi (nom unique) dans l'état voulu. */
async function tournoi(etat = 'pari_tournoi_ouvert', categorie = 'masters_1000') {
  const r = await b.admin(
    'insert into public.tournaments (annee, nom, categorie, etat) values (2026, $1, $2, $3) returning id',
    [`Tournoi ${++compteur}`, categorie, etat],
  );
  return r.rows[0].id;
}
const parierTournoi = (uid, t, vainqueur, finaliste) =>
  b.comme(uid, 'insert into public.tournament_bets (tournament_id, joueur_id, vainqueur_id, finaliste_id) values ($1, $2, $3, $4)', [t, uid, vainqueur, finaliste]);
const voir = async (uid, t) =>
  (await b.comme(uid, 'select joueur_id, vainqueur_id, finaliste_id from public.tournament_bets where tournament_id = $1', [t])).rows;

test('visiteur non connecté : aucun accès aux paris tournoi', async () => {
  await refuse(b.anonyme('select * from public.tournament_bets'));
});

test('pari tournoi caché tant que tout le groupe n’a pas parié, puis révélé à tout le groupe', async () => {
  const t = await tournoi();
  await parierTournoi(ID.andre, t, TENNIS.sinner, TENNIS.alcaraz);
  await parierTournoi(ID.paul, t, TENNIS.alcaraz, TENNIS.sinner);
  assert.deepEqual(vus(await voir(ID.andre, t)), [ID.andre]);
  assert.deepEqual(vus(await voir(ID.paul, t)), [ID.paul]);
  assert.deepEqual(await voir(ID.jacques, t), []);
  assert.deepEqual(await voir(ID.lea, t), [], 'un vrai joueur ne voit pas les paris de test');
  await parierTournoi(ID.jacques, t, TENNIS.zverev, TENNIS.sinner);
  for (const uid of TESTS) assert.deepEqual(vus(await voir(uid, t)), [...TESTS].sort());
  assert.deepEqual(await voir(ID.marc, t), []);
});

test('une fois révélé : pari tournoi figé, plus de nouveau pari, pas de suppression', async () => {
  const t = await tournoi();
  for (const [uid, v, f] of [[ID.andre, 3, 1], [ID.paul, 1, 3], [ID.jacques, 4, 3]]) await parierTournoi(uid, t, v, f);
  const r = await b.comme(ID.andre, 'update public.tournament_bets set vainqueur_id = $1, finaliste_id = $2 where tournament_id = $3 and joueur_id = $4', [TENNIS.zverev, TENNIS.fritz, t, ID.andre]);
  assert.equal(r.affectedRows, 0);
  const admin = await b.comme(ID.pierre, 'update public.tournament_bets set vainqueur_id = 5 where tournament_id = $1 and joueur_id = $2', [t, ID.andre]);
  assert.equal(admin.affectedRows, 0);
  await refuse(parierTournoi(ID.andre, t, 5, 6));
  await refuse(b.comme(ID.andre, 'delete from public.tournament_bets where tournament_id = $1', [t]));
});

test('modifiable tant que tout le monde n’a pas parié', async () => {
  const t = await tournoi();
  await parierTournoi(ID.andre, t, TENNIS.sinner, TENNIS.alcaraz);
  const r = await b.comme(ID.andre, 'update public.tournament_bets set vainqueur_id = $1, finaliste_id = $2 where tournament_id = $3 and joueur_id = $4', [TENNIS.zverev, TENNIS.fritz, t, ID.andre]);
  assert.equal(r.affectedRows, 1);
  assert.deepEqual((await voir(ID.andre, t)).map((l) => [l.vainqueur_id, l.finaliste_id]), [[TENNIS.zverev, TENNIS.fritz]]);
});

test('pas de pari avant l’ouverture ni après la clôture du tournoi', async () => {
  await refuse(parierTournoi(ID.andre, await tournoi('a_venir'), 1, 2));
  await refuse(parierTournoi(ID.andre, await tournoi('clos'), 1, 2));
  await parierTournoi(ID.andre, await tournoi('en_cours'), 1, 2); // tournoi commencé mais pari encore ouvert
});

test('un tournoi clos révèle tous les paris tournoi, même incomplets', async () => {
  const t = await tournoi();
  await parierTournoi(ID.andre, t, 1, 2);
  assert.deepEqual(await voir(ID.paul, t), []);
  await b.admin("update public.tournaments set etat = 'clos' where id = $1", [t]);
  assert.deepEqual(vus(await voir(ID.paul, t)), [ID.andre]);
});

test('vainqueur et finaliste doivent être deux joueurs différents', async () => {
  const t = await tournoi();
  await refuse(parierTournoi(ID.andre, t, TENNIS.sinner, TENNIS.sinner));
  await parierTournoi(ID.andre, t, TENNIS.sinner, TENNIS.zverev);
  await refuse(b.comme(ID.andre, 'update public.tournament_bets set finaliste_id = vainqueur_id where tournament_id = $1 and joueur_id = $2', [t, ID.andre]));
});

test('seuls les joueurs encore en lice sont sélectionnables (éliminé = a perdu un match terminé)', async () => {
  const t = await tournoi();
  await b.admin("insert into public.matches (tournament_id, tour, p1_id, p2_id, statut, vainqueur, sets_joues) values ($1, 'R16', $2, $3, 'termine', 1, 2)", [t, TENNIS.alcaraz, TENNIS.fritz]);
  await refuse(parierTournoi(ID.andre, t, TENNIS.fritz, TENNIS.sinner)); // Fritz éliminé, en vainqueur
  await refuse(parierTournoi(ID.andre, t, TENNIS.sinner, TENNIS.fritz)); // Fritz éliminé, en finaliste
  await parierTournoi(ID.andre, t, TENNIS.alcaraz, TENNIS.sinner); // Alcaraz a gagné : encore en lice
});

test('élimination : le joueur 2 qui perd est éliminé aussi ; un match neutralisé ne compte pas', async () => {
  const t = await tournoi();
  await b.admin("insert into public.matches (tournament_id, tour, p1_id, p2_id, statut, vainqueur, sets_joues) values ($1, 'QF', $2, $3, 'termine', 2, 3)", [t, TENNIS.sinner, TENNIS.zverev]);
  await refuse(parierTournoi(ID.andre, t, TENNIS.sinner, TENNIS.alcaraz)); // Sinner a perdu (joueur 1, vainqueur = 2)
  await b.admin("insert into public.matches (tournament_id, tour, p1_id, p2_id, statut, vainqueur, sets_joues, neutralise) values ($1, 'QF', $2, $3, 'termine', 1, 3, true)", [t, TENNIS.djokovic, TENNIS.medvedev]);
  await parierTournoi(ID.andre, t, TENNIS.medvedev, TENNIS.zverev); // le match neutralisé n'élimine personne
});

test('ATP Finals : une défaite en poule n’élimine pas, une défaite en demi-finale élimine', async () => {
  const t = await tournoi('pari_tournoi_ouvert', 'atp_finals');
  await b.admin("insert into public.matches (tournament_id, tour, p1_id, p2_id, statut, vainqueur, sets_joues) values ($1, 'RR', $2, $3, 'termine', 1, 2)", [t, TENNIS.alcaraz, TENNIS.fritz]);
  await parierTournoi(ID.andre, t, TENNIS.alcaraz, TENNIS.fritz); // Fritz a perdu en poule : toujours en lice
  await b.admin("insert into public.matches (tournament_id, tour, p1_id, p2_id, statut, vainqueur, sets_joues) values ($1, 'SF', $2, $3, 'termine', 1, 2)", [t, TENNIS.sinner, TENNIS.zverev]);
  await refuse(parierTournoi(ID.paul, t, TENNIS.zverev, TENNIS.alcaraz));
  await refuse(b.comme(ID.andre, 'update public.tournament_bets set finaliste_id = $1 where tournament_id = $2 and joueur_id = $3', [TENNIS.zverev, t, ID.andre]));
});

test('impossible de parier au nom d’un autre, ni sur un tournoi inexistant', async () => {
  const t = await tournoi();
  await refuse(b.comme(ID.andre, 'insert into public.tournament_bets (tournament_id, joueur_id, vainqueur_id, finaliste_id) values ($1, $2, 1, 2)', [t, ID.paul]));
  await refuse(b.comme(ID.lea, 'insert into public.tournament_bets (tournament_id, joueur_id, vainqueur_id, finaliste_id) values ($1, $2, 1, 2)', [t, ID.andre]));
  await refuse(parierTournoi(ID.andre, 987654, 1, 2));
  await refuse(parierTournoi(ID.andre, t, 1, 999)); // joueur de tennis inexistant
});

test('administrateur : joue les faux comptes, ne voit jamais les paris tournoi non révélés des vrais joueurs', async () => {
  const t = await tournoi();
  await parierTournoi(ID.lea, t, 1, 2);
  assert.deepEqual(await voir(ID.pierre, t), []);
  await b.comme(ID.pierre, 'insert into public.tournament_bets (tournament_id, joueur_id, vainqueur_id, finaliste_id) values ($1, $2, 3, 4)', [t, ID.andre]);
  assert.deepEqual(vus(await voir(ID.pierre, t)), [ID.andre]);
  await refuse(b.comme(ID.pierre, 'insert into public.tournament_bets (tournament_id, joueur_id, vainqueur_id, finaliste_id) values ($1, $2, 3, 4)', [t, ID.marc]));
});

test('exclusion d’un tournoi : le groupe se complète sans le joueur exclu', async () => {
  const t = await tournoi();
  await parierTournoi(ID.andre, t, 1, 2);
  await parierTournoi(ID.paul, t, 3, 4);
  assert.deepEqual(vus(await voir(ID.andre, t)), [ID.andre]);
  await b.comme(ID.pierre, 'insert into public.exclusions (joueur_id, tournament_id) values ($1, $2)', [ID.jacques, t]);
  assert.deepEqual(vus(await voir(ID.andre, t)), [ID.andre, ID.paul].sort());
  await refuse(parierTournoi(ID.jacques, t, 5, 6));
});

test('qui_a_parie_tournoi : qui a parié, sans le contenu, dans le groupe de la personne connectée', async () => {
  const t = await tournoi();
  await parierTournoi(ID.andre, t, 1, 2);
  const r = await b.comme(ID.paul, 'select * from public.qui_a_parie_tournoi($1)', [t]);
  assert.deepEqual(Object.keys(r.rows[0]).sort(), ['a_parie', 'joueur_id']);
  assert.deepEqual(Object.fromEntries(r.rows.map((l) => [l.joueur_id, l.a_parie])), { [ID.andre]: true, [ID.paul]: false, [ID.jacques]: false });
  const reel = await b.comme(ID.lea, 'select joueur_id from public.qui_a_parie_tournoi($1)', [t]);
  assert.deepEqual(vus(reel.rows), [...REELS].sort());
});

test('résultats archivés d’un tournoi : lisibles, mais écrits par l’administrateur seulement ; format exact contrôlé', async () => {
  const t = await tournoi('clos');
  await b.comme(ID.pierre, "insert into public.tournament_results (tournament_id, joueur_id, points_matchs, points_pari_tournoi, bonus_classement, score_final, rang) values ($1, $2, '45/2', '8', '5/3', '77/6', 1)", [t, ID.lea]);
  assert.equal((await b.comme(ID.andre, 'select * from public.tournament_results where tournament_id = $1', [t])).rows.length, 1);
  await refuse(b.comme(ID.pierre, "insert into public.tournament_results (tournament_id, joueur_id, points_matchs, points_pari_tournoi, bonus_classement, score_final, rang) values ($1, $2, '22,5', '8', '0', '30', 2)", [t, ID.marc]));
  await refuse(b.comme(ID.pierre, "insert into public.tournament_results (tournament_id, joueur_id, points_matchs, points_pari_tournoi, bonus_classement, score_final, rang) values ($1, $2, '1', '0', '0', '1', 0)", [t, ID.marc]));
  await refuse(b.comme(ID.lea, "update public.tournament_results set rang = 3 where tournament_id = $1", [t]).then((r) => { if (r.affectedRows === 0) throw new Error('permission denied (aucune ligne modifiée)'); }));
});
