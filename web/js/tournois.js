// Logique d'affichage des tournois et des matchs (pure, testable).

export const CATEGORIES = { grand_slam: 'Grand Chelem', masters_1000: 'Masters 1000', atp_finals: 'ATP Finals' };
export const SURFACES = { dur: 'dur', terre: 'terre battue', gazon: 'gazon' };
export const ETATS = {
  a_venir: 'À venir',
  pari_tournoi_ouvert: 'Pari tournoi ouvert',
  en_cours: 'En cours',
  clos: 'Terminé',
};
export const LIBELLES_TOURS = {
  R16: 'Huitièmes de finale',
  QF: 'Quarts de finale',
  SF: 'Demi-finales',
  F: 'Finale',
  RR: 'Round Robin',
};
export const LIBELLES_COURTS = {
  R16: 'Huitièmes',
  QF: 'Quarts',
  SF: 'Demies',
  F: 'Finale',
  RR: 'Round Robin',
};

/** Tours dans l'ordre d'affichage (cahier des charges, 12.2 : ATP Finals = poules, demi-finales, finale). */
export function ordreTours(categorie) {
  return categorie === 'atp_finals' ? ['RR', 'SF', 'F'] : ['R16', 'QF', 'SF', 'F'];
}

/** Un match est « terminé » pour l'affichage s'il est fini ou neutralisé. */
export function matchTermine(match) {
  return match.statut === 'termine' || match.neutralise === true;
}

function comparerMatchs(a, b) {
  const ta = a.heure_prevue ? Date.parse(a.heure_prevue) : Infinity;
  const tb = b.heure_prevue ? Date.parse(b.heure_prevue) : Infinity;
  return ta === tb ? a.id - b.id : ta - tb;
}

/**
 * Regroupe les matchs par tour.
 * Renvoie une section par tour de la catégorie, dans l'ordre : { tour, libelle, matchs, aVenir, termine, courant }.
 *  - aVenir : aucune affiche connue pour ce tour (section grisée) ;
 *  - termine : tous les matchs du tour sont terminés ou neutralisés ;
 *  - courant : le premier tour qui contient un match non terminé (le seul déplié).
 */
export function grouperParTour(matchs, categorie) {
  const sections = ordreTours(categorie).map((tour) => {
    const liste = (matchs ?? []).filter((m) => m.tour === tour).sort(comparerMatchs);
    return {
      tour,
      libelle: LIBELLES_TOURS[tour],
      matchs: liste,
      aVenir: liste.length === 0,
      termine: liste.length > 0 && liste.every(matchTermine),
      courant: false,
    };
  });
  const courant = sections.find((s) => s.matchs.length > 0 && !s.termine);
  if (courant) courant.courant = true;
  return sections;
}

/**
 * Score vu du côté du joueur 1 (par défaut) ou du joueur 2 (perspective = 2) : « 7-6 6-4 » ;
 * mention d'abandon ou de forfait. Chaîne vide si rien à montrer.
 */
export function formaterScore(score, finMatch, perspective = 1) {
  if (finMatch === 'forfait') return 'Forfait';
  const jeux = Array.isArray(score?.games) ? score.games : [];
  const texte = jeux
    .filter((s) => Array.isArray(s) && s.length === 2 && s.every((n) => Number.isFinite(n)))
    .map(([a, b]) => (perspective === 2 ? `${b}-${a}` : `${a}-${b}`))
    .join(' ');
  if (finMatch === 'abandon') return texte ? `${texte} (abandon)` : 'Abandon';
  return texte;
}

/** « Alcaraz (1) » ; classement absent toléré. */
export function nomAvecClassement(joueur) {
  if (!joueur) return 'À déterminer';
  return joueur.classement ? `${joueur.nom} (${joueur.classement})` : joueur.nom;
}

/** Années présentes, de la plus récente à la plus ancienne, avec leurs tournois triés par date puis par nom. */
export function grouperParAnnee(tournois) {
  const parAnnee = new Map();
  for (const t of tournois ?? []) {
    if (!parAnnee.has(t.annee)) parAnnee.set(t.annee, []);
    parAnnee.get(t.annee).push(t);
  }
  return [...parAnnee.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([annee, liste]) => ({
      annee,
      tournois: liste.sort((x, y) => {
        const dx = x.date_debut ?? '9999-12-31';
        const dy = y.date_debut ?? '9999-12-31';
        return dx === dy ? x.nom.localeCompare(y.nom, 'fr') : dx.localeCompare(dy);
      }),
    }));
}

/** « Paris · dur · indoor » (ville, surface, puis « indoor » si le tournoi se joue en salle). */
export function lieuEtSurface(t) {
  return [t.ville, t.surface ? SURFACES[t.surface] : null, t.indoor ? 'indoor' : null].filter(Boolean).join(' · ');
}

/**
 * Barre de progression des tours (en-tête de la page tournoi, maquette 1).
 * Chaque étape : { tour, libelle, etat: 'fait' | 'en-cours' | 'a-venir', balle }.
 * La balle de tennis marque le tour en cours ; tournoi entièrement joué : tout est « fait » et la balle est sur la finale.
 */
export function etapesProgression(sections) {
  const aDesMatchs = sections.some((s) => !s.aVenir);
  const fini = aDesMatchs && !sections.some((s) => s.courant) && sections.filter((s) => !s.aVenir).every((s) => s.termine)
    && sections[sections.length - 1].termine;
  return sections.map((s, i) => {
    let etat = 'a-venir';
    if (s.courant) etat = 'en-cours';
    else if (s.termine) etat = 'fait';
    return {
      tour: s.tour,
      libelle: LIBELLES_COURTS[s.tour],
      etat,
      balle: s.courant || (fini && i === sections.length - 1),
    };
  });
}
