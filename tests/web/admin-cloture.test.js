// Clôture admin (4.4) : aperçu calculé par le moteur partagé, avertissements, messages d'erreur, HTML, appels à la base.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as moteur from '../../src/moteur/index.js';
import { apercuCloture, raisonsClotureForcee, messageErreurCloture, htmlClotureAdmin } from '../../web/js/admin-cloture.js';
import { creerDonnees } from '../../web/js/donnees.js';

const A = 'u-andre';
const B = 'u-paul';
const profils = new Map([[A, { id: A, prenom: 'André' }], [B, { id: B, prenom: 'Paul <b>' }]]);
const joueurs = new Map([[10, { id: 10, nom: 'Alcaraz' }], [11, { id: 11, nom: 'Sinner' }]]);
const tournoi = { id: 5, nom: 'Masters <test>', categorie: 'masters_1000', vainqueur_id: null, finaliste_id: null };

/** Une finale jouée, André a parié sur le vainqueur (confiance 8), Paul sur l'autre (confiance 8). */
function donnees(extra = {}) {
  return {
    tournoi_id: 5, categorie: 'masters_1000', etat: 'en_cours', cloture_auto_desactivee: false,
    resultat: { vainqueur_id: 10, finaliste_id: 11 },
    situation: { eligible: true, finale_comptee: true, groupes: [{ test: false, avec_paris: true, matchs_non_reveles: 0 }] },
    matchs: [{ id: 1, tour: 'F', vainqueur: 1, sets_joues: 2, fin_match: 'normal', neutralise: false }],
    groupes: [{
      test: false, joueurs: [A, B],
      paris: [{ match_id: 1, joueur_id: A, choix: 1, confiance: 8, sets: null }, { match_id: 1, joueur_id: B, choix: 2, confiance: 8, sets: null }],
      paris_tournoi: [],
    }],
    ...extra,
  };
}

test('apercuCloture : calcule avec le moteur, sans lever d’exception', () => {
  const { calcul } = apercuCloture({ moteur, donnees: donnees() });
  assert.equal(calcul.resultats.length, 2);
  assert.deepEqual([calcul.vainqueur_id, calcul.finaliste_id], [10, 11]);
  const a = calcul.resultats.find((r) => r.joueur_id === A);
  const b = calcul.resultats.find((r) => r.joueur_id === B);
  assert.ok(a.rang < b.rang);
});

test('apercuCloture : finale sans vainqueur → erreur en français ; choix imposés acceptés ; même joueur refusé', () => {
  const sans = donnees({ resultat: null });
  assert.match(apercuCloture({ moteur, donnees: sans }).erreur, /requis/);
  assert.equal(apercuCloture({ moteur, donnees: sans, imposes: { vainqueurId: '10', finalisteId: '11' } }).calcul.vainqueur_id, 10);
  assert.match(apercuCloture({ moteur, donnees: donnees(), imposes: { vainqueurId: 10, finalisteId: 10 } }).erreur, /différents/);
});

test('raisonsClotureForcee : finale inconnue, personne n’a parié, matchs sans paris de tous', () => {
  assert.deepEqual(raisonsClotureForcee(donnees()), []);
  assert.deepEqual(raisonsClotureForcee({}), []);
  const r = raisonsClotureForcee({ situation: { finale_comptee: false, groupes: [{ test: true, avec_paris: true, matchs_non_reveles: 2 }, { test: false, avec_paris: false, matchs_non_reveles: 0 }] } });
  assert.equal(r.length, 2);
  assert.match(r[0], /finale/);
  assert.match(r[1], /2 matchs.*test/);
  assert.match(raisonsClotureForcee({ situation: { finale_comptee: true, groupes: [] } })[0], /Personne/);
});

test('messageErreurCloture : refus, joueurs changés, base pas à jour, réseau', () => {
  assert.match(messageErreurCloture({ message: 'Réservé à l\'administrateur' }), /administrateur/);
  assert.match(messageErreurCloture({ message: 'Résultats incomplets ou inattendus : …' }), /recharge/);
  assert.match(messageErreurCloture({ code: 'PGRST202', message: 'Could not find the function' }), /migration 0006/);
  assert.match(messageErreurCloture({ message: 'Failed to fetch' }), /connexion/);
  assert.match(messageErreurCloture(new Error('boum')), /échoué/);
});

test('htmlClotureAdmin : tournoi non clos, éligible → bouton simple, tableau, échappement', () => {
  const h = htmlClotureAdmin({ moteur, tournoi, donnees: donnees(), profils, joueurs });
  assert.match(h, /Clôture · Masters &lt;test&gt;/);
  assert.match(h, /Paul &lt;b&gt;/);
  assert.doesNotMatch(h, /Paul <b>/);
  assert.match(h, /Clôturer le tournoi/);
  assert.doesNotMatch(h, /Clôturer quand même/);
  assert.match(h, /<option value="10" selected>Alcaraz/);
  assert.match(h, /<option value="11" selected>Sinner/);
  assert.match(h, /Groupe réel/);
  assert.ok(h.indexOf('André') < h.indexOf('Paul &lt;b&gt;'), 'André (rang 1) avant Paul');
});

test('htmlClotureAdmin : clôture manuelle → avertissements et « Clôturer quand même » ; sans vainqueur, bouton inactif', () => {
  const d = donnees({ resultat: null, situation: { eligible: false, finale_comptee: false, groupes: [{ test: false, avec_paris: true, matchs_non_reveles: 1 }] } });
  const h = htmlClotureAdmin({ moteur, tournoi, donnees: d, profils, joueurs });
  assert.match(h, /Clôturer quand même/);
  assert.match(h, /data-force="1" disabled/);
  assert.match(h, /Clôture manuelle/);
  assert.match(h, /role="alert"/); // vainqueur et finaliste requis
  const avec = htmlClotureAdmin({ moteur, tournoi, donnees: d, profils, joueurs, imposes: { vainqueurId: 10, finalisteId: 11 } });
  assert.doesNotMatch(avec, /data-force="1" disabled/);
  assert.match(avec, /data-force="1"/);
});

test('htmlClotureAdmin : tournoi clos — archive à jour (bouton Corriger inactif) ou différente (lignes surlignées)', () => {
  const clos = { ...tournoi, vainqueur_id: 10, finaliste_id: 11 };
  const calcul = apercuCloture({ moteur, donnees: donnees() }).calcul;
  const archive = calcul.resultats.map((r) => ({ joueur_id: r.joueur_id, score_final: r.score_final, rang: r.rang }));
  const aJour = htmlClotureAdmin({ moteur, tournoi: clos, donnees: donnees({ etat: 'clos' }), profils, joueurs, archive });
  assert.match(aJour, /archive enregistrée est à jour/);
  assert.match(aJour, /data-action="ad-cloturer"[^>]* disabled/);
  assert.match(aJour, /data-action="ad-rouvrir"/);
  assert.doesNotMatch(aJour, /class="ecart"/);
  const perime = archive.map((r) => (r.joueur_id === A ? { ...r, score_final: '999' } : r));
  const diff = htmlClotureAdmin({ moteur, tournoi: clos, donnees: donnees({ etat: 'clos' }), profils, joueurs, archive: perime });
  assert.match(diff, /class="ecart"/);
  assert.match(diff, /diffère/);
  assert.doesNotMatch(diff, /data-action="ad-cloturer"[^>]* disabled/);
  // vainqueur modifié par l'administrateur → l'archive diffère aussi
  const autre = htmlClotureAdmin({ moteur, tournoi: clos, donnees: donnees({ etat: 'clos' }), profils, joueurs, archive, imposes: { vainqueurId: 11, finalisteId: 10 } });
  assert.match(autre, /diffère/);
});

test('htmlClotureAdmin : personne n’a parié', () => {
  const h = htmlClotureAdmin({ moteur, tournoi, donnees: donnees({ groupes: [], situation: { finale_comptee: true, groupes: [] } }), profils, joueurs });
  assert.match(h, /Personne n’a parié/);
});

test('donnees : clôture, réouverture et lecture passent par les fonctions de la base', async () => {
  const appels = [];
  const supabase = { rpc: async (nom, args) => { appels.push([nom, args]); return { data: { statut: 'cloture' }, error: null }; } };
  const d = creerDonnees(supabase);
  await d.donneesCloture(5);
  await d.cloturerTournoi({ tournoiId: 5, resultats: [{ joueur_id: A }], vainqueurId: 10, finalisteId: 11 });
  await d.rouvrirTournoi(5);
  assert.deepEqual(appels, [
    ['admin_donnees_cloture', { p_tournoi: 5 }],
    ['admin_cloturer_tournoi', { p_tournoi: 5, p_resultats: [{ joueur_id: A }], p_vainqueur: 10, p_finaliste: 11 }],
    ['admin_rouvrir_tournoi', { p_tournoi: 5 }],
  ]);
  const erreur = creerDonnees({ rpc: async () => ({ data: null, error: { message: 'Réservé à l\'administrateur' } }) });
  await assert.rejects(erreur.rouvrirTournoi(5), (e) => /Réservé/.test(e.message));
});
