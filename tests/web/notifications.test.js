import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emailValide, htmlBlocNotifications, htmlPageProfil } from '../../web/js/profil.js';

test('adresse e-mail : vide acceptée, forme contrôlée', () => {
  assert.equal(emailValide(''), true);
  assert.equal(emailValide('a@b.fr'), true);
  assert.equal(emailValide('pas une adresse'), false);
  assert.equal(emailValide('a@b'), false);
});

test('bloc notifications : trois cases cochées par défaut, adresse échappée', () => {
  const h = htmlBlocNotifications({});
  assert.equal((h.match(/type="checkbox"[^>]* checked/g) ?? []).length, 3);
  const p = htmlBlocNotifications({ prefs: { email: '"x@y.fr', tour_ouvert: false, paris_visibles: true, tournoi_termine: true } });
  assert.match(p, /&quot;x@y\.fr/);
  assert.equal((p.match(/type="checkbox"[^>]* checked/g) ?? []).length, 2);
  assert.match(htmlPageProfil({ profil: { id: 'a', prenom: 'Léa' } }), /Notifications par e-mail/);
});
