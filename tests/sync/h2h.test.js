import test from 'node:test';
import assert from 'node:assert/strict';
import { lireCsv, normaliserNom, construireIndex, trouverIdAtp, calculerH2H } from '../../src/sync/h2h.js';

const ENTETE = 'tourney_id,tourney_name,surface,tourney_date,winner_id,winner_name,loser_id,loser_name,score,round';
const csv = [
  ENTETE,
  '2024-1,"Rome, Masters",Clay,20240508,S1,Jannik Sinner,A1,Carlos Alcaraz,6-2 6-4,SF',
  '2025-2,Cincinnati Masters,Hard,20250807,A1,Carlos Alcaraz,S1,Jannik Sinner,5-0 RET,F',
  '2025-3,Wimbledon,Grass,20250630,S1,Jannik Sinner,A1,Carlos Alcaraz,4-6 6-4 6-4 6-4,F',
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
