// Administration des matchs (4.3) : liste par tour, formulaire d'un match (statut, heure, résultat, score, neutralisation).
// Fonctions pures : données → HTML, validation, conversion vers la ligne de la table matches. L'écriture passe par la base (RLS administrateur).
import { echapper, formaterHeureParis, heureParisVersChamp, champVersHeureParis } from './outils.js';
import { LIBELLES_TOURS, ordreTours, formaterScore } from './tournois.js';
import { htmlEnteteAdmin } from './admin.js';

export const STATUTS_MATCH = { a_venir: 'À venir', en_cours: 'En cours', termine: 'Terminé' };
export const FINS_MATCH = { normal: 'Normale', abandon: 'Abandon', forfait: 'Forfait' };
export const NB_SETS_MAX = 5;
const JEUX_MAX = 30;

/** Sets lus dans le formulaire : champs set1_1, set1_2 … set5_2 → liste de [jeuxJ1, jeuxJ2] (chaînes brutes, lignes vides conservées). */
export function lireSetsFormulaire(brut) {
  return Array.from({ length: NB_SETS_MAX }, (_, i) => [String(brut[`set${i + 1}_1`] ?? '').trim(), String(brut[`set${i + 1}_2`] ?? '').trim()]);
}

/** Interprète les sets saisis. Renvoie { sets: [[a,b]…] (sets remplis, dans l'ordre), erreur: string|null }. */
export function interpreterSets(lignes) {
  const sets = [];
  let vide = false;
  for (let i = 0; i < lignes.length; i += 1) {
    const [a, b] = lignes[i];
    if (a === '' && b === '') { vide = true; continue; }
    if (a === '' || b === '') return { sets, erreur: `Set ${i + 1} : indique les jeux des deux joueurs.` };
    const na = Number(a);
    const nb = Number(b);
    if (![na, nb].every((n) => Number.isInteger(n) && n >= 0 && n <= JEUX_MAX)) return { sets, erreur: `Set ${i + 1} : des nombres de jeux entre 0 et ${JEUX_MAX}.` };
    if (vide) return { sets, erreur: `Set ${i + 1} : ne laisse pas de set vide avant lui.` };
    sets.push([na, nb]);
  }
  return { sets, erreur: null };
}

/** Sets remportés par chaque joueur (le set entamé n'est à personne ; égalité de jeux = à personne). */
export function setsGagnes(sets) {
  let p1 = 0;
  let p2 = 0;
  for (const [a, b] of sets) { if (a > b) p1 += 1; else if (b > a) p2 += 1; }
  return { p1, p2 };
}

/**
 * Valide le formulaire d'un match. v : valeurs brutes (chaînes) ; contexte : { categorie, creation }.
 * Renvoie la liste des erreurs, en français.
 */
export function validerMatch(v, { categorie, creation }) {
  const erreurs = [];
  if (creation) {
    if (!ordreTours(categorie).includes(v.tour)) erreurs.push('Choisis un tour qui existe dans cette catégorie de tournoi.');
    const p1 = String(v.p1_id ?? '');
    const p2 = String(v.p2_id ?? '');
    if (!p1 || !p2) erreurs.push('Choisis les deux joueurs.');
    else if (p1 === p2) erreurs.push('Les deux joueurs doivent être différents.');
  }
  if (!Object.hasOwn(STATUTS_MATCH, v.statut)) { erreurs.push('Choisis un statut.'); return erreurs; }
  if (!Object.hasOwn(FINS_MATCH, v.fin_match)) erreurs.push('Choisis le type de fin de match.');
  if (String(v.heure_prevue ?? '').trim() !== '' && champVersHeureParis(v.heure_prevue) === null) erreurs.push('L’heure prévue n’est pas valide (cette heure n’existe pas à Paris ?).');
  if (v.vainqueur && !['1', '2'].includes(String(v.vainqueur))) erreurs.push('Vainqueur inconnu.');

  const { sets, erreur } = interpreterSets(lireSetsFormulaire(v));
  if (erreur) { erreurs.push(erreur); return erreurs; }

  if (v.statut === 'a_venir') {
    if (v.vainqueur) erreurs.push('Un match à venir n’a pas de vainqueur.');
    if (sets.length) erreurs.push('Un match à venir n’a pas de score.');
    return erreurs;
  }
  if (v.statut === 'en_cours') {
    if (v.vainqueur) erreurs.push('Un vainqueur ne s’enregistre que pour un match terminé.');
    return erreurs;
  }
  // terminé
  const neutralise = v.neutralise === true || v.neutralise === 'on';
  const fin = v.fin_match;
  if (fin === 'forfait') {
    if (sets.length) erreurs.push('Un forfait n’a pas de score : efface les sets.');
    return erreurs;
  }
  if (!v.vainqueur && !neutralise) erreurs.push('Indique le vainqueur d’un match terminé (ou neutralise le match).');
  const maxSets = categorie === 'grand_slam' ? 5 : 3;
  if (sets.length > maxSets) erreurs.push(`Un match de cette catégorie se joue en ${maxSets} sets au plus.`);
  if (fin === 'normal' && sets.length < 2 && !neutralise) erreurs.push('Un match terminé normalement compte au moins 2 sets.');
  if (fin === 'abandon' && sets.length < 1 && !neutralise) erreurs.push('Un abandon compte au moins un set entamé (sinon, c’est un forfait).');
  if (fin === 'normal' && v.vainqueur && sets.length >= 2) {
    const g = setsGagnes(sets);
    const [gagnant, perdant] = String(v.vainqueur) === '1' ? [g.p1, g.p2] : [g.p2, g.p1];
    if (gagnant <= perdant) erreurs.push('Le score ne correspond pas au vainqueur : il doit avoir gagné plus de sets que son adversaire.');
  }
  return erreurs;
}

/**
 * Champs du formulaire → ligne de la table matches.
 * Hors match terminé : ni vainqueur ni nombre de sets, fin « normale ». Forfait : pas de score.
 */
export function matchPourBase(v, { tournoiId = null, creation = false } = {}) {
  const termine = v.statut === 'termine';
  const forfait = termine && v.fin_match === 'forfait';
  const { sets } = interpreterSets(lireSetsFormulaire(v));
  const scoreSaisi = !forfait && sets.length > 0;
  const ligne = {
    heure_prevue: champVersHeureParis(v.heure_prevue),
    statut: v.statut,
    vainqueur: termine && v.vainqueur ? Number(v.vainqueur) : null,
    fin_match: termine ? v.fin_match : 'normal',
    sets_joues: termine && scoreSaisi ? sets.filter(([a, b]) => a + b > 0).length || null : null,
    score: scoreSaisi ? { games: sets } : null,
    neutralise: v.neutralise === true || v.neutralise === 'on',
  };
  if (creation) Object.assign(ligne, { tournament_id: tournoiId, tour: v.tour, p1_id: Number(v.p1_id), p2_id: Number(v.p2_id) });
  return ligne;
}

/** Erreur de la base → message français (écritures de matchs). */
export function messageErreurMatch(erreur) {
  const texte = String(erreur?.message ?? erreur ?? '');
  const bas = texte.toLowerCase();
  if (erreur?.code === '23514') return 'Une valeur est refusée par la base (vainqueur manquant pour un match terminé ?). Vérifie les champs.';
  if (erreur?.code === '23503') return 'Un joueur ou un tournoi indiqué n’existe pas.';
  if (erreur?.code === '42501' || bas.includes('row-level security')) return 'Action refusée : seul l’administrateur peut modifier les matchs.';
  if (bas.includes('n\'existe pas dans un tournoi')) return 'Ce tour n’existe pas dans cette catégorie de tournoi.';
  if (bas.includes('failed to fetch') || bas.includes('network')) return 'Enregistrement impossible : vérifie ta connexion internet.';
  return 'L’enregistrement a échoué. Réessaie dans un instant.';
}

const nomJoueur = (joueurs, id) => joueurs?.get?.(id)?.nom ?? `Joueur n° ${id}`;

function lignesMatch(m, joueurs) {
  const p1 = nomJoueur(joueurs, m.p1_id);
  const p2 = nomJoueur(joueurs, m.p2_id);
  let resultat = '';
  if (m.statut === 'termine') {
    const score = formaterScore(m.score, m.fin_match, m.vainqueur === 2 ? 2 : 1);
    const vainqueur = m.vainqueur === 1 ? p1 : m.vainqueur === 2 ? p2 : '';
    resultat = [vainqueur ? `Victoire : ${vainqueur}` : (m.neutralise ? '' : 'Sans vainqueur'), score].filter(Boolean).join(' · ');
  } else if (m.statut === 'en_cours') {
    resultat = formaterScore(m.score, 'normal') || 'En cours';
  } else {
    resultat = formaterHeureParis(m.heure_prevue) || 'Horaire inconnu';
  }
  return { p1, p2, resultat };
}

/** Page « Matchs » d'un tournoi pour l'administrateur : un bloc par tour. */
export function htmlMatchsAdmin({ tournoi, matchs, joueurs, message = '' }) {
  const tours = ordreTours(tournoi.categorie);
  const bloc = (tour) => {
    const liste = matchs.filter((m) => m.tour === tour)
      .sort((a, b) => String(a.heure_prevue ?? '9999').localeCompare(String(b.heure_prevue ?? '9999')) || a.id - b.id);
    if (liste.length === 0) return '';
    return `
    <section class="carte carte-admin"><h3>${echapper(LIBELLES_TOURS[tour])}</h3>
      <ul class="liste-admin">${liste.map((m) => {
    const { p1, p2, resultat } = lignesMatch(m, joueurs);
    return `
        <li><a class="ligne-admin" href="#/admin/match/${encodeURIComponent(m.id)}">
          <span><b>${echapper(p1)} – ${echapper(p2)}</b><small>${echapper(resultat)}</small></span>
          <span class="etiquettes"><em class="statut-${echapper(m.statut)}">${echapper(STATUTS_MATCH[m.statut] ?? m.statut)}</em>${m.neutralise ? '<em class="alerte">Neutralisé</em>' : ''}${m.modifie_manuellement ? '<em>À la main</em>' : ''}</span>
        </a></li>`;
  }).join('')}</ul></section>`;
  };
  const corps = tours.map(bloc).join('');
  return `
    ${htmlEnteteAdmin(`Matchs · ${tournoi.nom}`, { retour: { href: `#/admin/tournoi/${encodeURIComponent(tournoi.id)}`, texte: 'Fiche du tournoi' }, details: 'Corriger un résultat, neutraliser, ajouter ou supprimer un match.' })}
    ${message ? `<p class="succes" role="status">${echapper(message)}</p>` : ''}
    <a class="btn main btn-lien" href="#/admin/tournoi/${encodeURIComponent(tournoi.id)}/match/nouveau">+ Ajouter un match</a>
    ${corps || '<p class="vide">Aucun match pour ce tournoi pour le moment.</p>'}`;
}

function champ(id, libelle, controle, aide = '') {
  return `<div class="champ"><label for="${id}">${echapper(libelle)}</label>${controle}${aide ? `<p class="small">${echapper(aide)}</p>` : ''}</div>`;
}

/** Valeurs initiales du formulaire d'après un match de la base. */
export function valeursDepuisMatch(m) {
  const v = {
    tour: m.tour, p1_id: String(m.p1_id), p2_id: String(m.p2_id),
    heure_prevue: heureParisVersChamp(m.heure_prevue), statut: m.statut,
    vainqueur: m.vainqueur ? String(m.vainqueur) : '', fin_match: m.fin_match, neutralise: m.neutralise === true,
  };
  const jeux = Array.isArray(m.score?.games) ? m.score.games : [];
  for (let i = 0; i < NB_SETS_MAX; i += 1) {
    const s = jeux[i];
    v[`set${i + 1}_1`] = Array.isArray(s) ? String(s[0] ?? '') : '';
    v[`set${i + 1}_2`] = Array.isArray(s) ? String(s[1] ?? '') : '';
  }
  return v;
}

/**
 * Formulaire d'un match (création ou modification).
 * @param {{tournoi: object, match?: object|null, joueurs: Map|object[], valeurs?: object|null, erreurs?: string[], message?: string, nbParis?: number|null}} o
 *   joueurs : en création, la liste des joueurs [{id, nom}] à proposer ; en modification, la Map id → joueur des deux joueurs du match.
 */
export function htmlFormulaireMatch({ tournoi, match = null, joueurs, valeurs = null, erreurs = [], message = '', nbParis = null }) {
  const creation = !match;
  const v = valeurs ?? (match ? valeursDepuisMatch(match) : { tour: ordreTours(tournoi.categorie)[0], p1_id: '', p2_id: '', heure_prevue: '', statut: 'a_venir', vainqueur: '', fin_match: 'normal', neutralise: false });
  const val = (c) => echapper(v[c] ?? '');
  const opts = (liste, courant) => Object.entries(liste).map(([k, l]) => `<option value="${echapper(k)}"${String(courant) === k ? ' selected' : ''}>${echapper(l)}</option>`).join('');
  const liste = creation ? [...joueurs].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')) : [];
  const choixJoueur = (nom, courant) => `<select id="f-${nom}" name="${nom}"><option value="">— choisir —</option>${liste.map((j) => `<option value="${echapper(j.id)}"${String(courant) === String(j.id) ? ' selected' : ''}>${echapper(j.nom)}</option>`).join('')}</select>`;
  const n1 = creation ? 'Joueur 1' : nomJoueur(joueurs, match.p1_id);
  const n2 = creation ? 'Joueur 2' : nomJoueur(joueurs, match.p2_id);
  const toursDispo = Object.fromEntries(ordreTours(tournoi.categorie).map((t) => [t, LIBELLES_TOURS[t]]));
  const sets = Array.from({ length: NB_SETS_MAX }, (_, i) => `
        <div class="ligne-set"><span>Set ${i + 1}</span>
          <input name="set${i + 1}_1" type="number" inputmode="numeric" min="0" max="${JEUX_MAX}" aria-label="Jeux de ${echapper(n1)}, set ${i + 1}" value="${val(`set${i + 1}_1`)}">
          <span class="tiret">–</span>
          <input name="set${i + 1}_2" type="number" inputmode="numeric" min="0" max="${JEUX_MAX}" aria-label="Jeux de ${echapper(n2)}, set ${i + 1}" value="${val(`set${i + 1}_2`)}">
        </div>`).join('');
  const identite = creation
    ? `${champ('f-tour', 'Tour', `<select id="f-tour" name="tour">${opts(toursDispo, v.tour)}</select>`)}
       ${champ('f-p1_id', 'Joueur 1', choixJoueur('p1_id', v.p1_id))}
       ${champ('f-p2_id', 'Joueur 2', choixJoueur('p2_id', v.p2_id), 'Les paris portent sur « joueur 1 » et « joueur 2 » : l’ordre ne se change plus ensuite.')}`
    : `<p class="small">${echapper(LIBELLES_TOURS[match.tour] ?? match.tour)} · <b>${echapper(n1)}</b> contre <b>${echapper(n2)}</b>. Les joueurs ne se modifient pas ici (des paris peuvent déjà exister) ; en cas d’erreur, supprime le match et recrée-le.</p>`;
  const titre = creation ? 'Nouveau match' : `${n1} – ${n2}`;
  const form = `
    <form class="formulaire-admin" data-admin="match" data-id="${creation ? 'nouveau' : echapper(match.id)}" data-tournoi="${echapper(tournoi.id)}" novalidate>
      ${identite}
      ${champ('f-heure', 'Heure prévue (heure de Paris)', `<input id="f-heure" name="heure_prevue" type="datetime-local" value="${val('heure_prevue')}">`)}
      <div class="deux">
        ${champ('f-statut', 'Statut', `<select id="f-statut" name="statut">${opts(STATUTS_MATCH, v.statut)}</select>`)}
        ${champ('f-fin', 'Fin de match', `<select id="f-fin" name="fin_match">${opts(FINS_MATCH, v.fin_match)}</select>`)}
      </div>
      ${champ('f-vainqueur', 'Vainqueur', `<select id="f-vainqueur" name="vainqueur"><option value="">—</option><option value="1"${String(v.vainqueur) === '1' ? ' selected' : ''}>${echapper(n1)}</option><option value="2"${String(v.vainqueur) === '2' ? ' selected' : ''}>${echapper(n2)}</option></select>`, 'Seulement pour un match terminé (un forfait peut rester sans vainqueur).')}
      <fieldset class="sets-admin"><legend>Score, set par set (jeux)</legend>
        <p class="small">Colonne de gauche : ${echapper(n1)} · colonne de droite : ${echapper(n2)}. Laisse vides les sets non joués.</p>${sets}
      </fieldset>
      <div class="champ case"><label><input name="neutralise" type="checkbox"${v.neutralise ? ' checked' : ''}> Match neutralisé</label>
        <p class="small">Un match neutralisé ne rapporte ni ne coûte aucun point, et n’empêche pas de dévoiler les paris.</p></div>
      ${!creation && match.modifie_manuellement ? '<p class="small">Ce match a déjà été corrigé à la main : la synchronisation ne touche plus à son résultat.</p>' : '<p class="small">Après un changement de résultat, la synchronisation ne touchera plus à ce match.</p>'}
      ${erreurs.map((e) => `<p class="erreur" role="alert">${echapper(e)}</p>`).join('')}
      <button type="submit" class="btn main">${creation ? 'Ajouter le match' : 'Enregistrer'}</button>
    </form>`;
  const suppression = creation ? '' : `
    <section class="carte carte-admin">
      <h3>Supprimer ce match</h3>
      <p class="small">${nbParis ? `<b>${echapper(nbParis)} pari${nbParis > 1 ? 's' : ''}</b> existe${nbParis > 1 ? 'nt' : ''} sur ce match et ser${nbParis > 1 ? 'ont effacés' : 'a effacé'} avec lui.` : 'Aucun pari sur ce match.'} Pour simplement ne plus le compter, préfère le neutraliser.</p>
      <button type="button" class="btn-petit danger" data-action="ad-supprimer-match" data-match="${echapper(match.id)}" data-tournoi="${echapper(tournoi.id)}" data-nb-paris="${echapper(nbParis ?? 0)}">Supprimer le match</button>
    </section>`;
  return `
    ${htmlEnteteAdmin(titre, { retour: { href: `#/admin/tournoi/${encodeURIComponent(tournoi.id)}/matchs`, texte: `Matchs · ${tournoi.nom}` } })}
    ${message ? `<p class="succes" role="status">${echapper(message)}</p>` : ''}
    <section class="carte carte-admin">${form}</section>
    ${suppression}`;
}
