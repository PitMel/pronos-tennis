// Statistiques de la page « Race » : détail des points, vaches à lait, chouchous, amours impossibles, records en tournoi.
// Fonctions pures. Le moteur est passé en paramètre (comme dans classement.js). Tout porte sur les tournois TERMINÉS de l'année.

const cmp = (a, b) => a.localeCompare(b, 'fr');

/** Pari de la base → pari du moteur. */
const pariMoteur = (b, avecSets = true) => ({ choix: b.choix, confiance: b.confiance, sets: avecSets ? (b.sets ?? undefined) : undefined });

function matchMoteur(m, categorie) {
  return {
    categorie, tour: m.tour, vainqueur: m.vainqueur ?? null, setsJoues: m.sets_joues ?? undefined,
    finMatch: m.fin_match ?? 'normal', neutralise: Boolean(m.neutralise),
  };
}

/** Un match dont le résultat compte pour les statistiques : terminé avec un vainqueur (1 ou 2), non neutralisé. */
const matchJoue = (m) => !m.neutralise && (m.vainqueur === 1 || m.vainqueur === 2);

/**
 * @param {object} p
 * @param {object} p.moteur
 * @param {number} p.annee
 * @param {Array} p.tournois         tous les tournois
 * @param {Array} p.resultats        archives de clôture (tournament_results)
 * @param {Array} p.profils          parieurs du groupe, déjà rangés comme la Race (colonnes)
 * @param {Array} p.matchs           lignes de matches_visibles des tournois terminés de l'année
 * @param {Map}   p.paris            Map(idMatch → Map(idProfil → pari))
 * @param {Array} p.parisTournoi     lignes de tournament_bets des tournois terminés de l'année
 * @param {Map}   p.joueurs          Map(idTennis → { nom })
 */
export function statsRace({ moteur, annee, tournois, resultats, profils, matchs, paris, parisTournoi, joueurs }) {
  const { Fraction, ZERO } = moteur;
  const clos = tournois.filter((t) => t.annee === annee && t.etat === 'clos');
  const parId = new Map(clos.map((t) => [t.id, t]));
  const idsProfils = new Set(profils.map((x) => x.id));
  const prenom = new Map(profils.map((x) => [x.id, x.prenom]));
  const nomJoueur = (id) => joueurs?.get(id)?.nom ?? '—';
  const archives = resultats.filter((r) => parId.has(r.tournament_id) && idsProfils.has(r.joueur_id));
  const lesMatchs = matchs.filter((m) => parId.has(m.tournament_id));
  const parisDe = (m) => paris?.get(m.id) ?? new Map();

  const cellule = (v) => ({ texte: moteur.formaterPoints(v, { signe: false }), negatif: v.comparer(ZERO) < 0, positif: v.comparer(ZERO) > 0 });
  const somme = (liste, champ) => liste.reduce((s, r) => s.plus(Fraction.de(r[champ] ?? '0')), ZERO);

  // ---------- points d'un pari de match, et part due au nombre de sets ----------
  const pointsDuPari = (m, bet) => {
    const t = parId.get(m.tournament_id);
    try {
      const avec = moteur.pointsPari(pariMoteur(bet), matchMoteur(m, t.categorie));
      const sans = moteur.pointsPari(pariMoteur(bet, false), matchMoteur(m, t.categorie));
      return { total: avec, sets: avec.moins(sans) };
    } catch {
      return null;
    }
  };

  // ---------- 1. Détail des points ----------
  const setsParProfil = new Map(profils.map((x) => [x.id, ZERO]));
  for (const m of lesMatchs) {
    if (m.neutralise) continue;
    for (const [id, bet] of parisDe(m)) {
      if (!idsProfils.has(id)) continue;
      const r = pointsDuPari(m, bet);
      if (r) setsParProfil.set(id, setsParProfil.get(id).plus(r.sets));
    }
  }
  const detailPoints = profils.map((x) => {
    const siens = archives.filter((r) => r.joueur_id === x.id);
    const sets = setsParProfil.get(x.id);
    const matchsHorsSets = somme(siens, 'points_matchs').moins(sets);
    const pari = somme(siens, 'points_pari_tournoi');
    const bonus = somme(siens, 'bonus_classement');
    return {
      id: x.id, prenom: x.prenom, couleur: x.couleur ?? null, photo_url: x.photo_url ?? null,
      matchs: cellule(matchsHorsSets), sets: cellule(sets), pari: cellule(pari), bonus: cellule(bonus),
      total: cellule(matchsHorsSets.plus(sets).plus(pari).plus(bonus)),
    };
  });

  // ---------- 2. Vaches à lait : points cumulés par joueur de tennis sur lequel le parieur a parié ----------
  const gainsParProfil = new Map(profils.map((x) => [x.id, new Map()]));
  const crediter = (profil, joueurId, v) => {
    const m = gainsParProfil.get(profil);
    m.set(joueurId, (m.get(joueurId) ?? ZERO).plus(v));
  };
  for (const m of lesMatchs) {
    if (m.neutralise) continue;
    for (const [id, bet] of parisDe(m)) {
      if (!idsProfils.has(id)) continue;
      const r = pointsDuPari(m, bet);
      if (r) crediter(id, bet.choix === 1 ? m.p1_id : m.p2_id, r.total);
    }
  }
  // pari tournoi : points rapportés par chaque joueur choisi (finale atteinte, et victoire pour le vainqueur choisi)
  for (const l of parisTournoi) {
    const t = parId.get(l.tournament_id);
    if (!t || !idsProfils.has(l.joueur_id) || !t.vainqueur_id || !t.finaliste_id) continue;
    const x = moteur.POINTS_PARI_TOURNOI[t.categorie];
    const enFinale = (j) => j === t.vainqueur_id || j === t.finaliste_id;
    if (l.vainqueur_id) {
      let v = ZERO;
      if (enFinale(l.vainqueur_id)) v = v.plus(x);
      if (l.vainqueur_id === t.vainqueur_id) v = v.plus(x);
      crediter(l.joueur_id, l.vainqueur_id, v);
    }
    if (l.finaliste_id && enFinale(l.finaliste_id)) crediter(l.joueur_id, l.finaliste_id, x);
  }
  const vachesALait = profils.map((x) => ({
    id: x.id, prenom: x.prenom,
    joueurs: [...gainsParProfil.get(x.id)]
      .filter(([, v]) => v.comparer(ZERO) > 0)
      .map(([id, v]) => ({ id, nom: nomJoueur(id), points: moteur.formaterPoints(v, { signe: false }), valeur: v }))
      .sort((a, b) => b.valeur.comparer(a.valeur) || cmp(a.nom, b.nom))
      .slice(0, 3).map(({ valeur, ...reste }) => reste),
  }));

  // ---------- 3 et 4. Chouchous et amours impossibles ----------
  const apparitions = new Map();
  for (const m of lesMatchs) {
    if (m.neutralise) continue;
    for (const j of [m.p1_id, m.p2_id]) if (j !== null && j !== undefined) apparitions.set(j, (apparitions.get(j) ?? 0) + 1);
  }
  const paries = new Map(profils.map((x) => [x.id, new Map()])); // profil → joueur → { paris, victoires } (matchs joués)
  const surLaVictoire = new Map(profils.map((x) => [x.id, new Map()])); // profil → joueur → nombre de paris sur sa victoire
  for (const m of lesMatchs) {
    if (m.neutralise) continue;
    for (const [id, bet] of parisDe(m)) {
      if (!idsProfils.has(id)) continue;
      const joueur = bet.choix === 1 ? m.p1_id : m.p2_id;
      if (joueur === null || joueur === undefined) continue;
      surLaVictoire.get(id).set(joueur, (surLaVictoire.get(id).get(joueur) ?? 0) + 1);
      if (matchJoue(m)) {
        const c = paries.get(id).get(joueur) ?? { paris: 0, victoires: 0 };
        c.paris += 1;
        if (bet.choix === m.vainqueur) c.victoires += 1;
        paries.get(id).set(joueur, c);
      }
    }
  }
  const chouchous = profils.map((x) => ({
    id: x.id, prenom: x.prenom,
    joueurs: [...surLaVictoire.get(x.id)]
      .filter(([j]) => (apparitions.get(j) ?? 0) >= 5)
      .map(([j, n]) => ({ id: j, nom: nomJoueur(j), n, sur: apparitions.get(j) }))
      .sort((a, b) => b.n * a.sur - a.n * b.sur || b.sur - a.sur || b.n - a.n || cmp(a.nom, b.nom))
      .slice(0, 3).map((j) => ({ id: j.id, nom: j.nom, rapport: `${j.n}/${j.sur}` })),
  }));
  const amoursImpossibles = profils.map((x) => ({
    id: x.id, prenom: x.prenom,
    joueurs: [...paries.get(x.id)]
      .filter(([, c]) => c.paris >= 3)
      .map(([j, c]) => ({ id: j, nom: nomJoueur(j), ...c }))
      .sort((a, b) => a.victoires * b.paris - b.victoires * a.paris || b.paris - a.paris || cmp(a.nom, b.nom))
      .slice(0, 3).map((j) => ({ id: j.id, nom: j.nom, rapport: `${j.victoires}/${j.paris}` })),
  }));

  // ---------- 5. Records en tournoi ----------
  const avantBonus = archives.map((r) => ({
    tournoi: parId.get(r.tournament_id), id: r.joueur_id, prenom: prenom.get(r.joueur_id),
    valeur: Fraction.de(r.points_matchs ?? '0').plus(Fraction.de(r.points_pari_tournoi ?? '0')),
  }));
  const infoTournoi = (t) => ({ id: t.id, nom: t.nom, categorie: t.categorie, date_debut: t.date_debut ?? null, annee: t.annee });
  const plusGrosScore = (categorie) => {
    const candidats = avantBonus.filter((a) => a.tournoi.categorie === categorie);
    if (candidats.length === 0) return null;
    const max = candidats.reduce((m, a) => (a.valeur.comparer(m) > 0 ? a.valeur : m), candidats[0].valeur);
    const ex = candidats.filter((a) => a.valeur.comparer(max) === 0)
      .sort((a, b) => String(a.tournoi.date_debut ?? '').localeCompare(String(b.tournoi.date_debut ?? '')) || cmp(a.prenom, b.prenom));
    return ex.map((a) => ({ tournoi: infoTournoi(a.tournoi), parieur: a.prenom, score: moteur.formaterPoints(a.valeur, { signe: false }) }));
  };
  let ricRac = null;
  for (const t of clos) {
    const scores = avantBonus.filter((a) => a.tournoi.id === t.id).sort((a, b) => b.valeur.comparer(a.valeur) || cmp(a.prenom, b.prenom));
    if (scores.length < 2) continue;
    const ecart = scores[0].valeur.moins(scores[1].valeur);
    if (ricRac === null || ecart.comparer(ricRac.valeur) < 0) {
      ricRac = { valeur: ecart, pluriel: ecart.comparer(moteur.f(2)) >= 0, tournoi: infoTournoi(t), premier: scores[0].prenom, deuxieme: scores[1].prenom, ecart: moteur.formaterPoints(ecart, { signe: false }) };
    }
  }
  if (ricRac) delete ricRac.valeur;

  const compterConfiance = (confiance) => {
    const nb = new Map(profils.map((x) => [x.id, 0]));
    for (const m of lesMatchs) for (const [id, bet] of parisDe(m)) if (nb.has(id) && bet.confiance === confiance) nb.set(id, nb.get(id) + 1);
    const max = Math.max(0, ...nb.values());
    if (max === 0) return null;
    return {
      noms: profils.filter((x) => nb.get(x.id) === max).map((x) => x.prenom),
      nombre: max,
      autres: profils.filter((x) => nb.get(x.id) !== max).map((x) => ({ id: x.id, prenom: x.prenom, nombre: nb.get(x.id) })),
    };
  };

  return {
    detailPoints, vachesALait, chouchous, amoursImpossibles,
    records: {
      grandChelem: plusGrosScore('grand_slam'),
      masters: plusGrosScore('masters_1000'),
      ricRac,
      grandFou: compterConfiance(10),
      gagnePetit: compterConfiance(6),
    },
  };
}
