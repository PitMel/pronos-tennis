import test from 'node:test';
import assert from 'node:assert/strict';
import { lireCsv, normaliserNom, construireIndex, trouverIdAtp, calculerH2H, rangAtp } from '../../src/sync/h2h.js';

const ENTETE = 'tourney_id,tourney_name,surface,tourney_date,winner_id,winner_name,loser_id,loser_name,score,round,winner_rank,loser_rank';
const csv = [
  ENTETE,
  '2024-1,"Rome, Masters",Clay,20240508,S1,Jannik Sinner,A1,Carlos Alcaraz,6-2 6-4,SF,2,3',
  '2025-2,Cincinnati Masters,Hard,20250807,A1,Carlos Alcaraz,S1,Jannik Sinner,5-0 RET,F,2,1',
  '2025-3,Wimbledon,Grass,20250630,S1,Jannik Sinner,A1,Carlos Alcaraz,4-6 6-4 6-4 6-4,F,1,2',
  '2025-4,US Open,Hard,20250825,A1,Carlos Alcaraz,S1,Jannik Sinner,W/O,SF', // forfait : pas un match joué
  '2020-5,Challenger X,Hard,20200101,E1,Tomas Martin Etcheverry,Z9,Autre Joueur,6-0 6-0,R32',
  '2010-6,Ancien,Hard,20100101,D1,Marc Durand,Z8,Un Autre,6-1 6-1,R16', // homonymes : un ancien…
  '2024-6,Autre,Hard,20240101,D2,Marc Durand,Z8,Un Autre,6-1 6-1,R16', // …et un actif
  '2025-7,Test,Hard,20250101,M1,Rafael Jódar,Z9,Autre Joueur,6-4 6-4,R16',
].join('\n');
const index = construireIndex(lireCsv(csv));

test('lireCsv : guillemets, virgules dans un champ, fins de ligne Windows', () => {
  const l = lireCsv('a,b\r\n"x, y",2\r\n');
  assert.deepEqual(l, [{ a: 'x, y', b: '2' }]);
  assert.deepEqual(lireCsv(''), []);
});

test('normaliserNom : accents, casse et ponctuation ignorés', () => {
  assert.equal(normaliserNom('Rafael Jódar'), 'rafael jodar');
  assert.equal(normaliserNom("Christopher O'Connell"), 'christopher o connell');
  assert.equal(normaliserNom('Jan-Lennard  Struff'), 'jan lennard struff');
});

test('trouverIdAtp : nom identique, nom proche, introuvable, ambigu', () => {
  assert.equal(trouverIdAtp('jannik SINNER', index).id, 'S1');
  assert.equal(trouverIdAtp('Rafael Jodar', index).id, 'M1'); // accent absent côté API
  assert.deepEqual(trouverIdAtp('Tomas Etcheverry', index), { id: 'E1', nom: 'Tomas Martin Etcheverry', raison: 'nom proche' });
  assert.equal(trouverIdAtp('Marc Durand', index).id, 'D2'); // deux homonymes : le seul actif depuis 2015 est retenu
  assert.equal(trouverIdAtp('Inconnu Total', index).id, null);
  assert.equal(trouverIdAtp('', index).id, null);
  const ambigu = construireIndex(lireCsv(`${ENTETE}\n1,T,Hard,20240101,X1,Jean Dupont,Y1,Aa Bb,6-0 6-0,F\n2,T,Hard,20240101,X2,Jean Dupont,Y1,Aa Bb,6-0 6-0,F`));
  assert.equal(trouverIdAtp('Jean Dupont', ambigu).id, null); // deux joueurs actifs de même nom : jamais de faux chiffre
});

test('calculerH2H : bilan dans l’ordre demandé, surfaces, rencontres récentes d’abord, forfaits écartés', () => {
  const h = calculerH2H('S1', 'A1', index);
  assert.deepEqual([h.a, h.b], [2, 1]);
  assert.deepEqual(h.parSurface.map((x) => [x.surface, x.a, x.b]).sort(), [['Dur', 0, 1], ['Gazon', 1, 0], ['Terre battue', 1, 0]]);
  assert.deepEqual(h.rencontres.map((r) => [r.annee, r.tournoi, r.tour, r.vainqueur]), [[2025, 'Cincinnati Masters', 'Finale', 'b'], [2025, 'Wimbledon', 'Finale', 'a'], [2024, 'Rome, Masters', 'Demi-finale', 'a']]);
  const inverse = calculerH2H('A1', 'S1', index);
  assert.deepEqual([inverse.a, inverse.b], [1, 2]);
  assert.deepEqual(inverse.rencontres.map((r) => r.vainqueur), ['a', 'b', 'b']);
  assert.deepEqual(calculerH2H('S1', 'M1', index), { a: 0, b: 0, parSurface: [], rencontres: [] }); // jamais rencontrés
});

test('calculerH2H : classement ATP de l\'époque du vainqueur et du vaincu, pour chaque rencontre (null si inconnu)', () => {
  const h = calculerH2H('S1', 'A1', index);
  // Cincinnati 2025 : Alcaraz (n° 2) bat Sinner (n° 1) ; Wimbledon 2025 : Sinner (n° 1) bat Alcaraz (n° 2) ; Rome 2024 : Sinner (n° 2) bat Alcaraz (n° 3)
  assert.deepEqual(h.rencontres.map((r) => [r.vainqueur, r.classement_vainqueur, r.classement_vaincu]), [['b', 2, 1], ['a', 1, 2], ['a', 2, 3]]);
  // même chose vu de l'autre côté : le classement suit le vainqueur / le vaincu, pas l'ordre demandé
  assert.deepEqual(calculerH2H('A1', 'S1', index).rencontres.map((r) => [r.vainqueur, r.classement_vainqueur, r.classement_vaincu]), [['a', 2, 1], ['b', 1, 2], ['b', 2, 3]]);
  // fichier sans classement (colonnes absentes ou vides) : les clés existent quand même, à null
  const sans = construireIndex(lireCsv('tourney_name,surface,tourney_date,winner_id,winner_name,loser_id,loser_name,score,round\nX,Hard,20240101,P1,Pierre Un,P2,Paul Deux,6-1 6-1,F'));
  const r = calculerH2H('P1', 'P2', sans).rencontres[0];
  assert.ok('classement_vainqueur' in r && 'classement_vaincu' in r);
  assert.deepEqual([r.classement_vainqueur, r.classement_vaincu], [null, null]);
  assert.deepEqual([rangAtp('12'), rangAtp(' 7 '), rangAtp(''), rangAtp('NA'), rangAtp('0'), rangAtp(undefined), rangAtp(null), rangAtp('-3')], [12, 7, null, null, null, null, null, null]);
});
