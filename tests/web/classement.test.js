import test from 'node:test';
import assert from 'node:assert/strict';
import * as moteur from '../../src/moteur/index.js';
import { construireRace } from '../../web/js/classement.js';
import { htmlRace, htmlListeTournois } from '../../web/js/vues.js';

const profils = [
  { id: 'a', prenom: 'André', couleur: '#aa0000' },
  { id: 'p', prenom: 'Paul', couleur: null },
  { id: 'j', prenom: 'Jacques', couleur: null },
];
const tournois = [
  { id: 1, annee: 2026, etat: 'clos' },
  { id: 2, annee: 2026, etat: 'en_cours' },
  { id: 3, annee: 2025, etat: 'clos' },
];
const resultats = [
  { tournament_id: 1, joueur_id: 'a', score_final: '27/2' }, // 13,5
  { tournament_id: 1, joueur_id: 'p', score_final: '-3/4' }, // −0,75
  { tournament_id: 1, joueur_id: 'j', score_final: '27/2' },
  { tournament_id: 1, joueur_id: 'zzz', score_final: '99' }, // hors groupe : ignoré
  { tournament_id: 2, joueur_id: 'a', score_final: '50' },   // tournoi non clos : ignoré
  { tournament_id: 3, joueur_id: 'a', score_final: '70' },   // autre année : ignoré
];

test('construireRace : somme des scores finaux des tournois clos de l\'année, rangs avec ex aequo', () => {
  const race = construireRace({ moteur, annee: 2026, tournois, resultats, profils });
  assert.equal(race.tournoisClos, 1);
  assert.deepEqual(race.lignes.map((l) => [l.prenom, l.rang, l.points]), [['André', 1, '13,5'], ['Jacques', 1, '13,5'], ['Paul', 3, '−0,75']]);
});

test('construireRace : aucun tournoi clos = tout le monde à 0, tous premiers', () => {
  const race = construireRace({ moteur, annee: 2026, tournois: [{ id: 2, annee: 2026, etat: 'en_cours' }], resultats, profils });
  assert.equal(race.tournoisClos, 0);
  assert.deepEqual(race.lignes.map((l) => [l.rang, l.points]), [[1, '0'], [1, '0'], [1, '0']]);
});

test('construireRace : un joueur absent des archives compte 0', () => {
  const race = construireRace({ moteur, annee: 2026, tournois, resultats: [{ tournament_id: 1, joueur_id: 'a', score_final: '5' }], profils });
  assert.deepEqual(race.lignes.map((l) => [l.prenom, l.rang, l.points]), [['André', 1, '5'], ['Jacques', 2, '0'], ['Paul', 2, '0']]);
});

test('vues : classement « Race 2026 » en haut de la saison en cours, ordre chronologique dessous', () => {
  const race = construireRace({ moteur, annee: 2026, tournois, resultats, profils });
  assert.match(htmlRace(race), /Race 2026/);
  assert.match(htmlRace(race), /1 tournoi terminé/);
  const t = (id, nom, debut) => ({ id, annee: 2026, nom, ville: 'X', surface: 'dur', indoor: false, categorie: 'masters_1000', date_debut: debut, date_fin: null, etat: 'a_venir' });
  const html = htmlListeTournois([t(1, 'Tardif', '2026-11-02'), t(2, 'Précoce', '2026-03-10'), t(3, 'Sans date', null)], { race, anneeCourante: 2026 });
  assert.ok(html.indexOf('Saison 2026') < html.indexOf('Race 2026'));
  assert.ok(html.indexOf('Race 2026') < html.indexOf('Précoce'));
  assert.ok(html.indexOf('Précoce') < html.indexOf('Tardif'));
  assert.ok(html.indexOf('Tardif') < html.indexOf('Sans date'));
});

test('vues : Race sans tournoi clos, et saison courante absente de la liste', () => {
  const race = construireRace({ moteur, annee: 2027, tournois: [], resultats: [], profils });
  assert.match(htmlRace(race), /Aucun tournoi terminé/);
  const html = htmlListeTournois([], { race, anneeCourante: 2027 });
  assert.match(html, /Saison 2027/);
  assert.match(html, /Race 2027/);
});

test('vues : prénoms échappés dans le classement', () => {
  const race = construireRace({ moteur, annee: 2026, tournois: [], resultats: [], profils: [{ id: 'x', prenom: '<script>', couleur: null }] });
  assert.doesNotMatch(htmlRace(race), /<script>/);
});
