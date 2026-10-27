// Administration des paris (4.5) : saisie ou correction d'un pari à la place d'un joueur, exclusions, journal des corrections.
// Fonctions pures : données → HTML, validation. Le contrôle de validité des paris vient du moteur (injecté) ;
// l'écriture passe par les fonctions de la base réservées à l'administrateur (migrations 0002 et 0003) et par les droits RLS des exclusions.
import { echapper, formaterHeureParis } from './outils.js';
import { LIBELLES_COURTS, ordreTours } from './tournois.js';
import { joueursDuTournoi } from './pari-tournoi.js';
import { htmlEnteteAdmin } from './admin.js';

const MOTIF_MAX = 300;
const nomJoueur = (joueurs, id) => joueurs.get(id)?.nom ?? `Joueur ${id}`;
const nomProfil = (profils, id) => {
  const p = profils.get(id);
  return p ? `${p.prenom}${p.is_test ? ' (test)' : ''}` : 'Compte inconnu';
};

/** Libellé d'un match pour une liste : « Quarts · Alcaraz – Fritz ». */
export function libelleMatch(match, joueurs) {
  return `${LIBELLES_COURTS[match.tour] ?? match.tour} · ${nomJoueur(joueurs, match.p1_id)} – ${nomJoueur(joueurs, match.p2_id)}`;
}

/** Matchs triés par tour (ordre du tournoi) puis par numéro. */
export function matchsOrdonnes(matchs, categorie) {
  const ordre = ordreTours(categorie);
  return [...matchs].sort((a, b) => ordre.indexOf(a.tour) - ordre.indexOf(b.tour) || a.id - b.id);
}

/** Valide la saisie d'un pari de match (valeurs brutes du formulaire). Renvoie la liste des erreurs, en français. */
export function validerCorrectionPari(v, { moteur, categorie }) {
  const erreurs = [];
  if (!v.joueur) erreurs.push('Choisis le joueur dont tu saisis le pari.');
  if (!v.match) erreurs.push('Choisis le match.');
  const pari = { choix: Number(v.choix), confiance: Number(v.confiance) };
  if (v.sets !== undefined && v.sets !== '' && v.sets !== null) pari.sets = Number(v.sets);
  erreurs.push(...moteur.validerPari(pari, categorie));
  if (String(v.motif ?? '').length > MOTIF_MAX) erreurs.push(`Le motif est trop long (${MOTIF_MAX} caractères au plus).`);
  return erreurs;
}

/** Valeurs du formulaire → arguments de admin_saisir_pari. */
export function pariPourBase(v, categorie) {
  const motif = String(v.motif ?? '').trim();
  return {
    choix: Number(v.choix),
    confiance: Number(v.confiance),
    sets: categorie === 'grand_slam' && v.sets !== '' && v.sets !== undefined ? Number(v.sets) : null,
    motif: motif === '' ? null : motif,
  };
}

/** Valide la saisie d'un pari tournoi. */
export function validerCorrectionPariTournoi(v, { moteur }) {
  const erreurs = [];
  if (!v.joueur) erreurs.push('Choisis le joueur dont tu saisis le pari.');
  erreurs.push(...moteur.validerPariTournoi({ vainqueur: v.vainqueur || null, finaliste: v.finaliste || null }));
  if (String(v.motif ?? '').length > MOTIF_MAX) erreurs.push(`Le motif est trop long (${MOTIF_MAX} caractères au plus).`);
  return erreurs;
}

/** Erreur de la base → message français (corrections, exclusions). */
export function messageErreurParisAdmin(erreur) {
  const texte = String(erreur?.message ?? erreur ?? '');
  const bas = texte.toLowerCase();
  if (erreur?.code === '23505') return 'Ce joueur est déjà exclu de cette façon.';
  if (erreur?.code === '23514') return 'Valeur refusée par la base. Vérifie les champs.';
  if (bas.includes('failed to fetch') || bas.includes('network')) return 'Action impossible : vérifie ta connexion internet.';
  if (bas.includes('could not find the function') || erreur?.code === 'PGRST202') return 'La base n’est pas à jour (migrations 0002 et 0003 manquantes).';
  if (erreur?.code === '42501' || bas.includes('row-level security') || bas.includes('permission denied')) return 'Action refusée : réservée à l’administrateur.';
  // messages écrits en français par la base (« Tournoi clos : rouvre-le… », « Ce joueur est inactif ou exclu… », « déjà éliminé »)
  if (/clos|exclu|inconnu|éliminé|grand chelem|administrateur/i.test(texte)) return texte;
  return 'L’opération a échoué. Réessaie dans un instant.';
}

/** Contenu d'une ligne du journal → phrase. Renvoie null si le contenu est masqué. */
export function resumeContenu(kind, contenu, { match = null, joueurs }) {
  if (!contenu) return null;
  if (kind === 'tournoi') return `vainqueur ${nomJoueur(joueurs, contenu.vainqueur_id)}, finaliste ${nomJoueur(joueurs, contenu.finaliste_id)}`;
  const choisi = match ? nomJoueur(joueurs, contenu.choix === 1 ? match.p1_id : match.p2_id) : `joueur ${contenu.choix}`;
  return `${choisi}, confiance ${contenu.confiance}${contenu.sets ? `, en ${contenu.sets} sets` : ''}`;
}

function champ(id, libelle, controle, aide = '') {
  return `<div class="champ"><label for="${id}">${echapper(libelle)}</label>${controle}${aide ? `<p class="small">${echapper(aide)}</p>` : ''}</div>`;
}

const options = (liste, courant, vide = '— choisir —') =>
  `<option value="">${echapper(vide)}</option>${liste.map(([v, l]) => `<option value="${echapper(v)}"${String(courant ?? '') === String(v) ? ' selected' : ''}>${echapper(l)}</option>`).join('')}`;

function sectionPariMatch({ moteur, tournoi, matchs, joueurs, profils, paris, selection, valeurs, erreurs }) {
  const actifs = [...profils.values()].filter((p) => p.actif);
  const liste = matchsOrdonnes(matchs, tournoi.categorie);
  const joueurId = selection.joueurId ?? '';
  const matchId = selection.matchId ?? '';
  const match = liste.find((m) => String(m.id) === String(matchId)) ?? null;
  const existant = match && joueurId ? paris.find((p) => String(p.match_id) === String(match.id) && p.joueur_id === joueurId) ?? null : null;
  const profil = profils.get(joueurId);
  const v = valeurs ?? (existant
    ? { choix: existant.choix, confiance: existant.confiance, sets: existant.sets ?? '', motif: '' }
    : { choix: '', confiance: '', sets: '', motif: '' });
  const gc = tournoi.categorie === 'grand_slam';
  let etat = '';
  if (match && joueurId) {
    if (existant) etat = `Pari actuel : ${resumeContenu('match', existant, { match, joueurs })}${existant.corrige_par_admin ? ' (déjà corrigé par l’administrateur)' : ''}.`;
    else if (profil && !profil.is_test) etat = 'Pari actuel non visible : les paris d’un vrai joueur restent cachés jusqu’à leur révélation. Un pari saisi ici remplace l’éventuel pari existant.';
    else etat = 'Aucun pari de ce joueur sur ce match.';
  }
  const radios = match ? [[1, nomJoueur(joueurs, match.p1_id)], [2, nomJoueur(joueurs, match.p2_id)]].map(([n, nom]) => `
        <label class="radio"><input type="radio" name="choix" value="${n}"${String(v.choix) === String(n) ? ' checked' : ''}> ${echapper(nom)}</label>`).join('') : '<p class="small">Choisis d’abord un match.</p>';
  return `
    <section class="carte carte-admin">
      <h3>Saisir ou corriger un pari de match</h3>
      <p class="small">Pour un joueur qui a oublié de parier ou s’est trompé. Le pari est marqué « corrigé par l’administrateur » (visible des joueurs quand les paris sont révélés) et inscrit au journal ci-dessous. Aucun contrôle d’heure : à utiliser avec discernement.</p>
      <form class="formulaire-admin" data-admin="pari-match" data-tournoi="${echapper(tournoi.id)}" novalidate>
        <div class="deux">
          ${champ('pm-joueur', 'Joueur', `<select id="pm-joueur" name="joueur" data-admin-paris="match">${options(actifs.map((p) => [p.id, nomProfil(profils, p.id)]), joueurId)}</select>`)}
          ${champ('pm-match', 'Match', `<select id="pm-match" name="match" data-admin-paris="match">${options(liste.map((m) => [m.id, libelleMatch(m, joueurs)]), matchId)}</select>`)}
        </div>
        ${etat ? `<p class="small etat-pari">${echapper(etat)}</p>` : ''}
        <fieldset class="choix-admin"><legend>Vainqueur choisi</legend>${radios}</fieldset>
        <div class="deux">
          ${champ('pm-confiance', 'Confiance', `<select id="pm-confiance" name="confiance">${options([6, 7, 8, 9, 10].map((n) => [n, String(n)]), v.confiance)}</select>`)}
          ${gc ? champ('pm-sets', 'Nombre de sets', `<select id="pm-sets" name="sets">${options([3, 4, 5].map((n) => [n, `${n} sets`]), v.sets)}</select>`) : ''}
        </div>
        ${champ('pm-motif', 'Motif (facultatif, pour le journal)', `<input id="pm-motif" name="motif" type="text" maxlength="${MOTIF_MAX}" value="${echapper(v.motif ?? '')}">`)}
        ${erreurs.map((e) => `<p class="erreur" role="alert">${echapper(e)}</p>`).join('')}
        <button type="submit" class="btn main">Enregistrer le pari</button>
      </form>
    </section>`;
}

function sectionPariTournoi({ moteur, tournoi, matchs, joueurs, profils, parisT, selection, valeurs, erreurs }) {
  const actifs = [...profils.values()].filter((p) => p.actif);
  const joueurId = selection.joueurId ?? '';
  const candidats = joueursDuTournoi(matchs, joueurs);
  const existant = joueurId ? parisT.find((p) => p.joueur_id === joueurId) ?? null : null;
  const profil = profils.get(joueurId);
  const v = valeurs ?? (existant ? { vainqueur: existant.vainqueur_id, finaliste: existant.finaliste_id, motif: '' } : { vainqueur: '', finaliste: '', motif: '' });
  let etat = '';
  if (joueurId) {
    if (existant) etat = `Pari actuel : vainqueur ${nomJoueur(joueurs, existant.vainqueur_id)}, finaliste ${nomJoueur(joueurs, existant.finaliste_id)}${existant.corrige_par_admin ? ' (déjà corrigé par l’administrateur)' : ''}.`;
    else if (profil && !profil.is_test) etat = 'Pari actuel non visible : les paris d’un vrai joueur restent cachés jusqu’à leur révélation. Un pari saisi ici remplace l’éventuel pari existant.';
    else etat = 'Aucun pari tournoi de ce joueur.';
  }
  const liste = candidats.map((j) => [j.id, j.nom]);
  return `
    <section class="carte carte-admin">
      <h3>Saisir ou corriger un pari tournoi</h3>
      ${candidats.length === 0 ? '<p class="vide">Aucun joueur connu pour ce tournoi (le tableau n’est pas encore là) : ajoute d’abord les matchs.</p>' : `
      <form class="formulaire-admin" data-admin="pari-tournoi" data-tournoi="${echapper(tournoi.id)}" novalidate>
        ${champ('pt-joueur', 'Joueur', `<select id="pt-joueur" name="joueur" data-admin-paris="tournoi">${options(actifs.map((p) => [p.id, nomProfil(profils, p.id)]), joueurId)}</select>`)}
        ${etat ? `<p class="small etat-pari">${echapper(etat)}</p>` : ''}
        <div class="deux">
          ${champ('pt-vainqueur', 'Vainqueur', `<select id="pt-vainqueur" name="vainqueur">${options(liste, v.vainqueur)}</select>`)}
          ${champ('pt-finaliste', 'Finaliste', `<select id="pt-finaliste" name="finaliste">${options(liste, v.finaliste)}</select>`)}
        </div>
        ${champ('pt-motif', 'Motif (facultatif, pour le journal)', `<input id="pt-motif" name="motif" type="text" maxlength="${MOTIF_MAX}" value="${echapper(v.motif ?? '')}">`)}
        ${erreurs.map((e) => `<p class="erreur" role="alert">${echapper(e)}</p>`).join('')}
        <button type="submit" class="btn main">Enregistrer le pari tournoi</button>
      </form>`}
    </section>`;
}

function sectionExclusions({ tournoi, matchs, joueurs, profils, exclusions, erreurExclusion }) {
  const actifs = [...profils.values()].filter((p) => p.actif);
  const liste = matchsOrdonnes(matchs, tournoi.categorie);
  const parMatch = new Map(matchs.map((m) => [m.id, m]));
  const lignes = exclusions.map((e) => `
      <li><span><b>${echapper(nomProfil(profils, e.joueur_id))}</b> · ${e.match_id === null ? 'tout le tournoi' : echapper(parMatch.has(e.match_id) ? libelleMatch(parMatch.get(e.match_id), joueurs) : `match ${e.match_id}`)}</span>
        <button type="button" class="btn-petit" data-action="ad-retirer-exclusion" data-id="${echapper(e.id)}">Retirer</button></li>`).join('');
  return `
    <section class="carte carte-admin">
      <h3>Exclusions</h3>
      <p class="small">Un joueur exclu (d’un match ou de tout le tournoi) ne compte plus dans « tous ont parié », ne voit plus ce pari à poser, et n’a aucun point. Utile pour un absent. Un compte désactivé est exclu de tout automatiquement (voir les comptes).</p>
      ${exclusions.length ? `<ul class="liste-ids">${lignes}</ul>` : '<p class="vide">Aucune exclusion pour ce tournoi.</p>'}
      <form class="formulaire-admin" data-admin="exclusion" data-tournoi="${echapper(tournoi.id)}" novalidate>
        <div class="deux">
          ${champ('ex-joueur', 'Joueur', `<select id="ex-joueur" name="joueur">${options(actifs.map((p) => [p.id, nomProfil(profils, p.id)]), '')}</select>`)}
          ${champ('ex-portee', 'Exclu de', `<select id="ex-portee" name="portee"><option value="">Tout le tournoi</option>${liste.map((m) => `<option value="${echapper(m.id)}">${echapper(libelleMatch(m, joueurs))}</option>`).join('')}</select>`)}
        </div>
        ${erreurExclusion ? `<p class="erreur" role="alert">${echapper(erreurExclusion)}</p>` : ''}
        <button type="submit" class="btn-petit principal">Ajouter l’exclusion</button>
      </form>
    </section>`;
}

function sectionJournal({ tournoi, matchs, joueurs, profils, journal }) {
  const parMatch = new Map(matchs.map((m) => [m.id, m]));
  const lignes = journal.map((c) => {
    const match = c.kind === 'match' ? parMatch.get(c.ref_id) ?? null : null;
    const quoi = c.kind === 'match' ? (match ? libelleMatch(match, joueurs) : `match ${c.ref_id}`) : 'pari tournoi';
    let detail;
    if (!c.contenu_visible) detail = 'contenu masqué jusqu’à la révélation des paris';
    else {
      const avant = resumeContenu(c.kind, c.avant, { match, joueurs });
      const apres = resumeContenu(c.kind, c.apres, { match, joueurs });
      detail = `${avant ? `${avant} → ` : 'saisi : '}${apres}`;
    }
    return `
      <li><span class="date-journal">${echapper(formaterHeureParis(c.cree_le))}</span>
        <span><b>${echapper(nomProfil(profils, c.joueur_id))}</b> · ${echapper(quoi)}<small>${echapper(detail)}${c.motif ? ` · motif : ${echapper(c.motif)}` : ''}</small></span></li>`;
  }).join('');
  return `
    <section class="carte carte-admin">
      <h3>Journal des corrections</h3>
      ${journal.length ? `<ul class="journal-admin">${lignes}</ul>` : '<p class="vide">Aucune correction pour ce tournoi.</p>'}
    </section>`;
}

/**
 * Page « Paris et exclusions » d'un tournoi.
 * @param o.paris  paris de match lisibles par l'administrateur (faux comptes, et paris révélés)
 * @param o.parisT paris tournoi lisibles
 * @param o.selection { match: {joueurId, matchId}, tournoi: {joueurId} }
 * @param o.valeurs { match, tournoi } valeurs brutes à ré-afficher après une erreur
 * @param o.erreurs { match: [], tournoi: [], exclusion: '' }
 */
export function htmlParisAdmin({ moteur, tournoi, matchs, joueurs, profils, paris = [], parisT = [], exclusions = [], journal = [], selection = {}, valeurs = {}, erreurs = {}, message = '' }) {
  const clos = tournoi.etat === 'clos';
  return `
    ${htmlEnteteAdmin(`Paris et exclusions · ${tournoi.nom}`, { retour: { href: `#/admin/tournoi/${encodeURIComponent(tournoi.id)}`, texte: 'Fiche du tournoi' }, details: clos ? 'Tournoi clos : rouvre-le (page Clôture) avant de corriger un pari.' : '' })}
    ${message ? `<p class="succes" role="status">${echapper(message)}</p>` : ''}
    ${sectionPariMatch({ moteur, tournoi, matchs, joueurs, profils, paris, selection: selection.match ?? {}, valeurs: valeurs.match ?? null, erreurs: erreurs.match ?? [] })}
    ${sectionPariTournoi({ moteur, tournoi, matchs, joueurs, profils, parisT, selection: selection.tournoi ?? {}, valeurs: valeurs.tournoi ?? null, erreurs: erreurs.tournoi ?? [] })}
    ${sectionExclusions({ tournoi, matchs, joueurs, profils, exclusions, erreurExclusion: erreurs.exclusion ?? '' })}
    ${sectionJournal({ tournoi, matchs, joueurs, profils, journal })}`;
}

