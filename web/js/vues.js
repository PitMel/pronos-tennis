// Construction du HTML des écrans (fonctions pures : données → texte HTML). Tout texte vient échappé.
import { echapper, formaterPeriode } from './outils.js';
import {
  CATEGORIES, ETATS, grouperParTour, grouperParAnnee, lieuEtSurface, etapesProgression,
} from './tournois.js';
import { htmlCarteMatch, htmlBaremeTour, bilanDuTour } from './cartes.js';
import { htmlCartePariTournoi, htmlPagePariTournoi } from './pari-tournoi.js';

export { htmlCarteMatch, htmlPagePariTournoi };

/** Pastille ronde avec l'initiale du prénom, dans la couleur du joueur. */
export function htmlPastille(profil, classe = 'pastille') {
  const initiale = echapper((profil.prenom || '?').trim().charAt(0).toUpperCase());
  const couleur = /^#[0-9A-Fa-f]{6}$/.test(profil.couleur ?? '') ? profil.couleur : '#2F6CC2';
  return `<span class="${classe}" style="background:${couleur}" aria-hidden="true">${initiale}</span>`;
}

const SVG_BALLE = '<svg viewBox="0 0 28 28" width="26" height="26" aria-hidden="true"><circle cx="14" cy="14" r="12.5" fill="#D8E64C" stroke="#17324B" stroke-width="1.5"/><path d="M5.5 8 Q9.5 14 5.5 20" fill="none" stroke="#fff" stroke-width="1.7"/><path d="M22.5 8 Q18.5 14 22.5 20" fill="none" stroke="#fff" stroke-width="1.7"/></svg>';
const SVG_COCHE = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 8.5 l3.2 3.2 l6.8 -7" fill="none" stroke="#1F4D43" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/* ---------- Classement de l'année (Race) ---------- */
export function htmlRace(race) {
  const lignes = race.lignes.map((l) => `
    <li class="ligne-race">
      <span class="rang">${echapper(l.rang)}</span>
      ${htmlPastille(l, 'pastille pastille-petite')}
      <span class="nom-race">${echapper(l.prenom)}</span>
      <span class="points-race">${echapper(l.points)}</span>
    </li>`).join('');
  const etat = race.tournoisClos === 0
    ? 'Aucun tournoi terminé pour l’instant : la Race bouge à la clôture de chaque tournoi.'
    : `${race.tournoisClos} tournoi${race.tournoisClos > 1 ? 's' : ''} terminé${race.tournoisClos > 1 ? 's' : ''}`;
  return `
    <section class="carte carte-race">
      <h3>Race ${echapper(race.annee)}</h3>
      <p class="sous-race">${echapper(etat)}</p>
      <ol class="liste-race">${lignes}</ol>
    </section>`;
}

/* ---------- Page de la saison : classement puis tournois dans l'ordre chronologique ---------- */
function htmlCarteTournoi(t) {
  return `
    <a class="carte carte-tournoi categorie-${echapper(t.categorie)}" href="#/tournoi/${encodeURIComponent(t.id)}">
      <div class="ligne-titre">
        <h3>${echapper(t.nom)}</h3>
        <span class="badge badge-categorie">${echapper(CATEGORIES[t.categorie] ?? t.categorie)}</span>
      </div>
      <p class="periode">${echapper(formaterPeriode(t.date_debut, t.date_fin))}</p>
      <p class="lieu">${echapper(lieuEtSurface(t))}</p>
      <span class="badge badge-etat etat-${echapper(t.etat)}">${echapper(ETATS[t.etat] ?? t.etat)}</span>
    </a>`;
}

/**
 * @param {Array} tournois
 * @param {{race?: object|null, anneeCourante?: number|null}} [options] la Race s'affiche en haut de la saison en cours
 */
export function htmlListeTournois(tournois, { race = null, anneeCourante = null } = {}) {
  const annees = grouperParAnnee(tournois);
  if (race && anneeCourante && !annees.some((a) => a.annee === anneeCourante)) {
    annees.unshift({ annee: anneeCourante, tournois: [] });
    annees.sort((a, b) => b.annee - a.annee);
  }
  if (annees.length === 0) {
    return `<section class="carte"><h2>Tournois</h2><p>Aucun tournoi pour le moment.</p></section>`;
  }
  return annees.map(({ annee, tournois: liste }) => `
    <section>
      <h2 class="titre-annee">Saison ${echapper(annee)}</h2>
      ${race && annee === anneeCourante ? htmlRace(race) : ''}
      ${liste.length ? liste.map(htmlCarteTournoi).join('') : '<p class="vide">Aucun tournoi pour cette saison.</p>'}
    </section>`).join('');
}

/* ---------- Page d'un tournoi ---------- */
function htmlProgression(sections) {
  const etapes = etapesProgression(sections);
  return `
    <ol class="etapes" aria-label="Progression du tournoi">
      ${etapes.map((e) => `
        <li class="etape etape-${e.etat}${e.balle ? ' etape-balle' : ''}">
          <i>${e.balle ? SVG_BALLE : (e.etat === 'fait' ? SVG_COCHE : '')}</i>
          <b>${echapper(e.libelle)}</b>
        </li>`).join('')}
    </ol>`;
}

export function htmlPageTournoi({ tournoi, matchs, joueurs, ctx = {} }) {
  const contexte = { ...ctx, joueurs, categorie: tournoi.categorie };
  const sections = grouperParTour(matchs, tournoi.categorie);
  const vainqueur = tournoi.etat === 'clos' && tournoi.vainqueur_id ? joueurs.get(tournoi.vainqueur_id) : null;
  const finaliste = tournoi.etat === 'clos' && tournoi.finaliste_id ? joueurs.get(tournoi.finaliste_id) : null;
  const details = [CATEGORIES[tournoi.categorie] ?? tournoi.categorie, formaterPeriode(tournoi.date_debut, tournoi.date_fin), lieuEtSurface(tournoi)]
    .filter(Boolean).join(' · ');

  const htmlSection = (s) => {
    if (s.aVenir) return `<div class="tour tour-a-venir"><h3>${echapper(s.libelle)}</h3><p>Affiches à venir</p></div>`;
    const bilan = s.termine ? bilanDuTour(s.matchs, contexte) : null;
    const moi = contexte.moi;
    const monBilan = bilan && moi && bilan.has(moi)
      ? ` · toi <b class="${bilan.get(moi).comparer(contexte.moteur.ZERO) < 0 ? 'neg' : 'pos'}">${echapper(contexte.moteur.formaterPoints(bilan.get(moi), { signe: true }))}</b>` : '';
    const bilanComplet = bilan
      ? `<p class="bilan">Bilan du tour : ${(contexte.profils ?? []).filter((p) => bilan.has(p.id)).map((p) => `${echapper(p.prenom)} <b class="${bilan.get(p.id).comparer(contexte.moteur.ZERO) < 0 ? 'neg' : 'pos'}">${echapper(contexte.moteur.formaterPoints(bilan.get(p.id), { signe: true }))}</b>`).join(' · ')}</p>` : '';
    return `<details class="tour${s.termine ? ' tour-termine' : ''}"${s.courant ? ' open' : ''}>
           <summary><span>${echapper(s.libelle)}</span><span class="compte">${s.matchs.length} match${s.matchs.length > 1 ? 's' : ''}${s.termine ? ' · terminé' : ''}${monBilan}</span></summary>
           ${bilanComplet}
           ${htmlBaremeTour(tournoi.categorie, s.tour, contexte.moteur)}
           <div class="matchs">${s.matchs.map((m) => htmlCarteMatch(m, contexte)).join('')}</div>
         </details>`;
  };

  return `
    <section class="hero categorie-${echapper(tournoi.categorie)}">
      <a class="retour retour-clair" href="#/">← Saison ${echapper(tournoi.annee)}</a>
      <h2 class="hero-titre">${echapper(tournoi.nom)}</h2>
      <p class="hero-details">${echapper(details)}</p>
      <span class="badge badge-etat etat-${echapper(tournoi.etat)}">${echapper(ETATS[tournoi.etat] ?? tournoi.etat)}</span>
      ${vainqueur ? `<p class="palmares">Vainqueur : <strong>${echapper(vainqueur.nom)}</strong>${finaliste ? ` · finaliste : ${echapper(finaliste.nom)}` : ''}</p>` : ''}
      ${htmlProgression(sections)}
    </section>
    ${ctx.pariTournoi !== undefined ? htmlCartePariTournoi(tournoi, { monPari: ctx.pariTournoi, joueurs }) : ''}
    ${sections.map(htmlSection).join('')}`;
}

export function htmlErreur(message) {
  return `<section class="carte"><h2>Oups</h2><p class="erreur">${echapper(message)}</p><p><a href="#/">Retour à l’accueil</a></p></section>`;
}
