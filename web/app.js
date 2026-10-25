// Pronos Tennis — point d'entrée de l'application (JavaScript natif, modules ES, sans compilation).
// Jalon 3.1 : connexion, mémorisation de la session, déconnexion. Le contenu viendra aux jalons suivants.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_CLE_PUBLIABLE } from './config.js';
import { emailTechnique, messageErreurConnexion } from './js/identifiants.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_CLE_PUBLIABLE, {
  // La session est mémorisée sur l'appareil (localStorage) et renouvelée toute seule.
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

const racine = document.getElementById('app');

/** Échappe le texte venant de la base avant de l'insérer dans la page. */
function echapper(texte) {
  return String(texte ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function pastille(profil) {
  const initiale = echapper((profil.prenom || '?').trim().charAt(0).toUpperCase());
  const couleur = /^#[0-9A-Fa-f]{6}$/.test(profil.couleur ?? '') ? profil.couleur : '#2F6CC2';
  return `<span class="pastille" style="background:${couleur}" aria-hidden="true">${initiale}</span>`;
}

/* ---------- Écran de connexion ---------- */
function afficherConnexion(message = '') {
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

/* ---------- Écran d'accueil (provisoire) ---------- */
async function afficherAccueil(profil) {
  racine.innerHTML = `
    <header class="bandeau">
      <h1>Pronos <span>Tennis</span></h1>
      ${pastille(profil)}
      <button class="discret" id="deconnexion" type="button">Déconnexion</button>
    </header>
    <section class="carte">
      <h2>Bonjour ${echapper(profil.prenom)}</h2>
      <p>Tu es connecté${profil.is_test ? ' (compte de test)' : ''}${profil.is_admin ? ', administrateur' : ''}. Les tournois et les paris arrivent aux prochains jalons.</p>
    </section>`;
  document.getElementById('deconnexion').addEventListener('click', async () => {
    await supabase.auth.signOut();
    afficherConnexion();
  });
}

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
  await afficherAccueil(profil);
}

demarrer().catch(() => afficherConnexion('Connexion impossible : vérifie ta connexion internet.'));
