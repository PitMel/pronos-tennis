// Mise en forme d'un match de la Live Tennis API vers la « charge utile » attendue par la fonction SQL sync_appliquer.
// Fonctions pures, sans réseau. Les règles viennent du cahier des charges (section 10) et de la documentation de l'API :
//   * un match n'est terminé que si status = completed ET winner renseigné (sinon : anomalie) ;
//   * on branche sur `outcome` (completed / retired / walkover / default / abandoned / unresolved), pas sur le texte de event_status ;
//   * seuls les matchs ATP, simple, messieurs, hors qualifications, des tournois suivis, aux tours R16 / QF / SF / F / RR.

export const TOURS_SUIVIS = ['R16', 'QF', 'SF', 'F', 'RR'];

const entier = (x) => {
  if (x === null || x === undefined || x === '') return null;
  const n = Number(x);
  return Number.isInteger(n) ? n : null;
};

/** Nombre de sets joués d'après les jeux par set (un set entamé compte), à défaut d'après le score en sets. */
export function compterSets(score) {
  const jeux = score?.games;
  if (Array.isArray(jeux) && jeux.length === 2 && Array.isArray(jeux[0]) && Array.isArray(jeux[1])) {
    const n = Math.max(jeux[0].length, jeux[1].length);
    let c = 0;
    for (let i = 0; i < n; i += 1) {
      if ((Number(jeux[0][i]) || 0) + (Number(jeux[1][i]) || 0) > 0) c += 1;
    }
    return c > 0 ? Math.min(c, 5) : null;
  }
  const s = score?.sets;
  if (Array.isArray(s) && s.length === 2 && s.every((v) => Number.isFinite(Number(v)))) {
    const total = Number(s[0]) + Number(s[1]);
    return total > 0 ? Math.min(total, 5) : null;
  }
  return null;
}

/**
 * Statut interne, type de fin de match et anomalies d'après status / outcome / event_status / winner.
 * Renvoie { statut: 'a_venir'|'en_cours'|'termine'|null, fin_match, anomalies: [{code, detail}] }.
 * `statut: null` = ne rien conclure (la base garde l'état actuel).
 */
export function interpreterStatut(m) {
  const status = m.status ?? null;
  const outcome = m.outcome ?? null;
  const ev = m.event_status ?? null;
  const anomalies = [];
  const walkover = outcome === 'walkover' || ev === 'Walk Over';

  if (status === 'cancelled') {
    anomalies.push({ code: 'match_annule', detail: 'l\'API annonce le match annulé : à neutraliser ou corriger dans l\'administration si besoin' });
    return { statut: null, fin_match: 'normal', anomalies };
  }
  if (walkover && status !== 'live') {
    // Un forfait (walkover) peut rester « upcoming » côté API : on le traite comme terminé, sans vainqueur exigé.
    return { statut: 'termine', fin_match: 'forfait', anomalies };
  }
  if (status === 'upcoming') return { statut: 'a_venir', fin_match: 'normal', anomalies };
  if (status === 'live') return { statut: 'en_cours', fin_match: 'normal', anomalies };
  if (status === 'completed') {
    switch (outcome) {
      case 'retired':
        return { statut: 'termine', fin_match: 'abandon', anomalies };
      case 'default':
        anomalies.push({ code: 'defaut', detail: 'outcome « default » (disqualification ?) traité comme un abandon : à vérifier' });
        return { statut: 'termine', fin_match: 'abandon', anomalies };
      case 'abandoned':
      case 'unresolved':
        anomalies.push({ code: 'sans_resultat', detail: `outcome « ${outcome} » : aucun résultat attribué, laissé en l'état` });
        return { statut: null, fin_match: 'normal', anomalies };
      case 'completed':
      case null:
        return { statut: 'termine', fin_match: 'normal', anomalies };
      default:
        anomalies.push({ code: 'outcome_inconnu', detail: `outcome « ${outcome} » inconnu, traité comme un match normal` });
        return { statut: 'termine', fin_match: 'normal', anomalies };
    }
  }
  if (status !== null) anomalies.push({ code: 'status_inconnu', detail: `status « ${status} » inconnu` });
  return { statut: null, fin_match: 'normal', anomalies };
}

function joueur(p) {
  if (!p || p.id === null || p.id === undefined || String(p.id) === '') return null;
  return {
    api_id: String(p.id),
    nom: typeof p.name === 'string' ? p.name : null,
    pays: typeof p.country === 'string' ? p.country : null,
    classement: entier(p.ranking),
  };
}

/**
 * @param m match de l'API
 * @param tournoisSuivis Set des identifiants de tournoi de l'API suivis (chaînes)
 * @returns { ignore: raison } ou { match, anomalies }
 */
export function normaliserMatch(m, tournoisSuivis) {
  if (!m || typeof m !== 'object' || m.id === undefined || m.id === null) return { ignore: 'sans_identifiant' };
  if (m.tour !== 'atp') return { ignore: 'pas_atp' };
  if (m.gender !== undefined && m.gender !== null && m.gender !== 'men') return { ignore: 'pas_messieurs' };
  if (m.draw === 'doubles' || m.is_doubles === true) return { ignore: 'double' };
  if (m.draw !== undefined && m.draw !== null && m.draw !== 'singles') return { ignore: 'pas_simple' };
  if (m.is_qualifying === true) return { ignore: 'qualification' };
  const tid = m.tournament_id === null || m.tournament_id === undefined ? '' : String(m.tournament_id);
  if (!tid || !tournoisSuivis.has(tid)) return { ignore: 'tournoi_non_suivi' };
  const tour = typeof m.round_code === 'string' ? m.round_code.toUpperCase() : null;
  if (!tour || !TOURS_SUIVIS.includes(tour)) return { ignore: 'tour_non_suivi' };

  const { statut, fin_match: fin, anomalies } = interpreterStatut(m);
  const vainqueur = entier(m.winner);
  const score = m.score && typeof m.score === 'object' ? { sets: m.score.sets ?? null, games: m.score.games ?? null } : null;
  const heure = typeof m.scheduled_time === 'string' && !Number.isNaN(Date.parse(m.scheduled_time)) ? new Date(m.scheduled_time).toISOString() : null;

  return {
    match: {
      api_id: String(m.id),
      tournament_api_id: tid,
      tour,
      heure_prevue: heure,
      statut,
      vainqueur: vainqueur === 1 || vainqueur === 2 ? vainqueur : null,
      sets_joues: statut === 'termine' ? compterSets(m.score) : null,
      score: score && (score.sets || score.games) ? score : null,
      fin_match: fin,
      p1: joueur(m.players?.p1),
      p2: joueur(m.players?.p2),
    },
    anomalies,
  };
}

/** Normalise une liste de matchs ; renvoie { matchs, anomalies:[{api_id, code, detail}], ignores:{raison: n} } sans doublon d'identifiant. */
export function normaliserListe(liste, tournoisSuivis) {
  const matchs = new Map();
  const anomalies = [];
  const ignores = {};
  for (const m of Array.isArray(liste) ? liste : []) {
    const r = normaliserMatch(m, tournoisSuivis);
    if (r.ignore) {
      ignores[r.ignore] = (ignores[r.ignore] ?? 0) + 1;
      continue;
    }
    matchs.set(r.match.api_id, r.match);
    for (const a of r.anomalies) anomalies.push({ api_id: r.match.api_id, ...a });
  }
  return { matchs: [...matchs.values()], anomalies, ignores };
}
