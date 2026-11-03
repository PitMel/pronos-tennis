import { formaterScore, LIBELLES_TOURS } from './tournois.js';

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

  const pct = (n, sur) => (sur > 0 ? Math.round((100 * n) / sur) : 0);
  const parDate = (a, b) => String(a.date_debut ?? '').localeCompare(String(b.date_debut ?? '')) || a.id - b.id;
  const cellule = (v) => ({ valeur: v.versNombre(), texte: moteur.formaterPoints(v, { signe: false }), negatif: v.comparer(ZERO) < 0, positif: v.comparer(ZERO) > 0 });
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
      .slice(0, 5).map(({ valeur, ...reste }) => reste),
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
      .slice(0, 5).map((j) => ({ id: j.id, nom: j.nom, rapport: `${j.n}/${j.sur}`, pourcentage: Math.round((100 * j.n) / j.sur) })),
  }));
  const amoursImpossibles = profils.map((x) => ({
    id: x.id, prenom: x.prenom,
    joueurs: [...paries.get(x.id)]
      .filter(([, c]) => c.paris >= 3)
      .map(([j, c]) => ({ id: j, nom: nomJoueur(j), ...c }))
      .sort((a, b) => a.victoires * b.paris - b.victoires * a.paris || b.paris - a.paris || cmp(a.nom, b.nom))
      .slice(0, 5).map((j) => ({ id: j.id, nom: j.nom, rapport: `${j.victoires}/${j.paris}`, pourcentage: Math.round((100 * j.victoires) / j.paris) })),
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
  // Ric rac : tous les tournois dont l'écart entre le 1er et le 2e est le plus faible (ex æquo compris)
  const ecarts = [];
  for (const t of clos) {
    const scores = avantBonus.filter((a) => a.tournoi.id === t.id).sort((a, b) => b.valeur.comparer(a.valeur) || cmp(a.prenom, b.prenom));
    if (scores.length < 2) continue;
    ecarts.push({ t, valeur: scores[0].valeur.moins(scores[1].valeur), premier: scores[0].prenom, deuxieme: scores[1].prenom });
  }
  const plusPetit = ecarts.reduce((m, e) => (m === null || e.valeur.comparer(m) < 0 ? e.valeur : m), null);
  const ricRac = ecarts.length ? ecarts.filter((e) => e.valeur.comparer(plusPetit) === 0).sort((a, b) => parDate(a.t, b.t))
    .map((e) => ({ tournoi: infoTournoi(e.t), pluriel: e.valeur.comparer(moteur.f(2)) >= 0, premier: e.premier, deuxieme: e.deuxieme, ecart: moteur.formaterPoints(e.valeur, { signe: false }) })) : null;

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

  // ---------- Records « paris » : sniper, contradicteur, strike, bérézina ----------

  // Le sniper : meilleur taux de bons vainqueurs sur les matchs joués
  const tirs = new Map(profils.map((x) => [x.id, { ok: 0, sur: 0 }]));
  for (const m of lesMatchs) {
    if (!matchJoue(m)) continue;
    for (const [id, bet] of parisDe(m)) {
      if (!tirs.has(id)) continue;
      const c = tirs.get(id);
      c.sur += 1;
      if (bet.choix === m.vainqueur) c.ok += 1;
    }
  }
  const classeTirs = profils.map((x) => ({ id: x.id, prenom: x.prenom, ...tirs.get(x.id) })).filter((c) => c.sur > 0)
    .sort((a, b) => b.ok * a.sur - a.ok * b.sur || b.sur - a.sur || cmp(a.prenom, b.prenom));
  const formeTir = (c) => ({ id: c.id, prenom: c.prenom, ok: c.ok, sur: c.sur, pourcentage: pct(c.ok, c.sur) });
  const egalTir = (a, b) => a.ok * b.sur === b.ok * a.sur;
  const sniper = classeTirs.length ? {
    tops: classeTirs.filter((c) => egalTir(c, classeTirs[0])).map(formeTir),
    autres: classeTirs.filter((c) => !egalTir(c, classeTirs[0])).map(formeTir),
  } : null;

  // Le contradicteur : seul contre tous (au moins deux autres parieurs, tous d'un avis contraire) et raison
  const contre = new Map(profils.map((x) => [x.id, { bons: 0, solo: 0 }]));
  for (const m of lesMatchs) {
    if (!matchJoue(m)) continue;
    const bets = [...parisDe(m)].filter(([id]) => contre.has(id));
    if (bets.length < 3) continue;
    for (const [id, bet] of bets) {
      if (!bets.every(([autre, b]) => autre === id || b.choix !== bet.choix)) continue;
      contre.get(id).solo += 1;
      if (bet.choix === m.vainqueur) contre.get(id).bons += 1;
    }
  }
  const classeContre = profils.map((x) => ({ id: x.id, prenom: x.prenom, ...contre.get(x.id) }))
    .sort((a, b) => b.bons - a.bons || a.solo - b.solo || cmp(a.prenom, b.prenom));
  const contradicteur = classeContre.length && classeContre[0].bons > 0 ? {
    tops: classeContre.filter((c) => c.bons === classeContre[0].bons),
    autres: classeContre.filter((c) => c.bons !== classeContre[0].bons),
  } : null;

  // Le strike : le plus de bons vainqueurs dans un même tournoi ; pour chacun des autres, son meilleur tournoi (pro rata)
  const joues = new Map(clos.map((t) => [t.id, lesMatchs.filter((m) => m.tournament_id === t.id && matchJoue(m)).length]));
  const bonsParTournoi = [];
  for (const t of clos) {
    for (const x of profils) {
      let ok = 0;
      for (const m of lesMatchs) {
        if (m.tournament_id !== t.id || !matchJoue(m)) continue;
        const bet = parisDe(m).get(x.id);
        if (bet && bet.choix === m.vainqueur) ok += 1;
      }
      if (joues.get(t.id) > 0) bonsParTournoi.push({ t, id: x.id, prenom: x.prenom, ok, sur: joues.get(t.id) });
    }
  }
  const formeStrike = (c) => ({ prenom: c.prenom, tournoi: infoTournoi(c.t), ok: c.ok, sur: c.sur, pourcentage: pct(c.ok, c.sur) });
  const memeScore = (a, b) => a.ok === b.ok && a.ok * b.sur === b.ok * a.sur;
  const classe = [...bonsParTournoi].sort((a, b) => b.ok - a.ok || b.ok * a.sur - a.ok * b.sur || parDate(a.t, b.t) || cmp(a.prenom, b.prenom));
  let strike = null;
  if (classe.length && classe[0].ok > 0) {
    // tous les (parieur, tournoi) à égalité parfaite avec le meilleur sont mis en avant
    const tops = classe.filter((c) => memeScore(c, classe[0]));
    const idsTops = new Set(tops.map((c) => c.id));
    const autres = profils.filter((x) => !idsTops.has(x.id)).map((x) => {
      const siens = bonsParTournoi.filter((c) => c.id === x.id)
        .sort((a, b) => b.ok * a.sur - a.ok * b.sur || b.ok - a.ok || parDate(a.t, b.t));
      if (siens.length === 0) return null;
      const egaux = siens.filter((c) => memeScore(c, siens[0]));
      return { prenom: x.prenom, ok: siens[0].ok, sur: siens[0].sur, pourcentage: pct(siens[0].ok, siens[0].sur), tournois: egaux.map((c) => infoTournoi(c.t)) };
    }).filter(Boolean);
    strike = { tops: tops.map(formeStrike), autres };
  }

  // Le full strike : tous les vainqueurs de tous les matchs joués d'un tournoi trouvés (un par parieur et par tournoi)
  const fullStrike = bonsParTournoi.filter((c) => c.ok === c.sur).sort((a, b) => parDate(a.t, b.t) || cmp(a.prenom, b.prenom))
    .map((c) => ({ id: c.id, prenom: c.prenom, tournoi: infoTournoi(c.t), sur: c.sur }));

  // La bérézina : le match où le total des points des parieurs est le plus bas (au moins deux paris)
  const candidatsBerezina = [];
  for (const m of lesMatchs) {
    if (!matchJoue(m)) continue;
    const pts = new Map();
    for (const [id, bet] of parisDe(m)) {
      if (!idsProfils.has(id)) continue;
      const r = pointsDuPari(m, bet);
      if (r) pts.set(id, r.total);
    }
    if (pts.size < 2) continue;
    candidatsBerezina.push({ valeur: [...pts.values()].reduce((x, y) => x.plus(y), ZERO), t: parId.get(m.tournament_id), m, pts });
  }
  const plusBas = candidatsBerezina.reduce((mn, c) => (mn === null || c.valeur.comparer(mn) < 0 ? c.valeur : mn), null);
  const berezina = candidatsBerezina.length
    ? candidatsBerezina.filter((c) => c.valeur.comparer(plusBas) === 0).sort((a, b) => parDate(a.t, b.t) || a.m.id - b.m.id).map(({ valeur, t, m, pts }) => {
      const gagnant = m.vainqueur === 1 ? m.p1_id : m.p2_id;
      const perdant = m.vainqueur === 1 ? m.p2_id : m.p1_id;
      return {
        tournoi: infoTournoi(t), tour: LIBELLES_TOURS[m.tour] ?? m.tour,
        vainqueur: nomJoueur(gagnant), perdant: nomJoueur(perdant), score: formaterScore(m.score, m.fin_match, m.vainqueur),
        total: moteur.formaterPoints(valeur, { signe: true }),
        parieurs: profils.map((x) => (pts.has(x.id)
          ? { prenom: x.prenom, points: moteur.formaterPoints(pts.get(x.id), { signe: true }), negatif: pts.get(x.id).comparer(ZERO) < 0, choix: nomJoueur(parisDe(m).get(x.id).choix === 1 ? m.p1_id : m.p2_id) }
          : { prenom: x.prenom, points: null, negatif: false, choix: null })),
      };
    }) : null;

  // ---------- Degrés de confiance ----------
  const confiances = profils.map((x) => {
    const nb = new Map(moteur.CONFIANCES.map((c) => [c, 0]));
    for (const m of lesMatchs) { const b = parisDe(m).get(x.id); if (b && nb.has(b.confiance)) nb.set(b.confiance, nb.get(b.confiance) + 1); }
    const total = [...nb.values()].reduce((a, b) => a + b, 0);
    return { id: x.id, prenom: x.prenom, couleur: x.couleur ?? null, photo_url: x.photo_url ?? null, total, repartition: [...nb].map(([confiance, n]) => ({ confiance, n, pourcentage: pct(n, total) })) };
  });

  return {
    nbTournois: clos.length, nbMatchs: lesMatchs.filter((m) => !m.neutralise).length,
    detailPoints, vachesALait, chouchous, amoursImpossibles, confiances,
    records: {
      grandChelem: plusGrosScore('grand_slam'),
      masters: plusGrosScore('masters_1000'),
      ricRac,
      grandFou: compterConfiance(10),
      gagnePetit: compterConfiance(6),
      sniper, contradicteur, strike, fullStrike, berezina,
    },
  };
}
