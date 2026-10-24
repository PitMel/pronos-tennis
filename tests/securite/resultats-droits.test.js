// Sécurité : résultats masqués, droits d'écriture, élévation de privilèges, fonctions internes.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { creerBase, ID, TESTS, REELS, TOURNOI, TENNIS, REFUSE } from './base.js';

let b;
before(async () => {
  b = await creerBase();
});

const refuse = (promesse) => assert.rejects(promesse, REFUSE);
const vue = async (uid, match) => (await b.comme(uid, 'select * from public.matches_visibles where id = $1', [match])).rows[0];

// ------------------------------------------------------------------ résultats masqués

test('table matches : illisible pour un joueur (aucune ligne), lisible par l’administrateur', async () => {
  const m = await b.nouveauMatch();
  await b.terminer(m, { vainqueur: 2, sets: 2 });
  assert.equal((await b.comme(ID.andre, 'select * from public.matches where id = $1', [m])).rows.length, 0);
  assert.equal((await b.comme(ID.lea, 'select * from public.matches')).rows.length, 0);
  const admin = await b.comme(ID.pierre, 'select vainqueur from public.matches where id = $1', [m]);
  assert.deepEqual(admin.rows, [{ vainqueur: 2 }]);
});

test('match terminé mais paris non révélés : vainqueur, score et sets restent masqués', async () => {
  const m = await b.nouveauMatch();
  await b.parier(ID.andre, m, 1, 8); // Paul et Jacques n'ont pas parié
  await b.admin(`update public.matches set statut = 'termine', vainqueur = 2, sets_joues = 2,
                 score = '{"sets":[[7,6],[6,4]]}'::jsonb, fin_match = 'abandon' where id = $1`, [m]);
  for (const uid of [ID.andre, ID.paul, ID.jacques]) {
    const v = await vue(uid, m);
    assert.equal(v.statut, 'termine', 'le statut « terminé » reste visible');
    assert.equal(v.vainqueur, null);
    assert.equal(v.sets_joues, null);
    assert.equal(v.score, null);
    assert.equal(v.fin_match, null, 'même le type de fin (abandon) est masqué');
    assert.equal(v.resultat_visible, false);
    assert.equal(v.paris_reveles, false);
    assert.equal(v.verrouille, true);
  }
});

test('match terminé et tous ont parié : le résultat devient visible', async () => {
  const m = await b.nouveauMatch();
  for (const uid of TESTS) await b.parier(uid, m, 1, 8);
  await b.terminer(m, { vainqueur: 2, sets: 3 });
  const v = await vue(ID.paul, m);
  assert.equal(v.vainqueur, 2);
  assert.equal(v.sets_joues, 3);
  assert.equal(v.resultat_visible, true);
});

test('tous ont parié mais match pas terminé : aucun résultat, même si un vainqueur est déjà saisi', async () => {
  const m = await b.nouveauMatch();
  for (const uid of TESTS) await b.parier(uid, m, 1, 8);
  await b.admin("update public.matches set statut = 'en_cours', debut_detecte = now(), vainqueur = 1, sets_joues = 1 where id = $1", [m]);
  const v = await vue(ID.andre, m);
  assert.equal(v.paris_reveles, true);
  assert.equal(v.resultat_visible, false);
  assert.equal(v.vainqueur, null);
  assert.equal(v.sets_joues, null);
});

test('le résultat d’un groupe n’est pas dévoilé par la révélation de l’autre groupe', async () => {
  const m = await b.nouveauMatch();
  for (const uid of TESTS) await b.parier(uid, m, 1, 8); // groupe test complet, groupe réel non
  await b.terminer(m, { vainqueur: 1, sets: 2 });
  assert.equal((await vue(ID.andre, m)).vainqueur, 1);
  for (const uid of [ID.lea, ID.marc]) {
    const v = await vue(uid, m);
    assert.equal(v.vainqueur, null, 'le vrai groupe n’a pas fini de parier : résultat masqué');
    assert.equal(v.paris_reveles, false);
  }
});

test('match neutralisé et terminé : résultat visible (les paris sont révélés)', async () => {
  const m = await b.nouveauMatch();
  await b.parier(ID.andre, m, 1, 8);
  await b.admin('update public.matches set neutralise = true where id = $1', [m]);
  await b.terminer(m, { vainqueur: 1, sets: 2 });
  const v = await vue(ID.paul, m);
  assert.equal(v.neutralise, true);
  assert.equal(v.vainqueur, 1);
});

test('indicateur « verrouillé » : faux avant tout, vrai au début du match ou quand tout le monde a parié', async () => {
  const m = await b.nouveauMatch();
  assert.equal((await vue(ID.andre, m)).verrouille, false);
  await b.demarrer(m);
  assert.equal((await vue(ID.andre, m)).verrouille, true);
  const m2 = await b.nouveauMatch();
  for (const uid of TESTS) await b.parier(uid, m2, 1, 8);
  assert.equal((await vue(ID.andre, m2)).verrouille, true);
  assert.equal((await vue(ID.lea, m2)).verrouille, false, 'le groupe réel peut encore parier');
});

test('la vue ne dévoile aucune colonne brute supplémentaire (pas de modifie_manuellement, api_id…)', async () => {
  const m = await b.nouveauMatch();
  const v = await vue(ID.andre, m);
  assert.deepEqual(Object.keys(v).sort(), [
    'debut_detecte', 'fin_match', 'heure_prevue', 'id', 'neutralise', 'p1_id', 'p2_id', 'paris_reveles',
    'resultat_visible', 'score', 'sets_joues', 'statut', 'tour', 'tournament_id', 'vainqueur', 'verrouille',
  ]);
});

// ------------------------------------------------------------------ écriture réservée à l'administrateur

test('un joueur ne peut écrire ni matchs, ni tournois, ni joueurs de tennis, ni résultats, ni exclusions', async () => {
  const m = await b.nouveauMatch();
  for (const uid of [ID.andre, ID.lea]) {
    await refuse(b.comme(uid, 'insert into public.matches (tournament_id, tour, p1_id, p2_id) values (1, $1, 1, 2)', ['QF']));
    assert.equal((await b.comme(uid, "update public.matches set vainqueur = 1, statut = 'termine' where id = $1", [m])).affectedRows, 0);
    assert.equal((await b.comme(uid, 'delete from public.matches where id = $1', [m])).affectedRows, 0);
    await refuse(b.comme(uid, "insert into public.tournaments (annee, nom, categorie) values (2027, 'Faux', 'masters_1000')"));
    assert.equal((await b.comme(uid, "update public.tournaments set etat = 'clos'")).affectedRows, 0);
    await refuse(b.comme(uid, "insert into public.players (nom) values ('Intrus')"));
    assert.equal((await b.comme(uid, "update public.players set nom = 'X'")).affectedRows, 0);
    await refuse(b.comme(uid, "insert into public.tournament_results (tournament_id, joueur_id, points_matchs, points_pari_tournoi, bonus_classement, score_final, rang) values (1, $1, '1','0','0','1',1)", [uid]));
    await refuse(b.comme(uid, "insert into public.tournament_api_ids (api_id, tournament_id) values ('x', 1)"));
  }
  assert.equal((await b.admin('select count(*)::int as n from public.matches where id = $1', [m])).rows[0].n, 1);
});

test('l’administrateur écrit les données de référence et les matchs', async () => {
  await b.comme(ID.pierre, "insert into public.players (api_id, nom) values ('px', 'Nouveau joueur')");
  const t = await b.comme(ID.pierre, "insert into public.tournaments (annee, nom, categorie) values (2027, 'Open d''Australie', 'grand_slam') returning id");
  const tid = t.rows[0].id;
  await b.comme(ID.pierre, "insert into public.tournament_api_ids (api_id, tournament_id) values ('9001', $1)", [tid]);
  await b.comme(ID.pierre, "insert into public.matches (tournament_id, tour, p1_id, p2_id) values ($1, 'R16', 1, 2)", [tid]);
  const r = await b.comme(ID.pierre, "update public.tournaments set etat = 'pari_tournoi_ouvert' where id = $1", [tid]);
  assert.equal(r.affectedRows, 1);
});

test('un tour qui n’existe pas dans la catégorie du tournoi est refusé (même par l’administrateur)', async () => {
  const gc = TOURNOI.chelem;
  await assert.rejects(b.admin("insert into public.matches (tournament_id, tour, p1_id, p2_id) values ($1, 'RR', 1, 2)", [gc]), /n'existe pas/);
  await assert.rejects(b.admin("insert into public.matches (tournament_id, tour, p1_id, p2_id) values ($1, 'R16', 1, 2)", [TOURNOI.finals]), /n'existe pas/);
  await assert.rejects(b.comme(ID.pierre, "insert into public.matches (tournament_id, tour, p1_id, p2_id) values ($1, 'RR', 1, 2)", [TOURNOI.masters]), /n'existe pas/);
});

test('contraintes de match : même joueur des deux côtés, vainqueur invalide, terminé sans vainqueur', async () => {
  await assert.rejects(b.admin("insert into public.matches (tournament_id, tour, p1_id, p2_id) values (1, 'QF', 3, 3)"));
  await assert.rejects(b.admin("insert into public.matches (tournament_id, tour, p1_id, p2_id, vainqueur) values (1, 'QF', 3, 4, 3)"));
  await assert.rejects(b.admin("insert into public.matches (tournament_id, tour, p1_id, p2_id, statut) values (1, 'QF', 3, 4, 'termine')"));
  // forfait et neutralisation peuvent être « terminés » sans vainqueur
  await b.admin("insert into public.matches (tournament_id, tour, p1_id, p2_id, statut, fin_match) values (1, 'QF', 3, 4, 'termine', 'forfait')");
  await b.admin("insert into public.matches (tournament_id, tour, p1_id, p2_id, statut, neutralise) values (1, 'QF', 3, 4, 'termine', true)");
});

test('journal de synchronisation : lisible par l’administrateur seulement, écrit par le service seulement', async () => {
  await b.admin("insert into public.sync_log (endpoint, http_status, ok, quota_restant, message) values ('/matches', 200, true, 90, 'ok')");
  assert.equal((await b.comme(ID.pierre, 'select * from public.sync_log')).rows.length, 1);
  assert.equal((await b.comme(ID.andre, 'select * from public.sync_log')).rows.length, 0);
  await refuse(b.comme(ID.pierre, "insert into public.sync_log (endpoint) values ('x')"));
  await refuse(b.comme(ID.andre, "insert into public.sync_log (endpoint) values ('x')"));
});

// ------------------------------------------------------------------ comptes et élévation de privilèges

test('un joueur ne peut pas se donner les droits d’administrateur, ni changer de groupe ou se réactiver', async () => {
  await refuse(b.comme(ID.andre, 'update public.profiles set is_admin = true where id = $1', [ID.andre]));
  await refuse(b.comme(ID.lea, 'update public.profiles set is_admin = true where id = $1', [ID.lea]));
  await refuse(b.comme(ID.lea, 'update public.profiles set is_test = true where id = $1', [ID.lea]));
  await refuse(b.comme(ID.lea, "update public.profiles set prenom = 'Pirate' where id = $1", [ID.lea]));
  await b.admin('update public.profiles set actif = false where id = $1', [ID.marc]);
  await refuse(b.comme(ID.marc, 'update public.profiles set actif = true where id = $1', [ID.marc]));
  await b.admin('update public.profiles set actif = true where id = $1', [ID.marc]);
  const r = await b.admin('select is_admin, is_test, actif, prenom from public.profiles where id = $1', [ID.lea]);
  assert.deepEqual(r.rows[0], { is_admin: false, is_test: false, actif: true, prenom: 'Léa' });
});

test('un joueur peut changer sa couleur et sa photo, mais pas celles des autres', async () => {
  const ok = await b.comme(ID.lea, "update public.profiles set couleur = '#112233', photo_url = 'photos/lea.jpg' where id = $1", [ID.lea]);
  assert.equal(ok.affectedRows, 1);
  const autre = await b.comme(ID.lea, "update public.profiles set couleur = '#000000' where id = $1", [ID.marc]);
  assert.equal(autre.affectedRows, 0);
  await refuse(b.comme(ID.lea, "update public.profiles set couleur = 'rouge' where id = $1", [ID.lea]));
});

test('personne ne crée ni ne supprime de profil depuis le navigateur', async () => {
  await refuse(b.comme(ID.pierre, "insert into public.profiles (id, prenom) values (gen_random_uuid(), 'Fantôme')"));
  await refuse(b.comme(ID.pierre, 'delete from public.profiles where id = $1', [ID.lea]));
  await refuse(b.comme(ID.lea, 'delete from public.profiles where id = $1', [ID.lea]));
});

test('l’administrateur peut désactiver ou réactiver un compte, même le sien est protégé du changement de droits', async () => {
  const r = await b.comme(ID.pierre, 'update public.profiles set actif = false where id = $1', [ID.paul]);
  assert.equal(r.affectedRows, 1);
  await b.comme(ID.pierre, 'update public.profiles set actif = true where id = $1', [ID.paul]);
  await refuse(b.comme(ID.pierre, 'update public.profiles set is_admin = false where id = $1', [ID.pierre])); // colonne non modifiable depuis le navigateur
});

test('un administrateur désactivé perd ses droits', async () => {
  await b.admin('update public.profiles set actif = false where id = $1', [ID.pierre]);
  try {
    assert.equal((await b.comme(ID.pierre, 'select public.est_admin() as a')).rows[0].a, false);
    await refuse(b.comme(ID.pierre, "insert into public.players (nom) values ('X')"));
  } finally {
    await b.admin('update public.profiles set actif = true where id = $1', [ID.pierre]);
  }
});

// ------------------------------------------------------------------ fonctions et tables internes

test('tables et fonctions internes inaccessibles depuis le navigateur', async () => {
  const m = await b.nouveauMatch();
  for (const uid of [ID.andre, ID.pierre]) {
    await refuse(b.comme(uid, 'select * from public.revelations'));
    await refuse(b.comme(uid, "insert into public.revelations (kind, ref_id, groupe_test) values ('match', $1, true)", [m]));
    await refuse(b.comme(uid, 'select public.groupe_complet_match($1, true)', [m]));
    await refuse(b.comme(uid, 'select public.groupe_complet_tournoi(1, true)'));
    await refuse(b.comme(uid, 'select public.maj_toutes_revelations()'));
    await refuse(b.comme(uid, 'select public.maj_revelations_match($1)', [m]));
    await refuse(b.comme(uid, 'select public.joueur_elimine(1, 1)'));
  }
});

test('on ne peut pas forcer une révélation en écrivant dans revelations', async () => {
  const m = await b.nouveauMatch();
  await b.parier(ID.andre, m, 1, 8);
  await refuse(b.comme(ID.paul, "insert into public.revelations (kind, ref_id, groupe_test) values ('match', $1, true)", [m]));
  assert.deepEqual(await b.voirParis(ID.paul, m), []);
});

test('le rôle « service » (synchronisation) contourne la sécurité par lignes : il lit et écrit tout', async () => {
  const m = await b.nouveauMatch();
  await b.parier(ID.andre, m, 1, 8);
  const lu = await b.comme(null, 'select count(*)::int as n from public.bets where match_id = $1', [m], 'service_role');
  assert.equal(lu.rows[0].n, 1);
  await b.comme(null, "update public.matches set statut = 'en_cours', debut_detecte = now() where id = $1", [m], 'service_role');
  await refuse(b.parier(ID.paul, m, 2, 7));
  await b.comme(null, "insert into public.sync_log (endpoint, ok) values ('/matches', true)", [], 'service_role');
});

test('un joueur n’usurpe pas une identité en changeant de jeton : la lecture suit toujours l’identité du jeton', async () => {
  const m = await b.nouveauMatch();
  await b.parier(ID.andre, m, 1, 8);
  // un jeton sans identité (rôle authenticated mais sub vide) ne donne accès à aucun pari ni résultat
  assert.equal((await b.comme('', 'select * from public.bets where match_id = $1', [m])).rows.length, 0);
  assert.equal((await b.comme('', 'select * from public.matches_visibles')).rows.length, 0);
  assert.equal((await b.comme('', 'select * from public.qui_a_parie($1)', [m])).rows.length, 0);
  await refuse(b.comme('', 'insert into public.bets (match_id, choix, confiance) values ($1, 1, 8)', [m]));
});
