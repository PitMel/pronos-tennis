// Migration 0005 — clôture automatique : conditions (finale comptée, matchs révélés, groupe sans pari ignoré),
// données pour le moteur, enregistrement atomique, réouverture par l'administrateur, droits.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { creerBase, ID, TESTS, TENNIS, REFUSE } from './base.js';

let b;
let compteur = 0;
before(async () => { b = await creerBase(); });

const service = (sql, params = []) => b.comme(null, sql, params, 'service_role');
const situation = async (t) => (await service('select public.sync_cloture_situation($1) as r', [t])).rows[0].r;
const candidats = async () => (await service('select public.sync_cloture_candidats() as r')).rows[0].r;
const donnees = async (t) => (await service('select public.sync_donnees_cloture($1) as r', [t])).rows[0].r;
const cloturer = async (t, res) => (await service('select public.sync_cloturer_tournoi($1, $2::jsonb) as r', [t, JSON.stringify(res)])).rows[0].r;
const etat = async (t) => (await b.admin('select etat, vainqueur_id, finaliste_id, cloture_auto_desactivee from public.tournaments where id = $1', [t])).rows[0];
const groupe = (s, test) => s.groupes.find((g) => g.test === test);

async function tournoi(categorie = 'masters_1000') {
  compteur += 1;
  return (await b.admin("insert into public.tournaments (annee, nom, categorie, etat) values (2026, $1, $2, 'en_cours') returning id", [`Clôture ${compteur}`, categorie])).rows[0].id;
}
/** SF + F (joueurs 1-2 et 3-4 ; finale 1 contre 3), paris non encore faits. */
async function scene() {
  const t = await tournoi();
  const sf = await b.nouveauMatch({ tournoi: t, tour: 'SF', p1: TENNIS.alcaraz, p2: TENNIS.fritz });
  const f = await b.nouveauMatch({ tournoi: t, tour: 'F', p1: TENNIS.alcaraz, p2: TENNIS.sinner });
  return { t, sf, f };
}
const parierTous = async (uids, matchs, choix = 1) => { for (const m of matchs) for (const u of uids) await b.parier(u, m, choix, 8); };
const finir = async ({ sf, f }, vainqueurFinale = 1) => { await b.terminer(sf, { vainqueur: 1, sets: 2 }); await b.terminer(f, { vainqueur: vainqueurFinale, sets: 2 }); };
const resultatsValides = (uids) => uids.map((u, i) => ({ joueur_id: u, points_matchs: '10', points_pari_tournoi: '2', bonus_classement: i === 0 ? '9/2' : '0', score_final: i === 0 ? '33/2' : '12', rang: i + 1 }));

test('aucun pari nulle part : jamais éligible, même finale terminée', async () => {
  const s = await scene();
  await finir(s);
  const r = await situation(s.t);
  assert.equal(r.finale_comptee, true);
  assert.deepEqual(r.groupes.map((g) => g.avec_paris), [false, false]);
  assert.equal(r.eligible, false);
});

test('groupe test complet, groupe réel sans aucun pari : éligible (le groupe sans pari est ignoré)', async () => {
  const s = await scene();
  await parierTous(TESTS, [s.sf, s.f]);
  await finir(s);
  const r = await situation(s.t);
  assert.deepEqual([groupe(r, true).avec_paris, groupe(r, false).avec_paris], [true, false]);
  assert.equal(groupe(r, true).matchs_non_reveles, 0);
  assert.equal(r.eligible, true);
  assert.ok((await candidats()).some((c) => c.tournoi_id === s.t && c.eligible));
});

test('un joueur n\'a pas parié sur un match : bloqué ; le match neutralisé débloque', async () => {
  const s = await scene();
  await parierTous(TESTS, [s.f]);
  await parierTous([ID.andre, ID.paul], [s.sf]);
  await finir(s);
  let r = await situation(s.t);
  assert.equal(groupe(r, true).matchs_non_reveles, 1);
  assert.equal(r.eligible, false);
  await b.admin('update public.matches set neutralise = true where id = $1', [s.sf]);
  r = await situation(s.t);
  assert.equal(groupe(r, true).matchs_non_reveles, 0);
  assert.equal(r.eligible, true);
});

test('finale non terminée, ou terminée sans vainqueur (forfait) : jamais éligible', async () => {
  let s = await scene();
  await parierTous(TESTS, [s.sf, s.f]);
  await b.terminer(s.sf, { vainqueur: 1, sets: 2 });
  assert.equal((await situation(s.t)).eligible, false, 'finale à venir');
  await b.demarrer(s.f);
  assert.equal((await situation(s.t)).eligible, false, 'finale en cours');
  await b.admin("update public.matches set statut = 'termine', fin_match = 'forfait', vainqueur = null where id = $1", [s.f]);
  const r = await situation(s.t);
  assert.equal(r.finale_comptee, false);
  assert.equal(r.eligible, false);
  await b.admin("update public.matches set vainqueur = 2, fin_match = 'abandon' where id = $1", [s.f]);
  assert.equal((await situation(s.t)).eligible, true, 'abandon en finale : vainqueur connu, éligible');
});

test('les deux groupes ont parié : tous les deux doivent être complets', async () => {
  const s = await scene();
  await parierTous(TESTS, [s.sf, s.f]);
  await parierTous([ID.lea], [s.sf, s.f]);
  await finir(s);
  let r = await situation(s.t);
  assert.equal(groupe(r, false).avec_paris, true);
  assert.equal(groupe(r, false).matchs_non_reveles, 2);
  assert.equal(r.eligible, false, 'Pierre et Marc n\'ont pas parié, le groupe réel bloque');
});

test('un joueur exclu du tournoi n\'est pas attendu ni dans les joueurs du calcul', async () => {
  const s = await scene();
  await parierTous([ID.andre, ID.paul], [s.sf, s.f]);
  await finir(s);
  assert.equal((await situation(s.t)).eligible, false, 'Jacques n\'a pas parié');
  await b.admin('insert into public.exclusions (joueur_id, tournament_id) values ($1, $2)', [ID.jacques, s.t]);
  assert.equal((await situation(s.t)).eligible, true);
  const d = await donnees(s.t);
  assert.deepEqual(d.groupes.find((g) => g.test).joueurs.sort(), [ID.andre, ID.paul].sort());
});

test('sync_donnees_cloture : contenu complet, refus si non éligible', async () => {
  const s = await scene();
  await assert.rejects(donnees(s.t), /Clôture impossible/);
  await parierTous(TESTS, [s.sf, s.f], 2);
  await b.db.exec(`insert into public.tournament_bets (tournament_id, joueur_id, vainqueur_id, finaliste_id) values (${s.t}, '${ID.andre}', ${TENNIS.alcaraz}, ${TENNIS.sinner})`);
  await finir(s, 2); // finale : joueur 2 = Sinner (id 3) gagne
  const d = await donnees(s.t);
  assert.equal(d.categorie, 'masters_1000');
  assert.deepEqual(d.resultat, { vainqueur_id: TENNIS.sinner, finaliste_id: TENNIS.alcaraz });
  assert.equal(d.groupes.length, 1);
  assert.equal(d.groupes[0].test, true);
  assert.equal(d.groupes[0].joueurs.length, 3);
  assert.equal(d.groupes[0].paris.length, 6);
  assert.deepEqual(d.groupes[0].paris_tournoi, [{ joueur_id: ID.andre, vainqueur_id: TENNIS.alcaraz, finaliste_id: TENNIS.sinner }]);
  assert.equal(d.matchs.length, 2);
  assert.deepEqual(d.matchs.find((m) => m.tour === 'F'), { id: s.f, tour: 'F', vainqueur: 2, sets_joues: 2, fin_match: 'normal', neutralise: false });
});

test('sync_cloturer_tournoi : résultats incomplets, en trop, doublonnés ou mal formés refusés, rien n\'est écrit', async () => {
  const s = await scene();
  await parierTous(TESTS, [s.sf, s.f]);
  await finir(s);
  const ok = resultatsValides(TESTS);
  await assert.rejects(cloturer(s.t, ok.slice(0, 2)), /incomplets ou inattendus/);
  await assert.rejects(cloturer(s.t, [...ok, { ...ok[0], joueur_id: ID.lea }]), /incomplets ou inattendus/);
  await assert.rejects(cloturer(s.t, [ok[0], ok[0], ok[1]]), /incomplets ou inattendus/);
  await assert.rejects(cloturer(s.t, { a: 1 }), /invalides/);
  await assert.rejects(cloturer(s.t, [ok[0], ok[1], { ...ok[2], score_final: '12,5' }]), REFUSE);
  await assert.rejects(cloturer(s.t, [ok[0], ok[1], { ...ok[2], rang: 0 }]), REFUSE);
  assert.equal((await b.admin('select count(*)::int n from public.tournament_results where tournament_id = $1', [s.t])).rows[0].n, 0, 'rien d\'écrit (transaction annulée)');
  assert.equal((await etat(s.t)).etat, 'en_cours');
  await assert.rejects(cloturer(999999, ok), /inconnu/);
});

test('sync_cloturer_tournoi : clôture complète, paris tournoi révélés, deuxième appel sans effet', async () => {
  const s = await scene();
  await parierTous(TESTS, [s.sf, s.f]);
  await b.db.exec(`insert into public.tournament_bets (tournament_id, joueur_id, vainqueur_id, finaliste_id) values (${s.t}, '${ID.andre}', 1, 3), (${s.t}, '${ID.paul}', 3, 1)`);
  await finir(s);
  assert.deepEqual((await b.comme(ID.andre, 'select joueur_id from public.tournament_bets where tournament_id = $1', [s.t])).rows.map((r) => r.joueur_id), [ID.andre], 'avant : seul son pari');
  const r = await cloturer(s.t, resultatsValides(TESTS));
  assert.deepEqual(r, { statut: 'cloture', resultats: 3 });
  const e = await etat(s.t);
  assert.deepEqual([e.etat, e.vainqueur_id, e.finaliste_id], ['clos', 1, 3]);
  const lignes = (await b.admin('select joueur_id, points_matchs, bonus_classement, score_final, rang from public.tournament_results where tournament_id = $1 order by rang', [s.t])).rows;
  assert.equal(lignes.length, 3);
  assert.deepEqual([lignes[0].bonus_classement, lignes[0].score_final, lignes[0].rang], ['9/2', '33/2', 1]);
  assert.equal((await b.comme(ID.andre, 'select joueur_id from public.tournament_bets where tournament_id = $1', [s.t])).rows.length, 2, 'après : paris tournoi révélés');
  assert.equal((await b.comme(ID.lea, 'select joueur_id from public.tournament_bets where tournament_id = $1', [s.t])).rows.length, 0, 'le groupe réel ne voit rien');
  assert.deepEqual(await cloturer(s.t, resultatsValides(TESTS)), { statut: 'deja_clos' });
  assert.ok(!(await candidats()).some((c) => c.tournoi_id === s.t), 'plus candidat');
});

test('réouverture par l\'administrateur : clôture automatique désactivée pour ce tournoi ; par le service : non', async () => {
  const s = await scene();
  await parierTous(TESTS, [s.sf, s.f]);
  await b.db.exec(`insert into public.tournament_bets (tournament_id, joueur_id, vainqueur_id, finaliste_id) values (${s.t}, '${ID.andre}', 1, 3), (${s.t}, '${ID.paul}', 3, 1)`);
  await finir(s);
  await cloturer(s.t, resultatsValides(TESTS));
  await b.comme(ID.pierre, "update public.tournaments set etat = 'en_cours' where id = $1", [s.t]);
  assert.equal((await etat(s.t)).cloture_auto_desactivee, true);
  assert.equal((await b.comme(ID.andre, 'select joueur_id from public.tournament_bets where tournament_id = $1', [s.t])).rows.length, 2, 'paris tournoi restent révélés et figés après réouverture');
  assert.ok(!(await candidats()).some((c) => c.tournoi_id === s.t), 'plus examiné automatiquement');
  await assert.rejects(cloturer(s.t, resultatsValides(TESTS)), /désactivée/);
  // un changement d'état ordinaire par l'administrateur (tournoi non clos) ne désactive rien
  const s3 = await scene();
  await b.comme(ID.pierre, "update public.tournaments set etat = 'a_venir' where id = $1", [s3.t]);
  assert.equal((await etat(s3.t)).cloture_auto_desactivee, false);
  // un autre tournoi rouvert par la base elle-même (aucun utilisateur) ne désactive rien
  const s2 = await scene();
  await parierTous(TESTS, [s2.sf, s2.f]);
  await finir(s2);
  await cloturer(s2.t, resultatsValides(TESTS));
  await b.admin("update public.tournaments set etat = 'en_cours' where id = $1", [s2.t]);
  assert.equal((await etat(s2.t)).cloture_auto_desactivee, false);
});

test('droits : fermé au navigateur, aux visiteurs et même à l\'administrateur', async () => {
  const s = await scene();
  const appels = [
    ['select public.sync_cloture_situation($1)', [s.t]],
    ['select public.sync_cloture_candidats()', []],
    ['select public.sync_donnees_cloture($1)', [s.t]],
    ["select public.sync_cloturer_tournoi($1, '[]'::jsonb)", [s.t]],
  ];
  for (const [sql, p] of appels) {
    await assert.rejects(b.anonyme(sql, p), /permission denied/);
    await assert.rejects(b.comme(ID.andre, sql, p), /permission denied/);
    await assert.rejects(b.comme(ID.pierre, sql, p), /permission denied/);
  }
  assert.equal((await b.admin("select has_function_privilege('anon', 'public.sync_cloturer_tournoi(bigint, jsonb)', 'execute') as a, has_function_privilege('authenticated', 'public.sync_cloturer_tournoi(bigint, jsonb)', 'execute') as u")).rows[0].a, false);
});

test('les deux groupes complets : chacun reçoit uniquement ses joueurs et ses paris', async () => {
  const s = await scene();
  const reels = [ID.pierre, ID.lea, ID.marc];
  await parierTous([...TESTS, ...reels], [s.sf, s.f]);
  await b.db.exec(`insert into public.tournament_bets (tournament_id, joueur_id, vainqueur_id, finaliste_id) values (${s.t}, '${ID.lea}', 1, 3)`);
  await finir(s);
  assert.equal((await situation(s.t)).eligible, true);
  const d = await donnees(s.t);
  assert.equal(d.groupes.length, 2);
  for (const g of d.groupes) {
    const attendus = g.test ? TESTS : reels;
    assert.deepEqual([...g.joueurs].sort(), [...attendus].sort());
    assert.equal(g.paris.length, 6);
    assert.ok(g.paris.every((p) => attendus.includes(p.joueur_id)), 'aucun pari de l\'autre groupe');
  }
  assert.deepEqual(d.groupes.find((g) => !g.test).paris_tournoi.map((p) => p.joueur_id), [ID.lea]);
  assert.deepEqual(d.groupes.find((g) => g.test).paris_tournoi, []);
  const res = [...TESTS, ...reels].map((u, i) => ({ joueur_id: u, points_matchs: '1', points_pari_tournoi: '0', bonus_classement: '0', score_final: '1', rang: 1 }));
  assert.deepEqual(await cloturer(s.t, res), { statut: 'cloture', resultats: 6 });
});
