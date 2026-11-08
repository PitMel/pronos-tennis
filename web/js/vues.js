// Construction du HTML des écrans (fonctions pures : données → texte HTML). Tout texte vient échappé.
import { echapper, formaterPeriode } from './outils.js';
import {
  CATEGORIES, ETATS, grouperParTour, grouperParAnnee, lieuEtSurface, etapesProgression,
} from './tournois.js';
import { htmlCarteMatch, htmlBaremeTour, bilanDuTour, matchsAParier } from './cartes.js';
import { htmlSectionPariTournoi, contextePariTournoi } from './pari-tournoi.js';
import { htmlTrophee, htmlIconeRecompense } from './trophees.js';
import { htmlLigneRecompenses } from './recompenses.js';

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

/** Intitulé du classement de l'année : « Race 2026 » en cours de saison, « Classement final 2026 » une fois tous les tournois terminés. */
export const intituleRace = (annee, terminee) => `${terminee ? 'Classement final' : 'Race'} ${annee}`;
const saisonTerminee = (liste) => liste.length > 0 && liste.every((t) => t.etat === 'clos');

export function htmlRace(race, { lienPalmares = false, ligneRecompenses = '' } = {}) {
  const lignes = race.lignes.map((l) => `
    <li class="ligne-race">
      <span class="rang">${echapper(l.rang)}</span>
      ${htmlPastille(l, 'pastille pastille-petite')}
      <span class="nom-race">${echapper(l.prenom)}${htmlTropheesRace(l)}</span>
      <span class="points-race">${echapper(l.points)}</span>
    </li>`).join('');
  const etat = race.tournoisClos === 0
    ? 'Aucun tournoi terminé pour l’instant : la Race bouge à la clôture de chaque tournoi.'
    : race.terminee ? `Saison terminée · ${race.tournoisClos} tournoi${race.tournoisClos > 1 ? 's' : ''}`
      : `${race.tournoisClos} tournoi${race.tournoisClos > 1 ? 's' : ''} terminé${race.tournoisClos > 1 ? 's' : ''}`;
  return `
    <section class="carte carte-race race-saison">
      <h3>${echapper(intituleRace(race.annee, race.terminee))}</h3>
      <p class="sous-race">${echapper(etat)}</p>
      <ol class="liste-race">${lignes}</ol>
      ${ligneRecompenses}
      <a class="lien-detail" href="#/race/${encodeURIComponent(race.annee)}">Détail de la saison ›</a>
      ${lienPalmares ? '<a class="lien-detail lien-palmares" href="#/palmares">Palmarès de la saison ›</a>' : ''}
    </section>`;
}

/* ---------- Page de la saison : classement puis tournois dans l'ordre chronologique ---------- */
function htmlCarteTournoi(t, classement = null, joueurs = new Map(), moi = null, records = null) {
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
    // trophées « Biggest win » et « Full strike » du vainqueur pour ce tournoi, à côté du trophée du tournoi (même taille)
    const prenomsPremiers = new Set(premiers.map((l) => l.prenom));
    const biggest = t.categorie === 'grand_slam' ? records?.grandChelem : t.categorie === 'masters_1000' ? records?.masters : null;
    const iconesGagnant = (biggest?.some((x) => x.tournoi.id === t.id && prenomsPremiers.has(x.parieur))
      ? htmlIconeRecompense(t.categorie === 'grand_slam' ? 'biggest_gc' : 'biggest_m1000', 22) : '')
      + (records?.fullStrike?.some((x) => x.tournoi.id === t.id && prenomsPremiers.has(x.prenom)) ? htmlIconeRecompense('full_strike', 22) : '');
    const strikeDe = (prenom) => records?.strike?.tops.some((x) => x.tournoi.id === t.id && x.prenom === prenom);
    palmares = `<p class="palmares-groupe">${htmlTrophee(t.categorie, t.nom, t)}${iconesGagnant}<span><b>${echapper(premiers.map((l) => l.prenom).join(' et '))}</b>`
      + ` · ${echapper(premiers[0].final.texte)}</span>${lienMoi}</p>`
      + `<p class="scores-groupe">${classement.lignes.map((l) => {
        // score avant bonification (matchs + pari tournoi), puis la bonification du 1er et du 2e entre parenthèses : « Paul 112 (+12) »
        const base = l.avantBonus ?? l.final;
        return `${echapper(l.prenom)} <b class="${base.negatif ? 'neg' : ''}">${echapper(base.texte)}</b>${strikeDe(l.prenom) ? htmlIconeRecompense('strike', 14) : ''}${l.bonus?.positif ? ` <b class="bonus-classement">(${echapper(l.bonus.texte)})</b>` : ''}`;
      }).join(' · ')}</p>`;
    // logos des faits de l'année qui concernent ce tournoi ou l'un de ses matchs, sur une ligne à part en bas
    const faits = [
      ['ric_rac', records?.ricRac], ['berezina', records?.berezina], ['pomme_discorde', records?.pommeDiscorde],
    ].filter(([, liste]) => liste?.some((x) => x.tournoi.id === t.id)).map(([cle]) => htmlIconeRecompense(cle, 26)).join('');
    if (faits) palmares += `<p class="faits-tournoi">${faits}</p>`;
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
export function htmlListeTournois(tournois, { race = null, anneeCourante = null, anneeAffichee = null, classements = new Map(), joueurs = new Map(), moi = null, stats = null } = {}) {
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
      ${race && annee === anneeCourante ? htmlRace(race, { lienPalmares: anneeAffichee !== null, ligneRecompenses: htmlLigneRecompenses(stats?.records, race.lignes) }) : ''}
      ${race && annee !== anneeCourante && liste.some((t) => t.etat === 'clos') ? `<p class="lien-archive"><a href="#/race/${encodeURIComponent(annee)}">Détail de la saison ${echapper(annee)} ›</a></p>` : ''}
      ${liste.length ? liste.map((t) => htmlCarteTournoi(t, classements.get(t.id) ?? null, joueurs, moi, annee === anneeCourante ? stats?.records ?? null : null)).join('') : '<p class="vide">Aucun tournoi pour cette saison.</p>'}
    </section>`).join('')}`;
}

/* ---------- Classement d'un tournoi (3 temps) ---------- */
const casePoints = (c, classe = '') => `<td class="${[classe, c.negatif ? 'neg' : '', c.positif ? 'pos' : ''].filter(Boolean).join(' ')}">${echapper(c.texte)}</td>`;

export function htmlClassementTournoi(classement, { moi = null, tournoi = null } = {}) {
  if (!classement || classement.lignes.length === 0) return '';
  const clos = classement.cloture;
  const tours = classement.tours ?? [];
  // tournoi terminé : le trophée suit le nom du (ou des) premier(s) du classement
  const trophee = tournoi && clos ? htmlTrophee(tournoi.categorie, tournoi.nom, tournoi) : '';
  const nom = (l) => `${htmlPastille(l, 'pastille pastille-petite')}<span>${echapper(l.prenom)}</span>${trophee && l.rang === 1 ? `<span class="trophee-vainqueur">${trophee}</span>` : ''}`;
  // dès les quarts (tournoi en cours) : colonne « Score » = somme des points de matchs déjà obtenus
  const colScore = !clos && tours.some((t) => ['QF', 'SF', 'F'].includes(t.tour));
  const lignes = classement.lignes.map((l) => `
      <tr class="${l.id === moi ? 'isme' : ''}"><td class="rang">${echapper(l.rang)}</td><th scope="row">${nom(l)}</th>
        ${tours.length ? tours.map((t) => casePoints(l.parTour[t.tour])).join('') : casePoints(l.matchs)}${clos ? `${casePoints(l.pari)}${casePoints(l.bonus)}${casePoints(l.final, 'final')}` : ''}${colScore ? casePoints(l.matchs, 'final') : ''}</tr>`).join('');
  let note;
  if (clos) note = 'Score final = points des matchs (par tour) + pari tournoi + bonus de classement. Les chiffres sont figés à la clôture.';
  else if (tournoi?.etat === 'clos') note = 'Aucun score archivé pour ton groupe sur ce tournoi.';
  else if (classement.matchsComptes === 0) note = 'Aucun match compté pour l’instant. Le classement évolue à mesure que les matchs sont terminés ; le pari tournoi et le bonus de classement s’ajoutent à la clôture.';
  else note = `Points de ${classement.matchsComptes} match${classement.matchsComptes > 1 ? 's' : ''} déjà compté${classement.matchsComptes > 1 ? 's' : ''}. Le pari tournoi et le bonus de classement s’ajoutent à la clôture du tournoi ; la Race ne bouge qu’à ce moment-là.`;
  return `
    <section class="carte carte-classement">
      <h3>Classement du tournoi</h3>
      <div class="tableau-defilant"><table class="classement-tournoi">
        <thead><tr><th></th><th></th>${tours.length ? tours.map((t) => `<th>${echapper(t.libelle)}</th>`).join('') : '<th>Matchs</th>'}${clos ? '<th>Pari tournoi</th><th>Bonus</th><th>Score</th>' : ''}${colScore ? '<th>Score</th>' : ''}</tr></thead>
        <tbody>${lignes}</tbody>
      </table></div>
      <p class="small">${echapper(note)}</p>
    </section>`;
}

/* ---------- Page « Race » : classement de l'année, détail par tournoi et évolution ---------- */
const MEDAILLES = { 1: ['🥇', '1re place'], 2: ['🥈', '2e place'], 3: ['🥉', '3e place'] };

/** Graphe « Évolution » : une courbe par joueur, écart (négatif) avec le joueur en tête de la Race après chaque tournoi. */
export function htmlEvolutionRace(evolution, { terminee = false } = {}) {
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
    const ronds = s.ecarts.map((v, i) => `<circle cx="${nb(X(i))}" cy="${nb(Y(v))}" r="4" fill="${couleur}"><title>${echapper(s.prenom)} · ${echapper(evolution.tournois[i].nom)} : ${v === 0 ? (terminee ? 'en tête du classement final' : 'en tête de la Race') : `${texte(v)} point${v < -1 ? 's' : ''} sur le premier`}</title></circle>`).join('');
    return `<g class="evo-courbe">${n > 1 ? `<polyline points="${points}" fill="none" stroke="${couleur}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>` : ''}${ronds}</g>`;
  }).join('');
  const couleurDe = (s) => (/^#[0-9A-Fa-f]{6}$/.test(s.couleur ?? '') ? s.couleur : '#2F6CC2');
  const legende = evolution.series.map((s) => `<li>${htmlPastille(s, 'pastille pastille-petite')}<span style="color:${couleurDe(s)}">${echapper(s.prenom)}</span></li>`).join('');
  return `
    <section class="carte carte-evolution">
      <h3>Évolution</h3>
      <p class="small">Retard de chaque joueur, en points, sur le premier ${terminee ? 'du classement final' : 'de la Race'} après chaque tournoi (0 = en tête).</p>
      <svg class="evo-svg" viewBox="0 0 ${largeur} ${H}" role="img" aria-label="Évolution ${terminee ? 'du classement final' : 'de la Race'} ${echapper(evolution.tournois.length)} tournoi${n > 1 ? 's' : ''}">
        ${grille}${etiquettes}${courbes}
      </svg>
      <ul class="evo-legende">${legende}</ul>
    </section>`;
}

/** Rangs « à la compétition » (ex æquo partagés) de valeurs numériques ; null si tout le monde est à égalité. */
function rangsDesValeurs(valeurs) {
  if (valeurs.every((v) => v === valeurs[0])) return valeurs.map(() => null);
  return valeurs.map((v) => 1 + valeurs.filter((w) => w > v).length);
}

/** Tableau « Détail des points » : par parieur, matchs, sets, pari vainqueur/finaliste, bonification, total. Médaille et cadre selon la place dans chaque colonne. */
function htmlDetailPoints(detailPoints, moi) {
  if (!detailPoints?.length) return '';
  const lignes = [...detailPoints.filter((d) => d.id === moi), ...detailPoints.filter((d) => d.id !== moi)];
  const colonnes = ['matchs', 'sets', 'pari', 'bonus', 'total'];
  const rangs = Object.fromEntries(colonnes.map((c) => [c, rangsDesValeurs(lignes.map((d) => d[c].valeur))]));
  const td = (c, rang, classe = '') => {
    const medaille = rang && MEDAILLES[rang] ? `<span class="medaille" role="img" aria-label="${MEDAILLES[rang][1]}">${MEDAILLES[rang][0]}</span>` : '';
    const score = rang === 1 ? `<span class="cadre-gagnant">${echapper(c.texte)}</span>` : echapper(c.texte);
    return `<td class="${[classe, c.negatif ? 'neg' : '', rang === 1 ? 'gagnant' : ''].filter(Boolean).join(' ')}"><span class="cellule-score">${medaille}${score}</span></td>`;
  };
  return `
    <section class="carte carte-detail-points">
      <h3>Détail des points</h3>
      <div class="tableau-defilant"><table class="detail-points">
        <thead><tr><th></th><th scope="col">Matchs</th><th scope="col">Sets</th><th scope="col">Vainqueur et finaliste</th><th scope="col">Bonification</th><th scope="col">Total</th></tr></thead>
        <tbody>${lignes.map((d, i) => `<tr class="${d.id === moi ? 'isme' : ''}"><th scope="row" class="col-nom">${htmlPastille(d, 'pastille pastille-petite')}<span>${echapper(d.prenom)}</span></th>${colonnes.map((c) => td(d[c], rangs[c][i], c === 'total' ? 'total' : '')).join('')}</tr>`).join('')}</tbody>
      </table></div>
      <p class="small">Points des paris de match, du nombre de sets (Grand Chelem), du pari sur le vainqueur et le finaliste, et des bonifications de 1re et 2e places. Médaille et cadre : place de chaque joueur dans la colonne.</p>
    </section>`;
}

/** Section « par parieur » : une colonne par parieur avec ses (jusqu'à) cinq joueurs de tennis. */
function htmlSectionParParieur({ titre, icone, intro, lignes, moi, texteJoueur, vide }) {
  const ordre = [...lignes.filter((l) => l.id === moi), ...lignes.filter((l) => l.id !== moi)];
  const colonnes = ordre.map((l) => `
      <li class="colonne-parieur${l.id === moi ? ' isme' : ''}">
        <b class="nom-parieur">${echapper(l.prenom)}</b>
        ${l.joueurs.length ? `<ol class="top5">${l.joueurs.map((j) => `<li>${texteJoueur(j)}</li>`).join('')}</ol>` : `<p class="small">${echapper(vide)}</p>`}
      </li>`).join('');
  return `
    <section class="carte carte-stats">
      <h3><span class="icone-section" aria-hidden="true">${icone}</span>${echapper(titre)}</h3>
      <p class="small">${echapper(intro)}</p>
      <ul class="liste-parieurs" style="--n:${ordre.length || 1}">${colonnes}</ul>
    </section>`;
}

const taux = (x) => `${echapper(x.ok)}/${echapper(x.sur)} (${echapper(x.pourcentage)}&nbsp;%)`;

function htmlBerezina(b) {
  const lignes = b.parieurs.map((x) => (x.points === null
    ? `<li>${echapper(x.prenom)} : n’a pas parié</li>`
    : `<li>${echapper(x.prenom)} (${echapper(x.choix)}) : <span class="${x.negatif ? 'neg' : ''}">${echapper(x.points)}</span></li>`)).join('');
  return `${lienTournoi(b.tournoi)} · ${echapper(b.tour)}<br><b>${echapper(b.vainqueur)}</b> bat ${echapper(b.perdant)}${b.score ? ` · ${echapper(b.score)}` : ''}<br><small>Total des parieurs : <span class="${b.total.startsWith('−') ? 'neg' : ''}">${echapper(b.total)}</span></small><ul class="detail-berezina">${lignes}</ul>`;
}

function htmlPommeDiscorde(p) {
  const paires = p.paires.map(([a, b]) => `<b>${echapper(a.prenom)}</b> (${echapper(a.confiance)} sur ${echapper(a.choix)}) contre <b>${echapper(b.prenom)}</b> (${echapper(b.confiance)} sur ${echapper(b.choix)})`).join('<br>');
  return `${lienTournoi(p.tournoi)} · ${echapper(p.tour)}<br>${echapper(p.joueur1)} – ${echapper(p.joueur2)} · vainqueur : ${echapper(p.vainqueur)}<br>${paires}<br><small>Écart : ${echapper(p.ecart)}</small>`;
}

/** Courbes de la confiance : abscisse = valeur du pari (6 à 10), ordonnée = part des paris du parieur (%), une courbe par parieur. */
export function htmlCourbesConfiance(confiances) {
  const W = 640; const H = 300; const L = 52; const R = 24; const haut = 16; const bas = 46;
  const plusGrand = Math.max(0, ...confiances.flatMap((c) => c.repartition.map((r) => r.pourcentage)));
  const pas = plusGrand <= 20 ? 5 : plusGrand <= 50 ? 10 : 20;
  const ymax = Math.max(pas, Math.ceil(plusGrand / pas) * pas);
  const X = (i) => L + ((W - L - R) * i) / 4;
  const Y = (v) => haut + (H - haut - bas) * (1 - v / ymax);
  const nb = (x) => Math.round(x * 10) / 10;
  const grille = [];
  for (let v = 0; v <= ymax; v += pas) grille.push(`<line class="evo-grille" x1="${L}" x2="${W - R}" y1="${nb(Y(v))}" y2="${nb(Y(v))}"/><text class="evo-axe" x="${L - 6}" y="${nb(Y(v) + 4)}" text-anchor="end">${v} %</text>`);
  const abscisses = [6, 7, 8, 9, 10].map((v, i) => `<text class="evo-axe" x="${nb(X(i))}" y="${H - bas + 20}" text-anchor="middle">${v}</text>`).join('');
  const courbes = confiances.map((c) => {
    const couleur = /^#[0-9A-Fa-f]{6}$/.test(c.couleur ?? '') ? c.couleur : '#2F6CC2';
    const points = c.repartition.map((r, i) => `${nb(X(i))},${nb(Y(r.pourcentage))}`).join(' ');
    const ronds = c.repartition.map((r, i) => `<circle cx="${nb(X(i))}" cy="${nb(Y(r.pourcentage))}" r="4" fill="${couleur}"><title>${echapper(c.prenom)} · pari à ${r.confiance} : ${echapper(r.n)} fois (${echapper(r.pourcentage)} %)</title></circle>`).join('');
    return `<g class="evo-courbe"><polyline points="${points}" fill="none" stroke="${couleur}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>${ronds}</g>`;
  }).join('');
  const legende = confiances.map((c) => (c.sansPastille
    ? `<li><i class="pt-legende" style="background:${/^#[0-9A-Fa-f]{6}$/.test(c.couleur ?? '') ? c.couleur : '#2F6CC2'}"></i><span>${echapper(c.prenom)}</span></li>`
    : `<li>${htmlPastille(c, 'pastille pastille-petite')}<span>${echapper(c.prenom)}</span></li>`)).join('');
  return `
      <svg class="evo-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Part des paris à chaque niveau de confiance, une courbe par parieur">
        ${grille.join('')}${abscisses}
        <text class="evo-axe" x="${nb((L + W - R) / 2)}" y="${H - 6}" text-anchor="middle">Valeur du pari</text>
        ${courbes}
      </svg>
      <ul class="evo-legende">${legende}</ul>`;
}

/** Section « Le thermomètre de la confiance » : pour chaque parieur, part des paris (en grand) et nombre (en petit) à 6, 7, 8, 9 et 10, puis courbes. */
function htmlConfiances(confiances, moi) {
  if (!confiances?.length || confiances.every((c) => c.total === 0)) return '';
  const lignes = [...confiances.filter((c) => c.id === moi), ...confiances.filter((c) => c.id !== moi)];
  return `
    <section class="carte carte-stats carte-confiances">
      <h3><span class="icone-section" aria-hidden="true">🌡️</span>Le thermomètre de la confiance</h3>
      <p class="small">Part des paris de match à chaque niveau de confiance (en dessous : nombre de paris).</p>
      <div class="tableau-defilant"><table class="detail-points table-confiances">
        <thead><tr><th></th>${[6, 7, 8, 9, 10].map((c) => `<th scope="col">${c}</th>`).join('')}</tr></thead>
        <tbody>${lignes.map((c) => `<tr class="${c.id === moi ? 'isme' : ''}"><th scope="row" class="col-nom">${htmlPastille(c, 'pastille pastille-petite')}<span>${echapper(c.prenom)}</span></th>${c.repartition.map((r) => `<td><b>${echapper(r.pourcentage)}&nbsp;%</b><small>${echapper(r.n)}</small></td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>
    </section>`;
}

/** Section « Statistiques » : une ligne par joueur ; pourcentage en grand, valeur en dessous en petit. */
function htmlStatistiquesJoueurs(statistiques, moi) {
  if (!statistiques?.length || statistiques.every((x) => !x.vainqueurMatch && !x.sets && !x.vainqueurs && !x.finalistes)) return '';
  const lignes = [...statistiques.filter((x) => x.id === moi), ...statistiques.filter((x) => x.id !== moi)];
  const cas = (c) => `<td>${c ? `<b>${echapper(c.pourcentage)}&nbsp;%</b><small>${echapper(c.ok)}/${echapper(c.sur)}</small>` : '<span class="small">—</span>'}</td>`;
  return `
    <section class="carte carte-stats carte-confiances carte-statistiques-joueurs">
      <h3><span class="icone-section" aria-hidden="true">📈</span>Statistiques</h3>
      <p class="small">Part de réussite de chaque joueur (en dessous : réussis / total). Vainqueur du match : sur tous les matchs joués. Nombre de sets : paris du Grand Chelem. Vainqueurs et finalistes : paris tournoi des tournois terminés (deux finalistes par tournoi, dans n’importe quel ordre).</p>
      <div class="tableau-defilant"><table class="detail-points table-confiances">
        <thead><tr><th></th><th scope="col">Vainqueur du match</th><th scope="col">Nombre de sets</th><th scope="col">Vainqueurs</th><th scope="col">Finalistes</th></tr></thead>
        <tbody>${lignes.map((x) => `<tr class="${x.id === moi ? 'isme' : ''}"><th scope="row" class="col-nom">${htmlPastille(x, 'pastille pastille-petite')}<span>${echapper(x.prenom)}</span></th>${cas(x.vainqueurMatch)}${cas(x.sets)}${cas(x.vainqueurs)}${cas(x.finalistes)}</tr>`).join('')}</tbody>
      </table></div>
    </section>`;
}

const lienTournoi = (t) => `<a class="nom-tournoi" href="#/tournoi/${encodeURIComponent(t.id)}">${echapper(t.nom)} ${echapper(t.annee)}</a>`;

const recordLi = (titre, contenu, explication, icone = '') => `<li class="record${icone ? ' record-icone' : ''}">${icone}<b>${echapper(titre)}</b><span>${contenu}</span><small class="explication">${echapper(explication)}</small></li>`;

/** Section « Autres récompenses » : les récompenses « de parieur » (Biggest win, grand fou, gagne-petit, sniper, contradicteur). */
function htmlAutresRecompenses(r, { nbTournois = 0, nbMatchsRecompenses = 0 } = {}) {
  const nbMatchs = nbMatchsRecompenses;
  if (!r) return '';
  const rec = recordLi;
  const gros = (titre, liste, explication, icone) => rec(titre, liste?.length
    ? liste.map((x) => `${lienTournoi(x.tournoi)} · <b>${echapper(x.parieur)}</b> · ${echapper(x.score)} points`).join('<br>') : '<em>pas encore de tournoi terminé</em>', explication, icone);
  const compte = (titre, x, explication, icone) => rec(titre, x
    ? `${x.noms.map((n) => `<b>${echapper(n)}</b> · ${echapper(x.nombre)} fois`).join('<br>')}${x.autres.length ? `<br><small>${x.autres.map((a) => `${echapper(a.prenom)} : ${echapper(a.nombre)}`).join(' · ')}</small>` : ''}`
    : '<em>personne pour l’instant</em>', explication, icone);
  return `
    <section class="carte carte-stats carte-records carte-autres-recompenses">
      <h3><span class="icone-section" aria-hidden="true">🏅</span>Autres récompenses</h3>
      <p class="small">${echapper(nbTournois)} tournoi${nbTournois > 1 ? 's' : ''} terminé${nbTournois > 1 ? 's' : ''} · ${echapper(nbMatchs)} match${nbMatchs > 1 ? 's' : ''}</p>
      <ul class="liste-records">
        ${gros('Biggest win – Grand Chelem', r.grandChelem, 'Meilleur score d’un parieur dans un tournoi du Grand Chelem, avant bonification de 1re et 2e places.', htmlIconeRecompense('biggest_gc'))}
        ${gros('Biggest win – Master 1000', r.masters, 'Meilleur score d’un parieur dans un Masters 1000, avant bonification de 1re et 2e places.', htmlIconeRecompense('biggest_m1000'))}
        ${compte('Le grand fou', r.grandFou, 'Parieur qui a le plus souvent misé avec une confiance de 10 ; les autres chiffres sont ceux des autres parieurs.', htmlIconeRecompense('grand_fou'))}
        ${compte('Le gagne-petit', r.gagnePetit, 'Parieur qui a le plus souvent misé avec une confiance de 6 ; les autres chiffres sont ceux des autres parieurs.', htmlIconeRecompense('gagne_petit'))}
        ${rec('Le sniper', r.sniper ? `${r.sniper.tops.map((x) => `<b>${echapper(x.prenom)}</b> · ${taux(x)}`).join('<br>')}${r.sniper.autres.length ? `<br><small>${r.sniper.autres.map((a) => `${echapper(a.prenom)} : ${taux(a)}`).join(' · ')}</small>` : ''}` : '<em>pas encore de match joué</em>', 'Meilleur taux de bons vainqueurs sur tous les matchs joués (bons vainqueurs / paris) ; dessous, le taux des autres parieurs.', htmlIconeRecompense('sniper'))}
        ${rec('Le strike', r.strike ? `${r.strike.tops.map((x) => `${lienTournoi(x.tournoi)} · <b>${echapper(x.prenom)}</b> · ${taux(x)} bons vainqueurs`).join('<br>')}${r.strike.autres.length ? `<br><small>${r.strike.autres.map((a) => `${echapper(a.prenom)} : ${taux(a)} (${a.tournois.map((t) => echapper(t.nom)).join(', ')})`).join(' · ')}</small>` : ''}` : '<em>pas encore de tournoi terminé</em>', 'Plus grand nombre de bons vainqueurs dans un même tournoi, sur les matchs joués de ce tournoi (tous les ex æquo sont affichés) ; dessous, le meilleur tournoi de chaque autre parieur.', htmlIconeRecompense('strike'))}
        ${rec('Le full strike', r.fullStrike?.length ? r.fullStrike.map((x) => `<b>${echapper(x.prenom)}</b> · ${lienTournoi(x.tournoi)} · ${echapper(x.sur)}/${echapper(x.sur)}`).join('<br>') : '<em>personne pour l’instant</em>', 'Tous les vainqueurs de tous les matchs d’un même tournoi trouvés. Attribué une fois le tournoi terminé, sans attendre la fin de la saison ; plusieurs fois possible, ou jamais.', htmlIconeRecompense('full_strike'))}
        ${rec('Le contradicteur', r.contradicteur ? `${r.contradicteur.tops.map((x) => `<b>${echapper(x.prenom)}</b> · ${echapper(x.bons)} fois raison seul contre tous (sur ${echapper(x.solo)} paris en solitaire)`).join('<br>')}${r.contradicteur.autres.length ? `<br><small>${r.contradicteur.autres.map((a) => `${echapper(a.prenom)} : ${echapper(a.bons)} sur ${echapper(a.solo)}`).join(' · ')}</small>` : ''}` : '<em>personne pour l’instant</em>', 'Nombre de fois où le parieur était seul contre tous (au moins deux autres parieurs, tous sur l’autre joueur) et avait raison ; dessous, le même compteur pour les autres parieurs.', htmlIconeRecompense('contradicteur'))}
      </ul>
    </section>`;
}

/** Section « Faits de l'année » : Ric rac, bérézina, pomme de discorde. */
function htmlRecords(r, { nbTournois = 0, nbMatchs = 0 } = {}) {
  if (!r) return '';
  const rec = recordLi;
  const rr = r.ricRac;
  return `
    <section class="carte carte-stats carte-records">
      <h3><span class="icone-section" aria-hidden="true">📅</span>Faits de l’année</h3>
      <p class="small">${echapper(nbTournois)} tournoi${nbTournois > 1 ? 's' : ''} terminé${nbTournois > 1 ? 's' : ''} · ${echapper(nbMatchs)} match${nbMatchs > 1 ? 's' : ''}</p>
      <ul class="liste-records">
        ${rec('Ric rac !', rr?.length ? rr.map((x) => `${lienTournoi(x.tournoi)} · <b>${echapper(x.premier)}</b> devant <b>${echapper(x.deuxieme)}</b> · ${echapper(x.ecart)} point${x.pluriel ? 's' : ''} d’écart`).join('<br>') : '<em>pas encore de tournoi terminé</em>', 'Tournoi où l’écart entre le 1er et le 2e est le plus faible, avant bonification.', htmlIconeRecompense('ric_rac'))}
        ${rec('La bérézina', r.berezina?.length ? r.berezina.map(htmlBerezina).join('<hr class="sep-record">') : '<em>pas encore de match concerné</em>', 'Match où le total des points gagnés ou perdus par les parieurs est le plus bas (au moins deux paris).', htmlIconeRecompense('berezina'))}
        ${rec('La pomme de discorde', r.pommeDiscorde?.length ? r.pommeDiscorde.map(htmlPommeDiscorde).join('<hr class="sep-record">') : '<em>pas encore de match concerné</em>', 'Match où l’écart entre les paris de deux parieurs est le plus grand : un pari vaut (confiance − 5) pour un joueur et son opposé pour l’autre ; 6 sur A contre 6 sur B = écart de 2, 6 sur A contre 8 sur B = écart de 4.', htmlIconeRecompense('pomme_discorde'))}
      </ul>
    </section>`;
}

function htmlStatsRace(stats, moi) {
  if (!stats) return '';
  return `
    ${htmlSectionParParieur({
    titre: 'Les vaches à lait', icone: '🐄', moi, lignes: stats.vachesALait, vide: 'Aucun joueur n’a encore rapporté de points.',
    intro: 'Les cinq joueurs de tennis qui ont rapporté le plus de points à chaque parieur sur l’année (entre parenthèses).',
    texteJoueur: (j) => `<b>${echapper(j.nom)}</b> <span class="valeur">(${echapper(j.points)})</span>`,
  })}
    ${htmlSectionParParieur({
    titre: 'Les chouchous', icone: '❤️', moi, lignes: stats.chouchous, vide: 'Pas encore de joueur vu au moins 5 fois.',
    intro: 'Parmi les joueurs vus au moins 5 fois dans l’année : ceux sur la victoire desquels le parieur a le plus souvent misé (paris sur sa victoire / matchs où l’on pouvait parier sur lui).',
    texteJoueur: (j) => `<b>${echapper(j.nom)}</b> <span class="valeur">${echapper(j.rapport)} (${echapper(j.pourcentage)}&nbsp;%)</span>`,
  })}
    ${htmlSectionParParieur({
    titre: 'Les amours impossibles', icone: '💔', moi, lignes: stats.amoursImpossibles, vide: 'Aucun joueur n’a encore reçu trois paris de sa part.',
    intro: 'Parmi les joueurs sur lesquels le parieur a misé au moins trois fois : ceux qui l’ont le moins souvent récompensé (victoires du joueur / paris sur lui).',
    texteJoueur: (j) => `<b>${echapper(j.nom)}</b> <span class="valeur">${echapper(j.rapport)} (${echapper(j.pourcentage)}&nbsp;%)</span>`,
  })}
    ${htmlConfiances(stats.confiances, moi)}
    ${htmlStatistiquesJoueurs(stats.statistiques, moi)}
    ${htmlRecords(stats.records, stats)}`;
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
      <h2 class="hero-titre">Détail de la saison ${echapper(detail.annee)}</h2>
      <p class="hero-details">${detail.tournoisClos === 0 ? 'Aucun tournoi terminé pour l’instant.' : `Somme des scores finaux de ${detail.tournoisClos} tournoi${detail.tournoisClos > 1 ? 's' : ''} terminé${detail.tournoisClos > 1 ? 's' : ''}.`}</p>
    </section>
    <section class="carte carte-race race-saison"><h3>Classement</h3><ol class="liste-race">${classement}</ol>${htmlLigneRecompenses(stats?.records, detail.colonnes)}</section>
    ${detail.tournoisClos === 0 ? '' : htmlDetailPoints(stats?.detailPoints, moi)}
    ${detail.tournoisClos === 0 ? `<p class="vide">La Race bouge à la clôture de chaque tournoi.</p>${htmlAutresRecompenses(stats?.records, stats ?? undefined)}` : `
    <section class="carte carte-detail-race">
      <h3>Détail par tournoi</h3>
      <div class="tableau-defilant"><table class="detail-race">
        <thead><tr><th></th>${entetes}</tr></thead>
        <tbody>${lignes}</tbody>
        <tfoot><tr><th scope="row">${detail.terminee ? 'Total du classement final' : 'Total Race'} ${echapper(detail.annee)}</th>${total}</tr></tfoot>
      </table></div>
      <p class="small">Score final de chaque tournoi (après pari tournoi et bonus de classement), précédé d’une médaille pour les trois premières places ; le score du vainqueur est encadré.</p>
    </section>
    ${htmlEvolutionRace(detail.evolution, { terminee: detail.terminee })}
    ${htmlAutresRecompenses(stats?.records, stats ?? undefined)}
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
