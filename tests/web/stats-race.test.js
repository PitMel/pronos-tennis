import test from 'node:test';
import assert from 'node:assert/strict';
import * as moteur from '../../src/moteur/index.js';
import { detailRace } from '../../web/js/classement.js';
import { statsRace } from '../../web/js/stats-race.js';
import { htmlPageRace } from '../../web/js/vues.js';

const profils = [{ id: 'a', prenom: 'André', couleur: null }, { id: 'p', prenom: 'Paul', couleur: null }];
const tournois = [
  { id: 1, annee: 2026, nom: 'Roland-Garros', categorie: 'grand_slam', etat: 'clos', date_debut: '2026-05-24', vainqueur_id: 10, finaliste_id: 11 },
  { id: 2, annee: 2026, nom: 'Monte-Carlo', categorie: 'masters_1000', etat: 'en_cours' }, // pas terminé : ignoré
];
const resultats = [
  { tournament_id: 1, joueur_id: 'a', points_matchs: '8', points_pari_tournoi: '24', bonus_classement: '24', score_final: '56', rang: 1 },
  { tournament_id: 1, joueur_id: 'p', points_matchs: '14', points_pari_tournoi: '0', bonus_classement: '12', score_final: '26', rang: 2 },
];
// Joueur 10 (Alcaraz) joue les 6 matchs en p1 et en gagne 4 ; ses adversaires : 11 à 16.
const vainqueurs = [1, 1, 2, 1, 2, 1];
const sets = [3, 4, 3, 5, 4, 3];
const matchs = vainqueurs.map((v, i) => ({ id: 100 + i, tournament_id: 1, tour: 'R16', p1_id: 10, p2_id: 11 + i, vainqueur: v, sets_joues: sets[i], fin_match: 'normal', neutralise: false }));
matchs.push({ id: 200, tournament_id: 2, tour: 'R16', p1_id: 10, p2_id: 99, vainqueur: 1, sets_joues: 2, neutralise: false }); // tournoi non terminé : ignoré
const paris = new Map();
// André : Alcaraz à 10 partout, en pariant 3 sets ; Paul : contre Alcaraz sur les 3 premiers matchs, à 6, en pariant 5 sets
matchs.slice(0, 6).forEach((m) => paris.set(m.id, new Map([['a', { choix: 1, confiance: 10, sets: 3 }]])));
matchs.slice(0, 3).forEach((m) => paris.get(m.id).set('p', { choix: 2, confiance: 6, sets: 5 }));
const parisTournoi = [{ tournament_id: 1, joueur_id: 'a', vainqueur_id: 10, finaliste_id: 11 }];
const joueurs = new Map([[10, { nom: 'Alcaraz' }], [11, { nom: 'Bublik' }], [12, { nom: 'Cobolli' }], [13, { nom: 'Draper' }]]);
const calculer = () => statsRace({ moteur, annee: 2026, tournois, resultats, profils, matchs, paris, parisTournoi, joueurs });

test('détail des points : matchs, sets, vainqueur et finaliste, bonification, total', () => {
  const [a, p] = calculer().detailPoints;
  assert.deepEqual([a.matchs.texte, a.sets.texte, a.pari.texte, a.bonus.texte, a.total.texte], ['6', '2', '24', '24', '56']);
  assert.deepEqual([p.matchs.texte, p.sets.texte, p.pari.texte, p.bonus.texte, p.total.texte], ['14', '0', '0', '12', '26']);
});

test('vaches à lait : points cumulés par joueur de tennis (matchs et pari tournoi), trois au plus', () => {
  const [a, p] = calculer().vachesALait;
  assert.deepEqual(a.joueurs.map((j) => [j.nom, j.points]), [['Alcaraz', '24'], ['Bublik', '8']]);
  assert.deepEqual(p.joueurs.map((j) => [j.nom, j.points]), [['Draper', '6'], ['Bublik', '4'], ['Cobolli', '4']]);
});

test('chouchous : joueurs vus au moins 5 fois, rapport paris sur sa victoire / matchs', () => {
  const [a, p] = calculer().chouchous;
  assert.deepEqual(a.joueurs.map((j) => [j.nom, j.rapport]), [['Alcaraz', '6/6']]);
  assert.deepEqual(p.joueurs, []); // Paul n'a jamais misé sur Alcaraz
});

test('amours impossibles : au moins trois paris, victoires du joueur / paris sur lui', () => {
  const [a, p] = calculer().amoursImpossibles;
  assert.deepEqual(a.joueurs.map((j) => [j.nom, j.rapport]), [['Alcaraz', '4/6']]);
  assert.deepEqual(p.joueurs, []); // un seul pari sur chaque adversaire
});

test('records : plus gros score avant bonification, ric rac, grand fou, gagne-petit ; tournois non terminés ignorés', () => {
  const r = calculer().records;
  assert.equal(r.grandChelem.length, 1);
  assert.deepEqual([r.grandChelem[0].tournoi.nom, r.grandChelem[0].parieur, r.grandChelem[0].score], ['Roland-Garros', 'André', '32']);
  assert.equal(r.masters, null);
  assert.deepEqual([r.ricRac.tournoi.nom, r.ricRac.premier, r.ricRac.deuxieme, r.ricRac.ecart, r.ricRac.pluriel], ['Roland-Garros', 'André', 'Paul', '18', true]);
  assert.deepEqual([r.grandFou.noms, r.grandFou.nombre, r.grandFou.autres], [['André'], 6, [{ id: 'p', prenom: 'Paul', nombre: 0 }]]);
  assert.deepEqual([r.gagnePetit.noms, r.gagnePetit.nombre, r.gagnePetit.autres], [['Paul'], 3, [{ id: 'a', prenom: 'André', nombre: 0 }]]);
});

test('page Race : les sections viennent dans l’ordre demandé', () => {
  const d = detailRace({ moteur, annee: 2026, tournois, resultats, profils });
  const html = htmlPageRace(d, { moi: 'p', stats: calculer() });
  const ordre = ['<h3>Classement</h3>', '<h3>Détail des points</h3>', '<h3>Détail par tournoi</h3>', '<h3>Évolution</h3>', 'Les vaches à lait', 'Les chouchous', 'Amours impossibles', 'Records en tournoi'];
  const positions = ordre.map((t) => html.indexOf(t));
  assert.ok(positions.every((x) => x >= 0), `section manquante : ${positions}`);
  assert.deepEqual([...positions].sort((x, y) => x - y), positions);
  assert.match(html, /Biggest win – Grand Chelem/);
  assert.match(html, /Ric rac !/);
  assert.match(html, /Le grand fou/);
  assert.match(html, /Le gagne-petit/);
  assert.match(html, /Alcaraz <span class="valeur">\(24\)<\/span>/);
  // sans statistiques (échec de chargement) : la page s'affiche quand même
  assert.doesNotMatch(htmlPageRace(d, { moi: 'p' }), /vaches à lait/);
});
