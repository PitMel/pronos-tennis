// Administration du calendrier (4.2) : liste des tournois, formulaire d'un tournoi, identifiants de l'API.
// Fonctions pures : données → HTML, et validation des champs du formulaire. L'écriture passe par la base (RLS administrateur).
import { echapper, formaterPeriode } from './outils.js';
import { CATEGORIES, SURFACES, ETATS, lieuEtSurface } from './tournois.js';
import { htmlEnteteAdmin } from './admin.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Valide les champs du formulaire (valeurs brutes, chaînes). Renvoie la liste des erreurs, en français. */
export function validerTournoi(v) {
  const erreurs = [];
  const nom = String(v.nom ?? '').trim();
  if (!nom) erreurs.push('Le nom du tournoi est obligatoire.');
  else if (nom.length > 80) erreurs.push('Le nom du tournoi est trop long (80 caractères au plus).');
  const annee = Number(v.annee);
  if (!Number.isInteger(annee) || annee < 2020 || annee > 2100) erreurs.push('L’année doit être comprise entre 2020 et 2100.');
  if (!Object.hasOwn(CATEGORIES, v.categorie)) erreurs.push('Choisis une catégorie.');
  if (v.surface && !Object.hasOwn(SURFACES, v.surface)) erreurs.push('Surface inconnue.');
  for (const [champ, libelle] of [['date_debut', 'de début'], ['date_fin', 'de fin']]) {
    const d = String(v[champ] ?? '').trim();
    if (d && (!DATE.test(d) || Number.isNaN(Date.parse(`${d}T12:00:00Z`)))) erreurs.push(`La date ${libelle} n’est pas valide.`);
  }
  const debut = String(v.date_debut ?? '').trim();
  const fin = String(v.date_fin ?? '').trim();
  if (DATE.test(debut) && DATE.test(fin) && fin < debut) erreurs.push('La date de fin ne peut pas précéder la date de début.');
  return erreurs;
}

/** Champs du formulaire → ligne de la table tournaments (chaînes vides = absent). */
export function tournoiPourBase(v) {
  const vide = (x) => { const t = String(x ?? '').trim(); return t === '' ? null : t; };
  return {
    annee: Number(v.annee),
    nom: String(v.nom).trim(),
    ville: vide(v.ville),
    surface: vide(v.surface),
    indoor: v.indoor === true || v.indoor === 'on' || v.indoor === 'true',
    categorie: v.categorie,
    date_debut: vide(v.date_debut),
    date_fin: vide(v.date_fin),
  };
}

/** Erreur de la base → message français (écritures de l'administrateur). */
export function messageErreurAdmin(erreur) {
  const texte = String(erreur?.message ?? erreur ?? '');
  const bas = texte.toLowerCase();
  if (erreur?.code === '23505') {
    if (bas.includes('tournament_api_ids')) return 'Cet identifiant de l’API est déjà utilisé (par ce tournoi ou un autre).';
    return 'Un tournoi de ce nom existe déjà pour cette année.';
  }
  if (erreur?.code === '23514') return 'Une valeur est refusée par la base (dates incohérentes ?). Vérifie les champs.';
  if (erreur?.code === '42501' || bas.includes('row-level security')) return 'Action refusée : seul l’administrateur peut modifier le calendrier.';
  if (bas.includes('failed to fetch') || bas.includes('network')) return 'Enregistrement impossible : vérifie ta connexion internet.';
  return 'L’enregistrement a échoué. Réessaie dans un instant.';
}

/** Liste des tournois pour l'administration : par année, les plus récentes d'abord, ordre chronologique dans l'année. */
export function htmlCalendrierAdmin({ tournois, message = '' }) {
  const parAnnee = new Map();
  for (const t of tournois) {
    if (!parAnnee.has(t.annee)) parAnnee.set(t.annee, []);
    parAnnee.get(t.annee).push(t);
  }
  const annees = [...parAnnee.keys()].sort((a, b) => b - a);
  const carte = (t) => `
      <li><a class="ligne-admin" href="#/admin/tournoi/${encodeURIComponent(t.id)}">
        <span><b>${echapper(t.nom)}</b><small>${echapper(formaterPeriode(t.date_debut, t.date_fin))} · ${echapper(lieuEtSurface(t) || 'lieu à renseigner')}</small></span>
        <span class="etiquettes"><em>${echapper(CATEGORIES[t.categorie] ?? t.categorie)}</em><em class="etat-${echapper(t.etat)}">${echapper(ETATS[t.etat] ?? t.etat)}</em></span>
      </a></li>`;
  const tri = (x, y) => (x.date_debut ?? '9999-12-31').localeCompare(y.date_debut ?? '9999-12-31') || x.nom.localeCompare(y.nom, 'fr');
  return `
    ${htmlEnteteAdmin('Calendrier', { retour: { href: '#/admin', texte: 'Administration' }, details: 'Dates, lieu, surface, catégorie et identifiants de l’API de chaque tournoi.' })}
    ${message ? `<p class="succes" role="status">${echapper(message)}</p>` : ''}
    <a class="btn main btn-lien" href="#/admin/tournoi/nouveau">+ Ajouter un tournoi</a>
    ${annees.length === 0 ? '<p class="vide">Aucun tournoi pour le moment.</p>' : annees.map((a) => `
    <section class="carte carte-admin"><h3>Saison ${echapper(a)}</h3>
      <ul class="liste-admin">${parAnnee.get(a).sort(tri).map(carte).join('')}</ul></section>`).join('')}`;
}

function champ(id, libelle, contrôle, aide = '') {
  return `<div class="champ"><label for="${id}">${echapper(libelle)}</label>${contrôle}${aide ? `<p class="small">${echapper(aide)}</p>` : ''}</div>`;
}

/**
 * Formulaire d'un tournoi (modification ou création) et, en modification, ses identifiants de l'API.
 * @param {{tournoi?: object|null, idsApi?: string[], valeurs?: object|null, erreurs?: string[], erreurApi?: string, message?: string, anneeParDefaut?: number}} o
 *   valeurs : ce que la personne vient de saisir (réaffiché en cas d'erreur)
 */
export function htmlFormulaireTournoi({ tournoi = null, idsApi = [], valeurs = null, erreurs = [], erreurApi = '', message = '', anneeParDefaut = new Date().getFullYear() } = {}) {
  const nouveau = !tournoi;
  const v = valeurs ?? (tournoi ?? { annee: anneeParDefaut, categorie: 'masters_1000', surface: 'dur', indoor: false });
  const valeur = (c) => echapper(v[c] ?? '');
  const options = (liste, courant, vide = null) => `${vide ? `<option value=""${courant ? '' : ' selected'}>${echapper(vide)}</option>` : ''}${Object.entries(liste).map(([k, l]) => `<option value="${echapper(k)}"${courant === k ? ' selected' : ''}>${echapper(l)}</option>`).join('')}`;
  const formulaire = `
    <form class="formulaire-admin" data-admin="tournoi" data-id="${nouveau ? 'nouveau' : echapper(tournoi.id)}" novalidate>
      ${champ('f-nom', 'Nom', `<input id="f-nom" name="nom" type="text" maxlength="80" required value="${valeur('nom')}">`)}
      <div class="deux">
        ${champ('f-annee', 'Année', `<input id="f-annee" name="annee" type="number" min="2020" max="2100" required value="${valeur('annee')}">`)}
        ${champ('f-categorie', 'Catégorie', `<select id="f-categorie" name="categorie">${options(CATEGORIES, v.categorie)}</select>`)}
      </div>
      ${champ('f-ville', 'Ville', `<input id="f-ville" name="ville" type="text" value="${valeur('ville')}">`)}
      <div class="deux">
        ${champ('f-surface', 'Surface', `<select id="f-surface" name="surface">${options(SURFACES, v.surface, '—')}</select>`)}
        <div class="champ case"><label><input name="indoor" type="checkbox"${v.indoor ? ' checked' : ''}> Indoor (en salle)</label></div>
      </div>
      <div class="deux">
        ${champ('f-debut', 'Premier jour', `<input id="f-debut" name="date_debut" type="date" value="${valeur('date_debut')}">`)}
        ${champ('f-fin', 'Dernier jour', `<input id="f-fin" name="date_fin" type="date" value="${valeur('date_fin')}">`)}
      </div>
      ${nouveau ? '' : `<p class="small">État actuel : <b>${echapper(ETATS[tournoi.etat] ?? tournoi.etat)}</b> (géré par la synchronisation ; la clôture se pilote depuis la page du tournoi).${tournoi.etat === 'clos' ? ' Ce tournoi est clos : ses scores sont figés, modifier sa catégorie ne les recalcule pas.' : ' Changer la catégorie change le barème des matchs de ce tournoi.'}</p>`}
      ${erreurs.map((e) => `<p class="erreur" role="alert">${echapper(e)}</p>`).join('')}
      <button type="submit" class="btn main">${nouveau ? 'Créer le tournoi' : 'Enregistrer'}</button>
    </form>`;
  const api = nouveau ? '' : `
    <section class="carte carte-admin">
      <h3>Identifiants de l’API</h3>
      <p class="small">Un tournoi peut avoir plusieurs identifiants (doublons de l’API, Toronto et Montréal). La synchronisation s’en sert pour retrouver ses matchs.</p>
      ${idsApi.length ? `<ul class="liste-ids">${idsApi.map((id) => `<li><code>${echapper(id)}</code><button type="button" class="btn-petit" data-action="ad-retirer-api" data-api="${echapper(id)}" data-tournoi="${echapper(tournoi.id)}">Retirer</button></li>`).join('')}</ul>` : '<p class="vide">Aucun identifiant : ce tournoi n’est pas synchronisé.</p>'}
      ${erreurApi ? `<p class="erreur" role="alert">${echapper(erreurApi)}</p>` : ''}
      <form class="ajout-api" data-admin="api-ajouter" data-tournoi="${echapper(tournoi.id)}" novalidate>
        <input name="api_id" type="text" inputmode="numeric" placeholder="Nouvel identifiant" aria-label="Identifiant de l’API à ajouter">
        <button type="submit" class="btn-petit principal">Ajouter</button>
      </form>
    </section>`;
  return `
    ${htmlEnteteAdmin(nouveau ? 'Nouveau tournoi' : tournoi.nom, { retour: { href: '#/admin/calendrier', texte: 'Calendrier' } })}
    ${message ? `<p class="succes" role="status">${echapper(message)}</p>` : ''}
    <section class="carte carte-admin">${formulaire}</section>
    ${api}
    ${nouveau ? '' : `<a class="btn btn-lien" href="#/admin/tournoi/${encodeURIComponent(tournoi.id)}/matchs">Gérer les matchs de ce tournoi ›</a>`}
    ${nouveau ? '' : `<a class="btn btn-lien" href="#/admin/tournoi/${encodeURIComponent(tournoi.id)}/paris">Paris et exclusions ›</a>`}
    ${nouveau ? '' : `<a class="btn btn-lien" href="#/admin/tournoi/${encodeURIComponent(tournoi.id)}/cloture">Clôture et scores finaux ›</a>`}
    ${nouveau ? '' : `<p class="lien-archive"><a href="#/tournoi/${encodeURIComponent(tournoi.id)}">Voir la page du tournoi côté joueurs ›</a></p>`}`;
}
