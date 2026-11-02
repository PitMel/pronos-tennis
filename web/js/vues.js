// Construction du HTML des écrans (fonctions pures : données → texte HTML). Tout texte vient échappé.
import { echapper, formaterPeriode } from './outils.js';
import {
  CATEGORIES, ETATS, grouperParTour, grouperParAnnee, lieuEtSurface, etapesProgression,
} from './tournois.js';
import { htmlCarteMatch, htmlBaremeTour, bilanDuTour, matchsAParier } from './cartes.js';
import { htmlSectionPariTournoi, contextePariTournoi } from './pari-tournoi.js';
import { htmlTrophee } from './trophees.js';

export { htmlCarteMatch, htmlSectionPariTournoi, htmlTrophee };

const PHOTO_VALIDE = /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/avatars\/[0-9a-f-]{36}\.jpg(\?v=[0-9]{1,15})?$/;

/** Pastille ronde : la photo du joueur si elle existe, sinon l'initiale du prénom sur sa couleur. */
export function htmlPastille(profil, classe = 'pastille') {
  const initiale = echapper((profil.prenom || '?').trim().charAt(0).toUpperCase());
  const couleur = /^#[0-9A-Fa-f]{6}$/.test(profil.couleur ?? '') ? profil.couleur : '#2F6CC2';
  const photo = PHOTO_VALIDE.test(profil.photo_url ?? '') ? profil.photo_url : null;
  if (photo) return `<span class="${classe} pastille-photo" style="background-color:${couleur};background-image:url('${echapper(photo)}')" aria-hidden="true"></span>`;
  return `<span class="${classe}" style="background:${couleur}" aria-hidden="true">${initiale}</span>`;
}

const SVG_BALLE = '<svg viewBox="0 0 28 28" width="26" height="26" aria-hidden="true"><circle cx="14" cy="14" r="12.5" fill="#D8E64C" stroke="#17324B" stroke-width="1.5"/><path d="M5.5 8 Q9.5 14 5.5 20" fill="none" stroke="#fff" stroke-width="1.7"/><path d="M22.5 8 Q18.5 14 22.5 20" fill="none" stroke="#fff" stroke-width="1.7"/></svg>';
const SVG_COCHE = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 8.5 l3.2 3.2 l6.8 -7" fill="none" stroke="#1F4D43" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/* ---------- Classement de l'année (Race) ---------- */
const htmlTropheesRace = (l) => (l.trophees?.length ? `<span class="trophees-race">${l.trophees.map((t) => htmlTrophee(t.categorie, t.nom, t)).join('')}</span>` : '');

export function htmlRace(race, { lienPalmares = false } = {}) {
  const lignes = race.lignes.map((l) => `
    <li class="ligne-race">
      <span class="rang">${echapper(l.rang)}</span>
      ${htmlPastille(l, 'pastille pastille-petite')}
      <span class="nom-race">${echapper(l.prenom)}${htmlTropheesRace(l)}</span>
      <span class="points-race">${echapper(l.points)}</span>
    </li>`).join('');
  const etat = race.tournoisClos === 0
    ? 'Aucun tournoi terminé pour l’instant : la Race bouge à la clôture de chaque tournoi.'
    : `${race.tournoisClos} tournoi${race.tournoisClos > 1 ? 's' : ''} terminé${race.tournoisClos > 1 ? 's' : ''}`;
  return `
    <section class="carte carte-race race-saison">
      <h3>Race ${echapper(race.annee)}</h3>
      <p class="sous-race">${echapper(etat)}</p>
      <ol class="liste-race">${lignes}</ol>
      <a class="lien-detail" href="#/race/${encodeURIComponent(race.annee)}">Détail par tournoi ›</a>
      ${lienPalmares ? '<a class="lien-detail lien-palmares" href="#/palmares">Palmarès de la saison ›</a>' : ''}
    </section>`;
}

/* ---------- Page de la saison : classement puis tournois dans l'ordre chronologique ---------- */
function htmlCarteTournoi(t, classement = null, joueurs = new Map(), moi = null) {
  let palmares = '';
  // « Vainqueur : Prénom Nom » : le joueur de tennis qui a gagné le tournoi (tournoi terminé, finale connue)
  const gagnant = t.etat === 'clos' && t.vainqueur_id ? joueurs.get(t.vainqueur_id) : null;
  const vainqueurTennis = gagnant
    ? `<p class="vainqueur-tennis">Vainqueur : <strong>${echapper(gagnant.nom)}</strong></p>` : '';
  if (t.etat === 'clos' && classement?.cloture) {
    const premiers = classement.lignes.filter((l) => l.rang === 1);
    // « | Moi · score » : mon score final, sauf si je suis le (ou l'un des) vainqueur(s) des pronos
    const mienne = moi ? classement.lignes.find((l) => l.id === moi) : null;
    const lienMoi = mienne && mienne.rang !== 1 ? `<span class="sep-moi" aria-hidden="true">|</span><span><b>Moi</b> · ${echapper(mienne.final.texte)}</span>` : '';
    palmares = `<p class="palmares-groupe">${htmlTrophee(t.categorie, t.nom, t)}<span><b>${echapper(premiers.map((l) => l.prenom).join(' et '))}</b>`
      + ` · ${echapper(premiers[0].final.texte)}</span>${lienMoi}</p>`
      + `<p class="scores-groupe">${classement.lignes.map((l) => {
        // score avant bonification (matchs + pari tournoi), puis la bonification du 1er et du 2e entre parenthèses : « Paul 112 (+12) »
        const base = l.avantBonus ?? l.final;
        return `${echapper(l.prenom)} <b class="${base.negatif ? 'neg' : ''}">${echapper(base.texte)}</b>${l.bonus?.positif ? ` <b class="bonus-classement">(${echapper(l.bonus.texte)})</b>` : ''}`;
      }).join(' · ')}</p>`;
  }
  return `
    <a class="carte carte-tournoi categorie-${echapper(t.categorie)}" href="#/tournoi/${encodeURIComponent(t.id)}">
      <div class="ligne-titre">
        <div class="titre-tournoi">
          <h3>${echapper(t.nom)}</h3>
          <p class="periode">${echapper(formaterPeriode(t.date_debut, t.date_fin))}</p>
        </div>
        <span class="etiquettes">
          <span class="badge badge-categorie">${echapper(CATEGORIES[t.categorie] ?? t.categorie)}</span>
          <span class="badge badge-etat etat-${echapper(t.etat)}">${echapper(ETATS[t.etat] ?? t.etat)}</span>
        </span>
      </div>
      <p class="lieu">${echapper(lieuEtSurface(t))}</p>
      ${vainqueurTennis}
      ${palmares}
    </a>`;
}

/**
 * @param {Array} tournois
 * @param {{race?: object|null, anneeCourante?: number|null, classements?: Map}} [options] la Race s'affiche en haut de la saison en cours ;
 *   classements : Map(idTournoi → classementTournoi) pour le trophée et les scores des tournois terminés ;
 *   joueurs : Map(idTennis → joueur) pour le nom du vainqueur de chaque tournoi terminé
 */
/** Onglets des saisons (de la plus récente à la plus ancienne) ; la saison affichée est marquée. */
export function htmlOngletsSaisons(annees, affichee) {
  if (annees.length < 2) return '';
  return `<nav class="onglets-saisons" aria-label="Saisons">${annees.map((a) => `<a href="#/saison/${encodeURIComponent(a)}"${a === affichee ? ' aria-current="page"' : ''}>${echapper(a)}</a>`).join('')}</nav>`;
}

/**
 * Liste des tournois. Sans `anneeAffichee`, toutes les saisons à la suite ; avec, une seule saison et des onglets
 * pour passer de l'une à l'autre (la saison en cours existe toujours, même sans tournoi).
 */
export function htmlListeTournois(tournois, { race = null, anneeCourante = null, anneeAffichee = null, classements = new Map(), joueurs = new Map(), moi = null } = {}) {
  const annees = grouperParAnnee(tournois);
  if (race && anneeCourante && !annees.some((a) => a.annee === anneeCourante)) {
    annees.unshift({ annee: anneeCourante, tournois: [] });
    annees.sort((a, b) => b.annee - a.annee);
  }
  if (annees.length === 0) {
    return `<section class="carte"><h2>Tournois</h2><p>Aucun tournoi pour le moment.</p></section>`;
  }
  const choisie = anneeAffichee !== null && annees.some((a) => a.annee === anneeAffichee) ? anneeAffichee : null;
  const visibles = choisie === null ? annees : annees.filter((a) => a.annee === choisie);
  return `${anneeAffichee !== null ? htmlOngletsSaisons(annees.map((a) => a.annee), choisie ?? anneeCourante) : ''}${visibles.map(({ annee, tournois: liste }) => `
    <section>
      <h2 class="titre-annee titre-saison">Saison ${echapper(annee)}</h2>
      ${race && annee === anneeCourante ? htmlRace(race, { lienPalmares: anneeAffichee !== null }) : ''}
      ${race && annee !== anneeCourante && liste.some((t) => t.etat === 'clos') ? `<p class="lien-archive"><a href="#/race/${encodeURIComponent(annee)}">Race ${echapper(annee)} : classement final ›</a></p>` : ''}
      ${liste.length ? liste.map((t) => htmlCarteTournoi(t, classements.get(t.id) ?? null, joueurs, moi)).join('') : '<p class="vide">Aucun tournoi pour cette saison.</p>'}
    </section>`).join('')}`;
}

/* ---------- Classement d'un tournoi (3 temps) ---------- */
const casePoints = (c, classe = '') => `<td class="${[classe, c.negatif ? 'neg' : '', c.positif ? 'pos' : ''].filter(Boolean).join(' ')}">${echapper(c.texte)}</td>`;

export function htmlClassementTournoi(classement, { moi = null, tournoi = null } = {}) {
  if (!classement || classement.lignes.length === 0) return '';
  const clos = classement.cloture;
  // tournoi terminé : le trophée suit le nom du (ou des) premier(s) du classement
  const trophee = tournoi && clos ? htmlTrophee(tournoi.categorie, tournoi.nom, tournoi) : '';
  const nom = (l) => `${htmlPastille(l, 'pastille pastille-petite')}<span>${echapper(l.prenom)}</span>${trophee && l.rang === 1 ? `<span class="trophee-vainqueur">${trophee}</span>` : ''}`;
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

/* ---------- Page « Race » : classement de l'année, détail par tournoi et évolution ---------- */
const MEDAILLES = { 1: ['🥇', '1re place'], 2: ['🥈', '2e place'], 3: ['🥉', '3e place'] };

/** Graphe « Évolution » : une courbe par joueur, écart (négatif) avec le joueur en tête de la Race après chaque tournoi. */
export function htmlEvolutionRace(evolution) {
  const n = evolution.tournois.length;
  if (n === 0 || evolution.series.length === 0) return '';
  const L = 88; const R = 20; const H = 360; const haut = 16; const bas = 150; const largeur = 640;
  const plusGrand = Math.max(0, ...evolution.series.flatMap((s) => s.ecarts.map((e) => -e)));
  const pas = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000].find((p) => Math.ceil(plusGrand / p) <= 5) ?? 1000;
  const ymax = Math.max(pas, Math.ceil(plusGrand / pas) * pas);
  const X = (i) => (n === 1 ? L + (largeur - L - R) / 2 : L + ((largeur - L - R) * i) / (n - 1));
  // 0 (le meneur) en haut, −ymax en bas
  const Y = (v) => haut + (H - haut - bas) * (-v / ymax);
  const nb = (x) => Math.round(x * 10) / 10;
  const texte = (v) => (v === 0 ? '0' : `${v < 0 ? '−' : '+'}${nb(Math.abs(v)).toString().replace('.', ',')}`);
  const graduations = [];
  for (let v = 0; v >= -ymax; v -= pas) graduations.push(v);
  const grille = graduations.map((v) => `<line class="evo-grille" x1="${L}" x2="${largeur - R}" y1="${nb(Y(v))}" y2="${nb(Y(v))}"/><text class="evo-axe" x="${L - 6}" y="${nb(Y(v) + 4)}" text-anchor="end">${texte(v)}</text>`).join('');
  const court = (nom) => (nom.length > 20 ? `${nom.slice(0, 19)}…` : nom);
  const etiquettes = evolution.tournois.map((t, i) => `<text class="evo-axe" transform="translate(${nb(X(i))} ${H - bas + 12}) rotate(-45)" text-anchor="end">${echapper(court(t.nom))}</text>`).join('');
  const courbes = evolution.series.map((s) => {
    const couleur = /^#[0-9A-Fa-f]{6}$/.test(s.couleur ?? '') ? s.couleur : '#2F6CC2';
    const points = s.ecarts.map((v, i) => `${nb(X(i))},${nb(Y(v))}`).join(' ');
    const ronds = s.ecarts.map((v, i) => `<circle cx="${nb(X(i))}" cy="${nb(Y(v))}" r="4" fill="${couleur}"><title>${echapper(s.prenom)} · ${echapper(evolution.tournois[i].nom)} : ${v === 0 ? 'en tête de la Race' : `${texte(v)} point${v < -1 ? 's' : ''} sur le premier`}</title></circle>`).join('');
    return `<g class="evo-courbe">${n > 1 ? `<polyline points="${points}" fill="none" stroke="${couleur}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>` : ''}${ronds}</g>`;
  }).join('');
  const legende = evolution.series.map((s) => `<li>${htmlPastille(s, 'pastille pastille-petite')}<span>${echapper(s.prenom)}</span></li>`).join('');
  return `
    <section class="carte carte-evolution">
      <h3>Évolution</h3>
      <p class="small">Retard de chaque joueur, en points, sur le premier de la Race après chaque tournoi (0 = en tête).</p>
      <svg class="evo-svg" viewBox="0 0 ${largeur} ${H}" role="img" aria-label="Évolution de la Race ${echapper(evolution.tournois.length)} tournoi${n > 1 ? 's' : ''}">
        ${grille}${etiquettes}${courbes}
      </svg>
      <ul class="evo-legende">${legende}</ul>
    </section>`;
}

/** Tableau « Détail des points » : par parieur, matchs, sets, pari vainqueur/finaliste, bonification, total. */
function htmlDetailPoints(detailPoints, moi) {
  if (!detailPoints?.length) return '';
  const lignes = [...detailPoints.filter((d) => d.id === moi), ...detailPoints.filter((d) => d.id !== moi)];
  const td = (c, classe = '') => `<td class="${[classe, c.negatif ? 'neg' : ''].filter(Boolean).join(' ')}">${echapper(c.texte)}</td>`;
  return `
    <section class="carte carte-detail-points">
      <h3>Détail des points</h3>
      <div class="tableau-defilant"><table class="detail-points">
        <thead><tr><th></th><th scope="col">Matchs</th><th scope="col">Sets</th><th scope="col">Vainqueur et finaliste</th><th scope="col">Bonification</th><th scope="col">Total</th></tr></thead>
        <tbody>${lignes.map((d) => `<tr class="${d.id === moi ? 'isme' : ''}"><th scope="row" class="col-nom">${htmlPastille(d, 'pastille pastille-petite')}<span>${echapper(d.prenom)}</span></th>${td(d.matchs)}${td(d.sets)}${td(d.pari)}${td(d.bonus)}${td(d.total, 'total')}</tr>`).join('')}</tbody>
      </table></div>
      <p class="small">Points des paris de match, du nombre de sets (Grand Chelem), du pari sur le vainqueur et le finaliste, et des bonifications de 1re et 2e places.</p>
    </section>`;
}

/** Section « par parieur » : un bloc par parieur avec ses (jusqu'à) trois joueurs de tennis. */
function htmlSectionParParieur({ titre, icone, intro, lignes, moi, texteJoueur, vide }) {
  const ordre = [...lignes.filter((l) => l.id === moi), ...lignes.filter((l) => l.id !== moi)];
  const blocs = ordre.map((l) => `
      <li class="bloc-parieur${l.id === moi ? ' isme' : ''}">
        <b class="nom-parieur">${echapper(l.prenom)}</b>
        ${l.joueurs.length ? `<ol class="top3">${l.joueurs.map((j) => `<li>${texteJoueur(j)}</li>`).join('')}</ol>` : `<p class="small">${echapper(vide)}</p>`}
      </li>`).join('');
  return `
    <section class="carte carte-stats">
      <h3><span class="icone-section" aria-hidden="true">${icone}</span>${echapper(titre)}</h3>
      <p class="small">${echapper(intro)}</p>
      <ul class="liste-parieurs">${blocs}</ul>
    </section>`;
}

const lienTournoi = (t) => `<a class="nom-tournoi" href="#/tournoi/${encodeURIComponent(t.id)}">${echapper(t.nom)} ${echapper(t.annee)}</a>`;

function htmlRecords(r) {
  if (!r) return '';
  const rec = (titre, contenu) => `<li class="record"><b>${echapper(titre)}</b><span>${contenu}</span></li>`;
  const gros = (titre, liste) => rec(titre, liste?.length
    ? liste.map((x) => `${lienTournoi(x.tournoi)} · <b>${echapper(x.parieur)}</b> · ${echapper(x.score)} points`).join('<br>') : '<em>pas encore de tournoi terminé</em>');
  const compte = (titre, x) => rec(titre, x
    ? `<b>${echapper(x.noms.join(' et '))}</b> · ${echapper(x.nombre)} fois${x.autres.length ? `<br><small>${x.autres.map((a) => `${echapper(a.prenom)} : ${echapper(a.nombre)}`).join(' · ')}</small>` : ''}`
    : '<em>personne pour l’instant</em>');
  const rr = r.ricRac;
  return `
    <section class="carte carte-stats carte-records">
      <h3><span class="icone-section" aria-hidden="true">🏆</span>Records en tournoi</h3>
      <ul class="liste-records">
        ${gros('Biggest win – Grand Chelem', r.grandChelem)}
        ${gros('Biggest win – Master 1000', r.masters)}
        ${rec('Ric rac !', rr ? `${lienTournoi(rr.tournoi)} · <b>${echapper(rr.premier)}</b> devant <b>${echapper(rr.deuxieme)}</b> · ${echapper(rr.ecart)} point${rr.pluriel ? 's' : ''} d’écart` : '<em>pas encore de tournoi terminé</em>')}
        ${compte('Le grand fou', r.grandFou)}
        ${compte('Le gagne-petit', r.gagnePetit)}
      </ul>
      <p class="small">Scores avant bonification de 1re et 2e places. « Le grand fou » : le plus de paris à 10 ; « Le gagne-petit » : le plus de paris à 6.</p>
    </section>`;
}

function htmlStatsRace(stats, moi) {
  if (!stats) return '';
  return `
    ${htmlSectionParParieur({
    titre: 'Les vaches à lait', icone: '🐄', moi, lignes: stats.vachesALait, vide: 'Aucun joueur n’a encore rapporté de points.',
    intro: 'Les trois joueurs de tennis qui ont rapporté le plus de points à chaque parieur sur l’année (entre parenthèses).',
    texteJoueur: (j) => `${echapper(j.nom)} <span class="valeur">(${echapper(j.points)})</span>`,
  })}
    ${htmlSectionParParieur({
    titre: 'Les chouchous', icone: '❤️', moi, lignes: stats.chouchous, vide: 'Pas encore de joueur vu au moins 5 fois.',
    intro: 'Parmi les joueurs vus au moins 5 fois dans l’année : ceux sur la victoire desquels le parieur a le plus souvent misé (paris sur sa victoire / matchs où l’on pouvait parier sur lui).',
    texteJoueur: (j) => `${echapper(j.nom)} <span class="valeur">${echapper(j.rapport)}</span>`,
  })}
    ${htmlSectionParParieur({
    titre: 'Amours impossibles', icone: '💔', moi, lignes: stats.amoursImpossibles, vide: 'Aucun joueur n’a encore reçu trois paris de sa part.',
    intro: 'Parmi les joueurs sur lesquels le parieur a misé au moins trois fois : ceux qui l’ont le moins souvent récompensé (victoires du joueur / paris sur lui).',
    texteJoueur: (j) => `${echapper(j.nom)} <span class="valeur">${echapper(j.rapport)}</span>`,
  })}
    ${htmlRecords(stats.records)}`;
}

export function htmlPageRace(detail, { moi = null, stats = null } = {}) {
  const classement = detail.colonnes.map((c) => `
      <li class="ligne-race${c.id === moi ? ' isme' : ''}">
        <span class="rang">${echapper(c.rang)}</span>
        ${htmlPastille(c, 'pastille pastille-petite')}
        <span class="nom-race">${echapper(c.prenom)}${htmlTropheesRace(c)}</span>
        <span class="points-race">${echapper(c.points)}</span>
      </li>`).join('');
  // dans le tableau détaillé, le joueur du compte est toujours en première colonne
  const colonnes = [...detail.colonnes.filter((c) => c.id === moi), ...detail.colonnes.filter((c) => c.id !== moi)];
  const entetes = colonnes.map((c) => `<th scope="col" class="col-joueur">${htmlPastille(c, 'pastille pastille-detail')}<span>${echapper(c.prenom)}</span></th>`).join('');
  const cellule = (x) => {
    const medaille = x.rang && MEDAILLES[x.rang] ? `<span class="medaille" role="img" aria-label="${MEDAILLES[x.rang][1]}">${MEDAILLES[x.rang][0]}</span>` : '';
    const score = x.gagnant ? `<span class="cadre-gagnant">${echapper(x.texte)}</span>` : echapper(x.texte);
    return `<td class="${[x.negatif ? 'neg' : '', x.gagnant ? 'gagnant' : ''].filter(Boolean).join(' ')}"><span class="cellule-score">${medaille}${score}</span></td>`;
  };
  const lignes = detail.tournois.map((t) => `
      <tr><th scope="row"><a class="nom-tournoi" href="#/tournoi/${encodeURIComponent(t.id)}">${htmlTrophee(t.categorie, t.nom, t)}${echapper(t.nom)}</a><small>${echapper(CATEGORIES[t.categorie] ?? t.categorie)}</small></th>
        ${colonnes.map((c) => cellule(t.cellules[c.id])).join('')}</tr>`).join('');
  const total = colonnes.map((c) => `<td>${echapper(c.points)}</td>`).join('');
  return `
    <section class="hero hero-race">
      <a class="retour retour-clair" href="#/saison">← Saison ${echapper(detail.annee)}</a>
      <h2 class="hero-titre">Race ${echapper(detail.annee)}</h2>
      <p class="hero-details">${detail.tournoisClos === 0 ? 'Aucun tournoi terminé pour l’instant.' : `Somme des scores finaux de ${detail.tournoisClos} tournoi${detail.tournoisClos > 1 ? 's' : ''} terminé${detail.tournoisClos > 1 ? 's' : ''}.`}</p>
    </section>
    <section class="carte carte-race race-saison"><h3>Classement</h3><ol class="liste-race">${classement}</ol></section>
    ${detail.tournoisClos === 0 ? '' : htmlDetailPoints(stats?.detailPoints, moi)}
    ${detail.tournoisClos === 0 ? '<p class="vide">La Race bouge à la clôture de chaque tournoi.</p>' : `
    <section class="carte carte-detail-race">
      <h3>Détail par tournoi</h3>
      <div class="tableau-defilant"><table class="detail-race">
        <thead><tr><th></th>${entetes}</tr></thead>
        <tbody>${lignes}</tbody>
        <tfoot><tr><th scope="row">Total Race ${echapper(detail.annee)}</th>${total}</tr></tfoot>
      </table></div>
      <p class="small">Score final de chaque tournoi (après pari tournoi et bonus de classement), précédé d’une médaille pour les trois premières places ; le score du vainqueur est encadré.</p>
    </section>
    ${htmlEvolutionRace(detail.evolution)}
    ${htmlStatsRace(stats, moi)}`}`;
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
  const aParier = matchsAParier(matchs, contexte);
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
    const restants = s.matchs.filter((m) => aParier.has(m.id)).length;
    const pastille = restants > 0 ? `<span class="reste" title="Paris restant à faire">${restants} à parier</span>` : '';
    return `<details class="tour${s.termine ? ' tour-termine' : ''}"${s.courant ? ' open' : ''}>
           <summary><span>${echapper(s.libelle)}${pastille}</span><span class="compte">${s.matchs.length} match${s.matchs.length > 1 ? 's' : ''}${s.termine ? ' · terminé' : ''}${monBilan}</span></summary>
           ${bilanComplet}
           ${htmlBaremeTour(tournoi.categorie, s.tour, contexte.moteur)}
           <div class="matchs">${s.matchs.map((m) => htmlCarteMatch(m, contexte)).join('')}</div>
         </details>`;
  };

  return `
    <section class="hero categorie-${echapper(tournoi.categorie)}">
      <a class="retour retour-clair" href="#/saison">← Saison ${echapper(tournoi.annee)}</a>
      <h2 class="hero-titre">${echapper(tournoi.nom)}${htmlTrophee(tournoi.categorie, tournoi.nom, tournoi)}</h2>
      <p class="hero-details">${echapper(details)}</p>
      <span class="badge badge-etat etat-${echapper(tournoi.etat)}">${echapper(ETATS[tournoi.etat] ?? tournoi.etat)}</span>
      ${vainqueur ? `<p class="palmares">Vainqueur : <strong>${echapper(vainqueur.nom)}</strong>${finaliste ? ` · finaliste : ${echapper(finaliste.nom)}` : ''}</p>` : ''}
      ${htmlProgression(sections)}
    </section>
    ${ctx.classement ? htmlClassementTournoi(ctx.classement, { moi: ctx.moi, tournoi }) : ''}
    ${ctx.parisTournoi !== undefined ? htmlSectionPariTournoi({ tournoi, matchs, joueurs, ctx: contextePariTournoi(ctx) }) : ''}
    ${sections.map(htmlSection).join('')}`;
}

export function htmlErreur(message) {
  return `<section class="carte"><h2>Oups</h2><p class="erreur">${echapper(message)}</p><p><a href="#/">Retour à l’accueil</a></p></section>`;
}
