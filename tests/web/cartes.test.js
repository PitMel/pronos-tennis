// Cartes de match : états, textes, points (exemples A et B du cahier des charges, section 13).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as moteur from '../../src/moteur/index.js';
import {
  nomCourt, lettresProfils, listeFrancaise, etatCarte, phraseQui, htmlCarteMatch, htmlBaremeTour, bilanDuTour, pointsDuMatch,
} from '../../web/js/cartes.js';

const joueurs = new Map([
  [1, { id: 1, nom: 'Carlos Alcaraz', classement: 1 }],
  [2, { id: 2, nom: 'Taylor Fritz', classement: 9 }],
]);
const profils = [
  { id: 'p', prenom: 'Pierre' }, { id: 'l', prenom: 'Léa' }, { id: 'm', prenom: 'Marc' }, { id: 't', prenom: 'Thomas' },
];
const match = (extra = {}) => ({
  id: 10, tour: 'QF', p1_id: 1, p2_id: 2, statut: 'a_venir', neutralise: false, paris_reveles: false, verrouille: false,
  resultat_visible: false, vainqueur: null, score: null, fin_match: null, sets_joues: null, heure_prevue: null, ...extra,
});
const bet = (joueur, choix, confiance, sets = null) => [joueur, { match_id: 10, joueur_id: joueur, choix, confiance, sets }];
const ctxBase = (extra = {}) => ({ joueurs, profils, moi: 'p', moteur, categorie: 'masters_1000', ...extra });

test('nomCourt, lettresProfils, listeFrancaise', () => {
  assert.equal(nomCourt(joueurs.get(1)), 'Alcaraz');
  assert.equal(nomCourt({ nom: 'Alex De Minaur' }), 'De Minaur');
  assert.equal(nomCourt({ nom: 'Sinner' }), 'Sinner');
  assert.equal(nomCourt(undefined), 'À déterminer');
  assert.equal(lettresProfils(profils).get('l'), 'L');
  const doublons = lettresProfils([{ id: 'a', prenom: 'Paul' }, { id: 'b', prenom: 'Pierre' }, { id: 'c', prenom: 'Léa' }]);
  assert.equal(doublons.get('a'), 'Pa');
  assert.equal(doublons.get('b'), 'Pi');
  assert.equal(doublons.get('c'), 'L');
  assert.equal(listeFrancaise(['A']), 'A');
  assert.equal(listeFrancaise(['A', 'B']), 'A et B');
  assert.equal(listeFrancaise(['A', 'B', 'C']), 'A, B et C');
});

test('etatCarte : un état par situation', () => {
  assert.equal(etatCarte(match({ neutralise: true }), { aParie: false }), 'neutralise');
  assert.equal(etatCarte(match({ statut: 'termine', resultat_visible: true }), { aParie: true }), 'termine');
  assert.equal(etatCarte(match({ statut: 'termine' }), { aParie: true }), 'termine-masque');
  assert.equal(etatCarte(match({ statut: 'en_cours' }), { aParie: true }), 'en-cours');
  assert.equal(etatCarte(match({ verrouille: true, paris_reveles: true }), { aParie: true }), 'revele');
  assert.equal(etatCarte(match({ verrouille: true }), { aParie: true }), 'verrouille');
  assert.equal(etatCarte(match(), { aParie: true }), 'attente');
  assert.equal(etatCarte(match(), { aParie: false }), 'ouvert');
});

test('phraseQui : qui a parié, ou avertissement si l’on est seul', () => {
  const qui = new Map([['p', true], ['l', true], ['m', false], ['t', false]]);
  assert.equal(phraseQui(profils, 'p', qui), 'Léa a parié, Marc et Thomas pas encore.');
  assert.match(phraseQui([profils[0]], 'p', new Map([['p', false]])), /seul joueur de ton groupe/);
  assert.equal(phraseQui(profils, 'p', null), '');
});

test('exemple A : Fritz gagne en quart (×1,5) → Pierre −1,5, Léa +3, Marc −9, Thomas +9', () => {
  const paris = new Map([bet('p', 1, 8), bet('l', 1, 7), bet('m', 1, 9), bet('t', 2, 6)]);
  const m = match({
    statut: 'termine', resultat_visible: true, paris_reveles: true, vainqueur: 2, fin_match: 'normal',
    score: { games: [[6, 7], [4, 6]] }, // vu du joueur 1 (Alcaraz perd)
  });
  const pts = pointsDuMatch(m, ctxBase(), paris);
  const texte = Object.fromEntries(Object.entries(pts).map(([k, v]) => [k, moteur.formaterPoints(v, { signe: true })]));
  assert.deepEqual(texte, { p: '−1,5', l: '+3', m: '−9', t: '+9' });

  const html = htmlCarteMatch(m, ctxBase({ paris: new Map([[10, paris]]) }));
  assert.match(html, /data-etat="termine"/);
  assert.match(html, /Fritz bat Alcaraz <small>7-6 6-4<\/small>/);
  assert.match(html, /<strong class="neg">−1,5<\/strong>/);
  assert.match(html, /<strong class="pos">\+9<\/strong>/);
  assert.match(html, /barre-faux/);
  assert.match(html, /barre-juste/);

  const bilan = bilanDuTour([m], ctxBase({ paris: new Map([[10, paris]]) }));
  assert.equal(moteur.formaterPoints(bilan.get('t'), { signe: true }), '+9');
  assert.equal(bilanDuTour([match()], ctxBase()), null);
});

test('exemple B : paris révélés, scénarios « Si … gagne »', () => {
  const paris = new Map([bet('p', 1, 7), bet('l', 2, 6), bet('m', 1, 8), bet('t', 1, 9)]);
  const m = match({ verrouille: true, paris_reveles: true });
  const html = htmlCarteMatch(m, ctxBase({ paris: new Map([[10, paris]]) }));
  assert.match(html, /data-etat="revele"/);
  assert.match(html, /Si Alcaraz gagne<\/td><td class="pos">\+10,5<\/td><td class="pos">\+6<\/td><td class="pos">\+12<\/td><td class="pos">\+13,5<\/td>/);
  assert.match(html, /Si Fritz gagne<\/td><td class="pos">\+3<\/td><td class="pos">\+9<\/td><td class="neg">−1,5<\/td><td class="neg">−9<\/td>/);
  assert.doesNotMatch(html, /data-action="valider"/);
});

test('saisie : carte ouverte, brouillon, bouton désactivé tant que le pari est incomplet', () => {
  const sans = htmlCarteMatch(match(), ctxBase({ qui: new Map([[10, new Map([['p', false], ['l', true], ['m', false], ['t', false]])]]) }));
  assert.match(sans, /data-etat="ouvert"/);
  assert.match(sans, /À toi de parier/);
  assert.match(sans, /data-action="valider" disabled/);
  assert.match(sans, /Léa a parié, Marc et Thomas pas encore/);
  const avec = htmlCarteMatch(match(), ctxBase({ brouillons: new Map([[10, { choix: 2, confiance: 9 }]]) }));
  assert.match(avec, /Fritz, confiance 9/);
  assert.match(avec, /data-action="valider">Valider mon pari/);
  assert.match(avec, /gagné \+13,5/);
});

test('pari posé : résumé, bouton « Modifier », puis édition avec annulation', () => {
  const paris = new Map([[10, new Map([bet('p', 1, 8)])]]);
  const attente = htmlCarteMatch(match(), ctxBase({ paris, qui: new Map([[10, new Map([['p', true], ['l', false]])]]) }));
  assert.match(attente, /data-etat="attente"/);
  assert.match(attente, /Ton pari : Alcaraz, confiance 8/);
  assert.match(attente, /data-action="modifier"/);
  assert.match(attente, /en attente de Léa/);
  const edition = htmlCarteMatch(match(), ctxBase({ paris, edition: new Set([10]), brouillons: new Map([[10, { choix: 1, confiance: 8 }]]) }));
  assert.match(edition, /Enregistrer la modification/);
  assert.match(edition, /data-action="annuler"/);
});

test('Grand Chelem : choix du nombre de sets obligatoire', () => {
  const c = ctxBase({ categorie: 'grand_slam', brouillons: new Map([[10, { choix: 1, confiance: 8 }]]) });
  assert.match(htmlCarteMatch(match(), c), /data-action="valider" disabled/);
  assert.match(htmlCarteMatch(match(), c), /data-action="sets" data-valeur="5"/);
  const c2 = ctxBase({ categorie: 'grand_slam', brouillons: new Map([[10, { choix: 1, confiance: 8, sets: 4 }]]) });
  assert.match(htmlCarteMatch(match(), c2), /data-action="valider">/);
  assert.doesNotMatch(htmlCarteMatch(match(), ctxBase()), /data-action="sets"/);
});

test('exclu du match : pas de saisie ; forfait et neutralisé : 0 point', () => {
  const exclu = htmlCarteMatch(match(), ctxBase({ qui: new Map([[10, new Map([['l', true]])]]) }));
  assert.match(exclu, /Tu ne participes pas/);
  assert.doesNotMatch(exclu, /data-action="valider"/);
  const paris = new Map([[10, new Map([bet('p', 1, 8)])]]);
  const forfait = htmlCarteMatch(match({ statut: 'termine', resultat_visible: true, paris_reveles: true, vainqueur: 2, fin_match: 'forfait' }), ctxBase({ paris }));
  assert.match(forfait, /Forfait <small>0 point/);
  const neutre = htmlCarteMatch(match({ neutralise: true, paris_reveles: true }), ctxBase({ paris }));
  assert.match(neutre, /Match neutralisé/);
});

test('rien ne fuit : résultat masqué = ni score ni points', () => {
  const paris = new Map([[10, new Map([bet('p', 1, 8)])]]);
  const html = htmlCarteMatch(match({ statut: 'termine', vainqueur: 2, score: { games: [[6, 4]] } }), ctxBase({ paris }));
  assert.match(html, /Résultat masqué/);
  assert.doesNotMatch(html, /6-4|bat /);
});

test('htmlBaremeTour : multiplicateur et gains du tour', () => {
  const html = htmlBaremeTour('masters_1000', 'QF', moteur);
  assert.match(html, /Barème : quarts de finale/);
  assert.match(html, /multipliés par 1,5/);
  assert.match(htmlBaremeTour('masters_1000', 'QF', null), /^$/);
});

test('échappement : un nom de joueur piégé ne casse pas le HTML', () => {
  const j = new Map([[1, { id: 1, nom: 'A <img src=x onerror=1>' }], [2, { id: 2, nom: 'B' }]]);
  const html = htmlCarteMatch(match(), { ...ctxBase(), joueurs: j });
  assert.doesNotMatch(html, /<img src=x/);
});
