// Client de la Live Tennis API : appels réessayés avec pause croissante, gestion des quotas (429), aucun secret journalisé.
// La clé est passée en paramètre (variable d'environnement lue par cli.js) : jamais écrite dans le dépôt.

export const BASE_API = 'https://api.livetennisapi.com/api/public/v1';

export class ErreurApi extends Error {
  constructor(message, { status = null, code = null, corps = null } = {}) {
    super(message);
    this.name = 'ErreurApi';
    this.status = status;
    this.code = code;
    this.corps = corps;
  }
}

/** Quota du jour épuisé (ou blocage anti-abus) : inutile de réessayer avant `resetA` (Date ou null). */
export class ErreurQuotaJour extends ErreurApi {
  constructor(message, { resetA = null, ...reste } = {}) {
    super(message, reste);
    this.name = 'ErreurQuotaJour';
    this.resetA = resetA;
  }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Construit « /chemin?a=1&b=2 » en respectant l'ordre des paramètres (le journal en dépend). */
export function construireChemin(chemin, params = {}) {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return q ? `${chemin}?${q}` : chemin;
}

function resetDepuisCorps(corps) {
  if (!corps || typeof corps !== 'object') return null;
  if (typeof corps.resets_at === 'string' && !Number.isNaN(Date.parse(corps.resets_at))) return new Date(corps.resets_at);
  if (Number.isFinite(Number(corps.retry_at_epoch))) return new Date(Number(corps.retry_at_epoch) * 1000);
  return null;
}

/**
 * @param opts.cle clé d'API (secret)
 * @param opts.fetchImpl pour les tests
 * @param opts.pauses pauses entre tentatives (ms) ; longueur = nombre de nouvelles tentatives
 * @param opts.surAppel appelé après CHAQUE requête HTTP (même en échec) : { chemin, status, ok, message, resetA }
 */
export function creerClientApi({
  cle,
  baseUrl = BASE_API,
  fetchImpl = globalThis.fetch,
  dormirImpl = dormir,
  pauses = [2000, 6000, 15000],
  delaiMs = 20000,
  surAppel = async () => {},
} = {}) {
  if (!cle) throw new Error('Clé d\'API absente.');

  async function tenter(chemin) {
    const ctl = new AbortController();
    const minuteur = setTimeout(() => ctl.abort(), delaiMs);
    try {
      return await fetchImpl(baseUrl + chemin, {
        headers: { Authorization: `Bearer ${cle}`, Accept: 'application/json' },
        signal: ctl.signal,
      });
    } finally {
      clearTimeout(minuteur);
    }
  }

  async function get(chemin, params = {}) {
    const url = construireChemin(chemin, params);
    let derniere = null;
    for (let essai = 0; essai <= pauses.length; essai += 1) {
      let reponse = null;
      try {
        reponse = await tenter(url);
      } catch (e) {
        derniere = new ErreurApi(`réseau : ${e?.name === 'AbortError' ? 'délai dépassé' : (e?.cause?.code ?? e?.message ?? 'erreur inconnue')}`, { code: 'reseau' });
        await surAppel({ chemin: url, status: 0, ok: false, message: derniere.message, resetA: null });
        if (essai < pauses.length) await dormirImpl(pauses[essai]);
        continue;
      }

      let corps = null;
      try {
        corps = await reponse.json();
      } catch {
        corps = null;
      }
      const st = reponse.status;

      if (st >= 200 && st < 300) {
        await surAppel({ chemin: url, status: st, ok: true, message: null, resetA: null });
        return { status: st, json: corps };
      }

      const code = corps?.error ?? corps?.code ?? null;
      if (st === 429) {
        const resetA = resetDepuisCorps(corps);
        const jour = corps?.scope === 'day' || code === 'abuse_throttled';
        await surAppel({ chemin: url, status: st, ok: false, message: jour ? 'quota du jour épuisé' : 'limite par minute', resetA });
        if (jour) throw new ErreurQuotaJour(`quota de l'API atteint (${code ?? 'jour'})`, { status: st, code, corps, resetA });
        derniere = new ErreurApi('limite par minute atteinte', { status: st, code });
        const attente = Number(reponse.headers?.get?.('retry-after'));
        if (essai < pauses.length) await dormirImpl(Math.max(pauses[essai], Number.isFinite(attente) ? Math.min(attente, 70) * 1000 : 0));
        continue;
      }
      if (st >= 500) {
        derniere = new ErreurApi(`erreur serveur ${st}`, { status: st, code, corps });
        await surAppel({ chemin: url, status: st, ok: false, message: derniere.message, resetA: null });
        if (essai < pauses.length) await dormirImpl(pauses[essai]);
        continue;
      }
      // 400, 401, 403, 404, 410… : inutile de réessayer
      const message = st === 401 ? 'clé d\'API refusée (401)' : st === 403 ? 'offre insuffisante pour cet appel (403)' : st === 404 ? 'introuvable (404)' : `réponse ${st}`;
      await surAppel({ chemin: url, status: st, ok: false, message, resetA: null });
      throw new ErreurApi(message, { status: st, code, corps });
    }
    throw derniere ?? new ErreurApi('échec inconnu');
  }

  return { get };
}

/**
 * Lit le compteur d'usage de façon tolérante (la forme exacte de /usage n'est pas documentée).
 * Renvoie { utilise_jour, limite_jour, restant_jour } (nombres ou null) ; les valeurs inconnues restent null.
 */
export function interpreterUsage(json) {
  const sortie = { utilise_jour: null, limite_jour: null, restant_jour: null };
  if (!json || typeof json !== 'object') return sortie;
  const racine = json.data && typeof json.data === 'object' ? json.data : json;

  const nombres = [];
  (function parcourir(o, chemin) {
    if (o && typeof o === 'object') {
      for (const [k, v] of Object.entries(o)) parcourir(v, [...chemin, k]);
    } else if (typeof o === 'number' && Number.isFinite(o)) {
      nombres.push({ chemin: chemin.map((s) => String(s).toLowerCase()), valeur: o });
    }
  })(racine, []);

  const dansLeJour = (c) => c.some((s) => /^(day|daily|today|jour)$/.test(s) || /(_|^)(day|daily|today)(_|$)/.test(s));
  const dansLaMinute = (c) => c.some((s) => /(minute|min$|_min)/.test(s));
  const choisir = (re) => {
    const candidats = nombres.filter((n) => re.test(n.chemin[n.chemin.length - 1]) && !dansLaMinute(n.chemin));
    return (candidats.find((n) => dansLeJour(n.chemin)) ?? null)?.valeur ?? null;
  };
  sortie.utilise_jour = choisir(/^(used|count|requests|usage|calls)(_today|_day)?$|^(used|requests|calls)_/);
  sortie.limite_jour = choisir(/^(limit|quota|max)(_per_day|_day)?$|^limit_|^per_day$/);
  sortie.restant_jour = choisir(/^(remaining|left)(_today|_day)?$|^remaining_/);
  if (sortie.restant_jour === null && sortie.utilise_jour !== null && sortie.limite_jour !== null) {
    sortie.restant_jour = Math.max(0, sortie.limite_jour - sortie.utilise_jour);
  }
  return sortie;
}
