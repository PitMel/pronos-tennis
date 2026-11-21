// Pronos Tennis — premier fichier chargé (21 nov. 2026, demandé par Pierre : réduire le temps avant la citation d'ouverture).
// Il affiche l'écran d'ouverture tout de suite, depuis la copie gardée sur l'appareil, pendant que l'appli complète (app.js,
// bibliothèque Supabase, une trentaine de fichiers) se charge en arrière-plan. Sans copie ou sans session mémorisée : rien
// n'est affiché ici et app.js fait comme avant (lecture dans la base).
import { choisirContenu, htmlEcranOuverture } from './js/ecran-ouverture.js';
import { lireCache, sessionMemorisee } from './js/ouverture-cache.js';

const racine = document.getElementById('app');
const chargerAppli = () => import('./app.js');

try {
  const contenu = sessionMemorisee(localStorage) ? choisirContenu(lireCache(localStorage)) : null;
  if (contenu) {
    racine.innerHTML = htmlEcranOuverture(contenu);
    const ecran = racine.querySelector('[data-action="ecran-ouverture-fermer"]');
    ecran.querySelector('img')?.addEventListener('error', (e) => e.target.remove(), { once: true });
    // app.js attend cette promesse avant d'enchaîner (écrans de fin de tournoi, accueil)
    const fermee = new Promise((fin) => {
      const fermer = () => { racine.innerHTML = '<p class="chargement">Chargement…</p>'; fin(); };
      ecran.addEventListener('click', fermer, { once: true });
      ecran.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fermer(); } }, { once: true });
    });
    globalThis.pronosOuverture = { fermee };
    ecran.focus();
  }
} catch { /* sans écran rapide : app.js s'en charge */ }

chargerAppli().catch(() => {
  // l'appli n'a pas pu se charger (réseau coupé, fichier introuvable) : on le dit au lieu de rester bloqué sur l'écran
  racine.innerHTML = '<p class="chargement">Le chargement a échoué. Vérifie ta connexion internet puis <a href="">réessaie</a>.</p>';
});
