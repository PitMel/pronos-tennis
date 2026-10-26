// Pronos Tennis — point d'entrée de l'application (JavaScript natif, modules ES, sans compilation).
// Jalon 3.1 : connexion, session mémorisée, déconnexion.
// Jalon 3.2 : saison (classement Race + tournois) et page tournoi (matchs groupés par tour).
// Jalon 3.3 : cartes « Filet » et saisie des paris de match.
// Jalon 3.4 : pari tournoi (vainqueur + finaliste), page séparée #/tournoi/ID/pari.
// Jalon 3.5 : classement du tournoi en trois temps, page Race (#/race/ANNEE).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_CLE_PUBLIABLE } from './config.js';
import { emailTechnique, messageErreurConnexion } from './js/identifiants.js';
import { echapper, anneeCourante } from './js/outils.js';
import { construireRace, classementTournoi, detailRace } from './js/classement.js';
import { creerDonnees } from './js/donnees.js';
import { htmlListeTournois, htmlPageTournoi, htmlErreur, htmlPastille, htmlCarteMatch, htmlPagePariTournoi, htmlPageRace } from './js/vues.js';
import { ordonnerProfils, regrouperParis, regrouperQui, pariAEnregistrer, messageErreurPari } from './js/paris.js';
import { brancherParis } from './js/paris-ui.js';
import { regrouperParisTournoi, choisir, brouillonDepuisPariTournoi, messageErreurPariTournoi } from './js/pari-tournoi.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_CLE_PUBLIABLE, {
  // La session est mémorisée sur l'appareil (localStorage) et renouvelée toute seule.
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
const donnees = creerDonnees(supabase);
const racine = document.getElementById('app');

let profilCourant = null;

/* ---------- Écran de connexion ---------- */
function afficherConnexion(message = '') {
  profilCourant = null;
  racine.innerHTML = `
    <form class="carte-connexion" id="form-connexion" autocomplete="on">
      <div class="entete-connexion">
        <h1>Pronos <span>Tennis</span></h1>
        <p class="sous-titre">Connecte-toi pour parier.</p>
      </div>
      <div class="corps-connexion">
        <label for="nom">Prénom</label>
        <input id="nom" name="username" type="text" autocomplete="username" autocapitalize="words" required>
        <label for="mdp">Mot de passe</label>
        <input id="mdp" name="password" type="password" autocomplete="current-password" required>
        <p class="erreur" id="erreur" role="alert">${echapper(message)}</p>
        <button class="principal" type="submit">Se connecter</button>
      </div>
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
      ${htmlPastille(profil)}
      <button class="discret" id="deconnexion" type="button">Déconnexion</button>
    </header>
    <main id="contenu"></main>`;
  document.getElementById('contenu').addEventListener('click', gererClicPariTournoi);
  brancherParis(document.getElementById('contenu'), {
    etat: etatParis,
    contexte: contexteCartes,
    matchParId: (id) => page?.matchs.find((m) => m.id === id),
    rafraichirCarte,
    valider: validerPari,
  });
  document.getElementById('deconnexion').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.hash = '';
    afficherConnexion();
  });
}

/* ---------- Page tournoi : données, état de la saisie et rendu ---------- */
// État de la saisie (brouillons, cartes en modification…) : partagé avec le contexte de rendu, il survit aux rafraîchissements.
const etatParis = { brouillons: new Map(), edition: new Set(), enCours: new Set(), messages: new Map() };
let page = null; // { tournoi, matchs, joueurs, ctx }

async function chargerPageTournoi(id) {
  const tournoi = await donnees.tournoi(id);
  if (!tournoi) return null;
  const [matchs, lignesPariTournoi] = await Promise.all([donnees.matchs(id), donnees.parisTournoi(id)]);
  const [joueurs, profils, lignes, moteur, archives] = await Promise.all([
    donnees.joueurs([...matchs.flatMap((m) => [m.p1_id, m.p2_id]), tournoi.vainqueur_id, tournoi.finaliste_id,
      ...lignesPariTournoi.flatMap((l) => [l.vainqueur_id, l.finaliste_id])]),
    donnees.profilsGroupe(profilCourant.is_test),
    donnees.parisDesMatchs(matchs.map((m) => m.id)),
    import('./moteur/index.js'),
    donnees.resultats(),
  ]);
  const monPariTournoi = regrouperParisTournoi(lignesPariTournoi).get(profilCourant.id) ?? null;
  // « qui a parié » : seulement pour les matchs encore ouverts aux paris
  const qui = new Map();
  await Promise.all(matchs
    .filter((m) => m.statut === 'a_venir' && !m.neutralise && !m.verrouille)
    .map(async (m) => { qui.set(m.id, regrouperQui(await donnees.quiAParie(m.id))); }));
  const paris = regrouperParis(lignes);
  const classement = classementTournoi({ moteur, tournoi, matchs, paris, archives: archives.filter((r) => r.tournament_id === id), profils });
  return {
    tournoi,
    matchs,
    joueurs,
    ctx: { moi: profilCourant.id, profils: ordonnerProfils(profils, profilCourant.id), moteur, paris, qui, pariTournoi: monPariTournoi, classement, ...etatParis },
  };
}

function contexteCartes() {
  return page ? { ...page.ctx, joueurs: page.joueurs, categorie: page.tournoi.categorie } : null;
}

function rafraichirCarte(id) {
  const contenu = document.getElementById('contenu');
  const match = page?.matchs.find((m) => m.id === id);
  const element = contenu?.querySelector(`article.match[data-match="${id}"]`);
  if (!match || !element) return;
  element.outerHTML = htmlCarteMatch(match, contexteCartes());
}

async function validerPari(id) {
  const match = page?.matchs.find((m) => m.id === id);
  const brouillon = etatParis.brouillons.get(id);
  if (!match || !brouillon || etatParis.enCours.has(id)) return;
  const pari = pariAEnregistrer(brouillon, page.tournoi.categorie);
  const erreurs = page.ctx.moteur.validerPari(pari, page.tournoi.categorie);
  if (erreurs.length) { etatParis.messages.set(id, erreurs[0]); rafraichirCarte(id); return; }
  etatParis.messages.delete(id);
  etatParis.enCours.add(id);
  rafraichirCarte(id);
  try {
    await donnees.enregistrerPari({ matchId: id, moi: profilCourant.id, pari, existe: page.ctx.paris.get(id)?.has(profilCourant.id) ?? false });
    etatParis.brouillons.delete(id);
    etatParis.edition.delete(id);
  } catch (erreur) {
    etatParis.messages.set(id, messageErreurPari(erreur));
  }
  etatParis.enCours.delete(id);
  // Recharge la page : mon pari a pu révéler ceux des autres (tout le monde a parié) ou verrouiller le match.
  try {
    await afficherRoute({ silencieux: true });
  } catch {
    etatParis.messages.set(id, 'Pari enregistré, mais l’écran n’a pas pu être actualisé : recharge la page.');
    rafraichirCarte(id);
  }
}

/* ---------- Page « Pari tournoi » ---------- */
// État de la saisie (brouillon, modification en cours…) : survit aux rechargements silencieux de la page.
const etatPT = { tournoiId: null, brouillon: {}, edition: false, enCours: false, message: '' };
let pagePT = null; // { tournoi, matchs, joueurs, ctx }

async function chargerPagePariTournoi(id) {
  const tournoi = await donnees.tournoi(id);
  if (!tournoi) return null;
  const [matchs, lignes] = await Promise.all([donnees.matchs(id), donnees.parisTournoi(id)]);
  const [joueurs, profils, qui, moteur] = await Promise.all([
    donnees.joueurs([...matchs.flatMap((m) => [m.p1_id, m.p2_id]), tournoi.vainqueur_id, tournoi.finaliste_id,
      ...lignes.flatMap((l) => [l.vainqueur_id, l.finaliste_id])]),
    donnees.profilsGroupe(profilCourant.is_test),
    donnees.quiAParieTournoi(id),
    import('./moteur/index.js'),
  ]);
  if (etatPT.tournoiId !== id) Object.assign(etatPT, { tournoiId: id, brouillon: {}, edition: false, enCours: false, message: '' });
  return {
    tournoi, matchs, joueurs,
    ctx: { moi: profilCourant.id, profils: ordonnerProfils(profils, profilCourant.id), moteur, paris: regrouperParisTournoi(lignes), qui: regrouperQui(qui) },
  };
}

function htmlPariTournoiCourant() {
  const { tournoi, matchs, joueurs, ctx } = pagePT;
  return htmlPagePariTournoi({ tournoi, matchs, joueurs, ctx: { ...ctx, brouillon: etatPT.brouillon, edition: etatPT.edition, enCours: etatPT.enCours, message: etatPT.message } });
}

function redessinerPariTournoi() {
  const contenu = document.getElementById('contenu');
  if (!pagePT || !contenu) return;
  const defilement = window.scrollY;
  contenu.innerHTML = htmlPariTournoiCourant();
  window.scrollTo(0, defilement);
}

async function validerPariTournoi() {
  if (!pagePT || etatPT.enCours) return;
  const { tournoi, ctx } = pagePT;
  const pari = { vainqueur: etatPT.brouillon.vainqueur, finaliste: etatPT.brouillon.finaliste };
  const erreurs = ctx.moteur.validerPariTournoi(pari);
  if (erreurs.length) { etatPT.message = erreurs[0]; redessinerPariTournoi(); return; }
  etatPT.message = '';
  etatPT.enCours = true;
  redessinerPariTournoi();
  try {
    await donnees.enregistrerPariTournoi({
      tournoiId: tournoi.id, moi: profilCourant.id, vainqueurId: pari.vainqueur, finalisteId: pari.finaliste, existe: ctx.paris.has(profilCourant.id),
    });
    etatPT.brouillon = {};
    etatPT.edition = false;
  } catch (erreur) {
    etatPT.message = messageErreurPariTournoi(erreur);
  }
  etatPT.enCours = false;
  // Recharge : mon pari a pu révéler ceux des autres (tout le monde a parié).
  try {
    await afficherRoute({ silencieux: true });
  } catch {
    etatPT.message = 'Pari enregistré, mais l’écran n’a pas pu être actualisé : recharge la page.';
    redessinerPariTournoi();
  }
}

function gererClicPariTournoi(e) {
  const bouton = e.target.closest?.('button[data-action^="tp-"]');
  if (!bouton || !pagePT) return;
  switch (bouton.dataset.action) {
    case 'tp-choisir':
      etatPT.brouillon = choisir(etatPT.brouillon, bouton.dataset.role, Number(bouton.dataset.joueur));
      etatPT.message = '';
      redessinerPariTournoi();
      break;
    case 'tp-modifier': {
      const mien = pagePT.ctx.paris.get(profilCourant.id);
      etatPT.brouillon = brouillonDepuisPariTournoi(mien);
      etatPT.edition = true;
      etatPT.message = '';
      redessinerPariTournoi();
      break;
    }
    case 'tp-annuler':
      etatPT.brouillon = {};
      etatPT.edition = false;
      etatPT.message = '';
      redessinerPariTournoi();
      break;
    case 'tp-valider':
      validerPariTournoi();
      break;
    default:
  }
}

/* ---------- Routage par l'adresse (#/, #/tournoi/12, #/tournoi/12/pari ou #/race/2026) ---------- */
function lireRoute() {
  const race = /^#\/race\/(\d{4})$/.exec(window.location.hash);
  if (race) return { nom: 'race', annee: Number(race[1]) };
  const m = /^#\/tournoi\/(\d+)(\/pari)?$/.exec(window.location.hash);
  if (!m) return { nom: 'accueil' };
  return { nom: m[2] ? 'pari-tournoi' : 'tournoi', id: Number(m[1]) };
}

async function afficherRoute({ silencieux = false } = {}) {
  if (!profilCourant) return;
  const contenu = document.getElementById('contenu');
  if (!contenu) return;
  const route = lireRoute();
  // un rafraîchissement silencieux garde l'état des sections et la position de défilement
  const ouverts = silencieux ? [...contenu.querySelectorAll('details.tour')].map((d) => d.open) : [];
  const defilement = window.scrollY;
  if (!silencieux) contenu.innerHTML = '<p class="chargement-court">Chargement…</p>';
  try {
    if (route.nom === 'pari-tournoi') {
      page = null;
      const donneesPage = await chargerPagePariTournoi(route.id);
      if (!donneesPage) { pagePT = null; contenu.innerHTML = htmlErreur('Ce tournoi n’existe pas.'); return; }
      pagePT = donneesPage;
      contenu.innerHTML = htmlPariTournoiCourant();
    } else if (route.nom === 'race') {
      page = null;
      pagePT = null;
      const [tournois, resultats, profils, moteur] = await Promise.all([
        donnees.tournois(), donnees.resultats(), donnees.profilsGroupe(profilCourant.is_test), import('./moteur/index.js'),
      ]);
      contenu.innerHTML = htmlPageRace(detailRace({ moteur, annee: route.annee, tournois, resultats, profils }), { moi: profilCourant.id });
    } else if (route.nom === 'tournoi') {
      pagePT = null;
      const donneesPage = await chargerPageTournoi(route.id);
      if (!donneesPage) { page = null; contenu.innerHTML = htmlErreur('Ce tournoi n’existe pas.'); return; }
      page = donneesPage;
      contenu.innerHTML = htmlPageTournoi(page);
      contenu.querySelectorAll('details.tour').forEach((d, i) => { if (i < ouverts.length) d.open = ouverts[i]; });
    } else {
      page = null;
      pagePT = null;
      const [tournois, resultats, profils, moteur] = await Promise.all([
        donnees.tournois(), donnees.resultats(), donnees.profilsGroupe(profilCourant.is_test), import('./moteur/index.js'),
      ]);
      const annee = anneeCourante();
      const race = construireRace({ moteur, annee, tournois, resultats, profils });
      const classements = new Map();
      for (const t of tournois.filter((x) => x.etat === 'clos')) {
        const c = classementTournoi({ moteur, tournoi: t, matchs: [], paris: new Map(), archives: resultats.filter((r) => r.tournament_id === t.id), profils });
        if (c.cloture) classements.set(t.id, c);
      }
      contenu.innerHTML = htmlListeTournois(tournois, { race, anneeCourante: annee, classements });
    }
    window.scrollTo(0, silencieux ? defilement : 0);
  } catch (erreur) {
    if (silencieux) throw erreur;
    page = null;
    pagePT = null;
    contenu.innerHTML = htmlErreur('Impossible de charger les données. Vérifie ta connexion internet, puis réessaie.');
  }
}

window.addEventListener('hashchange', () => afficherRoute());

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
