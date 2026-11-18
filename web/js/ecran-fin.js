// Écran « le tournoi est terminé » (Pierre, 17 nov. 2026) : montré une seule fois à chaque joueur qui a participé à un tournoi
// clos, avant l'accès normal à l'application. Fonctions pures (testées) ; le branchement est dans app.js.

import { echapper } from './outils.js';
import { htmlTrophee, htmlIconeRecompense } from './trophees.js';
import { listeFrancaise } from './cartes.js';

const sansAccent = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Titre de l'écran : « Le Rolex Paris Masters est terminé ! » (espace insécable avant le « ! »), « L'US Open est terminé ! », « Wimbledon est terminé ! »,
 * « Les Nitto ATP Finals sont terminés ! ». Nom sans l'année ; aucun article pour Wimbledon et Roland-Garros ;
 * « Les » pour les ATP Finals ; « L' » devant une voyelle ; « Le » sinon.
 */
export function titreFinTournoi(tournoi) {
  const nom = String(tournoi.nom ?? '').replace(/\s*\b(?:19|20)\d{2}\b/g, '').trim();
  const cle = sansAccent(nom).toLowerCase();
  if (/^wimbledon$|^roland[ -]?garros$/.test(cle)) return `${nom} est terminé\u00A0!`;
  if (tournoi.categorie === 'atp_finals') return `Les ${nom} sont terminés\u00A0!`;
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
 * avantBonus, bonus). Vainqueur : trophée du tournoi en très grand, « Tu remportes le tournoi ! », puis le classement.
 * Les autres : pas de trophée, « X remporte le tournoi », puis le classement.
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
      <p class="ecran-fin-phrase">${echapper(phrase)}</p>
      <ol class="ecran-fin-classement" aria-label="Classement du tournoi">${lignes.map(ligne).join('')}</ol>
      <button type="button" class="ecran-fin-continuer" data-action="ecran-fin-continuer">Continuer</button>
    </section>`;
}

/* ---------- Écran « la saison est terminée » (18 nov. 2026, migration 0029) ---------- */

/**
 * Saisons dont l'écran reste à montrer à `moi` : tous leurs tournois sont clos, j'ai un résultat archivé dans l'un d'eux, pas encore
 * vue. De la plus ancienne à la plus récente. (La saison 2026 se termine à la clôture des ATP Finals.)
 */
export function ecransSaisonEnAttente({ tournois, resultats, vus, moi }) {
  const dejaVues = new Set(vus.map((v) => Number(v.annee)));
  const mesTournois = new Set(resultats.filter((r) => r.joueur_id === moi).map((r) => Number(r.tournament_id)));
  const parAnnee = new Map();
  for (const t of tournois) parAnnee.set(Number(t.annee), [...(parAnnee.get(Number(t.annee)) ?? []), t]);
  return [...parAnnee]
    .filter(([annee, liste]) => liste.every((t) => t.etat === 'clos') && liste.some((t) => mesTournois.has(Number(t.id))) && !dejaVues.has(annee))
    .map(([annee]) => annee)
    .sort((a, b) => a - b);
}

/**
 * Page entière, tout est centré, même style que l'écran de fin de tournoi. `race` = résultat de construireRace() d'une saison terminée
 * (lignes avec rang, prenom, points). Champion : trophée « champion de la saison » en très grand, « Tu es champion de la saison ! » ;
 * vice-champion : son trophée et « Tu es vice-champion de la saison ! » ; les autres : pas de trophée, « X est champion de la saison ».
 * Puis le classement final : une ligne par joueur avec son total de points de la Race.
 */
export function htmlEcranFinSaison({ annee, race, moi, recompenses = [] }) {
  const lignes = race.lignes;
  const champions = lignes.filter((l) => l.rang === 1).map((l) => l.prenom);
  const monRang = lignes.find((l) => l.id === moi)?.rang;
  const grandTrophee = (cle) => `<div class="ecran-fin-trophee">${htmlTrophee(cle, null, null, 260)}</div>`;
  let trophee = '';
  let phrase;
  if (monRang === 1) { trophee = grandTrophee('champion_saison'); phrase = 'Tu es champion de la saison !'; }
  else if (monRang === 2) { trophee = grandTrophee('vice_champion_saison'); phrase = 'Tu es vice-champion de la saison !'; }
  else phrase = `${listeFrancaise(champions)} ${champions.length > 1 ? 'sont champions' : 'est champion'} de la saison`;
  const ligne = (l) => {
    const negatif = /^[−-]/.test(l.points);
    return `<li class="${l.id === moi ? 'isme' : ''}"><span class="ecran-fin-prenom">${echapper(l.prenom)}</span> <b class="${negatif ? 'neg' : ''}">${echapper(l.points)}</b></li>`;
  };
  return `
    <section class="ecran-fin ecran-fin-saison" aria-labelledby="ecran-fin-titre">
      <h1 id="ecran-fin-titre" class="ecran-fin-titre">${echapper(`La saison ${annee} est terminée !`)}</h1>
      ${trophee}
      <p class="ecran-fin-phrase">${echapper(phrase)}</p>
      <ol class="ecran-fin-classement" aria-label="Classement final de la saison ${echapper(annee)}">${lignes.map(ligne).join('')}</ol>
      ${htmlTropheesSaison(recompenses)}
      <button type="button" class="ecran-fin-continuer" data-action="ecran-fin-continuer">Continuer</button>
    </section>`;
}

/** « Tes trophées de saison » : les « Autres récompenses » remportées par le joueur, en petit (icône, nom, ×n si plusieurs). */
function htmlTropheesSaison(recompenses) {
  const liste = recompenses.length
    ? `<ul class="ecran-fin-recompenses">${recompenses.map((r) => `<li>${htmlIconeRecompense(r.cle, 28)}<span>${echapper(r.court ?? r.titre)}${r.nombre > 1 ? ` ×${echapper(r.nombre)}` : ''}</span></li>`).join('')}</ul>`
    : '<p class="ecran-fin-aucun">Aucun cette saison</p>';
  return `<h2 class="ecran-fin-sous-titre">Tes trophées de saison</h2>${liste}`;
}
