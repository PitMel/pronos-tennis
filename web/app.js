// Pronos Tennis — point d'entrée de l'application (JavaScript natif, modules ES, sans compilation).
// Jalon 3.1 : connexion, session mémorisée, déconnexion.
// Jalon 3.2 : liste des tournois et page tournoi en lecture (matchs groupés par tour).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_CLE_PUBLIABLE } from './config.js';
import { emailTechnique, messageErreurConnexion } from './js/identifiants.js';
import { echapper } from './js/outils.js';
import { creerDonnees } from './js/donnees.js';
import { htmlListeTournois, htmlPageTournoi, htmlErreur } from './js/vues.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_CLE_PUBLIABLE, {
  // La session est mémorisée sur l'appareil (localStorage) et renouvelée toute seule.
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
const donnees = creerDonnees(supabase);
const racine = document.getElementById('app');

let profilCourant = null;

function pastille(profil) {
  const initiale = echapper((profil.prenom || '?').trim().charAt(0).toUpperCase());
  const couleur = /^#[0-9A-Fa-f]{6}$/.test(profil.couleur ?? '') ? profil.couleur : '#2F6CC2';
  return `<span class="pastille" style="background:${couleur}" aria-hidden="true">${initiale}</span>`;
}

/* ---------- Écran de connexion ---------- */
function afficherConnexion(message = '') {
  profilCourant = null;
  racine.innerHTML = `
    <form class="carte-connexion" id="form-connexion" autocomplete="on">
      <h1>Pronos <span>Tennis</span></h1>
      <p class="sous-titre">Connecte-toi pour parier.</p>
      <label for="nom">Prénom</label>
      <input id="nom" name="username" type="text" autocomplete="username" autocapitalize="words" required>
      <label for="mdp">Mot de passe</label>
      <input id="mdp" name="password" type="password" autocomplete="current-password" required>
      <p class="erreur" id="erreur" role="alert">${echapper(message)}</p>
      <button class="principal" type="submit">Se connecter</button>
    </form>`;

  const form = document.getElementById('form-connexion');
  form.addEventListener('submit', async (evenement) => {
    evenement.preventDefault();
    const zoneErreur = document.getElementById('erreur');
    const bouton = form.querySelector('button');
    const email = emailTechnique(form.nom.value);
    if (!email) { zoneErreur.textContent = 'Saisis ton prénom.'; return; }
    bouton.disabled = true;
    zoneErreur.textContent = '';
    const { error } = await supabase.auth.signInWithPassword({ email, password: form.mdp.value });
    if (error) {
      zoneErreur.textContent = messageErreurConnexion(error);
      bouton.disabled = false;
      return;
    }
    await demarrer();
  });
  document.getElementById('nom').focus();
}

/* ---------- Cadre de l'application connectée ---------- */
function afficherCadre(profil) {
  racine.innerHTML = `
    <header class="bandeau">
      <h1><a href="#/">Pronos <span>Tennis</span></a></h1>
      ${profil.is_test ? '<span class="mention-test">Compte de test</span>' : ''}
      ${pastille(profil)}
      <button class="discret" id="deconnexion" type="button">Déconnexion</button>
    </header>
    <main id="contenu"></main>`;
  document.getElementById('deconnexion').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.hash = '';
    afficherConnexion();
  });
}

/* ---------- Routage par l'adresse (#/ ou #/tournoi/12) ---------- */
function lireRoute() {
  const m = /^#\/tournoi\/(\d+)$/.exec(window.location.hash);
  return m ? { nom: 'tournoi', id: Number(m[1]) } : { nom: 'accueil' };
}

async function afficherRoute() {
  if (!profilCourant) return;
  const contenu = document.getElementById('contenu');
  if (!contenu) return;
  const route = lireRoute();
  contenu.innerHTML = '<p class="chargement-court">Chargement…</p>';
  try {
    if (route.nom === 'tournoi') {
      const tournoi = await donnees.tournoi(route.id);
      if (!tournoi) { contenu.innerHTML = htmlErreur('Ce tournoi n’existe pas.'); return; }
      const matchs = await donnees.matchs(route.id);
      const joueurs = await donnees.joueurs([
        ...matchs.flatMap((m) => [m.p1_id, m.p2_id]), tournoi.vainqueur_id, tournoi.finaliste_id,
      ]);
      contenu.innerHTML = htmlPageTournoi({ tournoi, matchs, joueurs });
    } else {
      contenu.innerHTML = htmlListeTournois(await donnees.tournois());
    }
    window.scrollTo(0, 0);
  } catch {
    contenu.innerHTML = htmlErreur('Impossible de charger les données. Vérifie ta connexion internet, puis réessaie.');
  }
}

window.addEventListener('hashchange', afficherRoute);

/* ---------- Démarrage ---------- */
async function demarrer() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { afficherConnexion(); return; }

  const { data: profil, error } = await supabase
    .from('profiles')
    .select('id, prenom, couleur, photo_url, is_admin, is_test, actif')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error || !profil) {
    await supabase.auth.signOut();
    afficherConnexion('Ce compte n’a pas de profil : préviens Pierre.');
    return;
  }
  if (!profil.actif) {
    await supabase.auth.signOut();
    afficherConnexion('Ce compte est désactivé : préviens Pierre.');
    return;
  }
  profilCourant = profil;
  afficherCadre(profil);
  await afficherRoute();
}

demarrer().catch(() => afficherConnexion('Connexion impossible : vérifie ta connexion internet.'));
