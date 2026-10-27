// Migration 0006 — clôture forcée, correction et réouverture par l'administrateur ; droits ; la clôture automatique garde ses conditions.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { creerBase, ID, TESTS, TENNIS } from './base.js';

let b;
let compteur = 0;
before(async () => { b = await creerBase(); });

const comme = (uid, sql, params = []) => b.comme(uid, sql, params);
const service = (sql, params = []) => b.comme(null, sql, params, 'service_role');
const lire = async (t) => (await comme(ID.pierre, 'select public.admin_donnees_cloture($1) as r', [t])).rows[0].r;
const cloturer = async (uid, t, res, v = TENNIS.alcaraz, f = TENNIS.sinner) =>
  (await comme(uid, 'select public.admin_cloturer_tournoi($1, $2::jsonb, $3, $4) as r', [t, JSON.stringify(res), v, f])).rows[0].r;
const etat = async (t) => (await b.admin('select etat, vainqueur_id, finaliste_id, cloture_auto_desactivee from public.tournaments where id = $1', [t])).rows[0];
const resultats = (uids, score = '36') => uids.map((u, i) => ({ joueur_id: u, points_matchs: '32', points_pari_tournoi: '0', bonus_classement: '4', score_final: score, rang: i + 1 }));

/** SF + F, deux faux comptes sur trois ont parié (André et Paul) : la clôture automatique est impossible. */
async function scene() {
  compteur += 1;
  const t = (await b.admin("insert into public.tournaments (annee, nom, categorie, etat) values (2026, $1, 'masters_1000', 'en_cours') returning id", [`Admin clôture ${compteur}`])).rows[0].id;
  const sf = await b.nouveauMatch({ tournoi: t, tour: 'SF', p1: TENNIS.alcaraz, p2: TENNIS.fritz });
  const f = await b.nouveauMatch({ tournoi: t, tour: 'F', p1: TENNIS.alcaraz, p2: TENNIS.sinner });
  for (const m of [sf, f]) for (const u of [ID.andre, ID.paul]) await b.parier(u, m, 1, 8);
  await b.terminer(sf, { vainqueur: 1, sets: 2 });
  await b.terminer(f, { vainqueur: 1, sets: 2 });
  return { t, sf, f };
}

test('droits : joueur, anonyme et service ne peuvent rien faire de ces fonctions', async () => {
  const { t } = await scene();
  await assert.rejects(comme(ID.andre, 'select public.admin_donnees_cloture($1)', [t]), /administrateur/);
  await assert.rejects(comme(ID.lea, 'select public.admin_rouvrir_tournoi($1)', [t]), /administrateur/);
  await assert.rejects(cloturer(ID.andre, t, [], 1, 2), /administrateur/);
  await assert.rejects(b.anonyme('select public.admin_donnees_cloture($1)', [t]), /permission denied|administrateur/);
  await assert.rejects(service('select public.admin_cloturer_tournoi($1, $2::jsonb, 1, 2)', [t, '[]']), /permission denied|administrateur/);
  await assert.rejects(comme(ID.andre, 'select public.donnees_cloture_brutes($1)', [t]), /permission denied/);
  assert.equal((await etat(t)).etat, 'en_cours');
});

test('la clôture automatique garde ses conditions (André et Paul ont parié, Jacques non)', async () => {
  const { t } = await scene();
  await assert.rejects(service('select public.sync_donnees_cloture($1)', [t]), /conditions non remplies/);
});

test('lecture par l’administrateur : données du groupe qui a parié, résultat de la finale, état', async () => {
  const { t } = await scene();
  const d = await lire(t);
  assert.equal(d.groupes.length, 1);
  assert.equal(d.groupes[0].test, true);
  assert.deepEqual([...d.groupes[0].joueurs].sort(), [...TESTS].sort());
  assert.equal(d.groupes[0].paris.length, 4);
  assert.deepEqual(d.resultat, { vainqueur_id: TENNIS.alcaraz, finaliste_id: TENNIS.sinner });
  assert.equal(d.etat, 'en_cours');
  assert.equal(d.situation.eligible, false);
  assert.equal(d.matchs.length, 2);
});

test('lecture sans finale jouée : résultat nul, pas d’erreur', async () => {
  const { t, f } = await scene();
  await b.admin("update public.matches set statut = 'a_venir', vainqueur = null, sets_joues = null where id = $1", [f]);
  assert.equal((await lire(t)).resultat, null);
});

test('clôture forcée : refus si résultats incomplets, vainqueur = finaliste, ou tournoi inconnu', async () => {
  const { t } = await scene();
  await assert.rejects(cloturer(ID.pierre, t, resultats([ID.andre, ID.paul])), /incomplets/);
  await assert.rejects(cloturer(ID.pierre, t, resultats(TESTS), TENNIS.alcaraz, TENNIS.alcaraz), /différents/);
  await assert.rejects(cloturer(ID.pierre, t, resultats(TESTS), null, TENNIS.alcaraz), /différents/);
  await assert.rejects(cloturer(ID.pierre, 99999, []), /inconnu/);
  assert.equal((await b.admin('select count(*)::int as n from public.tournament_results where tournament_id = $1', [t])).rows[0].n, 0);
  assert.equal((await etat(t)).etat, 'en_cours');
});

test('clôture forcée : archive, état clos, vainqueur et finaliste, révélations, clôture automatique désactivée', async () => {
  const { t, sf, f } = await scene();
  const r = await cloturer(ID.pierre, t, resultats(TESTS));
  assert.deepEqual(r, { statut: 'cloture', resultats: 3 });
  assert.deepEqual(await etat(t), { etat: 'clos', vainqueur_id: TENNIS.alcaraz, finaliste_id: TENNIS.sinner, cloture_auto_desactivee: true });
  assert.equal((await b.admin('select count(*)::int as n from public.tournament_results where tournament_id = $1', [t])).rows[0].n, 3);
  const rev = (await b.admin("select kind, ref_id from public.revelations where groupe_test and (ref_id in ($1, $2) and kind = 'match' or ref_id = $3 and kind = 'tournoi') order by kind, ref_id", [sf, f, t])).rows;
  assert.equal(rev.length, 3);
  // le groupe réel n'avait aucun pari : rien de révélé pour lui
  assert.equal((await b.admin('select count(*)::int as n from public.revelations where not groupe_test and (ref_id = $1 or ref_id = $2 or ref_id = $3)', [sf, f, t])).rows[0].n, 0);
});

test('correction d’une clôture : archive remplacée, état toujours clos', async () => {
  const { t } = await scene();
  await cloturer(ID.pierre, t, resultats(TESTS, '36'));
  const r = await cloturer(ID.pierre, t, resultats(TESTS, '10'), TENNIS.sinner, TENNIS.alcaraz);
  assert.deepEqual(r, { statut: 'corrige', resultats: 3 });
  const lignes = (await b.admin('select distinct score_final from public.tournament_results where tournament_id = $1', [t])).rows;
  assert.deepEqual(lignes, [{ score_final: '10' }]);
  assert.deepEqual(await etat(t), { etat: 'clos', vainqueur_id: TENNIS.sinner, finaliste_id: TENNIS.alcaraz, cloture_auto_desactivee: true });
});

test('réouverture : en cours, archive et vainqueur effacés, clôture automatique refusée ; deuxième appel sans effet', async () => {
  const { t } = await scene();
  await cloturer(ID.pierre, t, resultats(TESTS));
  assert.deepEqual((await comme(ID.pierre, 'select public.admin_rouvrir_tournoi($1) as r', [t])).rows[0].r, { statut: 'rouvert' });
  assert.deepEqual(await etat(t), { etat: 'en_cours', vainqueur_id: null, finaliste_id: null, cloture_auto_desactivee: true });
  assert.equal((await b.admin('select count(*)::int as n from public.tournament_results where tournament_id = $1', [t])).rows[0].n, 0);
  await assert.rejects(service('select public.sync_cloturer_tournoi($1, $2::jsonb)', [t, JSON.stringify(resultats(TESTS))]), /désactivée|conditions/);
  assert.deepEqual((await comme(ID.pierre, 'select public.admin_rouvrir_tournoi($1) as r', [t])).rows[0].r, { statut: 'deja_ouvert' });
});

test('clôture d’un tournoi sans aucun pari : permise, archive vide', async () => {
  compteur += 1;
  const t = (await b.admin("insert into public.tournaments (annee, nom, categorie, etat) values (2026, $1, 'masters_1000', 'en_cours') returning id", [`Sans pari ${compteur}`])).rows[0].id;
  assert.deepEqual(await cloturer(ID.pierre, t, [], TENNIS.alcaraz, TENNIS.sinner), { statut: 'cloture', resultats: 0 });
  assert.equal((await etat(t)).etat, 'clos');
});
