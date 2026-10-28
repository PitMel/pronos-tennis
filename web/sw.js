/* Service worker de Pronos Tennis.
 * Rôle : permettre l'installation sur l'écran d'accueil et ouvrir l'appli même sans réseau (coque + dernières pages vues).
 * Règles :
 *  - Les données (API Supabase, photos de profil du stockage) ne sont JAMAIS mises en cache ici : un pronostic ou un
 *    classement périmé serait pire qu'un message « pas de connexion ».
 *  - Fichiers de l'appli (même origine) : réseau d'abord (toujours la dernière version), cache en secours.
 *  - Bibliothèque supabase-js et polices : cache d'abord, rafraîchi en arrière-plan.
 */
const CACHE = 'pronos-tennis-v1';
const DELAI_RESEAU_MS = 4000;
const COQUE = ['./', 'index.html', 'style.css', 'app.js', 'config.js', 'manifest.webmanifest', 'icons/icone-192.png'];
const HOTES_STATIQUES = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (evt) => {
  evt.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Un fichier manquant ne doit pas empêcher l'installation.
    await Promise.allSettled(COQUE.map((u) => cache.add(u)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (evt) => {
  evt.waitUntil((async () => {
    const noms = await caches.keys();
    await Promise.all(noms.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

async function reseauPuisCache(requete) {
  const cache = await caches.open(CACHE);
  try {
    const reponse = await Promise.race([
      fetch(requete),
      new Promise((_, rejet) => setTimeout(() => rejet(new Error('delai')), DELAI_RESEAU_MS)),
    ]);
    if (reponse && reponse.ok) cache.put(requete, reponse.clone());
    return reponse;
  } catch (e) {
    const enCache = await cache.match(requete, { ignoreSearch: true });
    if (enCache) return enCache;
    if (requete.mode === 'navigate') {
      const accueil = (await cache.match('index.html')) || (await cache.match('./'));
      if (accueil) return accueil;
    }
    throw e;
  }
}

async function cacheRafraichi(requete) {
  const cache = await caches.open(CACHE);
  const enCache = await cache.match(requete);
  const reseau = fetch(requete)
    .then((reponse) => {
      if (reponse && (reponse.ok || reponse.type === 'opaque')) cache.put(requete, reponse.clone());
      return reponse;
    })
    .catch(() => null);
  return enCache || (await reseau) || Response.error();
}

self.addEventListener('fetch', (evt) => {
  const requete = evt.request;
  if (requete.method !== 'GET') return;
  const url = new URL(requete.url);

  if (url.origin === self.location.origin) {
    evt.respondWith(reseauPuisCache(requete));
  } else if (HOTES_STATIQUES.includes(url.hostname)) {
    evt.respondWith(cacheRafraichi(requete));
  }
  // Tout le reste (Supabase : données, authentification, photos) passe directement par le réseau.
});
