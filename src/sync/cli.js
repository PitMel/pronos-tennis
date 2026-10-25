// Point d'entrée de la synchronisation (lancé par GitHub Actions : « node src/sync/cli.js »).
//   node src/sync/cli.js                 passage normal (lit et écrit dans Supabase)
//   node src/sync/cli.js --simulation    comme le passage normal, mais n'écrit RIEN dans la base (lecture de l'état + appels API)
//   node src/sync/cli.js --diagnostic    quelques appels à l'API seulement, pour en découvrir la forme réelle (pas de Supabase)
// Secrets lus UNIQUEMENT dans des variables d'environnement (secrets GitHub) :
//   LIVETENNIS_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Tout texte affiché est filtré pour ne jamais contenir ces valeurs.

import { fileURLToPath } from 'node:url';
import { creerBaseSupabase } from './base.js';
import { creerClientApi } from './client-api.js';
import { executerSynchro } from './synchro.js';

const TOURNOIS_DIAGNOSTIC = ['1725', '1726', '2794', '2795']; // Masters de Paris (2 identifiants) et Masters de Turin (2 identifiants)

export function masquer(texte, secrets) {
  let t = String(texte);
  for (const s of secrets) if (s && String(s).length >= 6) t = t.split(String(s)).join('***');
  return t;
}

/** Les journaux de GitHub Actions d'un dépôt public sont publics : on ne montre de /usage que des chiffres et du texte neutre. */
export function epurer(valeur) {
  if (Array.isArray(valeur)) return valeur.map(epurer);
  if (valeur && typeof valeur === 'object') {
    return Object.fromEntries(Object.entries(valeur).map(([k, v]) => [k, /key|token|secret|mail|owner|account|user|customer|org|principal/i.test(k) ? '***' : epurer(v)]));
  }
  if (typeof valeur === 'string' && /@|^(sk|pk|eyJ)/.test(valeur)) return '***';
  return valeur;
}

const court = (v, n = 1800) => {
  const t = typeof v === 'string' ? v : JSON.stringify(v, null, 1);
  return t.length > n ? `${t.slice(0, n)} … (tronqué)` : t;
};

/** Résumé de structure d'une liste de matchs : valeurs distinctes des champs qui pilotent nos règles. */
export function resumerMatchs(liste) {
  const compte = (champ) => {
    const c = {};
    for (const m of liste) {
      const v = champ(m);
      const k = v === undefined ? '(absent)' : v === null ? '(null)' : String(v);
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  };
  return {
    nombre: liste.length,
    tour: compte((m) => m.tour),
    gender: compte((m) => m.gender),
    draw: compte((m) => m.draw),
    status: compte((m) => m.status),
    outcome: compte((m) => m.outcome),
    event_status: compte((m) => m.event_status),
    round_code: compte((m) => m.round_code),
    tournament_id: compte((m) => m.tournament_id),
    is_qualifying: compte((m) => m.is_qualifying),
  };
}

export async function diagnostic({ api, ecrire, tournois = TOURNOIS_DIAGNOSTIC }) {
  const usage = async (titre) => {
    try {
      const r = await api.get('/usage');
      ecrire(`${titre} /usage (HTTP ${r.status}) : ${court(epurer(r.json))}`);
    } catch (e) {
      ecrire(`${titre} /usage : ÉCHEC ${e.message}`);
    }
  };
  await usage('[avant]');

  let premier = null;
  for (const id of tournois) {
    try {
      const r = await api.get('/matches', { tournament_id: id, status: 'upcoming', draw: 'singles', limit: 200 });
      const l = Array.isArray(r.json?.data) ? r.json.data : Array.isArray(r.json) ? r.json : [];
      ecrire(`tournoi ${id} — à venir : ${court(resumerMatchs(l), 1500)}`);
      ecrire(`  forme de la réponse (clés racine) : ${Object.keys(r.json ?? {}).join(', ')}`);
      if (l[0]) {
        ecrire(`  exemple : ${court(l[0])}`);
        premier ??= l.find((m) => m.round_code) ?? l[0];
      }
    } catch (e) {
      ecrire(`tournoi ${id} — à venir : ÉCHEC ${e.message}`);
    }
  }

  // Sans filtre de statut : pour voir s'il existe d'autres statuts que « upcoming » / « live » / « completed ».
  try {
    const r = await api.get('/matches', { tournament_id: tournois[0], draw: 'singles', limit: 200 });
    const l = Array.isArray(r.json?.data) ? r.json.data : [];
    ecrire(`tournoi ${tournois[0]} — tous statuts : ${court(resumerMatchs(l), 1500)}`);
    if (r.json?.meta) ecrire(`  meta : ${court(r.json.meta, 400)}`);
  } catch (e) {
    ecrire(`tournoi ${tournois[0]} — tous statuts : ÉCHEC ${e.message}`);
  }

  try {
    const r = await api.get('/matches', { status: 'live', tour: 'atp', gender: 'men', draw: 'singles', limit: 50 });
    const l = Array.isArray(r.json?.data) ? r.json.data : [];
    ecrire(`direct ATP messieurs : ${court(resumerMatchs(l), 1500)}`);
    if (l[0]) ecrire(`  exemple : ${court(l[0])}`);
    premier ??= l[0] ?? null;
  } catch (e) {
    ecrire(`direct : ÉCHEC ${e.message}`);
  }

  if (premier?.id !== undefined) {
    try {
      const r = await api.get(`/matches/${premier.id}`);
      ecrire(`détail du match ${premier.id} (HTTP ${r.status}) : ${court(r.json, 2500)}`);
    } catch (e) {
      ecrire(`détail du match ${premier.id} : ÉCHEC ${e.message}`);
    }
  }
  await usage('[après]');
  ecrire('Comparez les deux /usage : la différence dit combien d\'appels comptent réellement (et si le détail d\'un match coûte 1).');
}

export async function lancer({ argv = [], env = {}, fetchImpl = globalThis.fetch, sortie = console.log, maintenant = new Date(), dormirImpl, parametres = {} } = {}) {
  const secrets = [env.LIVETENNIS_API_KEY, env.SUPABASE_SERVICE_ROLE_KEY];
  const ecrire = (t) => sortie(masquer(t, secrets));
  const modeDiagnostic = argv.includes('--diagnostic');
  const simulation = argv.includes('--simulation');

  if (!env.LIVETENNIS_API_KEY) {
    ecrire('ERREUR : la variable LIVETENNIS_API_KEY est absente (secret GitHub à créer : Settings > Secrets and variables > Actions).');
    return 1;
  }
  const options = dormirImpl ? { dormirImpl } : {};

  if (modeDiagnostic) {
    const api = creerClientApi({ cle: env.LIVETENNIS_API_KEY, fetchImpl, ...options });
    await diagnostic({ api, ecrire });
    return 0;
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    ecrire('ERREUR : SUPABASE_URL et/ou SUPABASE_SERVICE_ROLE_KEY absents (secrets GitHub à créer).');
    return 1;
  }
  const base = creerBaseSupabase({ url: env.SUPABASE_URL, cle: env.SUPABASE_SERVICE_ROLE_KEY, fetchImpl, ...options });
  // Chaque requête HTTP faite à l'API est inscrite dans le journal (c'est ce journal qui compte le quota du jour).
  const api = creerClientApi({
    cle: env.LIVETENNIS_API_KEY,
    fetchImpl,
    ...options,
    surAppel: async ({ chemin, status, ok, message, resetA }) => {
      if (simulation) return;
      try {
        await base.enregistrerAppel({ endpoint: chemin, httpStatus: status, ok, message, resetA: resetA ? resetA.toISOString() : null });
      } catch (e) {
        ecrire(`journal d'appel non enregistré : ${e.message}`);
      }
    },
  });

  try {
    const resume = await executerSynchro({ api, base, maintenant, parametres, simulation, journal: ecrire });
    ecrire(`Résultat : ${court({ ...resume, anomalies: resume.anomalies.length }, 800)}`);
    for (const a of resume.anomalies) ecrire(`  anomalie ${a.code} (match ${a.api_id}) : ${a.detail ?? ''}`);
    for (const e of resume.erreurs) ecrire(`  erreur ${e}`);
    return 0;
  } catch (e) {
    ecrire(`ERREUR : ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  lancer({ argv: process.argv.slice(2), env: process.env }).then((code) => { process.exitCode = code; });
}
