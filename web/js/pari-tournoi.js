// Pari tournoi (cahier des charges, section 6) : un vainqueur et un finaliste, choisis parmi les joueurs encore en lice.
// Fonctions pures : données → HTML. Le moteur de points est reçu dans le contexte (ctx.moteur).
import { echapper } from './outils.js';
import { ETATS } from './tournois.js';
import { nomCourt, phraseQui } from './cartes.js';

const NBSP = ' ';

/**
 * Joueurs de tennis présents dans les matchs connus du tournoi, avec leur situation d'après les résultats VISIBLES
 * (jamais un résultat encore masqué) :
 *  - elimine : a perdu un match terminé et compté (hors poules des ATP Finals) ;
 *  - avantFinale : éliminé avant la finale (donc « barré » dans le pari de quelqu'un) ;
 *  - finale : joue la finale ; gagnant : a gagné la finale.
 * Triés par classement ATP (inconnu en dernier), puis par nom.
 */
export function joueursDuTournoi(matchs, joueurs) {
  const ids = new Set();
  for (const m of matchs) { if (m.p1_id) ids.add(m.p1_id); if (m.p2_id) ids.add(m.p2_id); }
  const elimines = new Set();
  const avantFinale = new Set();
  const finale = new Set();
  let gagnant = null;
  for (const m of matchs) {
    if (m.tour === 'F') { if (m.p1_id) finale.add(m.p1_id); if (m.p2_id) finale.add(m.p2_id); }
    if (m.tour === 'RR' || m.neutralise || m.statut !== 'termine' || !m.resultat_visible) continue;
    const perdant = m.vainqueur === 1 ? m.p2_id : m.vainqueur === 2 ? m.p1_id : null;
    const vainqueur = m.vainqueur === 1 ? m.p1_id : m.vainqueur === 2 ? m.p2_id : null;
    if (!perdant) continue;
    elimines.add(perdant);
    if (m.tour !== 'F') avantFinale.add(perdant);
    else gagnant = vainqueur;
  }
  return [...ids].map((id) => {
    const j = joueurs.get(id) ?? { id, nom: `Joueur ${id}` };
    return { id, nom: j.nom, classement: j.classement ?? null, elimine: elimines.has(id), avantFinale: avantFinale.has(id), finale: finale.has(id), gagnant: gagnant === id };
  }).sort((a, b) => (a.classement ?? 9999) - (b.classement ?? 9999) || String(a.nom).localeCompare(String(b.nom), 'fr'));
}

/** Lignes de tournament_bets → Map(idProfil → pari). */
export function regrouperParisTournoi(lignes) {
  return new Map((lignes ?? []).map((l) => [l.joueur_id, l]));
}

/** Choisit un joueur comme vainqueur ou finaliste ; le même joueur ne peut pas occuper les deux rôles ; un second clic retire le choix. */
export function choisir(brouillon, role, id) {
  const autre = role === 'vainqueur' ? 'finaliste' : 'vainqueur';
  const b = { ...(brouillon ?? {}) };
  if (b[role] === id) { delete b[role]; return b; }
  b[role] = id;
  if (b[autre] === id) delete b[autre];
  return b;
}

export function brouillonDepuisPariTournoi(bet) {
  return bet ? { vainqueur: bet.vainqueur_id, finaliste: bet.finaliste_id } : {};
}

/** Les paris sont révélés pour moi dès que tout le monde (à qui s'adresse le pari) a parié. */
export function pariTournoiRevele(qui) {
  return Boolean(qui) && qui.size > 0 && [...qui.values()].every(Boolean);
}

export const MESSAGE_PARI_TOURNOI_FERME = 'Ton pari n’a pas été enregistré : le pari tournoi est fermé ou tout le monde a déjà parié.';

/** Erreur de la base → message français. */
export function messageErreurPariTournoi(erreur) {
  const texte = String(erreur?.message ?? erreur ?? '');
  const bas = texte.toLowerCase();
  if (erreur?.code === 'PARI_FERME' || erreur?.code === '42501' || bas.includes('row-level security')) return MESSAGE_PARI_TOURNOI_FERME;
  if (bas.includes('failed to fetch') || bas.includes('network')) return 'Enregistrement impossible : vérifie ta connexion internet.';
  if (/éliminé/i.test(texte)) return texte;
  return 'Ton pari n’a pas pu être enregistré. Réessaie dans un instant.';
}

/** État de l'espace pari tournoi pour la personne connectée : a-venir · ouvert · revele · clos. */
export function etatPariTournoi(tournoi, { revele }) {
  if (tournoi.etat === 'clos') return 'clos';
  if (tournoi.etat === 'a_venir') return 'a-venir';
  return revele ? 'revele' : 'ouvert';
}

/** Carte d'accès sur la page du tournoi. */
export function htmlCartePariTournoi(tournoi, { monPari = null, joueurs = new Map() } = {}) {
  const lien = `#/tournoi/${encodeURIComponent(tournoi.id)}/pari`;
  let texte;
  let classe = '';
  if (monPari) {
    texte = `Ton choix : ${echapper(nomCourt(joueurs.get(monPari.vainqueur_id)))} vainqueur, ${echapper(nomCourt(joueurs.get(monPari.finaliste_id)))} finaliste`;
  } else if (tournoi.etat === 'a_venir') {
    texte = 'Ouvre quand toutes les affiches des huitièmes sont connues';
    classe = ' pari-tournoi-ferme';
  } else if (tournoi.etat === 'clos') {
    texte = 'Pari terminé : voir les choix de chacun';
  } else {
    texte = 'À toi de choisir ton vainqueur et ton finaliste';
    classe = ' pari-tournoi-ouvert';
  }
  return `<a class="carte-pari-tournoi${classe}" href="${lien}"><span><b>Pari tournoi</b><small>${texte}</small></span><i aria-hidden="true">›</i></a>`;
}

function etiquetteJoueur(j) {
  return `<span class="nom-joueur">${echapper(nomCourt(j))}</span>${j.classement ? `<span class="rang-joueur">n°${NBSP}${echapper(j.classement)}</span>` : ''}`;
}

/** Une ligne de la liste de choix : joueur + deux boutons. */
function htmlLigneChoix(j, brouillon, enregistrement) {
  const bouton = (role, libelle) => {
    const choisi = brouillon[role === 'vainqueur' ? 'vainqueur' : 'finaliste'] === j.id;
    return `<button type="button" class="btn-role${choisi ? ' choisi' : ''}" data-action="tp-choisir" data-role="${role}" data-joueur="${echapper(j.id)}"`
      + ` aria-pressed="${choisi}"${j.elimine || enregistrement ? ' disabled' : ''}>${libelle}</button>`;
  };
  return `<li class="ligne-choix${j.elimine ? ' elimine' : ''}"><span class="joueur">${etiquetteJoueur({ nom: j.nom, classement: j.classement })}`
    + `${j.elimine ? '<em>éliminé</em>' : ''}</span>${bouton('vainqueur', 'Vainqueur')}${bouton('finaliste', 'Finaliste')}</li>`;
}

function nomPari(id, joueurs, liste) {
  const j = liste.find((x) => x.id === id);
  const barre = j && j.avantFinale;
  const nom = echapper(nomCourt(joueurs.get(id)));
  return barre ? `<s class="barre">${nom}</s>` : nom;
}

/** Tableau des choix de chacun (paris révélés ou tournoi clos), avec les points si le tournoi est clos. */
function htmlChoixDeTous(tournoi, ctx, liste) {
  const { profils = [], paris = new Map(), moi, joueurs, moteur } = ctx;
  const clos = tournoi.etat === 'clos' && tournoi.vainqueur_id && tournoi.finaliste_id;
  const lignes = profils.map((p) => {
    const bet = paris.get(p.id);
    if (!bet) return `<tr class="${p.id === moi ? 'isme' : ''}"><th>${echapper(p.prenom)}</th><td colspan="${clos ? 3 : 2}" class="vide">pas de pari</td></tr>`;
    let points = '';
    if (clos && moteur) {
      const v = moteur.pointsPariTournoi({ vainqueur: bet.vainqueur_id, finaliste: bet.finaliste_id }, { vainqueur: tournoi.vainqueur_id, finaliste: tournoi.finaliste_id }, tournoi.categorie);
      points = `<td class="${v.comparer(moteur.ZERO) > 0 ? 'pos' : ''}">${echapper(moteur.formaterPoints(v, { signe: true }))}</td>`;
    }
    return `<tr class="${p.id === moi ? 'isme' : ''}"><th>${echapper(p.prenom)}</th><td>${nomPari(bet.vainqueur_id, joueurs, liste)}</td><td>${nomPari(bet.finaliste_id, joueurs, liste)}</td>${points}</tr>`;
  }).join('');
  return `<table class="choix-tous"><thead><tr><th></th><th>Vainqueur</th><th>Finaliste</th>${clos ? '<th>Points</th>' : ''}</tr></thead><tbody>${lignes}</tbody></table>`;
}

/**
 * Page « Pari tournoi » d'un tournoi.
 * @param {object} o
 * @param {object} o.tournoi
 * @param {Array} o.matchs  lignes de matches_visibles
 * @param {Map} o.joueurs   Map(idTennis → joueur)
 * @param {object} o.ctx    moi, profils (moi d'abord), moteur, paris: Map(idProfil → pari), qui: Map(idProfil → a parié)|null,
 *                          brouillon, edition (bool), enCours (bool), message (string)
 */
export function htmlPagePariTournoi({ tournoi, matchs, joueurs, ctx = {} }) {
  const liste = joueursDuTournoi(matchs, joueurs);
  const moi = ctx.moi ?? null;
  const monPari = moi ? ctx.paris?.get(moi) ?? null : null;
  const revele = pariTournoiRevele(ctx.qui) || [...(ctx.paris?.keys() ?? [])].some((id) => id !== moi);
  const etat = etatPariTournoi(tournoi, { revele });
  const participe = !ctx.qui || !moi || ctx.qui.has(moi);
  const points = tournoi.categorie === 'grand_slam' ? 8 : 4;
  const regle = `Chaque joueur choisi qui joue la finale rapporte ${points} points, et ${points} de plus si ton vainqueur gagne le tournoi : ${points * 3} au maximum. Les points sont versés à la fin du tournoi.`;

  const entete = `
    <section class="hero hero-pari categorie-${echapper(tournoi.categorie)}">
      <a class="retour retour-clair" href="#/tournoi/${encodeURIComponent(tournoi.id)}">← ${echapper(tournoi.nom)}</a>
      <h2 class="hero-titre">Pari tournoi</h2>
      <p class="hero-details">Un vainqueur et un finaliste, à choisir parmi les joueurs encore en lice.</p>
      <span class="badge badge-etat etat-${echapper(tournoi.etat)}">${echapper(ETATS[tournoi.etat] ?? tournoi.etat)}</span>
    </section>`;

  if (etat === 'a-venir') {
    return `${entete}<section class="carte"><h3>Pas encore ouvert</h3><p>Le pari tournoi ouvre quand toutes les affiches des huitièmes sont connues (pour les ATP Finals : quand les 4 premiers matchs de poule sont connus).</p><p class="small">${echapper(regle)}</p></section>`;
  }

  const resultat = tournoi.etat === 'clos' && tournoi.vainqueur_id
    ? `<p class="palmares-pari">Vainqueur : <strong>${echapper(nomCourt(joueurs.get(tournoi.vainqueur_id)))}</strong>${tournoi.finaliste_id ? ` · finaliste : ${echapper(nomCourt(joueurs.get(tournoi.finaliste_id)))}` : ''}</p>` : '';

  if (etat === 'clos' || etat === 'revele') {
    const note = etat === 'revele'
      ? '<p class="small">Tout le monde a parié : les choix sont révélés et figés. Un joueur barré est éliminé avant la finale.</p>'
      : '<p class="small">Tournoi terminé. Un joueur barré a été éliminé avant la finale.</p>';
    return `${entete}<section class="carte carte-pari">${resultat}${htmlChoixDeTous(tournoi, { ...ctx, joueurs }, liste)}${note}<p class="small">${echapper(regle)}</p></section>`;
  }

  // ouvert : saisie
  if (!participe) {
    return `${entete}<section class="carte"><h3>Tu ne participes pas à ce pari</h3><p>L’administrateur t’en a exclu.</p></section>`;
  }
  const enEdition = !monPari || ctx.edition;
  const phrase = phraseQui(ctx.profils ?? [], moi, ctx.qui);
  const commun = `${phrase ? `${echapper(phrase)} ` : ''}Les choix des autres s’ouvrent quand tout le monde a parié. Modifiable jusqu’à ce que tout le monde ait parié.`;
  if (liste.length === 0) {
    return `${entete}<section class="carte"><p>Aucun joueur n’est encore connu pour ce tournoi.</p></section>`;
  }

  if (!enEdition) {
    return `${entete}<section class="carte carte-pari" data-pari-tournoi>
      <h3>Ton pari</h3>
      <p class="mon-pari"><b>${echapper(nomCourt(joueurs.get(monPari.vainqueur_id)))}</b> vainqueur · <b>${echapper(nomCourt(joueurs.get(monPari.finaliste_id)))}</b> finaliste</p>
      <button type="button" class="btn alt" data-action="tp-modifier">Modifier mon pari</button>
      <p class="small">${commun}</p><p class="small">${echapper(regle)}</p></section>`;
  }

  const b = ctx.brouillon ?? {};
  const complet = Boolean(b.vainqueur && b.finaliste && b.vainqueur !== b.finaliste);
  const nomChoisi = (id) => (id ? echapper(nomCourt(joueurs.get(id))) : '…');
  return `${entete}<section class="carte carte-pari" data-pari-tournoi>
      <h3>Choisis ton vainqueur et ton finaliste</h3>
      <p class="choix-en-cours">Vainqueur : <b>${nomChoisi(b.vainqueur)}</b> · Finaliste : <b>${nomChoisi(b.finaliste)}</b></p>
      <ul class="liste-choix">${liste.map((j) => htmlLigneChoix(j, b, ctx.enCours)).join('')}</ul>
      ${ctx.message ? `<p class="erreur" role="alert">${echapper(ctx.message)}</p>` : ''}
      <button type="button" class="btn main" data-action="tp-valider"${complet && !ctx.enCours ? '' : ' disabled'}>${ctx.enCours ? 'Enregistrement…' : (monPari ? 'Enregistrer la modification' : 'Valider mon pari')}</button>
      ${monPari ? '<button type="button" class="btn alt" data-action="tp-annuler">Annuler la modification</button>' : ''}
      <p class="small">${commun}</p><p class="small">${echapper(regle)}</p></section>`;
}
