import test from 'node:test';
import assert from 'node:assert/strict';
import { validerMotDePasse, messageErreurMotDePasse, htmlPageMotDePasse, LONGUEUR_MIN } from '../../web/js/mot-de-passe.js';

test('validerMotDePasse : champs, longueur, différence, confirmation', () => {
  assert.deepEqual(validerMotDePasse({ actuel: 'ancien', nouveau: 'nouveau-mdp', confirmation: 'nouveau-mdp' }), []);
  assert.match(validerMotDePasse({ nouveau: 'abcdefgh', confirmation: 'abcdefgh' }).join(), /actuel/);
  assert.match(validerMotDePasse({ actuel: 'a', nouveau: 'court', confirmation: 'court' }).join(), new RegExp(`${LONGUEUR_MIN} caractères`));
  assert.match(validerMotDePasse({ actuel: 'identique1', nouveau: 'identique1', confirmation: 'identique1' }).join(), /différent/);
  assert.match(validerMotDePasse({ actuel: 'a', nouveau: 'abcdefgh', confirmation: 'abcdefgX' }).join(), /confirmation/);
  assert.equal(validerMotDePasse({}).length, 2);
});

test('messageErreurMotDePasse', () => {
  assert.match(messageErreurMotDePasse({ message: 'Invalid login credentials' }, { etape: 'verification' }), /actuel est incorrect/);
  assert.match(messageErreurMotDePasse({ message: 'New password should be different from the old password.' }), /différent/);
  assert.match(messageErreurMotDePasse({ message: 'Password is known to be weak' }), /faible/);
  assert.match(messageErreurMotDePasse({ message: 'Failed to fetch' }), /connexion/);
  assert.match(messageErreurMotDePasse(new Error('boum')), /échoué/);
});

test('htmlPageMotDePasse : trois champs mot de passe, messages échappés', () => {
  const h = htmlPageMotDePasse({ erreurs: ['<b>x</b>'], message: 'Fait <i>' });
  assert.equal((h.match(/type="password"/g) ?? []).length, 3);
  assert.match(h, /&lt;b&gt;x/);
  assert.match(h, /Fait &lt;i&gt;/);
  assert.match(h, /autocomplete="new-password"/);
});
