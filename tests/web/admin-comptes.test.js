// Comptes admin (4.6) : validation, conversion, messages, HTML, écriture via faux Supabase.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, validerCompte, comptePourBase, messageErreurCompte, htmlComptesAdmin, htmlFormulaireCompte } from '../../web/js/admin-comptes.js';
import { htmlAdminAccueil } from '../../web/js/admin.js';
import { creerDonnees } from '../../web/js/donnees.js';

const profils = [
  { id: 'u-pierre', prenom: 'Pierre', couleur: '#2F6CC2', is_admin: true, is_test: false, actif: true },
  { id: 'u-paul', prenom: 'Paul <b>', couleur: null, is_admin: false, is_test: true, actif: true },
  { id: 'u-andre', prenom: 'André', couleur: '#D8A21E', is_admin: false, is_test: true, actif: false },
];

test('validerCompte : couleur vide ou hexadécimale', () => {
  assert.deepEqual(validerCompte({ couleur: '' }), []);
  assert.deepEqual(validerCompte({ couleur: '#aa00FF' }), []);
  assert.deepEqual(validerCompte({}), []);
  assert.match(validerCompte({ couleur: 'rouge' }).join(), /Couleur/);
  assert.match(validerCompte({ couleur: '#12345' }).join(), /Couleur/);
  assert.ok(PALETTE.every(([hex]) => validerCompte({ couleur: hex }).length === 0));
});

test('comptePourBase : le prénom n’en fait jamais partie', () => {
  assert.deepEqual(comptePourBase({ couleur: '#aa00ff', actif: true, is_test: false, prenom: 'X' }), { couleur: '#AA00FF', actif: true, is_test: false });
  assert.deepEqual(comptePourBase({ couleur: '', actif: 'on', is_test: 'on' }), { couleur: null, actif: true, is_test: true });
  assert.deepEqual(comptePourBase({ couleur: '', actif: false }), { couleur: null, actif: false, is_test: false });
});

test('messageErreurCompte', () => {
  assert.match(messageErreurCompte({ code: '23505', message: 'dup' }), /existe déjà/);
  assert.match(messageErreurCompte({ code: '42501', message: 'x' }), /réservée/);
  assert.match(messageErreurCompte({ message: 'Seul l\'administrateur peut modifier ces informations.' }), /réservée/);
  assert.match(messageErreurCompte({ message: 'Failed to fetch' }), /connexion/);
  assert.match(messageErreurCompte(new Error('boum')), /échoué/);
});

test('htmlComptesAdmin : deux groupes, désactivé signalé, échappement, moi', () => {
  const h = htmlComptesAdmin({ profils, moi: 'u-pierre' });
  assert.ok(h.indexOf('Groupe réel') < h.indexOf('Pierre') && h.indexOf('Pierre') < h.indexOf('Groupe test'));
  assert.match(h, /Pierre<\/b> <small>\(toi\)/);
  assert.match(h, /Paul &lt;b&gt;/);
  assert.doesNotMatch(h, /Paul <b>/);
  assert.equal((h.match(/Désactivé/g) ?? []).length, 1);
  assert.match(h, /href="#\/admin\/compte\/u-paul"/);
  assert.match(h, /comptes\.sql/);
  assert.ok(h.indexOf('André') < h.indexOf('Paul &lt;b&gt;'), 'ordre alphabétique');
  assert.match(htmlComptesAdmin({ profils: [], moi: 'x' }), /Aucun faux compte/);
});

test('htmlFormulaireCompte : prénom non modifiable, couleur cochée, cases', () => {
  const h = htmlFormulaireCompte({ profil: profils[2], moi: 'u-pierre' });
  assert.doesNotMatch(h, /name="prenom"/);
  assert.match(h, /Prénom : <b>André<\/b>/);
  assert.match(h, /value="#D8A21E" checked/);
  assert.doesNotMatch(h, /name="actif" type="checkbox" checked/);
  assert.match(h, /name="is_test" type="checkbox" checked/);
  assert.equal((h.match(/type="radio"/g) ?? []).length, PALETTE.length + 1);
  assert.doesNotMatch(h, /Changement de groupe/);
});

test('htmlFormulaireCompte : compte sans couleur → « Aucune » cochée ; soi-même : cases verrouillées', () => {
  assert.match(htmlFormulaireCompte({ profil: profils[1], moi: 'u-pierre' }), /value="" checked/);
  const soi = htmlFormulaireCompte({ profil: profils[0], moi: 'u-pierre' });
  assert.match(soi, /name="actif" type="checkbox" checked disabled/);
  assert.match(soi, /name="is_test" type="checkbox" disabled/);
  assert.match(soi, /ne peux pas désactiver/);
});

test('htmlFormulaireCompte : changement de groupe → avertissement ; erreurs ré-affichées', () => {
  const h = htmlFormulaireCompte({ profil: profils[1], moi: 'u-pierre', valeurs: { couleur: '', actif: true, is_test: false }, erreurs: ['Oups.'] });
  assert.match(h, /Changement de groupe/);
  assert.match(h, /role="alert">Oups\./);
});

test('accueil admin : lien vers les comptes', () => {
  assert.match(htmlAdminAccueil({ synchro: [] }), /href="#\/admin\/comptes"/);
});

test('donnees : enregistrerCompte met à jour le profil, refus si aucune ligne', async () => {
  const appels = [];
  const faux = (data, error = null) => ({ from: (t) => ({ update: (v) => ({ eq: (c, id) => ({ select: () => { appels.push([t, v, c, id]); return Promise.resolve({ data, error }); } }) }) }) });
  await creerDonnees(faux([{ id: 'u-paul' }])).enregistrerCompte('u-paul', { couleur: null, actif: false, is_test: true });
  assert.deepEqual(appels, [['profiles', { couleur: null, actif: false, is_test: true }, 'id', 'u-paul']]);
  await assert.rejects(creerDonnees(faux([])).enregistrerCompte('u-paul', {}), (e) => e.code === '42501');
  await assert.rejects(creerDonnees(faux(null, { code: '23505', message: 'dup' })).enregistrerCompte('u-paul', {}), (e) => e.code === '23505');
});
