// Pronos Tennis — point d'entrée de l'application (JavaScript natif, modules ES, sans compilation).
// Jalon 3.1 : connexion, session mémorisée, déconnexion.
// Jalon 3.2 : saison (classement Race + tournois) et page tournoi (matchs groupés par tour).
// Jalon 3.3 : cartes « Filet » et saisie des paris de match.
// Jalon 3.4 : pari tournoi (vainqueur + finaliste), page séparée #/tournoi/ID/pari.
// Jalon 3.5 : classement du tournoi en trois temps, page Race (#/race/ANNEE).
// Jalon 3.6 : page des règles (#/regles).
// Étape 4 : administration (#/admin…), réservée au compte administrateur.
// Jalon 3.7 : page d'accueil (#/) et pastille des paris restants ; la liste de la saison passe en #/saison.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_CLE_PUBLIABLE } from './config.js';
import { emailTechnique, messageErreurConnexion } from './js/identifiants.js';
import { echapper, anneeCourante, dateDuJour } from './js/outils.js';
import { construireRace, classementTournoi, detailRace } from './js/classement.js';
import { creerDonnees } from './js/donnees.js';
import { htmlListeTournois, htmlPageTournoi, htmlErreur, htmlPastille, htmlCarteMatch, htmlPagePariTournoi, htmlPageRace } from './js/vues.js';
import { ordonnerProfils, regrouperParis, regrouperQui, pariAEnregistrer, messageErreurPari } from './js/paris.js';
import { brancherParis } from './js/paris-ui.js';
import { htmlPageRegles } from './js/regles.js';
import { tournoisPourAccueil, statutPariTournoi, htmlAccueil } from './js/accueil.js';
import { matchsAParier } from './js/cartes.js';
import { htmlAdminAccueil, htmlAccesRefuse } from './js/admin.js';
import { validerTournoi, tournoiPourBase, messageErreurAdmin, htmlCalendrierAdmin, htmlFormulaireTournoi } from './js/admin-calendrier.js';
import { htmlClotureAdmin, apercuCloture, messageErreurCloture } from './js/admin-cloture.js';
import { validerMatch, matchPourBase, messageErreurMatch, htmlMatchsAdmin, htmlFormulaireMatch } from './js/admin-matchs.js';
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
    <nav class="menu" aria-label="Navigation">
      <a href="#/" data-menu="accueil">Accueil</a>
      <a href="#/saison" data-menu="saison">Saison</a>
      <a href="#/regles" data-menu="regles">Règles</a>
      ${profil.is_admin ? '<a href="#/admin" data-menu="admin">Admin</a>' : ''}
    </nav>
    <main id="contenu"></main>`;
  document.getElementById('contenu').addEventListener('click', gererClicPariTournoi);
  document.getElementById('contenu').addEventListener('click', gererClicAdmin);
  document.getElementById('contenu').addEventListener('submit', gererSoumissionAdmin);
  document.getElementById('contenu').addEventListener('change', gererChangementAdmin);
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

/* ---------- Accueil : ce qu'il reste à parier sur un tournoi ---------- */
async function chargerBlocAccueil(tournoi) {
  const moi = profilCourant.id;
  const [matchs, lignesTournoi, quiTournoi] = await Promise.all([
    donnees.matchs(tournoi.id), donnees.parisTournoi(tournoi.id), donnees.quiAParieTournoi(tournoi.id),
  ]);
  const paris = regrouperParis(await donnees.parisDesMatchs(matchs.map((m) => m.id)));
  // « qui a parié » seulement pour les matchs ouverts où je n'ai pas encore parié (pour écarter ceux dont je suis exclu)
  const candidats = [...matchsAParier(matchs, { moi, paris })];
  const qui = new Map();
  await Promise.all(candidats.map(async (id) => { qui.set(id, regrouperQui(await donnees.quiAParie(id))); }));
  const nbAParier = matchsAParier(matchs, { moi, paris, qui }).size;
  const monPari = regrouperParisTournoi(lignesTournoi).get(moi) ?? null;
  return { tournoi, nbAParier, pariTournoi: statutPariTournoi(tournoi, { monPari, qui: regrouperQui(quiTournoi), moi }) };
}

/* ---------- Administration : formulaires et boutons ---------- */
let flashAdmin = '';
let pageAdmin = null; // { tournoi, idsApi } de la page « tournoi » de l'administration
let pageAdminMatch = null; // { tournoi, match, joueurs, nbParis } de la page « match » de l'administration
let pageCloture = null; // { moteur, tournoi, donnees, profils, joueurs, archive } de la page « clôture »
const prendreFlash = () => { const m = flashAdmin; flashAdmin = ''; return m; };

function redessinerFormulaireTournoi(options) {
  const contenu = document.getElementById('contenu');
  if (!pageAdmin || !contenu) return;
  const defilement = window.scrollY;
  contenu.innerHTML = htmlFormulaireTournoi({ ...pageAdmin, anneeParDefaut: anneeCourante(), ...options });
  window.scrollTo(0, defilement);
}

function redessinerFormulaireMatch(options) {
  const contenu = document.getElementById('contenu');
  if (!pageAdminMatch || !contenu) return;
  const defilement = window.scrollY;
  contenu.innerHTML = htmlFormulaireMatch({ ...pageAdminMatch, ...options });
  window.scrollTo(0, defilement);
}

function redessinerCloture(options = {}) {
  const contenu = document.getElementById('contenu');
  if (!pageCloture || !contenu) return;
  const defilement = window.scrollY;
  contenu.innerHTML = htmlClotureAdmin({ ...pageCloture, ...options });
  window.scrollTo(0, defilement);
}

/** Vainqueur et finaliste choisis dans les listes de la page « clôture ». */
function choixCloture() {
  const lire = (nom) => { const v = document.querySelector(`select[name="${nom}"]`)?.value; return v ? Number(v) : null; };
  return { vainqueurId: lire('vainqueurId'), finalisteId: lire('finalisteId') };
}

function gererChangementAdmin(e) {
  if (!e.target.closest?.('select[data-admin-cloture]') || !profilCourant?.is_admin || !pageCloture) return;
  redessinerCloture({ imposes: choixCloture() });
}

async function gererClotureAdmin(bouton) {
  const tournoiId = Number(bouton.dataset.tournoi);
  if (bouton.dataset.action === 'ad-rouvrir') {
    if (!window.confirm('Rouvrir ce tournoi ? Son archive de scores sera effacée et il repassera « en cours ». Tu devras le clôturer toi-même ensuite.')) return;
    try {
      await donnees.rouvrirTournoi(tournoiId);
      flashAdmin = 'Tournoi rouvert : l’archive a été effacée.';
      await afficherRoute({ silencieux: true });
    } catch (erreur) { redessinerCloture({ erreurs: [messageErreurCloture(erreur)] }); }
    return;
  }
  const imposes = choixCloture();
  const { calcul, erreur } = apercuCloture({ moteur: pageCloture.moteur, donnees: pageCloture.donnees, imposes });
  if (erreur) { redessinerCloture({ imposes, erreurs: [erreur] }); return; }
  const clos = pageCloture.donnees.etat === 'clos';
  const question = clos
    ? 'Remplacer l’archive des scores finaux par ce nouveau calcul ?'
    : bouton.dataset.force
      ? 'Clôturer ce tournoi alors que la clôture automatique n’aurait pas eu lieu ? Les scores seront figés et les paris restants révélés.'
      : 'Clôturer ce tournoi ? Les scores seront figés et les paris restants révélés.';
  if (!window.confirm(question)) return;
  try {
    await donnees.cloturerTournoi({ tournoiId, resultats: calcul.resultats, vainqueurId: Number(calcul.vainqueur_id), finalisteId: Number(calcul.finaliste_id) });
    flashAdmin = clos ? 'Clôture corrigée : archive mise à jour.' : 'Tournoi clôturé.';
    await afficherRoute({ silencieux: true });
  } catch (e) { redessinerCloture({ imposes, erreurs: [messageErreurCloture(e)] }); }
}

async function gererSoumissionAdmin(e) {
  const form = e.target.closest?.('form[data-admin]');
  if (!form || !profilCourant?.is_admin) return;
  e.preventDefault();
  if (form.dataset.admin === 'tournoi') {
    const brut = Object.fromEntries(new FormData(form));
    brut.indoor = form.elements.indoor.checked;
    const erreurs = validerTournoi(brut);
    if (erreurs.length) { redessinerFormulaireTournoi({ valeurs: brut, erreurs }); return; }
    try {
      const id = form.dataset.id === 'nouveau' ? null : Number(form.dataset.id);
      await donnees.enregistrerTournoi({ id, valeurs: tournoiPourBase(brut) });
      flashAdmin = id === null ? 'Tournoi créé.' : 'Tournoi enregistré.';
      window.location.hash = '#/admin/calendrier';
    } catch (erreur) {
      redessinerFormulaireTournoi({ valeurs: brut, erreurs: [messageErreurAdmin(erreur)] });
    }
  } else if (form.dataset.admin === 'match') {
    const brut = Object.fromEntries(new FormData(form));
    brut.neutralise = form.elements.neutralise.checked;
    const creation = form.dataset.id === 'nouveau';
    const tournoiId = Number(form.dataset.tournoi);
    const erreurs = validerMatch(brut, { categorie: pageAdminMatch.tournoi.categorie, creation });
    if (erreurs.length) { redessinerFormulaireMatch({ valeurs: brut, erreurs }); return; }
    try {
      await donnees.enregistrerMatch({ id: creation ? null : Number(form.dataset.id), valeurs: matchPourBase(brut, { tournoiId, creation }) });
      flashAdmin = creation ? 'Match ajouté.' : 'Match enregistré.';
      window.location.hash = `#/admin/tournoi/${tournoiId}/matchs`;
    } catch (erreur) {
      redessinerFormulaireMatch({ valeurs: brut, erreurs: [messageErreurMatch(erreur)] });
    }
  } else if (form.dataset.admin === 'api-ajouter') {
    const apiId = String(new FormData(form).get('api_id') ?? '').trim();
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(apiId)) { redessinerFormulaireTournoi({ erreurApi: 'Identifiant invalide (lettres, chiffres, tirets).' }); return; }
    try {
      await donnees.ajouterIdApi(Number(form.dataset.tournoi), apiId);
      flashAdmin = 'Identifiant ajouté.';
    } catch (erreur) { redessinerFormulaireTournoi({ erreurApi: messageErreurAdmin(erreur) }); return; }
    await afficherRoute({ silencieux: true }).catch(() => {});
  }
}

async function gererClicAdmin(e) {
  const bouton = e.target.closest?.('button[data-action^="ad-"]');
  if (!bouton || !profilCourant?.is_admin) return;
  if (bouton.dataset.action === 'ad-cloturer' || bouton.dataset.action === 'ad-rouvrir') { await gererClotureAdmin(bouton); return; }
  if (bouton.dataset.action === 'ad-supprimer-match') {
    const nb = Number(bouton.dataset.nbParis) || 0;
    const question = nb ? `Supprimer ce match ? Les ${nb} pari${nb > 1 ? 's' : ''} sur ce match seront effacés. Cette action est définitive.` : 'Supprimer ce match ? Cette action est définitive.';
    if (!window.confirm(question)) return;
    try {
      await donnees.supprimerMatch(Number(bouton.dataset.match));
      flashAdmin = 'Match supprimé.';
      window.location.hash = `#/admin/tournoi/${Number(bouton.dataset.tournoi)}/matchs`;
    } catch (erreur) { redessinerFormulaireMatch({ erreurs: [messageErreurMatch(erreur)] }); }
    return;
  }
  if (bouton.dataset.action === 'ad-retirer-api') {
    if (!window.confirm('Retirer cet identifiant ? Sans autre identifiant, la synchronisation ne suivra plus ce tournoi.')) return;
    try {
      await donnees.retirerIdApi(Number(bouton.dataset.tournoi), bouton.dataset.api);
      flashAdmin = 'Identifiant retiré.';
    } catch (erreur) { redessinerFormulaireTournoi({ erreurApi: messageErreurAdmin(erreur) }); return; }
    await afficherRoute({ silencieux: true }).catch(() => {});
  }
}

/* ---------- Routage par l'adresse (#/ accueil, #/saison, #/tournoi/12, #/tournoi/12/pari, #/race/2026 ou #/regles) ---------- */
function lireRoute() {
  if (window.location.hash === '#/regles') return { nom: 'regles' };
  if (window.location.hash === '#/saison') return { nom: 'saison' };
  if (window.location.hash === '#/admin') return { nom: 'admin' };
  if (window.location.hash === '#/admin/calendrier') return { nom: 'admin-calendrier' };
  const adminMatchs = /^#\/admin\/tournoi\/(\d+)\/matchs$/.exec(window.location.hash);
  if (adminMatchs) return { nom: 'admin-matchs', id: Number(adminMatchs[1]) };
  const adminCloture = /^#\/admin\/tournoi\/(\d+)\/cloture$/.exec(window.location.hash);
  if (adminCloture) return { nom: 'admin-cloture', id: Number(adminCloture[1]) };
  const adminMatchNeuf = /^#\/admin\/tournoi\/(\d+)\/match\/nouveau$/.exec(window.location.hash);
  if (adminMatchNeuf) return { nom: 'admin-match', id: null, tournoiId: Number(adminMatchNeuf[1]) };
  const adminMatch = /^#\/admin\/match\/(\d+)$/.exec(window.location.hash);
  if (adminMatch) return { nom: 'admin-match', id: Number(adminMatch[1]), tournoiId: null };
  const adminTournoi = /^#\/admin\/tournoi\/(\d+|nouveau)$/.exec(window.location.hash);
  if (adminTournoi) return { nom: 'admin-tournoi', id: adminTournoi[1] === 'nouveau' ? null : Number(adminTournoi[1]) };
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
    document.querySelectorAll('nav.menu a').forEach((a) => {
      const actif = route.nom === 'accueil' ? 'accueil' : route.nom === 'regles' ? 'regles' : route.nom.startsWith('admin') ? 'admin' : 'saison';
      if (a.dataset.menu === actif) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (route.nom.startsWith('admin')) {
      page = null;
      pagePT = null;
      pageAdmin = null;
      pageAdminMatch = null;
      pageCloture = null;
      if (!profilCourant.is_admin) contenu.innerHTML = htmlAccesRefuse();
      else if (route.nom === 'admin-calendrier') {
        contenu.innerHTML = htmlCalendrierAdmin({ tournois: await donnees.tournois(), message: prendreFlash() });
      } else if (route.nom === 'admin-cloture') {
        const tournoi = await donnees.tournoi(route.id);
        if (!tournoi) { contenu.innerHTML = htmlErreur('Ce tournoi n’existe pas.'); return; }
        const [donneesCloture, profilsListe, matchs, resultats, moteur] = await Promise.all([
          donnees.donneesCloture(tournoi.id), donnees.profilsTous(), donnees.matchsAdmin(tournoi.id), donnees.resultats(), import('./moteur/index.js'),
        ]);
        const joueurs = await donnees.joueurs([...matchs.flatMap((m) => [m.p1_id, m.p2_id]), tournoi.vainqueur_id, tournoi.finaliste_id]);
        pageCloture = { moteur, tournoi, donnees: donneesCloture, profils: new Map(profilsListe.map((p) => [p.id, p])), joueurs, archive: resultats.filter((r) => r.tournament_id === tournoi.id) };
        contenu.innerHTML = htmlClotureAdmin({ ...pageCloture, message: prendreFlash() });
      } else if (route.nom === 'admin-matchs') {
        const tournoi = await donnees.tournoi(route.id);
        if (!tournoi) { contenu.innerHTML = htmlErreur('Ce tournoi n’existe pas.'); return; }
        const matchs = await donnees.matchsAdmin(tournoi.id);
        const joueurs = await donnees.joueurs(matchs.flatMap((m) => [m.p1_id, m.p2_id]));
        contenu.innerHTML = htmlMatchsAdmin({ tournoi, matchs, joueurs, message: prendreFlash() });
      } else if (route.nom === 'admin-match') {
        const match = route.id === null ? null : await donnees.matchAdmin(route.id);
        if (route.id !== null && !match) { contenu.innerHTML = htmlErreur('Ce match n’existe pas.'); return; }
        const tournoi = await donnees.tournoi(match ? match.tournament_id : route.tournoiId);
        if (!tournoi) { contenu.innerHTML = htmlErreur('Ce tournoi n’existe pas.'); return; }
        let joueurs;
        let nbParis = null;
        if (match) {
          joueurs = await donnees.joueurs([match.p1_id, match.p2_id]);
          nbParis = (await donnees.quiAParie(match.id)).filter((x) => x.a_parie).length;
        } else joueurs = await donnees.tousLesJoueurs();
        pageAdminMatch = { tournoi, match, joueurs, nbParis };
        contenu.innerHTML = htmlFormulaireMatch({ ...pageAdminMatch, message: prendreFlash() });
      } else if (route.nom === 'admin-tournoi') {
        const tournoi = route.id === null ? null : await donnees.tournoi(route.id);
        if (route.id !== null && !tournoi) { contenu.innerHTML = htmlErreur('Ce tournoi n’existe pas.'); return; }
        pageAdmin = { tournoi, idsApi: tournoi ? await donnees.idsApi(tournoi.id) : [] };
        contenu.innerHTML = htmlFormulaireTournoi({ ...pageAdmin, anneeParDefaut: anneeCourante(), message: prendreFlash() });
      } else contenu.innerHTML = htmlAdminAccueil({ synchro: await donnees.journalSynchro() });
    } else if (route.nom === 'regles') {
      page = null;
      pagePT = null;
      contenu.innerHTML = htmlPageRegles({ moteur: await import('./moteur/index.js') });
    } else if (route.nom === 'pari-tournoi') {
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
    } else if (route.nom === 'saison') {
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
    } else {
      page = null;
      pagePT = null;
      const [tournois, resultats, profils, moteur] = await Promise.all([
        donnees.tournois(), donnees.resultats(), donnees.profilsGroupe(profilCourant.is_test), import('./moteur/index.js'),
      ]);
      const annee = anneeCourante();
      const race = construireRace({ moteur, annee, tournois, resultats, profils });
      const { encours, prochain } = tournoisPourAccueil(tournois, dateDuJour());
      const blocs = await Promise.all(encours.map((t) => chargerBlocAccueil(t)));
      contenu.innerHTML = htmlAccueil({ profil: profilCourant, race, blocs, prochain });
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
