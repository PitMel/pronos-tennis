// Pari tournoi : joueurs sélectionnables et éliminés, choix, états, pages (cahier des charges §6, exemple E).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as moteur from '../../src/moteur/index.js';
import { creerDonnees } from '../../web/js/donnees.js';
import {
  joueursDuTournoi, regrouperParisTournoi, choisir, brouillonDepuisPariTournoi, pariTournoiRevele, etatPariTournoi,
  messageErreurPariTournoi, MESSAGE_PARI_TOURNOI_FERME, htmlSectionPariTournoi, contextePariTournoi,
} from '../../web/js/pari-tournoi.js';
import { htmlPageTournoi } from '../../web/js/vues.js';
import { classementTournoi } from '../../web/js/classement.js';

const joueurs = new Map([
  [1, { id: 1, nom: 'Carlos Alcaraz', classement: 1 }], [2, { id: 2, nom: 'Taylor Fritz', classement: 14 }],
  [3, { id: 3, nom: 'Novak Djokovic', classement: 4 }], [4, { id: 4, nom: 'Daniil Medvedev' }],
]);
const m = (id, tour, p1, p2, extra = {}) => ({
  id, tour, p1_id: p1, p2_id: p2, statut: 'a_venir', neutralise: false, resultat_visible: false, vainqueur: null, ...extra,
});
const fini = (id, tour, p1, p2, vainqueur) => m(id, tour, p1, p2, { statut: 'termine', resultat_visible: true, vainqueur });
const tournoi = (extra = {}) => ({ id: 7, annee: 2026, nom: 'Rolex Paris Masters', categorie: 'masters_1000', etat: 'en_cours', vainqueur_id: null, finaliste_id: null, ...extra });
const profils = [{ id: 'p', prenom: 'Pierre' }, { id: 'l', prenom: 'Léa' }, { id: 't', prenom: 'Thomas' }];

test('joueursDuTournoi : éliminés d’après les résultats visibles seulement, tri par classement', () => {
  const matchs = [
    fini(1, 'R16', 1, 2, 2), // Alcaraz perd
    m(2, 'R16', 3, 4, { statut: 'termine', vainqueur: 1 }), // résultat masqué : personne n'est éliminé
  ];
  const l = joueursDuTournoi(matchs, joueurs);
  assert.deepEqual(l.map((j) => j.id), [1, 3, 2, 4]); // 1, 4, 14, sans classement en dernier
  assert.equal(l.find((j) => j.id === 1).elimine, true);
  assert.equal(l.find((j) => j.id === 1).avantFinale, true);
  assert.equal(l.find((j) => j.id === 4).elimine, false);
  assert.equal(l.find((j) => j.id === 3).elimine, false);
});

test('joueursDuTournoi : poules des ATP Finals = personne d’éliminé ; finale = gagnant', () => {
  const rr = [fini(1, 'RR', 1, 2, 1), fini(2, 'RR', 3, 4, 2)];
  assert.ok(joueursDuTournoi(rr, joueurs).every((j) => !j.elimine));
  const fin = joueursDuTournoi([fini(1, 'SF', 1, 2, 1), fini(2, 'F', 1, 3, 1)], joueurs);
  assert.equal(fin.find((j) => j.id === 1).gagnant, true);
  assert.equal(fin.find((j) => j.id === 3).elimine, true);
  assert.equal(fin.find((j) => j.id === 3).avantFinale, false); // éliminé en finale : pas « avant la finale »
  assert.equal(fin.find((j) => j.id === 3).finale, true);
  assert.equal(fin.find((j) => j.id === 2).avantFinale, true);
});

test('choisir : un joueur ne peut pas être vainqueur et finaliste ; un second clic retire le choix', () => {
  let b = choisir({}, 'vainqueur', 5);
  b = choisir(b, 'finaliste', 6);
  assert.deepEqual(b, { vainqueur: 5, finaliste: 6 });
  assert.deepEqual(choisir(b, 'finaliste', 5), { finaliste: 5 }); // 5 passe finaliste, plus vainqueur
  assert.deepEqual(choisir(b, 'vainqueur', 5), { finaliste: 6 });
  assert.deepEqual(brouillonDepuisPariTournoi({ vainqueur_id: 1, finaliste_id: 2 }), { vainqueur: 1, finaliste: 2 });
  assert.deepEqual(brouillonDepuisPariTournoi(null), {});
  assert.equal(regrouperParisTournoi([{ joueur_id: 'a', vainqueur_id: 1 }]).get('a').vainqueur_id, 1);
});

test('états : à venir, ouvert, révélé, clos', () => {
  assert.equal(pariTournoiRevele(new Map([['p', true], ['l', true]])), true);
  assert.equal(pariTournoiRevele(new Map([['p', true], ['l', false]])), false);
  assert.equal(pariTournoiRevele(null), false);
  assert.equal(etatPariTournoi(tournoi({ etat: 'a_venir' }), { revele: false }), 'a-venir');
  assert.equal(etatPariTournoi(tournoi({ etat: 'pari_tournoi_ouvert' }), { revele: false }), 'ouvert');
  assert.equal(etatPariTournoi(tournoi(), { revele: true }), 'revele');
  assert.equal(etatPariTournoi(tournoi({ etat: 'clos' }), { revele: false }), 'clos');
});

test('messageErreurPariTournoi', () => {
  assert.equal(messageErreurPariTournoi({ code: 'PARI_FERME' }), MESSAGE_PARI_TOURNOI_FERME);
  assert.equal(messageErreurPariTournoi({ code: '42501' }), MESSAGE_PARI_TOURNOI_FERME);
  assert.match(messageErreurPariTournoi(new TypeError('Failed to fetch')), /connexion/);
  assert.match(messageErreurPariTournoi({ message: 'x' }), /Réessaie/);
});

test('contextePariTournoi : reprend les paris du tournoi et la saisie partagée, jamais les paris de match', () => {
  const saisie = { brouillon: { vainqueur: 1 }, edition: true, enCours: false, message: 'x' };
  const paris = new Map([['p', { vainqueur_id: 1 }]]);
  const qui = new Map([['p', true]]);
  const c = contextePariTournoi({ moi: 'p', profils, moteur, paris: new Map([[5, new Map()]]), qui: new Map([[5, new Map()]]), parisTournoi: paris, quiTournoi: qui, saisiePariTournoi: saisie });
  assert.equal(c.paris, paris);
  assert.equal(c.qui, qui);
  assert.deepEqual([c.brouillon, c.edition, c.enCours, c.message], [{ vainqueur: 1 }, true, false, 'x']);
  assert.equal(contextePariTournoi({}).brouillon, undefined); // pas de saisie : rien ne plante
});

test('page tournoi : la section « Pari tournoi » est entre le classement et les tours, sans carte d’accès ni page séparée', () => {
  const t = tournoi();
  const matchs = [m(2, 'R16', 3, 4)];
  const classement = classementTournoi({ moteur, tournoi: t, matchs: [], paris: new Map(), archives: [], profils });
  const ctx = {
    moi: 'p', moteur, profils, paris: new Map(), qui: new Map(), classement,
    parisTournoi: new Map(), quiTournoi: new Map([['p', false], ['l', false], ['t', false]]), saisiePariTournoi: { brouillon: { vainqueur: 3 } },
  };
  const html = htmlPageTournoi({ tournoi: t, matchs, joueurs, ctx });
  const classementPos = html.indexOf('Classement du tournoi');
  const pariPos = html.indexOf('id="pari-tournoi"');
  const tourPos = html.indexOf('Huitièmes de finale');
  assert.ok(classementPos > 0 && classementPos < pariPos && pariPos < tourPos, `ordre : ${classementPos}, ${pariPos}, ${tourPos}`);
  assert.match(html, /<h3>Pari tournoi<\/h3>/);
  assert.match(html, /Choisis ton vainqueur et ton finaliste/);
  assert.match(html, /Vainqueur : <b>Djokovic<\/b> · Finaliste : <b>…<\/b>/); // le brouillon partagé est affiché
  assert.doesNotMatch(html, /carte-pari-tournoi/);
  assert.doesNotMatch(html, /href="#\/tournoi\/7\/pari"/);
  // sans les données du pari tournoi dans le contexte : pas de section
  assert.doesNotMatch(htmlPageTournoi({ tournoi: t, matchs, joueurs, ctx: { ...ctx, parisTournoi: undefined } }), /id="pari-tournoi"/);
});

test('page : saisie, éliminés désactivés, bouton valider selon le brouillon', () => {
  const matchs = [fini(1, 'R16', 1, 2, 2), m(2, 'R16', 3, 4)];
  const ctx = { moi: 'p', profils, moteur, paris: new Map(), qui: new Map([['p', false], ['l', true], ['t', false]]) };
  const vide = htmlSectionPariTournoi({ tournoi: tournoi(), matchs, joueurs, ctx });
  assert.match(vide, /Choisis ton vainqueur et ton finaliste/);
  assert.match(vide, /data-action="tp-valider" disabled/);
  assert.match(vide, /Léa a parié, Thomas pas encore/);
  assert.match(vide, /ligne-choix elimine/);
  assert.match(vide, /data-joueur="1"[^>]*disabled/); // Alcaraz éliminé
  assert.match(vide, /Chaque joueur choisi qui joue la finale rapporte 4 points[\s\S]*12 au maximum/);
  const rempli = htmlSectionPariTournoi({ tournoi: tournoi(), matchs, joueurs, ctx: { ...ctx, brouillon: { vainqueur: 3, finaliste: 4 } } });
  assert.match(rempli, /Vainqueur : <b>Djokovic<\/b> · Finaliste : <b>Medvedev<\/b>/);
  assert.match(rempli, /data-action="tp-valider">Valider mon pari/);
  const gc = htmlSectionPariTournoi({ tournoi: tournoi({ categorie: 'grand_slam' }), matchs, joueurs, ctx });
  assert.match(gc, /rapporte 8 points[\s\S]*24 au maximum/);
});

test('page : pari posé, modification, tournoi à venir, exclu', () => {
  const matchs = [m(2, 'R16', 3, 4)];
  const paris = new Map([['p', { vainqueur_id: 3, finaliste_id: 4 }]]);
  const base = { moi: 'p', profils, moteur, paris, qui: new Map([['p', true], ['l', false], ['t', false]]) };
  const pose = htmlSectionPariTournoi({ tournoi: tournoi(), matchs, joueurs, ctx: base });
  assert.match(pose, /Djokovic<\/b> vainqueur · <b>Medvedev<\/b> finaliste/);
  assert.match(pose, /data-action="tp-modifier"/);
  const edition = htmlSectionPariTournoi({ tournoi: tournoi(), matchs, joueurs, ctx: { ...base, edition: true, brouillon: { vainqueur: 3, finaliste: 4 } } });
  assert.match(edition, /Enregistrer la modification/);
  assert.match(edition, /data-action="tp-annuler"/);
  assert.match(htmlSectionPariTournoi({ tournoi: tournoi({ etat: 'a_venir' }), matchs: [], joueurs, ctx: base }), /Pas encore ouvert/);
  assert.match(htmlSectionPariTournoi({ tournoi: tournoi(), matchs, joueurs, ctx: { ...base, paris: new Map(), qui: new Map([['l', true], ['t', false]]) } }), /Tu ne participes pas/);
});

test('page : tout le monde a parié = choix révélés avec joueurs barrés ; clos = points (exemple E)', () => {
  const matchs = [fini(1, 'R16', 1, 2, 2), m(2, 'R16', 3, 4)];
  const paris = new Map([
    ['p', { vainqueur_id: 1, finaliste_id: 3 }], ['l', { vainqueur_id: 3, finaliste_id: 4 }],
  ]);
  const ctx = { moi: 'p', profils, moteur, paris, qui: new Map([['p', true], ['l', true], ['t', true]]) };
  const revele = htmlSectionPariTournoi({ tournoi: tournoi(), matchs, joueurs, ctx });
  assert.match(revele, /<s class="barre">Alcaraz<\/s>/); // éliminé avant la finale
  assert.match(revele, /Thomas<\/th><td colspan="2" class="vide">pas de pari/);
  assert.doesNotMatch(revele, /data-action="tp-valider"/);

  // Masters : vainqueur et finaliste exacts = 12 ; les deux en finale mais inversés = 8 (pas de bonus vainqueur)
  const clos = tournoi({ etat: 'clos', vainqueur_id: 3, finaliste_id: 4 });
  const ctxClos = { ...ctx, paris: new Map([['p', { vainqueur_id: 4, finaliste_id: 3 }], ['l', { vainqueur_id: 3, finaliste_id: 4 }]]) };
  const html = htmlSectionPariTournoi({ tournoi: clos, matchs, joueurs, ctx: ctxClos });
  assert.match(html, /Pierre<\/th><td>Medvedev<\/td><td>Djokovic<\/td><td class="pos">\+8<\/td>/);
  assert.match(html, /Léa<\/th><td>Djokovic<\/td><td>Medvedev<\/td><td class="pos">\+12<\/td>/);
});

test('enregistrerPariTournoi : insertion, mise à jour, repli 23505, pari fermé', async () => {
  const faux = ({ insertErreur = null, lignes = [{ id: 1 }] } = {}) => {
    const appels = [];
    return {
      appels,
      from: (table) => ({
        insert: (v) => { appels.push(['insert', table, v]); return Promise.resolve({ error: insertErreur }); },
        update: (v) => {
          appels.push(['update', table, v]);
          const c = { eq: () => c, select: () => Promise.resolve({ data: lignes, error: null }) };
          return c;
        },
      }),
    };
  };
  const a = faux();
  assert.equal(await creerDonnees(a).enregistrerPariTournoi({ tournoiId: 7, moi: 'p', vainqueurId: 1, finalisteId: 2, existe: false }), 'cree');
  assert.deepEqual(a.appels, [['insert', 'tournament_bets', { tournament_id: 7, vainqueur_id: 1, finaliste_id: 2 }]]);
  const b = faux();
  assert.equal(await creerDonnees(b).enregistrerPariTournoi({ tournoiId: 7, moi: 'p', vainqueurId: 1, finalisteId: 2, existe: true }), 'remplace');
  assert.deepEqual(b.appels, [['update', 'tournament_bets', { vainqueur_id: 1, finaliste_id: 2 }]]);
  const c = faux({ insertErreur: { code: '23505' } });
  assert.equal(await creerDonnees(c).enregistrerPariTournoi({ tournoiId: 7, moi: 'p', vainqueurId: 1, finalisteId: 2, existe: false }), 'remplace');
  await assert.rejects(creerDonnees(faux({ lignes: [] })).enregistrerPariTournoi({ tournoiId: 7, moi: 'p', vainqueurId: 1, finalisteId: 2, existe: true }), { code: 'PARI_FERME' });
  await assert.rejects(creerDonnees(faux({ insertErreur: { code: '42501' } })).enregistrerPariTournoi({ tournoiId: 7, moi: 'p', vainqueurId: 1, finalisteId: 2, existe: false }), { code: '42501' });
});
