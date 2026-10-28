import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import vm from 'node:vm';
import { htmlPageProfil } from '../../web/js/profil.js';

const lire = (p) => readFileSync(new URL(`../../web/${p}`, import.meta.url), 'utf8');

test('manifeste : installable (nom, start_url, standalone, icônes existantes aux bonnes tailles)', () => {
  const m = JSON.parse(lire('manifest.webmanifest'));
  assert.equal(m.name, 'Pronos Tennis');
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, './');
  assert.match(m.theme_color, /^#[0-9A-F]{6}$/i);
  const tailles = m.icons.map((i) => i.sizes);
  assert.ok(tailles.includes('192x192') && tailles.includes('512x512'));
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
  for (const i of m.icons) {
    const chemin = new URL(`../../web/${i.src}`, import.meta.url);
    assert.ok(existsSync(chemin), `icône manquante : ${i.src}`);
    const png = readFileSync(chemin);
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    const [l, h] = i.sizes.split('x').map(Number);
    assert.equal(png.readUInt32BE(16), l);
    assert.equal(png.readUInt32BE(20), h);
  }
});

test('index.html : manifeste, icône iOS, enregistrement du service worker', () => {
  const html = lire('index.html');
  assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon" href="icons\/apple-touch-icon\.png"/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.ok(statSync(new URL('../../web/icons/apple-touch-icon.png', import.meta.url)).size > 500);
  assert.match(lire('app.js'), /serviceWorker\.register\('\.\/sw\.js'\)/);
});

/** Charge sw.js dans un faux contexte de service worker et renvoie les écouteurs + le journal des appels. */
function chargerSw({ reseau, cache = new Map() }) {
  const ecouteurs = {};
  const journal = { fetch: [], put: [] };
  const caches = {
    open: async () => ({
      add: async () => {},
      put: async (r, rep) => { journal.put.push(r.url ?? r); cache.set(r.url ?? r, rep); },
      match: async (r) => cache.get(r.url ?? r),
    }),
    keys: async () => [],
    delete: async () => true,
  };
  const contexte = {
    self: { location: { origin: 'https://pitmel.github.io' }, addEventListener: (n, f) => { ecouteurs[n] = f; }, skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches, URL, Promise, setTimeout, Response: { error: () => 'erreur' },
    fetch: async (r) => { journal.fetch.push(r.url); return reseau(r); },
  };
  vm.runInNewContext(lire('sw.js'), contexte);
  return { ecouteurs, journal, cache };
}

const evenement = (url, extra = {}) => {
  let promesse = null;
  return { request: { url, method: 'GET', mode: 'cors', ...extra }, respondWith: (p) => { promesse = p; }, reponse: () => promesse };
};

test('sw.js : Supabase et requêtes non-GET ne sont jamais interceptées', () => {
  const { ecouteurs } = chargerSw({ reseau: async () => ({ ok: true, clone() { return this; } }) });
  const donnees = evenement('https://wmqyplehxtafxoilllfd.supabase.co/rest/v1/matches?select=*');
  ecouteurs.fetch(donnees);
  assert.equal(donnees.reponse(), null);
  const photo = evenement('https://wmqyplehxtafxoilllfd.supabase.co/storage/v1/object/public/avatars/x.jpg');
  ecouteurs.fetch(photo);
  assert.equal(photo.reponse(), null);
  const post = evenement('https://pitmel.github.io/pronos-tennis/app.js', { method: 'POST' });
  ecouteurs.fetch(post);
  assert.equal(post.reponse(), null);
});

test('sw.js : fichier de l’appli = réseau d’abord, cache en secours hors ligne', async () => {
  const url = 'https://pitmel.github.io/pronos-tennis/app.js';
  let enLigne = true;
  const rep = { ok: true, clone() { return this; }, corps: 'v1' };
  const { ecouteurs, cache } = chargerSw({ reseau: async () => { if (!enLigne) throw new Error('hors ligne'); return rep; } });
  const e1 = evenement(url);
  ecouteurs.fetch(e1);
  assert.equal(await e1.reponse(), rep);
  assert.ok(cache.has(url), 'la réponse réseau est mise en cache');
  enLigne = false;
  const e2 = evenement(url);
  ecouteurs.fetch(e2);
  assert.equal(await e2.reponse(), rep, 'hors ligne : réponse du cache');
});

test('sw.js : bibliothèque supabase-js (jsDelivr) servie depuis le cache puis rafraîchie', async () => {
  const url = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
  const rep = { ok: true, clone() { return this; } };
  const cache = new Map([[url, rep]]);
  const { ecouteurs, journal } = chargerSw({ cache, reseau: async () => ({ ok: true, clone() { return this; }, neuf: true }) });
  const e = evenement(url);
  ecouteurs.fetch(e);
  assert.equal(await e.reponse(), rep);
  assert.deepEqual(journal.fetch, [url], 'rafraîchissement en arrière-plan');
});

test('page Profil : bloc « Installer l’appli »', () => {
  const h = htmlPageProfil({ profil: { id: 'x', prenom: 'Pierre', couleur: null } });
  assert.match(h, /Installer l’appli/);
  assert.match(h, /Sur l’écran d’accueil/);
});
