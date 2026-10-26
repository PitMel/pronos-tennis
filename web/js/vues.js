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

/** Trophée du vainqueur : une forme et une couleur par catégorie (Grand Chelem, Masters 1000, ATP Finals). */
export function htmlTrophee(categorie) {
  const formes = {
    grand_slam: ['Trophée Grand Chelem', '#E0B100', '<path d="M7 3h10v5a5 5 0 0 1-10 0V3z" fill="currentColor"/><path d="M7 5H4a3 3 0 0 0 3 4M17 5h3a3 3 0 0 1-3 4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 13v4M8 21h8M9.5 17h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>'],
    masters_1000: ['Trophée Masters 1000', '#7C8B94', '<circle cx="12" cy="9" r="6" fill="currentColor"/><path d="M8.5 14l-2 7 5.5-3 5.5 3-2-7" fill="currentColor" opacity=".75"/><text x="12" y="11.4" text-anchor="middle" font-size="6.5" font-weight="800" fill="#fff">1K</text>'],
    atp_finals: ['Trophée ATP Finals', '#2F6CC2', '<path d="M12 2l3 6.2 6.8.9-5 4.7 1.3 6.7L12 17.2 5.9 20.5l1.3-6.7-5-4.7 6.8-.9L12 2z" fill="currentColor"/>'],
  };
  const [titre, couleur, dessin] = formes[categorie] ?? formes.masters_1000;
  return `<svg class="trophee" viewBox="0 0 24 24" width="22" height="22" role="img" aria-label="${echapper(titre)}" style="color:${couleur}">${dessin}</svg>`;
}

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
      <a class="lien-detail" href="#/race/${encodeURIComponent(race.annee)}">Détail par tournoi ›</a>
    </section>`;
}

/* ---------- Page de la saison : classement puis tournois dans l'ordre chronologique ---------- */
function htmlCarteTournoi(t, classement = null) {
  let palmares = '';
  if (t.etat === 'clos' && classement?.cloture) {
    const premiers = classement.lignes.filter((l) => l.rang === 1);
    palmares = `<p class="palmares-groupe">${htmlTrophee(t.categorie)}<span><b>${echapper(premiers.map((l) => l.prenom).join(' et '))}</b>`
      + ` · ${echapper(premiers[0].final.texte)}</span></p>`
      + `<p class="scores-groupe">${classement.lignes.map((l) => `${echapper(l.prenom)} <b class="${l.final.negatif ? 'neg' : ''}">${echapper(l.final.texte)}</b>`).join(' · ')}</p>`;
  }
  return `
    <a class="carte carte-tournoi categorie-${echapper(t.categorie)}" href="#/tournoi/${encodeURIComponent(t.id)}">
      <div class="ligne-titre">
        <h3>${echapper(t.nom)}</h3>
        <span class="badge badge-categorie">${echapper(CATEGORIES[t.categorie] ?? t.categorie)}</span>
      </div>
      <p class="periode">${echapper(formaterPeriode(t.date_debut, t.date_fin))}</p>
      <p class="lieu">${echapper(lieuEtSurface(t))}</p>
      ${palmares}
      <span class="badge badge-etat etat-${echapper(t.etat)}">${echapper(ETATS[t.etat] ?? t.etat)}</span>
    </a>`;
}

/**
 * @param {Array} tournois
 * @param {{race?: object|null, anneeCourante?: number|null, classements?: Map}} [options] la Race s'affiche en haut de la saison en cours ;
 *   classements : Map(idTournoi → classementTournoi) pour le trophée et les scores des tournois terminés
 */
export function htmlListeTournois(tournois, { race = null, anneeCourante = null, classements = new Map() } = {}) {
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
      ${race && annee !== anneeCourante && liste.some((t) => t.etat === 'clos') ? `<p class="lien-archive"><a href="#/race/${encodeURIComponent(annee)}">Race ${echapper(annee)} : classement final ›</a></p>` : ''}
      ${liste.length ? liste.map((t) => htmlCarteTournoi(t, classements.get(t.id) ?? null)).join('') : '<p class="vide">Aucun tournoi pour cette saison.</p>'}
    </section>`).join('');
}

/* ---------- Classement d'un tournoi (3 temps) ---------- */
const casePoints = (c, classe = '') => `<td class="${[classe, c.negatif ? 'neg' : '', c.positif ? 'pos' : ''].filter(Boolean).join(' ')}">${echapper(c.texte)}</td>`;

export function htmlClassementTournoi(classement, { moi = null, tournoi = null } = {}) {
  if (!classement || classement.lignes.length === 0) return '';
  const clos = classement.cloture;
  const nom = (l) => `${htmlPastille(l, 'pastille pastille-petite')}<span>${echapper(l.prenom)}</span>`;
  const lignes = classement.lignes.map((l) => `
      <tr class="${l.id === moi ? 'isme' : ''}"><td class="rang">${echapper(l.rang)}</td><th scope="row">${nom(l)}</th>
        ${casePoints(l.matchs)}${clos ? `${casePoints(l.pari)}${casePoints(l.bonus)}${casePoints(l.final, 'final')}` : ''}</tr>`).join('');
  let note;
  if (clos) note = 'Score final = points des matchs + pari tournoi + bonus de classement. Les chiffres sont figés à la clôture.';
  else if (tournoi?.etat === 'clos') note = 'Aucun score archivé pour ton groupe sur ce tournoi.';
  else if (classement.matchsComptes === 0) note = 'Aucun match compté pour l’instant. Le classement évolue à mesure que les matchs sont terminés ; le pari tournoi et le bonus de classement s’ajoutent à la clôture.';
  else note = `Points de ${classement.matchsComptes} match${classement.matchsComptes > 1 ? 's' : ''} déjà compté${classement.matchsComptes > 1 ? 's' : ''}. Le pari tournoi et le bonus de classement s’ajoutent à la clôture du tournoi ; la Race ne bouge qu’à ce moment-là.`;
  return `
    <section class="carte carte-classement">
      <h3>Classement du tournoi</h3>
      <div class="tableau-defilant"><table class="classement-tournoi">
        <thead><tr><th></th><th></th><th>Matchs</th>${clos ? '<th>Pari tournoi</th><th>Bonus</th><th>Score</th>' : ''}</tr></thead>
        <tbody>${lignes}</tbody>
      </table></div>
      <p class="small">${echapper(note)}</p>
    </section>`;
}

/* ---------- Page « Race » : classement de l'année et détail par tournoi ---------- */
export function htmlPageRace(detail, { moi = null } = {}) {
  const classement = detail.colonnes.map((c) => `
      <li class="ligne-race${c.id === moi ? ' isme' : ''}">
        <span class="rang">${echapper(c.rang)}</span>
        ${htmlPastille(c, 'pastille pastille-petite')}
        <span class="nom-race">${echapper(c.prenom)}</span>
        <span class="points-race">${echapper(c.points)}</span>
      </li>`).join('');
  const entetes = detail.colonnes.map((c) => `<th scope="col">${htmlPastille(c, 'pastille pastille-petite')}<span>${echapper(c.prenom)}</span></th>`).join('');
  const lignes = detail.tournois.map((t) => `
      <tr><th scope="row"><span class="nom-tournoi">${htmlTrophee(t.categorie)}${echapper(t.nom)}</span><small>${echapper(CATEGORIES[t.categorie] ?? t.categorie)}</small></th>
        ${detail.colonnes.map((c) => { const x = t.cellules[c.id]; return `<td class="${[x.negatif ? 'neg' : '', x.gagnant ? 'gagnant' : ''].filter(Boolean).join(' ')}">${echapper(x.texte)}</td>`; }).join('')}</tr>`).join('');
  const total = detail.colonnes.map((c) => `<td>${echapper(c.points)}</td>`).join('');
  return `
    <section class="hero hero-race">
      <a class="retour retour-clair" href="#/">← Saison ${echapper(detail.annee)}</a>
      <h2 class="hero-titre">Race ${echapper(detail.annee)}</h2>
      <p class="hero-details">${detail.tournoisClos === 0 ? 'Aucun tournoi terminé pour l’instant.' : `Somme des scores finaux de ${detail.tournoisClos} tournoi${detail.tournoisClos > 1 ? 's' : ''} terminé${detail.tournoisClos > 1 ? 's' : ''}.`}</p>
    </section>
    <section class="carte carte-race"><h3>Classement</h3><ol class="liste-race">${classement}</ol></section>
    ${detail.tournoisClos === 0 ? '<p class="vide">La Race bouge à la clôture de chaque tournoi.</p>' : `
    <section class="carte carte-detail-race">
      <h3>Détail par tournoi</h3>
      <div class="tableau-defilant"><table class="detail-race">
        <thead><tr><th></th>${entetes}</tr></thead>
        <tbody>${lignes}</tbody>
        <tfoot><tr><th scope="row">Total Race ${echapper(detail.annee)}</th>${total}</tr></tfoot>
      </table></div>
      <p class="small">Score final de chaque tournoi (après pari tournoi et bonus de classement) ; le meilleur de chaque tournoi est en vert.</p>
    </section>`}`;
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
    ${ctx.classement ? htmlClassementTournoi(ctx.classement, { moi: ctx.moi, tournoi }) : ''}
    ${sections.map(htmlSection).join('')}`;
}

export function htmlErreur(message) {
  return `<section class="carte"><h2>Oups</h2><p class="erreur">${echapper(message)}</p><p><a href="#/">Retour à l’accueil</a></p></section>`;
}
