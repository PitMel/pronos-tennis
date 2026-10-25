// Migration 0004 — fonctions de synchronisation : droits, règles d'écriture (jamais de recul, protection des
// corrections manuelles, anomalies), états des tournois, choix de l'édition.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { creerBase, ID, TOURNOI, REFUSE } from './base.js';

let b;
before(async () => {
  b = await creerBase();
  await b.db.exec(`
    insert into public.tournament_api_ids (api_id, tournament_id) values ('1725', ${TOURNOI.masters}), ('1726', ${TOURNOI.masters}),
      ('9001', ${TOURNOI.chelem}), ('2794', ${TOURNOI.finals});
    update public.tournaments set etat = 'a_venir';
  `);
});

const refuse = (promesse, motif = REFUSE) => assert.rejects(promesse, motif);
const service = (sql, params = []) => b.comme(null, sql, params, 'service_role');
const appliquer = async (matchs) => (await service('select public.sync_appliquer($1::jsonb) as r', [JSON.stringify({ matchs })])).rows[0].r;
const etat = async () => (await service('select public.sync_etat() as r')).rows[0].r;
const ligne = async (apiId) => (await b.admin('select * from public.matches where api_id = $1', [apiId])).rows[0];

let compteur = 0;
/** Construit un match « API normalisé ». Joueurs identifiés par un numéro (p1, p2). */
function mt(o = {}) {
  compteur += 1;
  const a = o.a ?? 100 + compteur * 2;
  return {
    api_id: o.api_id ?? `m${compteur}`,
    tournament_api_id: o.tournoi ?? '1725',
    tour: o.tour ?? 'QF',
    heure_prevue: o.heure ?? '2026-10-30T14:00:00Z',
    statut: o.statut ?? 'a_venir',
    vainqueur: o.vainqueur ?? null,
    sets_joues: o.sets ?? null,
    score: o.score ?? null,
    fin_match: o.fin ?? 'normal',
    p1: o.p1 === null ? null : { api_id: `j${a}`, nom: `Joueur ${a}`, pays: 'FRA', classement: 10 + compteur },
    p2: o.p2 === null ? null : { api_id: `j${a + 1}`, nom: `Joueur ${a + 1}`, pays: 'ESP', classement: 30 + compteur },
  };
}

// ------------------------------------------------------------------ droits

test('les fonctions de synchronisation sont fermées au navigateur et aux visiteurs', async () => {
  const appels = [
    ["select public.sync_etat()", []],
    ["select public.sync_appliquer('{}'::jsonb)", []],
    ["select public.sync_enregistrer_appel('/matches', 200, true, null, null, null)", []],
    ["select public.sync_joueur('{\"api_id\":\"x\",\"nom\":\"X\"}'::jsonb)", []],
    ["select public.sync_tournoi_pour_api('1725')", []],
    ["select public.sync_maj_etat_tournoi(1)", []],
  ];
  for (const [sql, p] of appels) {
    await refuse(b.anonyme(sql, p), /permission denied/);
    await refuse(b.comme(ID.andre, sql, p), /permission denied/);
    await refuse(b.comme(ID.pierre, sql, p), /permission denied/); // même l'administrateur : seule la tâche automatique les utilise
  }
  assert.equal((await etat()).appels_aujourdhui, 0);
});

// ------------------------------------------------------------------ création et idempotence

test('un match à venir est créé avec ses joueurs ; rejouer la même charge ne change rien', async () => {
  const m = mt({ api_id: 'A1', a: 200 });
  const r1 = await appliquer([m]);
  assert.deepEqual([r1.crees, r1.maj, r1.ignores, r1.anomalies], [1, 0, 0, []]);
  const l = await ligne('A1');
  assert.equal(l.statut, 'a_venir');
  assert.equal(l.tour, 'QF');
  assert.equal(l.debut_detecte, null);
  assert.equal((await b.admin("select count(*)::int as n from public.players where api_id in ('j200','j201')")).rows[0].n, 2);
  const r2 = await appliquer([m]);
  assert.deepEqual([r2.crees, r2.maj], [0, 0]);
});

test('ce qui n’est pas suivi est ignoré sans rien écrire (tournoi inconnu, tour hors suivi, tour interdit dans la catégorie)', async () => {
  const avant = (await b.admin('select count(*)::int as n from public.players')).rows[0].n;
  const r = await appliquer([
    mt({ tournoi: '5555' }),
    mt({ tour: 'R32' }),
    mt({ tour: 'RR' }), // poules : seulement aux ATP Finals
    mt({ tournoi: '2794', tour: 'R16' }), // pas de huitièmes aux ATP Finals
  ]);
  assert.equal(r.ignores, 4);
  assert.equal(r.crees, 0);
  assert.equal((await b.admin('select count(*)::int as n from public.players')).rows[0].n, avant);
});

test('affiche incomplète : anomalie signalée, aucun match créé', async () => {
  const r = await appliquer([mt({ api_id: 'A2', p2: null })]);
  assert.equal(r.crees, 0);
  assert.equal(r.anomalies[0].code, 'joueurs_incomplets');
  assert.equal(await ligne('A2'), undefined);
});

// ------------------------------------------------------------------ début de match, verrouillage, jamais de recul

test('début détecté : les paris se verrouillent ; il ne s’efface jamais et le match ne recule jamais', async () => {
  const m = mt({ api_id: 'B1', a: 300 });
  await appliquer([m]);
  const id = (await ligne('B1')).id;
  assert.equal((await b.parier(ID.andre, id, 1, 8)).affectedRows, 1);
  await appliquer([{ ...m, statut: 'en_cours' }]);
  const l = await ligne('B1');
  assert.equal(l.statut, 'en_cours');
  assert.notEqual(l.debut_detecte, null);
  await refuse(b.parier(ID.paul, id, 1, 8)); // match commencé : plus de pari
  const debut = l.debut_detecte;
  await appliquer([{ ...m, statut: 'a_venir' }]); // l'API « recule »
  const l2 = await ligne('B1');
  assert.equal(l2.statut, 'en_cours');
  assert.deepEqual(l2.debut_detecte, debut);
});

test('match terminé : résultat, sets et score enregistrés ; un statut plus ancien ne l’écrase pas', async () => {
  const m = mt({ api_id: 'B2', a: 310 });
  await appliquer([m]);
  const fini = { ...m, statut: 'termine', vainqueur: 2, sets_joues: 3, score: { sets: [1, 2], games: [[6, 4, 3], [3, 6, 6]] } };
  await appliquer([fini]);
  let l = await ligne('B2');
  assert.deepEqual([l.statut, l.vainqueur, l.sets_joues, l.fin_match], ['termine', 2, 3, 'normal']);
  assert.deepEqual(l.score, { sets: [1, 2], games: [[6, 4, 3], [3, 6, 6]] });
  await appliquer([{ ...m, statut: 'en_cours', vainqueur: null }]);
  l = await ligne('B2');
  assert.deepEqual([l.statut, l.vainqueur], ['termine', 2]);
});

test('« terminé » sans vainqueur (cas constaté) : on n’en conclut rien et on signale', async () => {
  const m = mt({ api_id: 'B3', a: 320 });
  await appliquer([{ ...m, statut: 'en_cours' }]);
  const r = await appliquer([{ ...m, statut: 'termine', vainqueur: null }]);
  assert.equal(r.anomalies[0].code, 'termine_sans_vainqueur');
  assert.equal((await ligne('B3')).statut, 'en_cours');
  const neuf = await appliquer([mt({ api_id: 'B3bis', a: 322, statut: 'termine', vainqueur: null })]);
  assert.equal(neuf.anomalies[0].code, 'termine_sans_vainqueur');
  assert.equal((await ligne('B3bis')).statut, 'a_venir');
});

test('forfait (walkover) : match terminé sans vainqueur exigé, type « forfait », paris verrouillés', async () => {
  const m = mt({ api_id: 'B4', a: 330 });
  await appliquer([m]);
  const id = (await ligne('B4')).id;
  await appliquer([{ ...m, statut: 'termine', fin_match: 'forfait', vainqueur: null }]);
  const l = await ligne('B4');
  assert.deepEqual([l.statut, l.fin_match, l.vainqueur], ['termine', 'forfait', null]);
  await refuse(b.parier(ID.andre, id, 1, 8));
});

test('abandon : type enregistré avec le vainqueur', async () => {
  const m = mt({ api_id: 'B5', a: 340 });
  await appliquer([{ ...m, statut: 'termine', fin_match: 'abandon', vainqueur: 1, sets_joues: 2 }]);
  const l = await ligne('B5');
  assert.deepEqual([l.statut, l.fin_match, l.vainqueur, l.sets_joues], ['termine', 'abandon', 1, 2]);
  assert.notEqual(l.debut_detecte, null, 'un match découvert déjà terminé est tout de même daté');
});

test('l’API corrige un résultat déjà enregistré : mis à jour et signalé', async () => {
  const m = mt({ api_id: 'B6', a: 350 });
  await appliquer([{ ...m, statut: 'termine', vainqueur: 1, sets_joues: 2 }]);
  const r = await appliquer([{ ...m, statut: 'termine', vainqueur: 2, sets_joues: 3 }]);
  assert.equal(r.anomalies[0].code, 'resultat_modifie_par_api');
  assert.deepEqual([(await ligne('B6')).vainqueur, (await ligne('B6')).sets_joues], [2, 3]);
});

// ------------------------------------------------------------------ protections

test('match corrigé à la main par l’administrateur : la synchronisation ne touche plus au résultat', async () => {
  const m = mt({ api_id: 'C1', a: 400 });
  await appliquer([m]);
  const id = (await ligne('C1')).id;
  await b.comme(ID.pierre, "update public.matches set statut = 'termine', vainqueur = 1, sets_joues = 2 where id = $1", [id]);
  assert.equal((await ligne('C1')).modifie_manuellement, true);
  await appliquer([{ ...m, statut: 'termine', vainqueur: 2, sets_joues: 3, heure_prevue: '2026-10-31T10:00:00Z' }]);
  const l = await ligne('C1');
  assert.deepEqual([l.vainqueur, l.sets_joues, l.statut], [1, 2, 'termine']);
});

test('la synchronisation ne neutralise ni ne dé-neutralise jamais un match', async () => {
  const m = mt({ api_id: 'C2', a: 410 });
  await appliquer([m]);
  const id = (await ligne('C2')).id;
  await b.comme(ID.pierre, 'update public.matches set neutralise = true where id = $1', [id]);
  await b.admin('update public.matches set modifie_manuellement = false where id = $1', [id]); // l'admin rend la main à la synchro
  await appliquer([{ ...m, statut: 'termine', vainqueur: 1, sets_joues: 2 }]);
  assert.equal((await ligne('C2')).neutralise, true);
});

test('joueurs changés par l’API : modifiés s’il n’y a pas de pari, conservés (avec alerte) s’il y en a', async () => {
  const sans = mt({ api_id: 'C3', a: 420 });
  await appliquer([sans]);
  await appliquer([{ ...sans, p2: { api_id: 'j999', nom: 'Remplaçant', pays: 'ITA', classement: 77 } }]);
  const l = await ligne('C3');
  const j = (await b.admin('select api_id from public.players where id = $1', [l.p2_id])).rows[0];
  assert.equal(j.api_id, 'j999');

  const avec = mt({ api_id: 'C4', a: 430 });
  await appliquer([avec]);
  const id = (await ligne('C4')).id;
  await b.parier(ID.andre, id, 1, 8);
  const avant = await ligne('C4');
  const r = await appliquer([{ ...avec, p1: { api_id: 'j998', nom: 'Autre', pays: 'USA', classement: 5 } }]);
  assert.equal(r.anomalies[0].code, 'joueurs_changes');
  const apres = await ligne('C4');
  assert.deepEqual([apres.p1_id, apres.p2_id], [avant.p1_id, avant.p2_id]);
});

test('une erreur sur un match n’empêche pas les autres', async () => {
  const bon = mt({ api_id: 'D2', a: 520 });
  const mauvais = mt({ api_id: 'D1', a: 510, statut: 'termine', vainqueur: 1, sets: 9 }); // sets hors limites
  const r = await appliquer([mauvais, bon]);
  assert.equal(r.crees, 1);
  assert.equal(r.anomalies[0].code, 'erreur');
  assert.equal(await ligne('D1'), undefined);
  assert.ok(await ligne('D2'));
  assert.equal((await b.admin("select count(*)::int as n from public.players where api_id in ('j510','j511')")).rows[0].n, 0, 'rien de l’essai raté ne subsiste');
});

test('les joueurs de tennis sont mis à jour (classement, nom) sans écraser par du vide', async () => {
  await appliquer([mt({ api_id: 'D3', a: 600 })]);
  const m = mt({ api_id: 'D4', a: 600 });
  m.p1 = { api_id: 'j600', nom: 'Joueur 600 modifié', pays: null, classement: null };
  await appliquer([m]);
  const j = (await b.admin("select nom, pays, classement from public.players where api_id = 'j600'")).rows[0];
  assert.equal(j.nom, 'Joueur 600 modifié');
  assert.equal(j.pays, 'FRA');
  assert.notEqual(j.classement, null);
});

// ------------------------------------------------------------------ états des tournois

test('le pari tournoi s’ouvre quand les 8 huitièmes sont connus, puis le tournoi passe « en cours » au premier match', async () => {
  const t = TOURNOI.chelem;
  const huit = Array.from({ length: 8 }, (_, i) => mt({ api_id: `GC${i}`, tournoi: '9001', tour: 'R16', a: 700 + i * 2 }));
  await appliquer(huit.slice(0, 7));
  assert.equal((await b.admin('select etat from public.tournaments where id = $1', [t])).rows[0].etat, 'a_venir');
  await refuse(b.comme(ID.andre, 'insert into public.tournament_bets (tournament_id, joueur_id, vainqueur_id, finaliste_id) values ($1, $2, 1, 2)', [t, ID.andre]));
  await appliquer([huit[7]]);
  assert.equal((await b.admin('select etat from public.tournaments where id = $1', [t])).rows[0].etat, 'pari_tournoi_ouvert');
  assert.equal((await b.comme(ID.andre, 'insert into public.tournament_bets (tournament_id, joueur_id, vainqueur_id, finaliste_id) values ($1, $2, 1, 2)', [t, ID.andre])).affectedRows, 1);
  await appliquer([{ ...huit[0], statut: 'en_cours' }]);
  assert.equal((await b.admin('select etat from public.tournaments where id = $1', [t])).rows[0].etat, 'en_cours');
  await appliquer([{ ...huit[0], statut: 'a_venir' }]);
  assert.equal((await b.admin('select etat from public.tournaments where id = $1', [t])).rows[0].etat, 'en_cours', 'jamais de retour en arrière');
});

test('ATP Finals : le pari tournoi s’ouvre avec 4 matchs de poule connus', async () => {
  const t = TOURNOI.finals;
  const poules = Array.from({ length: 4 }, (_, i) => mt({ api_id: `RR${i}`, tournoi: '2794', tour: 'RR', a: 800 + i * 2 }));
  await appliquer(poules.slice(0, 3));
  assert.equal((await b.admin('select etat from public.tournaments where id = $1', [t])).rows[0].etat, 'a_venir');
  await appliquer([poules[3]]);
  assert.equal((await b.admin('select etat from public.tournaments where id = $1', [t])).rows[0].etat, 'pari_tournoi_ouvert');
});

test('tournoi clos : la synchronisation n’y touche plus', async () => {
  await b.admin("insert into public.tournaments (annee, nom, categorie, etat) values (2025, 'Clos 2025', 'masters_1000', 'clos')");
  const id = (await b.admin("select id from public.tournaments where nom = 'Clos 2025'")).rows[0].id;
  await b.admin("insert into public.tournament_api_ids (api_id, tournament_id) values ('4444', $1)", [id]);
  const r = await appliquer([mt({ tournoi: '4444', api_id: 'CLOS1' })]);
  assert.equal(r.ignores, 1);
  assert.equal(await ligne('CLOS1'), undefined);
});

test('un identifiant d’API partagé entre éditions va à la plus ancienne édition non clôturée', async () => {
  await b.admin("insert into public.tournaments (annee, nom, categorie, etat) values (2090, 'Edition A', 'masters_1000', 'en_cours'), (2091, 'Edition B', 'masters_1000', 'a_venir')");
  const [ta, tb] = (await b.admin("select id from public.tournaments where nom in ('Edition A', 'Edition B') order by annee")).rows.map((r) => r.id);
  await b.admin("insert into public.tournament_api_ids (api_id, tournament_id) values ('7777', $1), ('7777', $2)", [ta, tb]);
  await appliquer([mt({ tournoi: '7777', api_id: 'ED1', a: 900 })]);
  assert.equal((await ligne('ED1')).tournament_id, ta);
  await b.admin("update public.tournaments set etat = 'clos' where id = $1", [ta]);
  await appliquer([mt({ tournoi: '7777', api_id: 'ED2', a: 910 })]);
  assert.equal((await ligne('ED2')).tournament_id, tb);
});

// ------------------------------------------------------------------ état pour le planificateur et journal

test('journal des appels et état : appels du jour, quota épuisé, matchs à suivre', async () => {
  const avant = (await etat()).appels_aujourdhui;
  await service("select public.sync_enregistrer_appel('/matches?tournament_id=1725&status=upcoming&limit=200', 200, true, null, null, null)");
  await service("select public.sync_enregistrer_appel('/usage', 200, true, null, null, null)"); // gratuit : non compté
  await service("select public.sync_enregistrer_appel('/matches/m1', 500, false, null, 'erreur', null)");
  let e = await etat();
  assert.equal(e.appels_aujourdhui, avant + 2);
  assert.equal(e.quota_epuise_jusqua, null);
  const t = e.tournois.find((x) => x.id === TOURNOI.masters);
  assert.deepEqual(t.api_ids, ['1725', '1726']);
  assert.notEqual(t.derniere_decouverte, null);
  assert.equal(e.tournois.find((x) => x.id === TOURNOI.finals).derniere_decouverte, null);

  await service("select public.sync_enregistrer_appel('/matches?x=1', 429, false, 0, 'quota du jour', now() + interval '3 hours')");
  e = await etat();
  assert.notEqual(e.quota_epuise_jusqua, null);

  assert.ok(e.matchs.every((m) => m.statut !== 'termine' && m.api_id));
  assert.ok(e.matchs.some((m) => m.api_id === 'A1'));
  assert.ok(!e.matchs.some((m) => m.api_id === 'B2'), 'un match terminé n’est plus suivi');
  assert.ok(!e.matchs.some((m) => m.api_id === 'B4'), 'un forfait n’est plus suivi');
});

test('un tournoi sans identifiant d’API n’est pas suivi', async () => {
  await b.admin("insert into public.tournaments (annee, nom, categorie, etat) values (2093, 'Sans API', 'masters_1000', 'a_venir')");
  const e = await etat();
  assert.ok(!e.tournois.some((t) => t.nom === 'Sans API'));
});
