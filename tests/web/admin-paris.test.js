// Paris admin (4.5) : validation, conversion, messages, HTML (saisie, exclusions, journal), appels à la base.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as moteur from '../../src/moteur/index.js';
import {
  libelleMatch, matchsOrdonnes, validerCorrectionPari, pariPourBase, validerCorrectionPariTournoi, messageErreurParisAdmin, resumeContenu, htmlParisAdmin,
} from '../../web/js/admin-paris.js';
import { creerDonnees } from '../../web/js/donnees.js';

const A = 'u-andre'; // faux compte
const P = 'u-pierre'; // vrai compte
const profils = new Map([
  [A, { id: A, prenom: 'André', is_test: true, actif: true }],
  [P, { id: P, prenom: 'Pierre <i>', is_test: false, actif: true }],
  ['u-off', { id: 'u-off', prenom: 'Inactif', is_test: true, actif: false }],
]);
const joueurs = new Map([[1, { id: 1, nom: 'Alcaraz', classement: 1 }], [2, { id: 2, nom: 'Fritz', classement: 14 }], [3, { id: 3, nom: 'Sinner', classement: 2 }], [4, { id: 4, nom: 'Zverev', classement: 3 }]]);
const matchs = [
  { id: 12, tour: 'F', p1_id: 1, p2_id: 3, statut: 'a_venir', neutralise: false },
  { id: 11, tour: 'QF', p1_id: 1, p2_id: 2, statut: 'a_venir', neutralise: false },
  { id: 13, tour: 'QF', p1_id: 3, p2_id: 4, statut: 'a_venir', neutralise: false },
];
const masters = { id: 5, nom: 'Paris <Masters>', categorie: 'masters_1000', etat: 'en_cours' };
const slam = { ...masters, categorie: 'grand_slam' };
const base = { moteur, tournoi: masters, matchs, joueurs, profils };

test('libellé et ordre des matchs', () => {
  assert.equal(libelleMatch(matchs[1], joueurs), 'Quarts · Alcaraz – Fritz');
  assert.deepEqual(matchsOrdonnes(matchs, 'masters_1000').map((m) => m.id), [11, 13, 12]);
});

test('validerCorrectionPari : joueur, match, choix, confiance, sets en Grand Chelem, motif', () => {
  const ok = { joueur: A, match: '11', choix: '1', confiance: '8', sets: '', motif: '' };
  assert.deepEqual(validerCorrectionPari(ok, { moteur, categorie: 'masters_1000' }), []);
  assert.equal(validerCorrectionPari({ ...ok, joueur: '' }, { moteur, categorie: 'masters_1000' }).length, 1);
  assert.equal(validerCorrectionPari({ ...ok, match: '' }, { moteur, categorie: 'masters_1000' }).length, 1);
  assert.match(validerCorrectionPari({ ...ok, choix: '' }, { moteur, categorie: 'masters_1000' }).join(), /Choisis un joueur/);
  assert.match(validerCorrectionPari({ ...ok, confiance: '5' }, { moteur, categorie: 'masters_1000' }).join(), /6 à 10/);
  assert.match(validerCorrectionPari({ ...ok, sets: '3' }, { moteur, categorie: 'masters_1000' }).join(), /Grand Chelem/);
  assert.match(validerCorrectionPari(ok, { moteur, categorie: 'grand_slam' }).join(), /sets/);
  assert.deepEqual(validerCorrectionPari({ ...ok, sets: '4' }, { moteur, categorie: 'grand_slam' }), []);
  assert.match(validerCorrectionPari({ ...ok, motif: 'x'.repeat(301) }, { moteur, categorie: 'masters_1000' }).join(), /motif/);
});

test('pariPourBase : sets seulement en Grand Chelem, motif vide = null', () => {
  assert.deepEqual(pariPourBase({ choix: '2', confiance: '9', sets: '3', motif: '  ' }, 'masters_1000'), { choix: 2, confiance: 9, sets: null, motif: null });
  assert.deepEqual(pariPourBase({ choix: '1', confiance: '6', sets: '5', motif: ' oubli ' }, 'grand_slam'), { choix: 1, confiance: 6, sets: 5, motif: 'oubli' });
});

test('validerCorrectionPariTournoi', () => {
  const ok = { joueur: A, vainqueur: '1', finaliste: '3', motif: '' };
  assert.deepEqual(validerCorrectionPariTournoi(ok, { moteur }), []);
  assert.match(validerCorrectionPariTournoi({ ...ok, finaliste: '1' }, { moteur }).join(), /différents/);
  assert.match(validerCorrectionPariTournoi({ ...ok, vainqueur: '' }, { moteur }).join(), /vainqueur/);
  assert.equal(validerCorrectionPariTournoi({ ...ok, joueur: '' }, { moteur }).length, 1);
});

test('messageErreurParisAdmin : messages de la base conservés, doublon, refus, réseau', () => {
  assert.match(messageErreurParisAdmin({ message: 'Tournoi clos : rouvre-le avant de corriger un pari.' }), /rouvre-le/);
  assert.match(messageErreurParisAdmin({ message: 'Ce joueur est inactif ou exclu de ce match.' }), /exclu/);
  assert.match(messageErreurParisAdmin({ code: '23505', message: 'duplicate' }), /déjà exclu/);
  assert.match(messageErreurParisAdmin({ code: '42501', message: 'x' }), /réservée/);
  assert.match(messageErreurParisAdmin({ message: 'Failed to fetch' }), /connexion/);
  assert.match(messageErreurParisAdmin({ code: 'PGRST202', message: 'Could not find the function' }), /migrations/);
  assert.match(messageErreurParisAdmin(new Error('boum')), /échoué/);
});

test('resumeContenu : pari de match, pari tournoi, contenu masqué', () => {
  assert.equal(resumeContenu('match', { choix: 2, confiance: 9, sets: null }, { match: matchs[1], joueurs }), 'Fritz, confiance 9');
  assert.equal(resumeContenu('match', { choix: 1, confiance: 6, sets: 4 }, { match: matchs[1], joueurs }), 'Alcaraz, confiance 6, en 4 sets');
  assert.equal(resumeContenu('tournoi', { vainqueur_id: 1, finaliste_id: 3 }, { joueurs }), 'vainqueur Alcaraz, finaliste Sinner');
  assert.equal(resumeContenu('match', null, { joueurs }), null);
});

test('htmlParisAdmin : formulaires, comptes actifs seulement, échappement', () => {
  const h = htmlParisAdmin(base);
  assert.match(h, /Paris et exclusions · Paris &lt;Masters&gt;/);
  assert.match(h, /André \(test\)/);
  assert.match(h, /Pierre &lt;i&gt;/);
  assert.doesNotMatch(h, /Inactif/);
  assert.doesNotMatch(h, /Pierre <i>/);
  assert.ok(h.indexOf('Quarts · Alcaraz – Fritz') < h.indexOf('Finale · Alcaraz – Sinner'));
  assert.match(h, /Choisis d’abord un match/);
  assert.doesNotMatch(h, /Nombre de sets/);
  assert.match(htmlParisAdmin({ ...base, tournoi: slam }), /Nombre de sets/);
  assert.match(h, /Aucune exclusion/);
  assert.match(h, /Aucune correction/);
});

test('htmlParisAdmin : pari existant d’un faux compte pré-rempli ; vrai joueur = caché', () => {
  const paris = [{ match_id: 11, joueur_id: A, choix: 2, confiance: 9, sets: null, corrige_par_admin: true }];
  const h = htmlParisAdmin({ ...base, paris, selection: { match: { joueurId: A, matchId: '11' } } });
  assert.match(h, /Pari actuel : Fritz, confiance 9 \(déjà corrigé/);
  assert.match(h, /name="choix" value="2" checked/);
  assert.match(h, /<option value="9" selected>/);
  const reel = htmlParisAdmin({ ...base, selection: { match: { joueurId: P, matchId: '11' } } });
  assert.match(reel, /non visible/);
  assert.doesNotMatch(reel, /checked/);
  const sans = htmlParisAdmin({ ...base, selection: { match: { joueurId: A, matchId: '13' } } });
  assert.match(sans, /Aucun pari de ce joueur/);
});

test('htmlParisAdmin : valeurs et erreurs ré-affichées', () => {
  const h = htmlParisAdmin({ ...base, selection: { match: { joueurId: A, matchId: '11' } }, valeurs: { match: { choix: '1', confiance: '7', sets: '', motif: 'oubli <b>' } }, erreurs: { match: ['Oups.'] } });
  assert.match(h, /name="choix" value="1" checked/);
  assert.match(h, /value="oubli &lt;b&gt;"/);
  assert.match(h, /role="alert">Oups\./);
});

test('htmlParisAdmin : pari tournoi (joueurs du tournoi, pré-remplissage)', () => {
  const parisT = [{ joueur_id: A, vainqueur_id: 3, finaliste_id: 1, corrige_par_admin: false }];
  const h = htmlParisAdmin({ ...base, parisT, selection: { tournoi: { joueurId: A } } });
  assert.match(h, /Pari actuel : vainqueur Sinner, finaliste Alcaraz\./);
  assert.match(h, /<select id="pt-vainqueur" name="vainqueur">.*<option value="3" selected>Sinner/s);
  assert.match(htmlParisAdmin({ ...base, matchs: [] }), /Aucun joueur connu/);
});

test('htmlParisAdmin : exclusions et journal', () => {
  const exclusions = [{ id: 1, joueur_id: A, tournament_id: 5, match_id: null }, { id: 2, joueur_id: P, tournament_id: 5, match_id: 11 }];
  const journal = [
    { id: 2, cree_le: '2026-11-03T10:00:00Z', joueur_id: A, kind: 'match', ref_id: 11, motif: 'oubli <x>', contenu_visible: true, avant: { choix: 1, confiance: 7, sets: null }, apres: { choix: 2, confiance: 9, sets: null } },
    { id: 1, cree_le: '2026-11-03T09:00:00Z', joueur_id: P, kind: 'tournoi', ref_id: 5, motif: null, contenu_visible: false, avant: null, apres: null },
  ];
  const h = htmlParisAdmin({ ...base, exclusions, journal });
  assert.match(h, /André \(test\)<\/b> · tout le tournoi/);
  assert.match(h, /Pierre &lt;i&gt;<\/b> · Quarts · Alcaraz – Fritz/);
  assert.match(h, /data-action="ad-retirer-exclusion" data-id="2"/);
  assert.match(h, /Alcaraz, confiance 7 → Fritz, confiance 9 · motif : oubli &lt;x&gt;/);
  assert.match(h, /contenu masqué jusqu’à la révélation/);
  const nouveau = htmlParisAdmin({ ...base, journal: [{ ...journal[0], avant: null }] });
  assert.match(nouveau, /saisi : Fritz, confiance 9/);
});

test('htmlParisAdmin : tournoi clos signalé', () => {
  assert.match(htmlParisAdmin({ ...base, tournoi: { ...masters, etat: 'clos' } }), /rouvre-le/);
});

test('donnees : corrections, exclusions et journal passent par la base', async () => {
  const appels = [];
  const supabase = {
    rpc: async (nom, args) => { appels.push([nom, args]); return { data: 'cree', error: null }; },
    from: (table) => ({
      select: () => ({ eq: (c, v) => Promise.resolve({ data: [{ id: 1 }], error: null }), order: () => ({ limit: (n) => { appels.push(['journal', table, n]); return Promise.resolve({ data: [], error: null }); } }) }),
      insert: (v) => { appels.push(['insert', table, v]); return Promise.resolve({ error: null }); },
      delete: () => ({ eq: (c, v) => ({ select: () => { appels.push(['delete', table, c, v]); return Promise.resolve({ data: [{ id: v }], error: null }); } }) }),
    }),
  };
  const d = creerDonnees(supabase);
  assert.equal(await d.corrigerPari({ matchId: 11, joueurId: A, choix: 2, confiance: 9, sets: null, motif: 'oubli' }), 'cree');
  await d.corrigerPariTournoi({ tournoiId: 5, joueurId: A, vainqueurId: 1, finalisteId: 3 });
  await d.ajouterExclusion({ joueurId: A, tournoiId: 5 });
  await d.ajouterExclusion({ joueurId: A, tournoiId: 5, matchId: 11 });
  await d.retirerExclusion(7);
  await d.journalCorrections();
  assert.deepEqual(appels, [
    ['admin_saisir_pari', { p_match: 11, p_joueur: A, p_choix: 2, p_confiance: 9, p_sets: null, p_motif: 'oubli' }],
    ['admin_saisir_pari_tournoi', { p_tournoi: 5, p_joueur: A, p_vainqueur: 1, p_finaliste: 3, p_motif: null }],
    ['insert', 'exclusions', { joueur_id: A, tournament_id: 5, match_id: null }],
    ['insert', 'exclusions', { joueur_id: A, tournament_id: 5, match_id: 11 }],
    ['delete', 'exclusions', 'id', 7],
    ['journal', 'corrections_admin_visibles', 200],
  ]);
  const refus = creerDonnees({ from: () => ({ delete: () => ({ eq: () => ({ select: () => Promise.resolve({ data: [], error: null }) }) }) }) });
  await assert.rejects(refus.retirerExclusion(7), (e) => e.code === '42501');
});
