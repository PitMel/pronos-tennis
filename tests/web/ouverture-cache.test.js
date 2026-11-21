import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLE_CACHE, ecrireCache, lireCache, sessionMemorisee } from '../../web/js/ouverture-cache.js';

const lire = (f) => readFileSync(new URL(`../../web/${f}`, import.meta.url), 'utf8');
function faux(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), get length() { return m.size; }, key: (i) => [...m.keys()][i] };
}
const cit = { id: 1, type: 'citation', texte: 'Texte A', auteur: 'X', source: '2010', actif: true, secret: 'ne doit pas être copié' };
const img = { id: 3, type: 'image', image_url: './images/ouverture/a.jpg', texte: 'Légende', actif: true };

test('copie des contenus : écrire puis lire, seulement les contenus valides et seulement les champs utiles', () => {
  const s = faux();
  ecrireCache(s, [cit, img, { id: 9, type: 'citation', texte: ' ', actif: true }, { id: 10, type: 'info', texte: 'x', actif: false }]);
  const l = lireCache(s);
  assert.deepEqual(l.map((c) => c.id), [1, 3]);
  assert.equal('secret' in l[0], false);
});

test('copie des contenus : liste vide (interrupteur éteint, base vide) = copie effacée ; copie absente ou abîmée = liste vide', () => {
  const s = faux();
  ecrireCache(s, [cit]);
  ecrireCache(s, []);
  assert.equal(s.getItem(CLE_CACHE), null);
  assert.deepEqual(lireCache(s), []);
  assert.deepEqual(lireCache(faux({ [CLE_CACHE]: '{pas du json' })), []);
  assert.deepEqual(lireCache(faux({ [CLE_CACHE]: '{"a":1}' })), []);
});

test('copie des contenus : un stockage inaccessible ne fait jamais planter', () => {
  const casse = { getItem() { throw new Error('refusé'); }, setItem() { throw new Error('plein'); }, removeItem() { throw new Error('refusé'); }, get length() { throw new Error('refusé'); }, key() { throw new Error('refusé'); } };
  assert.doesNotThrow(() => ecrireCache(casse, [cit]));
  assert.deepEqual(lireCache(casse), []);
  assert.equal(sessionMemorisee(casse), false);
});

test('sessionMemorisee : seulement si une session Supabase est mémorisée (pas d’écran d’ouverture avant la connexion)', () => {
  assert.equal(sessionMemorisee(faux()), false);
  assert.equal(sessionMemorisee(faux({ autre: '1', [CLE_CACHE]: '[]' })), false);
  assert.equal(sessionMemorisee(faux({ 'sb-wmqyplehxtafxoilllfd-auth-token': '' })), false, 'clé vide : déconnecté');
  assert.equal(sessionMemorisee(faux({ 'sb-wmqyplehxtafxoilllfd-auth-token': '{"access_token":"x"}' })), true);
});

test('lancement rapide : index.html démarre par demarrage.js (précharge app.js), app.js reprend la main sans relire la base ni rouvrir l’écran', () => {
  const html = lire('index.html');
  assert.match(html, /<script type="module" src="demarrage\.js">/);
  assert.doesNotMatch(html, /<script type="module" src="app\.js">/);
  assert.match(html, /rel="modulepreload" href="app\.js"/);
  assert.match(html, /rel="stylesheet" media="print" onload="this\.media='all'"/, 'polices non bloquantes');
  const dem = lire('demarrage.js');
  assert.match(dem, /sessionMemorisee\(localStorage\)/);
  assert.match(dem, /import\('\.\/app\.js'\)/);
  assert.match(dem, /globalThis\.pronosOuverture = \{ fermee \}/);
  const app = lire('app.js');
  assert.match(app, /globalThis\.pronosOuverture/);
  assert.match(app, /await rapide\.fermee/);
  assert.match(app, /ecrireCache\(localStorage, liste\)/);
});

test('service worker : images de l’écran d’ouverture en cache d’abord ; demarrage.js dans la coque', () => {
  const sw = lire('sw.js');
  assert.match(sw, /includes\('\/images\/ouverture\/'\)/);
  assert.match(sw, /cachePuisReseau/);
  assert.match(sw, /'demarrage\.js'/);
});
