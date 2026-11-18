// Écran « le tournoi est terminé » (Pierre, 17 nov. 2026) : montré une seule fois à chaque joueur qui a participé à un tournoi
// clos, avant l'accès normal à l'application. Fonctions pures (testées) ; le branchement est dans app.js.

import { echapper } from './outils.js';
import { htmlTrophee } from './trophees.js';
import { listeFrancaise } from './cartes.js';

const sansAccent = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Titre de l'écran : « Le Rolex Paris Masters est terminé ! » (espace insécable avant le « ! »), « L'US Open est terminé ! », « Wimbledon est terminé ! »,
 * « Les Nitto ATP Finals sont terminées ! ». Nom sans l'année ; aucun article pour Wimbledon et Roland-Garros ;
 * « Les » pour les ATP Finals ; « L' » devant une voyelle ; « Le » sinon.
 */
export function titreFinTournoi(tournoi) {
  const nom = String(tournoi.nom ?? '').replace(/\s*\b(?:19|20)\d{2}\b/g, '').trim();
  const cle = sansAccent(nom).toLowerCase();
  if (/^wimbledon$|^roland[ -]?garros$/.test(cle)) return `${nom} est terminé\u00A0!`;
  if (tournoi.categorie === 'atp_finals') return `Les ${nom} sont terminées\u00A0!`;
  if (/^[aeiouy]/.test(cle)) return `L’${nom} est terminé\u00A0!`;
  return `Le ${nom} est terminé\u00A0!`;
}

/** Date de tri d'un tournoi : fin, sinon début (ISO), puis numéro. */
const dateTri = (t) => String(t.date_fin ?? t.date_debut ?? '');

/**
 * Tournois dont l'écran reste à montrer à `moi` : clos, avec un résultat archivé à son nom, pas encore vus.
 * Du plus ancien au plus récent (plusieurs tournois ont pu se terminer depuis la dernière ouverture).
 */
export function ecransEnAttente({ tournois, resultats, vus, moi }) {
  const dejaVus = new Set(vus.map((v) => Number(v.tournament_id)));
  const participe = new Set(resultats.filter((r) => r.joueur_id === moi).map((r) => Number(r.tournament_id)));
  return tournois
    .filter((t) => t.etat === 'clos' && participe.has(Number(t.id)) && !dejaVus.has(Number(t.id)))
    .sort((a, b) => dateTri(a).localeCompare(dateTri(b)) || Number(a.id) - Number(b.id));
}

/**
 * Page entière, tout est centré. `classement` = résultat de classementTournoi() d'un tournoi clos (lignes avec rang, prenom,
 * avantBonus, bonus). Vainqueur : trophée du tournoi en très grand, classement, « Tu remportes le tournoi ! ».
 * Les autres : pas de trophée, classement, « X remporte le tournoi ».
 */
export function htmlEcranFin({ tournoi, classement, moi }) {
  const lignes = classement.lignes;
  const premiers = lignes.filter((l) => l.rang === 1);
  const jeSuisVainqueur = premiers.some((l) => l.id === moi);
  const ligne = (l) => {
    const base = l.avantBonus ?? l.final;
    const bonus = l.bonus?.positif ? ` <span class="ecran-fin-bonus">(${echapper(l.bonus.texte)})</span>` : '';
    return `<li class="${l.id === moi ? 'isme' : ''}"><span class="ecran-fin-prenom">${echapper(l.prenom)}</span> `
      + `<b class="${base.negatif ? 'neg' : ''}">${echapper(base.texte)}</b>${bonus}</li>`;
  };
  const noms = premiers.map((l) => l.prenom);
  const phrase = jeSuisVainqueur
    ? 'Tu remportes le tournoi !'
    : `${listeFrancaise(noms)} ${noms.length > 1 ? 'remportent' : 'remporte'} le tournoi`;
  const trophee = jeSuisVainqueur
    ? `<div class="ecran-fin-trophee">${htmlTrophee(tournoi.categorie, tournoi.nom, tournoi, 260)}</div>`
    : '';
  return `
    <section class="ecran-fin" aria-labelledby="ecran-fin-titre">
      <h1 id="ecran-fin-titre" class="ecran-fin-titre">${echapper(titreFinTournoi(tournoi))}</h1>
      ${trophee}
      <ol class="ecran-fin-classement" aria-label="Classement du tournoi">${lignes.map(ligne).join('')}</ol>
      <p class="ecran-fin-phrase">${echapper(phrase)}</p>
      <button type="button" class="ecran-fin-continuer" data-action="ecran-fin-continuer">Continuer</button>
    </section>`;
}
