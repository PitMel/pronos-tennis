// Traduction d'un match de la Live Tennis API vers une ligne de notre base. Module PUR : aucun réseau, aucune base.
//
// Les champs lus sont ceux décrits dans le cahier des charges (section 10.1). Rien n'est supposé au-delà : tout
// ce qui est inattendu devient une « anomalie » (texte lisible) que la synchronisation écrit dans le journal, et
// l'administrateur corrige au besoin. Un doute ne doit jamais faire planter la tâche ni inventer un résultat.

/** Tours qui font l'objet de paris (les tours antérieurs ne sont pas suivis). */
export const TOURS_PARIABLES = ['R16', 'QF', 'SF', 'F'];

const RE_FORFAIT = /walk\s*-?\s*over|\bw\/o\b|walkover/i;
const RE_ABANDON = /retire|retirement|abandon|\bret\b|\bret\./i;
const RE_JUNIOR = /\b(boys?|girls?|juniors?)\b/i;
const RE_POULE = /^(RR|RRP?\d*|GROUP\w*|ROUND[\s_-]?ROBIN\w*)$/i;

/**
 * Tour interne (R16, QF, SF, F, RR) d'après le code de tour de l'API et la catégorie du tournoi ; null si le tour
 * n'est pas suivi (ex. R32, R64) ou n'existe pas dans cette catégorie.
 */
export function tourDepuisCode(roundCode, categorie) {
  const code = String(roundCode ?? '').trim().toUpperCase();
  if (!code) return null;
  if (RE_POULE.test(code)) return categorie === 'atp_finals' ? 'RR' : null;
  const direct = { R16: 'R16', QF: 'QF', SF: 'SF', F: 'F', FINAL: 'F', SEMIFINAL: 'SF', SEMIFINALS: 'SF', QUARTERFINAL: 'QF', QUARTERFINALS: 'QF' }[code];
  if (!direct) return null;
  if (direct === 'R16' && categorie === 'atp_finals') return null; // pas de huitièmes aux ATP Finals
  return direct;
}

/** Match de simple messieurs ATP, hors qualifications, hors juniors ? (cahier des charges 10.3) */
export function estSimpleMessieurs(m) {
  if (!m || typeof m !== 'object') return false;
  if (m.is_doubles === true || m.draw === 'doubles') return false;
  if (m.draw !== undefined && m.draw !== null && m.draw !== 'singles') return false;
  if (m.gender !== undefined && m.gender !== null && m.gender !== 'men') return false;
  if (m.tour !== undefined && m.tour !== null && String(m.tour).toLowerCase() !== 'atp') return false;
  if (m.is_qualifying === true) return false;
  if (RE_JUNIOR.test(String(m.tournament ?? '')) || RE_JUNIOR.test(String(m.round ?? ''))) return false;
  return true;
}

const versNombreOuNull = (x) => {
  const n = typeof x === 'string' && x.trim() !== '' ? Number(x) : x;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

function joueurApi(p) {
  if (!p || typeof p !== 'object') return null;
  const id = p.id === undefined || p.id === null || String(p.id).trim() === '' ? null : String(p.id);
  const nom = typeof p.name === 'string' ? p.name.trim() : '';
  if (!id || !nom) return null;
  const classement = versNombreOuNull(p.ranking);
  return {
    api_id: id,
    nom,
    pays: typeof p.country === 'string' && p.country.trim() ? p.country.trim() : null,
    classement: Number.isInteger(classement) && classement > 0 ? classement : null,
  };
}

function dateOuNull(x) {
  if (x === undefined || x === null || x === '') return null;
  const d = new Date(x);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Nombre de sets joués d'après le tableau des jeux par set (`score.games`) ; null si inconnu. */
export function setsJoues(score) {
  const jeux = score?.games;
  if (!Array.isArray(jeux)) return null;
  const n = jeux.filter((s) => s !== null && s !== undefined && !(Array.isArray(s) && s.length === 0)).length;
  return n >= 1 && n <= 5 ? n : null;
}

function scoreAConserver(score) {
  if (!score || typeof score !== 'object') return null;
  const out = {};
  for (const k of ['sets', 'games', 'tiebreaks']) if (score[k] !== undefined) out[k] = score[k];
  return Object.keys(out).length ? out : null;
}

/**
 * Traduit un match de l'API.
 * @returns {{ok:false, raison:string} | {ok:true, match:object, joueurs:object[], anomalies:string[]}}
 *   `match.debut_detecte` est la date de début proposée (à ne jamais écraser si elle existe déjà en base).
 */
export function traduireMatch(m, { categorie, maintenant = new Date() } = {}) {
  if (!estSimpleMessieurs(m)) return { ok: false, raison: 'pas un simple messieurs ATP' };
  if (m.id === undefined || m.id === null || String(m.id) === '') return { ok: false, raison: 'match sans identifiant' };
  const tour = tourDepuisCode(m.round_code, categorie);
  if (!tour) return { ok: false, raison: `tour non suivi (${m.round_code ?? 'code absent'})` };
  const p1 = joueurApi(m.players?.p1);
  const p2 = joueurApi(m.players?.p2);
  if (!p1 || !p2) return { ok: false, raison: 'affiche pas encore connue' };
  if (p1.api_id === p2.api_id) return { ok: false, raison: 'deux fois le même joueur' };

  const anomalies = [];
  const idMatch = String(m.id);
  const eventStatus = String(m.event_status ?? '');
  const winner = versNombreOuNull(m.winner);
  const vainqueurValide = winner === 1 || winner === 2 ? winner : null;
  if (winner !== null && vainqueurValide === null) anomalies.push(`match ${idMatch} : vainqueur « ${m.winner} » inattendu, ignoré`);
  const statutApi = String(m.status ?? '').toLowerCase();
  const live = dateOuNull(m.live_at);

  let statut;
  let finMatch = 'normal';
  let vainqueur = null;

  if (RE_FORFAIT.test(eventStatus)) {
    // Forfait avant le début : aucun point pour personne (cahier des charges 4.5). Le vainqueur n'a pas d'importance.
    statut = 'termine';
    finMatch = 'forfait';
    vainqueur = vainqueurValide;
    anomalies.push(`match ${idMatch} : forfait détecté (« ${eventStatus} »), à confirmer dans l'administration`);
  } else if (statutApi === 'completed') {
    if (vainqueurValide) {
      statut = 'termine';
      vainqueur = vainqueurValide;
      if (RE_ABANDON.test(eventStatus) || RE_ABANDON.test(String(m.outcome ?? ''))) {
        finMatch = 'abandon';
        anomalies.push(`match ${idMatch} : abandon détecté (« ${eventStatus || m.outcome} »), à confirmer dans l'administration`);
      }
    } else {
      // Piège connu (10.2) : « Finished » sans vainqueur (score 0-0). Le match n'est PAS considéré comme terminé.
      statut = 'en_cours';
      anomalies.push(`match ${idMatch} : marqué terminé par l'API mais sans vainqueur, laissé en cours`);
    }
  } else if (statutApi === 'live') {
    statut = 'en_cours';
  } else if (statutApi === 'upcoming' || statutApi === 'scheduled' || statutApi === '') {
    statut = 'a_venir';
  } else {
    return { ok: false, raison: `statut inconnu (${m.status})` };
  }

  const sets = statut === 'termine' && finMatch !== 'forfait' ? setsJoues(m.score) : null;
  if (statut === 'termine' && finMatch !== 'forfait' && sets === null) {
    anomalies.push(`match ${idMatch} : nombre de sets illisible dans le score${categorie === 'grand_slam' ? " (Grand Chelem : le bonus de sets ne sera pas compté tant que l'administration ne l'a pas saisi)" : ''}`);
  }

  const horsPlage = statut !== 'a_venir' && !live;
  const debut = statut === 'a_venir' ? null : (live ?? (horsPlage ? maintenant : null));

  return {
    ok: true,
    anomalies,
    joueurs: [p1, p2],
    match: {
      api_id: idMatch,
      api_tournament_id: m.tournament_id === undefined || m.tournament_id === null ? null : String(m.tournament_id),
      tour,
      heure_prevue: dateOuNull(m.scheduled_time)?.toISOString() ?? null,
      p1_api_id: p1.api_id,
      p2_api_id: p2.api_id,
      statut,
      debut_detecte: debut ? debut.toISOString() : null,
      vainqueur,
      sets_joues: sets,
      score: statut === 'a_venir' ? null : scoreAConserver(m.score),
      fin_match: finMatch,
    },
  };
}
