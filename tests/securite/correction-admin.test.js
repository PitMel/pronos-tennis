// Migration 0002 — correction par l'administrateur : écriture « à l'aveugle », mention « corrigé par l'administrateur »,
// journal réservé à l'administrateur, droits par colonne, résultats modifiés à la main.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { creerBase, ID, TENNIS, TOURNOI, REFUSE } from './base.js';

let b;
before(async () => {
  b = await creerBase();
});

const refuse = (promesse, motif = REFUSE) => assert.rejects(promesse, motif);

const corriger = (uid, match, joueur, choix, confiance, sets = null, motif = null) =>
  b.comme(uid, 'select public.admin_saisir_pari($1, $2, $3, $4, $5, $6) as r', [match, joueur, choix, confiance, sets, motif]);
const corrigerTournoi = (uid, tournoi, joueur, vainqueur, finaliste, motif = null) =>
  b.comme(uid, 'select public.admin_saisir_pari_tournoi($1, $2, $3, $4, $5) as r', [tournoi, joueur, vainqueur, finaliste, motif]);
const pari = async (uid, match, joueur) =>
  (await b.comme(uid, 'select choix, confiance, sets, corrige_par_admin from public.bets where match_id = $1 and joueur_id = $2', [match, joueur])).rows;
const journal = async (uid) => (await b.comme(uid, 'select * from public.corrections_admin_visibles order by id')).rows;

/** Match du groupe réel : Pierre et Marc ont parié, Léa non ; match commencé puis terminé (résultat caché car non révélé). */
async function matchSansLea() {
  const m = await b.nouveauMatch();
  await b.parier(ID.pierre, m, 1, 8);
  await b.parier(ID.marc, m, 2, 7);
  await b.demarrer(m);
  await b.terminer(m, { vainqueur: 1, sets: 2 });
  return m;
}

// ------------------------------------------------------------------ qui peut corriger

test('un joueur ou un visiteur ne peut pas appeler la correction', async () => {
  const m = await matchSansLea();
  await refuse(corriger(ID.lea, m, ID.lea, 1, 8), /Seul l'administrateur/);
  await refuse(corriger(ID.andre, m, ID.andre, 1, 8), /Seul l'administrateur/);
  await refuse(b.anonyme('select public.admin_saisir_pari($1::bigint, $2::uuid, 1::smallint, 8::smallint, null::smallint, null::text)', [m, ID.lea]));
  await refuse(corrigerTournoi(ID.lea, TOURNOI.masters, ID.lea, TENNIS.alcaraz, TENNIS.sinner), /Seul l'administrateur/);
  await refuse(b.anonyme('select public.admin_saisir_pari_tournoi($1::bigint, $2::uuid, $3::bigint, $4::bigint, null::text)', [TOURNOI.masters, ID.lea, TENNIS.alcaraz, TENNIS.sinner]));
});

test('un administrateur désactivé perd le droit de corriger', async () => {
  const m = await matchSansLea();
  await b.admin('update public.profiles set actif = false where id = $1', [ID.pierre]);
  try {
    await refuse(corriger(ID.pierre, m, ID.lea, 1, 8), /Seul l'administrateur/);
  } finally {
    await b.admin('update public.profiles set actif = true where id = $1', [ID.pierre]);
  }
});

test('l’administrateur corrige son propre pari : mention posée, visible des autres, journal tenu', async () => {
  const m = await matchSansLea();
  assert.equal((await corriger(ID.pierre, m, ID.pierre, 2, 10, null, 'erreur de clic')).rows[0].r, 'remplace');
  assert.deepEqual(await pari(ID.pierre, m, ID.pierre), [{ choix: 2, confiance: 10, sets: null, corrige_par_admin: true }]);
  // quand le groupe est complet, les autres voient la mention sur le pari de Pierre
  await corriger(ID.pierre, m, ID.lea, 1, 8);
  assert.deepEqual(await pari(ID.marc, m, ID.pierre), [{ choix: 2, confiance: 10, sets: null, corrige_par_admin: true }]);
  const j = (await journal(ID.pierre)).filter((l) => l.ref_id === m && l.joueur_id === ID.pierre);
  assert.equal(j.length, 1);
  assert.deepEqual(j[0].avant, { choix: 1, confiance: 8, sets: null });
  assert.deepEqual(await journal(ID.marc), [], 'les autres joueurs ne voient pas le journal');
  // pari tournoi
  const t = TOURNOI.finals;
  assert.equal((await corrigerTournoi(ID.pierre, t, ID.pierre, TENNIS.alcaraz, TENNIS.sinner)).rows[0].r, 'cree');
  assert.equal((await b.admin('select corrige_par_admin from public.tournament_bets where tournament_id = $1 and joueur_id = $2', [t, ID.pierre])).rows[0].corrige_par_admin, true);
});

// ------------------------------------------------------------------ saisie à la place d'un joueur, après le match

test('pari manquant saisi après la fin du match : il complète le groupe, révèle les paris et porte la mention', async () => {
  const m = await matchSansLea();
  // avant : résultat caché pour tout le monde, paris non révélés
  assert.equal((await b.comme(ID.marc, 'select resultat_visible, vainqueur from public.matches_visibles where id = $1', [m])).rows[0].vainqueur, null);
  assert.deepEqual(await pari(ID.marc, m, ID.pierre), [], 'Marc ne voit pas le pari de Pierre avant la révélation');

  const r = await corriger(ID.pierre, m, ID.lea, 2, 9, null, 'Léa me l’a dit par téléphone');
  assert.equal(r.rows[0].r, 'cree');

  // après : tout le groupe voit tous les paris, la mention, et le résultat
  const vus = await b.comme(ID.marc, 'select joueur_id, corrige_par_admin from public.bets where match_id = $1 order by joueur_id', [m]);
  assert.equal(vus.rows.length, 3);
  assert.deepEqual(vus.rows.map((l) => [l.joueur_id, l.corrige_par_admin]),
    [[ID.pierre, false], [ID.lea, true], [ID.marc, false]]);
  assert.equal((await b.comme(ID.marc, 'select vainqueur from public.matches_visibles where id = $1', [m])).rows[0].vainqueur, 1);
});

test('pari révélé et match terminé : l’administrateur peut le réécrire, la mention apparaît, le joueur ne peut pas le défaire', async () => {
  const m = await matchSansLea();
  await corriger(ID.pierre, m, ID.lea, 2, 9);
  const r = await corriger(ID.pierre, m, ID.lea, 1, 6, null, 'erreur de saisie');
  assert.equal(r.rows[0].r, 'remplace');
  assert.deepEqual(await pari(ID.marc, m, ID.lea), [{ choix: 1, confiance: 6, sets: null, corrige_par_admin: true }]);
  // Léa elle-même reste verrouillée : paris révélés
  const maj = await b.comme(ID.lea, 'update public.bets set confiance = 10 where match_id = $1 and joueur_id = $2', [m, ID.lea]);
  assert.equal(maj.affectedRows, 0);
});

test('un joueur ne peut ni lire ni réécrire la mention « corrigé »', async () => {
  const m = await b.nouveauMatch();
  await refuse(b.comme(ID.lea, 'insert into public.bets (match_id, joueur_id, choix, confiance, corrige_par_admin) values ($1, $2, 1, 8, true)', [m, ID.lea]));
  await b.parier(ID.lea, m, 1, 8);
  await refuse(b.comme(ID.lea, 'update public.bets set corrige_par_admin = true where match_id = $1', [m]));
  await refuse(b.comme(ID.lea, 'update public.bets set corrige_le = now() where match_id = $1', [m]));
  await refuse(b.comme(ID.lea, 'update public.bets set joueur_id = $2 where match_id = $1', [m, ID.marc]));
  // l'administrateur non plus, hors fonction de correction, même pour un faux compte
  await refuse(b.comme(ID.pierre, 'insert into public.bets (match_id, joueur_id, choix, confiance, corrige_par_admin) values ($1, $2, 1, 8, true)', [m, ID.andre]));
  await refuse(b.comme(ID.pierre, 'insert into public.tournament_bets (tournament_id, joueur_id, vainqueur_id, finaliste_id, corrige_par_admin) values ($1, $2, $3, $4, true)',
    [TOURNOI.masters, ID.andre, TENNIS.alcaraz, TENNIS.sinner]));
});

// ------------------------------------------------------------------ écriture « à l'aveugle »

test('à l’aveugle : la correction ne montre pas le pari non révélé, et le journal masque avant / après', async () => {
  const m = await b.nouveauMatch();
  await b.parier(ID.lea, m, 2, 10); // seule Léa a parié : rien n'est révélé
  await b.demarrer(m);
  const r = await corriger(ID.pierre, m, ID.lea, 1, 6);
  assert.deepEqual(Object.keys(r.rows[0]), ['r']);
  assert.equal(r.rows[0].r, 'remplace');
  assert.deepEqual(await pari(ID.pierre, m, ID.lea), [], 'l’administrateur ne lit toujours pas le pari de Léa');
  const j = (await journal(ID.pierre)).filter((l) => l.ref_id === m);
  assert.equal(j.length, 1);
  assert.equal(j[0].contenu_visible, false);
  assert.equal(j[0].avant, null);
  assert.equal(j[0].apres, null);
});

test('le journal montre avant / après quand le pari est révélé ou appartient à un faux compte', async () => {
  const m = await matchSansLea();
  await corriger(ID.pierre, m, ID.lea, 2, 9, null, 'saisie');
  await corriger(ID.pierre, m, ID.lea, 1, 7, null, 'changement d’avis');
  const j = (await journal(ID.pierre)).filter((l) => l.ref_id === m && l.kind === 'match');
  assert.equal(j.length, 2);
  assert.ok(j.every((l) => l.contenu_visible));
  assert.equal(j[0].avant, null);
  assert.deepEqual(j[0].apres, { choix: 2, confiance: 9, sets: null });
  assert.deepEqual(j[1].avant, { choix: 2, confiance: 9, sets: null });
  assert.deepEqual(j[1].apres, { choix: 1, confiance: 7, sets: null });
  assert.equal(j[1].motif, 'changement d’avis');

  const m2 = await b.nouveauMatch();
  await b.parier(ID.andre, m2, 1, 8); // faux compte : jamais caché à l'administrateur
  await corriger(ID.pierre, m2, ID.andre, 2, 6);
  const j2 = (await journal(ID.pierre)).filter((l) => l.ref_id === m2);
  assert.equal(j2[0].contenu_visible, true);
  assert.deepEqual(j2[0].avant, { choix: 1, confiance: 8, sets: null });
});

test('le journal est réservé à l’administrateur', async () => {
  const m = await matchSansLea();
  await corriger(ID.pierre, m, ID.lea, 2, 9);
  assert.deepEqual(await journal(ID.lea), []);
  assert.deepEqual(await journal(ID.andre), []);
  await refuse(b.comme(ID.lea, 'select * from public.corrections_admin'));
  await refuse(b.anonyme('select * from public.corrections_admin_visibles'));
  await refuse(b.anonyme('select * from public.corrections_admin'));
  await refuse(b.comme(ID.pierre, 'select * from public.corrections_admin'), /permission denied/);
  await refuse(b.comme(ID.pierre, "delete from public.corrections_admin_visibles"), /cannot|permission denied/);
  await refuse(b.comme(ID.pierre, "insert into public.corrections_admin (joueur_id, kind, ref_id, apres) values ($1, 'match', $2, '{}')", [ID.lea, m]));
});

// ------------------------------------------------------------------ garde-fous

test('la correction respecte les contraintes de saisie', async () => {
  const m = await b.nouveauMatch();
  await refuse(corriger(ID.pierre, m, ID.lea, 1, 5));
  await refuse(corriger(ID.pierre, m, ID.lea, 3, 8));
  await refuse(corriger(ID.pierre, m, ID.lea, 1, 8, 3), /Grand Chelem/); // sets interdits hors Grand Chelem
  const gc = await b.nouveauMatch({ tournoi: TOURNOI.chelem });
  await refuse(corriger(ID.pierre, gc, ID.lea, 1, 8), /Grand Chelem/); // sets obligatoires
  assert.equal((await corriger(ID.pierre, gc, ID.lea, 1, 8, 4)).rows[0].r, 'cree');
  await refuse(corriger(ID.pierre, 999999, ID.lea, 1, 8), /inconnu/);
  assert.deepEqual(await pari(ID.lea, m, ID.lea), [], 'rien n’a été écrit par les tentatives refusées');
});

test('joueur inactif, exclu ou inexistant : correction refusée', async () => {
  const m = await b.nouveauMatch();
  await b.admin('insert into public.exclusions (joueur_id, tournament_id, match_id) values ($1, $2, $3)', [ID.marc, TOURNOI.masters, m]);
  await refuse(corriger(ID.pierre, m, ID.marc, 1, 8), /exclu/);
  await refuse(corriger(ID.pierre, m, '00000000-0000-4000-8000-0000000000ff', 1, 8), /exclu|inactif/);
});

test('tournoi clos : correction refusée tant qu’il n’est pas rouvert', async () => {
  const m = await b.nouveauMatch({ tournoi: TOURNOI.finals, tour: 'SF' });
  await b.admin("update public.tournaments set etat = 'clos' where id = $1", [TOURNOI.finals]);
  try {
    await refuse(corriger(ID.pierre, m, ID.lea, 1, 8), /clos/);
    await refuse(corrigerTournoi(ID.pierre, TOURNOI.finals, ID.lea, TENNIS.alcaraz, TENNIS.sinner), /clos/);
  } finally {
    await b.admin("update public.tournaments set etat = 'en_cours' where id = $1", [TOURNOI.finals]);
  }
  assert.equal((await corriger(ID.pierre, m, ID.lea, 1, 8)).rows[0].r, 'cree');
});

test('isolation des groupes : corriger un faux compte n’expose rien aux vrais joueurs', async () => {
  const m = await b.nouveauMatch();
  await corriger(ID.pierre, m, ID.andre, 1, 9);
  assert.deepEqual(await pari(ID.lea, m, ID.andre), []);
  assert.deepEqual(await pari(ID.paul, m, ID.andre), [], 'les autres faux comptes ne voient rien tant que non révélé');
  assert.equal((await pari(ID.pierre, m, ID.andre))[0].corrige_par_admin, true);
});

// ------------------------------------------------------------------ pari tournoi

test('pari tournoi : saisie à la place d’un joueur, avec mention, même si le joueur choisi est éliminé', async () => {
  const t = TOURNOI.masters;
  const m = await b.nouveauMatch({ p1: TENNIS.deminaur, p2: TENNIS.musetti });
  await b.terminer(m, { vainqueur: 1 }); // Musetti éliminé
  // un joueur ne peut pas choisir un éliminé…
  await refuse(b.comme(ID.lea, 'insert into public.tournament_bets (tournament_id, joueur_id, vainqueur_id, finaliste_id) values ($1, $2, $3, $4)',
    [t, ID.lea, TENNIS.musetti, TENNIS.alcaraz]), /éliminé/);
  // … l'administrateur peut saisir ce que Léa avait réellement parié
  const r = await corrigerTournoi(ID.pierre, t, ID.lea, TENNIS.musetti, TENNIS.alcaraz, 'pari fait avant son élimination');
  assert.equal(r.rows[0].r, 'cree');
  const ligne = (await b.admin('select corrige_par_admin, corrige_le is not null as date from public.tournament_bets where tournament_id = $1 and joueur_id = $2', [t, ID.lea])).rows[0];
  assert.deepEqual(ligne, { corrige_par_admin: true, date: true });
  const j = (await journal(ID.pierre)).filter((l) => l.kind === 'tournoi' && l.joueur_id === ID.lea);
  assert.equal(j.length, 1);
  assert.equal(j[0].contenu_visible, false, 'pari tournoi d’un vrai joueur non révélé : contenu masqué');
});

test('la dérogation « éliminé » n’est pas utilisable par un joueur ni par l’administrateur hors correction', async () => {
  const t = TOURNOI.masters;
  const m = await b.nouveauMatch({ p1: TENNIS.medvedev, p2: TENNIS.zverev });
  await b.terminer(m, { vainqueur: 1 }); // Zverev éliminé
  // un joueur qui fixe lui-même le réglage de session ne contourne rien
  await b.db.exec('set role authenticated');
  await b.db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ID.marc]);
  await b.db.query(`select set_config('pronos.correction_admin', 'on', false)`);
  await assert.rejects(
    b.db.query('insert into public.tournament_bets (tournament_id, joueur_id, vainqueur_id, finaliste_id) values ($1, $2, $3, $4)', [t, ID.marc, TENNIS.zverev, TENNIS.sinner]),
    /éliminé/);
  await b.db.exec('reset role');
  await b.db.query(`select set_config('pronos.correction_admin', '', false)`);
  await b.db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  // l'administrateur écrivant directement pour un faux compte reste soumis à la règle
  await refuse(b.comme(ID.pierre, 'insert into public.tournament_bets (tournament_id, joueur_id, vainqueur_id, finaliste_id) values ($1, $2, $3, $4)',
    [t, ID.jacques, TENNIS.zverev, TENNIS.sinner]), /éliminé/);
});

// ------------------------------------------------------------------ résultat modifié à la main

test('résultat modifié par l’administrateur connecté : match marqué « modifié manuellement » ; pas par la synchronisation', async () => {
  const m = await b.nouveauMatch();
  const lire = async () => (await b.admin('select modifie_manuellement from public.matches where id = $1', [m])).rows[0].modifie_manuellement;
  assert.equal(await lire(), false);
  await b.admin("update public.matches set statut = 'en_cours', debut_detecte = now() where id = $1", [m]); // synchronisation (sans identité)
  assert.equal(await lire(), false);
  await b.comme(ID.pierre, 'update public.matches set heure_prevue = now() where id = $1', [m]); // pas un résultat
  assert.equal(await lire(), false);
  await b.comme(ID.pierre, "update public.matches set statut = 'termine', vainqueur = 2, sets_joues = 2 where id = $1", [m]);
  assert.equal(await lire(), true);
});

test('la neutralisation par l’administrateur marque aussi le match', async () => {
  const m = await b.nouveauMatch();
  await b.comme(ID.pierre, 'update public.matches set neutralise = true where id = $1', [m]);
  assert.equal((await b.admin('select modifie_manuellement from public.matches where id = $1', [m])).rows[0].modifie_manuellement, true);
});

test('pari tournoi réécrit par l’administrateur : « remplace », mention posée, journal avant / après (faux compte)', async () => {
  const t = TOURNOI.finals;
  await b.comme(ID.pierre, 'insert into public.tournament_bets (tournament_id, joueur_id, vainqueur_id, finaliste_id) values ($1, $2, $3, $4)',
    [t, ID.paul, TENNIS.alcaraz, TENNIS.fritz]);
  assert.equal((await b.admin('select corrige_par_admin from public.tournament_bets where tournament_id = $1 and joueur_id = $2', [t, ID.paul])).rows[0].corrige_par_admin, false);
  const r = await corrigerTournoi(ID.pierre, t, ID.paul, TENNIS.sinner, TENNIS.alcaraz);
  assert.equal(r.rows[0].r, 'remplace');
  const l = (await b.admin('select vainqueur_id, finaliste_id, corrige_par_admin from public.tournament_bets where tournament_id = $1 and joueur_id = $2', [t, ID.paul])).rows[0];
  assert.deepEqual(l, { vainqueur_id: TENNIS.sinner, finaliste_id: TENNIS.alcaraz, corrige_par_admin: true });
  const j = (await journal(ID.pierre)).filter((x) => x.kind === 'tournoi' && x.joueur_id === ID.paul);
  assert.equal(j.length, 1);
  assert.deepEqual(j[0].avant, { vainqueur_id: TENNIS.alcaraz, finaliste_id: TENNIS.fritz });
  assert.deepEqual(j[0].apres, { vainqueur_id: TENNIS.sinner, finaliste_id: TENNIS.alcaraz });
});

test('droits : rien d’ouvert au visiteur non connecté (anon) sur les nouveaux objets', async () => {
  const q = async (sql) => (await b.admin(sql)).rows[0].ok;
  assert.equal(await q("select has_function_privilege('anon', 'public.admin_saisir_pari(bigint, uuid, smallint, smallint, smallint, text)', 'execute') as ok"), false);
  assert.equal(await q("select has_function_privilege('anon', 'public.admin_saisir_pari_tournoi(bigint, uuid, bigint, bigint, text)', 'execute') as ok"), false);
  assert.equal(await q("select has_function_privilege('anon', 'public.trg_matches_marquer_manuel()', 'execute') as ok"), false);
  assert.equal(await q("select has_function_privilege('authenticated', 'public.trg_matches_marquer_manuel()', 'execute') as ok"), false);
  assert.equal(await q("select has_table_privilege('anon', 'public.corrections_admin_visibles', 'select') as ok"), false);
  assert.equal(await q("select has_table_privilege('anon', 'public.corrections_admin', 'select') as ok"), false);
  assert.equal(await q("select has_table_privilege('authenticated', 'public.corrections_admin', 'select') as ok"), false);
  assert.equal(await q("select has_table_privilege('authenticated', 'public.corrections_admin_visibles', 'insert') as ok"), false);
});
