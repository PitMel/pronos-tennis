// Onglet « Palmarès » : les informations propres au joueur connecté (armoire à trophées, parcours, statistiques par saison,
// profil des paris, « le juste prix »). Fonctions pures ; le moteur est passé en paramètre.
import { construireRace } from './classement.js';
import { statsRace } from './stats-race.js';

const cmp = (a, b) => a.localeCompare(b, 'fr');
const pct = (n, sur) => (sur > 0 ? Math.round((100 * n) / sur) : null);
const joue = (m) => !m.neutralise && (m.vainqueur === 1 || m.vainqueur === 2);

/** Jour de l'année (0 à 365) d'une date AAAA-MM-JJ ; null si inconnue. */
function jourDeLAnnee(date) {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000);
}

/**
 * @param {object} p
 * @param {object} p.moteur
 * @param {string} p.moi            identifiant du profil connecté
 * @param {Array}  p.profils        parieurs du groupe (le profil connecté compris)
 * @param {Array}  p.tournois       tous les tournois
 * @param {Array}  p.resultats      archives de clôture de tous les tournois
 * @param {Array}  p.matchs         lignes de matches_visibles des tournois terminés
 * @param {Map}    p.paris          Map(idMatch → Map(idProfil → pari))
 * @param {Array}  p.parisTournoi   lignes de tournament_bets des tournois terminés
 * @param {Map}    p.joueurs        Map(idTennis → { nom })
 */
export function monPalmares({ moteur, moi, profils, tournois, resultats, matchs, paris, parisTournoi, joueurs }) {
  const { Fraction, ZERO } = moteur;
  const clos = tournois.filter((t) => t.etat === 'clos');
  const parId = new Map(clos.map((t) => [t.id, t]));
  const annees = [...new Set(clos.map((t) => t.annee))].sort((a, b) => b - a);
  const mesProfils = profils.filter((x) => x.id === moi);
  const mesArchives = resultats.filter((r) => r.joueur_id === moi && parId.has(r.tournament_id));
  const lesMatchs = matchs.filter((m) => parId.has(m.tournament_id));
  const mesParis = (m) => paris?.get(m.id)?.get(moi) ?? null;

  // ---------- ordre des tournois : par date habituelle dans l'année ----------
  const tournoisDistincts = new Map();
  for (const t of tournois) {
    const e = tournoisDistincts.get(t.nom) ?? { nom: t.nom, categorie: t.categorie, jours: [] };
    const j = jourDeLAnnee(t.date_debut);
    if (j !== null) e.jours.push(j);
    tournoisDistincts.set(t.nom, e);
  }
  const rang = (nom) => {
    const j = tournoisDistincts.get(nom)?.jours ?? [];
    return j.length ? j.reduce((a, b) => a + b, 0) / j.length : 999;
  };
  const colonnes = [...tournoisDistincts.values()].sort((a, b) => rang(a.nom) - rang(b.nom) || cmp(a.nom, b.nom))
    .map((e) => ({ nom: e.nom, categorie: e.categorie }));

  // ---------- victoires du joueur (rang 1 dans l'archive, ex æquo compris) ----------
  const victoires = mesArchives.filter((r) => Number(r.rang) === 1).map((r) => {
    const t = parId.get(r.tournament_id);
    return { id: t.id, nom: t.nom, categorie: t.categorie, annee: t.annee, date_debut: t.date_debut ?? null };
  });
  const parTournoiPuisAnnee = (a, b) => rang(a.nom) - rang(b.nom) || cmp(a.nom, b.nom) || a.annee - b.annee;

  // ---------- 1. Armoire à trophées ----------
  const saison = [];
  for (const annee of annees) {
    const race = construireRace({ moteur, annee, tournois, resultats, profils });
    if (!race.terminee) continue;
    const ligne = race.lignes.find((l) => l.id === moi);
    if (ligne?.rang === 1) saison.push({ id: null, nom: 'Champion de la saison', categorie: 'champion_saison', annee });
    else if (ligne?.rang === 2) saison.push({ id: null, nom: 'Vice-champion de la saison', categorie: 'vice_champion_saison', annee });
  }
  saison.sort((a, b) => b.annee - a.annee);
  const armoire = {
    saison,
    grand_slam: victoires.filter((v) => v.categorie === 'grand_slam').sort(parTournoiPuisAnnee),
    masters_1000: victoires.filter((v) => v.categorie === 'masters_1000').sort(parTournoiPuisAnnee),
    atp_finals: victoires.filter((v) => v.categorie === 'atp_finals').sort(parTournoiPuisAnnee),
  };

  // ---------- 2. Parcours dans les tournois ----------
  const parcours = {
    colonnes,
    lignes: annees.map((annee) => ({
      annee,
      cases: colonnes.map((c) => {
        const t = clos.find((x) => x.annee === annee && x.nom === c.nom);
        if (!t) return null;
        const gagne = victoires.find((v) => v.id === t.id);
        return gagne ? { gagne: true, trophee: gagne } : { gagne: false };
      }),
    })),
  };

  // ---------- 3. Vaches à lait, chouchous, amours impossibles : une colonne par saison ----------
  const parAnnee = annees.map((annee) => ({
    annee,
    stats: statsRace({ moteur, annee, tournois, resultats, profils: mesProfils, matchs: lesMatchs, paris, parisTournoi, joueurs }),
  }));
  const saisons = parAnnee.map(({ annee, stats }) => ({
    annee,
    vaches: stats.vachesALait[0]?.joueurs ?? [],
    chouchous: stats.chouchous[0]?.joueurs ?? [],
    amours: stats.amoursImpossibles[0]?.joueurs ?? [],
  }));

  // ---------- 4. Mes statistiques ----------
  const parSaison = annees.map((annee) => {
    let okV = 0; let surV = 0; let okS = 0; let surS = 0;
    for (const m of lesMatchs) {
      const t = parId.get(m.tournament_id);
      if (t.annee !== annee || !joue(m)) continue;
      const b = mesParis(m);
      if (!b) continue;
      surV += 1;
      if (b.choix === m.vainqueur) okV += 1;
      if (t.categorie === 'grand_slam' && b.sets && m.fin_match !== 'forfait') {
        surS += 1;
        if (Number(m.sets_joues) === Number(b.sets)) okS += 1;
      }
    }
    let okT = 0; let surT = 0;
    for (const l of parisTournoi) {
      const t = parId.get(l.tournament_id);
      if (!t || t.annee !== annee || l.joueur_id !== moi || !l.vainqueur_id || !t.vainqueur_id) continue;
      surT += 1;
      if (l.vainqueur_id === t.vainqueur_id) okT += 1;
    }
    const f = (ok, sur) => (sur > 0 ? { ok, sur, pourcentage: pct(ok, sur) } : null);
    return { annee, vainqueurMatch: f(okV, surV), sets: f(okS, surS), vainqueurTournoi: f(okT, surT) };
  });

  // meilleur strike toutes saisons : celui de chaque saison, puis le meilleur (ex æquo : tous)
  const strikes = parAnnee.flatMap(({ stats }) => stats.records.strike?.tops ?? []);
  const memeScore = (a, b) => a.ok === b.ok && a.ok * b.sur === b.ok * a.sur;
  strikes.sort((a, b) => b.ok - a.ok || b.ok * a.sur - a.ok * b.sur || (a.tournoi.annee - b.tournoi.annee));
  const meilleurStrike = strikes.length ? strikes.filter((s) => memeScore(s, strikes[0])) : [];

  // meilleur tournoi (score final) d'une catégorie, ex æquo compris
  const meilleurTournoi = (categorie) => {
    const lignes = mesArchives.filter((r) => parId.get(r.tournament_id).categorie === categorie)
      .map((r) => ({ t: parId.get(r.tournament_id), valeur: Fraction.de(r.score_final ?? '0') }));
    if (!lignes.length) return [];
    const max = lignes.reduce((m, l) => (l.valeur.comparer(m) > 0 ? l.valeur : m), lignes[0].valeur);
    return lignes.filter((l) => l.valeur.comparer(max) === 0).sort((a, b) => a.t.annee - b.t.annee)
      .map((l) => ({ id: l.t.id, nom: l.t.nom, annee: l.t.annee, score: moteur.formaterPoints(l.valeur, { signe: false }) }));
  };

  // record de saison : plus gros total d'une année
  const totaux = annees.map((annee) => ({
    annee,
    valeur: mesArchives.filter((r) => parId.get(r.tournament_id).annee === annee).reduce((s, r) => s.plus(Fraction.de(r.score_final ?? '0')), ZERO),
  }));
  const maxTotal = totaux.reduce((m, x) => (m === null || x.valeur.comparer(m) > 0 ? x.valeur : m), null);
  const recordSaison = maxTotal === null ? [] : totaux.filter((x) => x.valeur.comparer(maxTotal) === 0).sort((a, b) => a.annee - b.annee)
    .map((x) => ({ annee: x.annee, score: moteur.formaterPoints(x.valeur, { signe: false }) }));

  const statistiques = {
    parSaison, meilleurStrike,
    meilleurGrandChelem: meilleurTournoi('grand_slam'),
    meilleurMasters: meilleurTournoi('masters_1000'),
    recordSaison,
  };

  // ---------- 5. Profil des paris : répartition par saison de MES paris ----------
  const profilDesParis = annees.map((annee) => {
    const nb = new Map(moteur.CONFIANCES.map((c) => [c, 0]));
    for (const m of lesMatchs) {
      if (parId.get(m.tournament_id).annee !== annee) continue;
      const b = mesParis(m);
      if (b && nb.has(b.confiance)) nb.set(b.confiance, nb.get(b.confiance) + 1);
    }
    const total = [...nb.values()].reduce((a, b) => a + b, 0);
    return { annee, total, repartition: [...nb].map(([confiance, n]) => ({ confiance, n, pourcentage: pct(n, total) ?? 0 })) };
  }).filter((l) => l.total > 0);

  // ---------- 6. Le juste prix : à chaque confiance, part des paris où le joueur choisi a gagné (toutes saisons) ----------
  const autres = profils.filter((x) => x.id !== moi);
  const colonnesPrix = [...profils.filter((x) => x.id === moi), ...autres];
  const compte = new Map(colonnesPrix.map((x) => [x.id, new Map(moteur.CONFIANCES.map((c) => [c, { ok: 0, sur: 0 }]))]));
  for (const m of lesMatchs) {
    if (!joue(m)) continue;
    for (const [id, b] of paris?.get(m.id) ?? []) {
      const c = compte.get(id)?.get(b.confiance);
      if (!c) continue;
      c.sur += 1;
      if (b.choix === m.vainqueur) c.ok += 1;
    }
  }
  const caseDe = (ok, sur) => ({ ok, sur, pourcentage: pct(ok, sur) });
  const justePrix = {
    colonnes: colonnesPrix.map((x) => ({ id: x.id, prenom: x.prenom, couleur: x.couleur ?? null, photo_url: x.photo_url ?? null })),
    lignes: moteur.CONFIANCES.map((confiance) => {
      let ok = 0; let sur = 0;
      const cases = colonnesPrix.map((x) => { const c = compte.get(x.id).get(confiance); ok += c.ok; sur += c.sur; return caseDe(c.ok, c.sur); });
      return { confiance, cases, total: caseDe(ok, sur) };
    }),
  };

  return { annees, armoire, parcours, saisons, statistiques, profilDesParis, justePrix };
}
