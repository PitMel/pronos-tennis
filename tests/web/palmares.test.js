// Palmarès (5.3).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as moteur from '../../src/moteur/index.js';
import { construirePalmares, htmlPalmares } from '../../web/js/palmares.js';

const profils = [{ id: 'a', prenom: 'André', couleur: '#aa0000' }, { id: 'p', prenom: 'Paul <b>', couleur: null }, { id: 'j', prenom: 'Jacques', couleur: null }];
const joueurs = new Map([[1, { id: 1, nom: 'Alcaraz' }], [2, { id: 2, nom: 'Sinner' }]]);
const tournois = [
  { id: 1, annee: 2026, nom: 'Madrid <x>', categorie: 'masters_1000', etat: 'clos', date_debut: '2026-04-20', date_fin: '2026-05-03', vainqueur_id: 1, finaliste_id: 2 },
  { id: 2, annee: 2026, nom: 'Paris', categorie: 'masters_1000', etat: 'en_cours', date_debut: '2026-11-02', date_fin: '2026-11-08' },
  { id: 3, annee: 2025, nom: 'US Open', categorie: 'grand_slam', etat: 'clos', date_debut: '2025-08-24', date_fin: '2025-09-07', vainqueur_id: 2, finaliste_id: 1 },
  { id: 4, annee: 2026, nom: 'Rome', categorie: 'masters_1000', etat: 'clos', date_debut: '2026-05-10', date_fin: '2026-05-17', vainqueur_id: null, finaliste_id: null },
];
const resultats = [
  { tournament_id: 1, joueur_id: 'a', score_final: '27/2', rang: 1 }, { tournament_id: 1, joueur_id: 'p', score_final: '-3/4', rang: 2 }, { tournament_id: 1, joueur_id: 'j', score_final: '27/2', rang: 1 },
  { tournament_id: 3, joueur_id: 'p', score_final: '40', rang: 1 }, { tournament_id: 3, joueur_id: 'a', score_final: '10', rang: 2 },
  { tournament_id: 4, joueur_id: 'zzz', score_final: '99', rang: 1 }, // hors groupe : ignoré
];

test('construirePalmares : saisons récentes d’abord, seuls les tournois clos, champion de la Race, meilleurs pronostiqueurs (ex æquo)', () => {
  const p = construirePalmares({ moteur, tournois, resultats, profils, joueurs });
  assert.deepEqual(p.map((s) => s.annee), [2026, 2025]);
  const s26 = p[0];
  assert.deepEqual(s26.tournois.map((t) => t.nom), ['Madrid <x>', 'Rome']);
  assert.deepEqual(s26.champions.map((c) => c.prenom).sort(), ['André', 'Jacques']);
  assert.equal(s26.points, '13,5');
  const madrid = s26.tournois[0];
  assert.deepEqual([madrid.vainqueur, madrid.finaliste], ['Alcaraz', 'Sinner']);
  assert.deepEqual(madrid.meilleurs.map((m) => [m.prenom, m.score]), [['André', '13,5'], ['Jacques', '13,5']]);
  const rome = s26.tournois[1];
  assert.equal(rome.vainqueur, null);
  assert.deepEqual(rome.meilleurs, []);
  assert.equal(p[1].champions[0].prenom, 'Paul <b>');
});

test('htmlPalmares : contenu, échappement, liens, cas vide', () => {
  const h = htmlPalmares(construirePalmares({ moteur, tournois, resultats, profils, joueurs }));
  assert.match(h, /Saison 2026/);
  assert.match(h, /Champions de la Race/);
  assert.match(h, /Madrid &lt;x&gt;/);
  assert.doesNotMatch(h, /Madrid <x>/);
  assert.match(h, /Alcaraz<small> bat Sinner/);
  assert.match(h, /href="#\/tournoi\/1"/);
  assert.match(h, /href="#\/race\/2026"/);
  assert.match(h, /Pas de pronostics archivés/);
  assert.match(h, /Paul &lt;b&gt;/);
  assert.match(htmlPalmares([]), /Aucun tournoi terminé/);
});

test('construirePalmares : groupe vide → pas de champion, pas d’erreur', () => {
  const p = construirePalmares({ moteur, tournois, resultats, profils: [], joueurs });
  assert.deepEqual(p[0].champions, []);
  assert.doesNotMatch(htmlPalmares(p), /Champion/);
});
