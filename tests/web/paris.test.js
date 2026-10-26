import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ordonnerProfils, regrouperParis, regrouperQui, brouillonDepuisPari, pariAEnregistrer, messageErreurPari, MESSAGE_PARI_FERME,
} from '../../web/js/paris.js';

test('ordonnerProfils : moi à gauche, les autres par prénom', () => {
  const p = [{ id: 'c', prenom: 'Thomas' }, { id: 'a', prenom: 'Pierre' }, { id: 'b', prenom: 'Léa' }, { id: 'd', prenom: 'Marc' }];
  assert.deepEqual(ordonnerProfils(p, 'a').map((x) => x.prenom), ['Pierre', 'Léa', 'Marc', 'Thomas']);
  assert.deepEqual(ordonnerProfils(p, 'c').map((x) => x.prenom), ['Thomas', 'Léa', 'Marc', 'Pierre']);
  assert.deepEqual(ordonnerProfils(p, 'inconnu').map((x) => x.prenom), ['Léa', 'Marc', 'Pierre', 'Thomas']);
});

test('regrouperParis / regrouperQui', () => {
  const m = regrouperParis([{ match_id: 1, joueur_id: 'a', choix: 1, confiance: 7 }, { match_id: 1, joueur_id: 'b', choix: 2, confiance: 6 }, { match_id: 2, joueur_id: 'a', choix: 2, confiance: 9 }]);
  assert.equal(m.get(1).size, 2);
  assert.equal(m.get(2).get('a').confiance, 9);
  assert.equal(regrouperParis(null).size, 0);
  const q = regrouperQui([{ joueur_id: 'a', a_parie: true }, { joueur_id: 'b', a_parie: false }]);
  assert.equal(q.get('a'), true);
  assert.equal(q.get('b'), false);
});

test('brouillon et pari à enregistrer : les sets ne comptent qu’en Grand Chelem', () => {
  assert.deepEqual(brouillonDepuisPari({ choix: 1, confiance: 8, sets: null }), { choix: 1, confiance: 8 });
  assert.deepEqual(brouillonDepuisPari({ choix: 2, confiance: 8, sets: 4 }), { choix: 2, confiance: 8, sets: 4 });
  assert.deepEqual(pariAEnregistrer({ choix: 1, confiance: 8, sets: 3 }, 'masters_1000'), { choix: 1, confiance: 8 });
  assert.deepEqual(pariAEnregistrer({ choix: 1, confiance: 8, sets: 3 }, 'grand_slam'), { choix: 1, confiance: 8, sets: 3 });
});

test('messageErreurPari : messages en français', () => {
  assert.equal(messageErreurPari({ code: 'PARI_FERME' }), MESSAGE_PARI_FERME);
  assert.equal(messageErreurPari({ code: '42501', message: 'x' }), MESSAGE_PARI_FERME);
  assert.equal(messageErreurPari({ message: 'new row violates row-level security policy' }), MESSAGE_PARI_FERME);
  assert.match(messageErreurPari(new TypeError('Failed to fetch')), /connexion internet/);
  assert.equal(messageErreurPari({ message: 'En Grand Chelem, indique le nombre de sets.' }), 'En Grand Chelem, indique le nombre de sets.');
  assert.match(messageErreurPari({ message: 'boom' }), /Réessaie/);
});
