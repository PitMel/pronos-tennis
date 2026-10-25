// « Monde » de test : une fausse API Live Tennis + une vraie base PostgreSQL embarquée (migrations réelles) derrière un faux fetch.
// Le programme de synchronisation (cli.js) tourne tel quel : il croit parler à Internet.
import { creerBase, TOURNOI } from '../securite/base.js';
import { BASE_API } from '../../src/sync/client-api.js';

export const CLE_API = 'cle-api-secrete-123456';
export const CLE_SUPABASE = 'sb_secret_cle-service-654321';
export const URL_SUPABASE = 'https://projet-test.supabase.co';
export const ENV = { LIVETENNIS_API_KEY: CLE_API, SUPABASE_URL: URL_SUPABASE, SUPABASE_SERVICE_ROLE_KEY: CLE_SUPABASE };
// Fenêtre horaire ouverte en permanence (le test ne dépend pas de l'heure à laquelle il tourne) et pas de pauses.
export const PARAMETRES_TEST = { heureDebut: 0, heureFin: 24 };

const reponse = (status, json) => ({
  status, ok: status >= 200 && status < 300, json: async () => json, text: async () => JSON.stringify(json), headers: { get: () => null },
});

export async function creerMonde() {
  const b = await creerBase();
  await b.db.exec(`
    insert into public.tournament_api_ids (api_id, tournament_id) values ('1725', ${TOURNOI.masters}), ('1726', ${TOURNOI.masters}), ('2794', ${TOURNOI.finals});
    update public.tournaments set etat = 'en_cours', date_debut = current_date, date_fin = current_date + 6 where id = ${TOURNOI.masters};
    update public.tournaments set etat = 'a_venir', date_debut = current_date + 200, date_fin = current_date + 207 where id = ${TOURNOI.finals};
  `);
  const monde = {
    b,
    appelsApi: [], // chemins appelés sur l'API (hors /usage dans `chemins()`)
    appelsBase: [], // { fonction, apikey, authorization }
    upcoming: {}, // { '1725': [matchs API] }
    live: [],
    details: {}, // { id: match API }
    pannes: {}, // { motif de chemin: {status, json} }
    usage: { day: { used: 0, limit: 100, remaining: 100 } },
    chemins: () => monde.appelsApi.filter((c) => !c.startsWith('/usage')),
    reinitialiserAppels() {
      monde.appelsApi.length = 0;
      monde.appelsBase.length = 0;
    },
    async fetchImpl(url, opts = {}) {
      if (url.startsWith(BASE_API)) {
        const chemin = url.slice(BASE_API.length);
        monde.appelsApi.push(chemin);
        if (opts.headers?.Authorization !== `Bearer ${CLE_API}`) return reponse(401, { error: 'unauthorized' });
        for (const [motif, rep] of Object.entries(monde.pannes)) if (chemin.includes(motif)) return reponse(rep.status, rep.json ?? {});
        if (chemin.startsWith('/usage')) return reponse(200, monde.usage);
        let m = chemin.match(/^\/matches\?tournament_id=([^&]+)&status=upcoming/);
        if (m) return reponse(200, { data: monde.upcoming[m[1]] ?? [] });
        if (chemin.startsWith('/matches?status=live')) return reponse(200, { data: monde.live });
        m = chemin.match(/^\/matches\/([^?]+)$/);
        if (m) return monde.details[m[1]] ? reponse(200, { data: monde.details[m[1]] }) : reponse(404, { error: 'not_found' });
        return reponse(404, { error: 'route inconnue' });
      }
      if (url.startsWith(`${URL_SUPABASE}/rest/v1/rpc/`)) {
        const fonction = url.slice(`${URL_SUPABASE}/rest/v1/rpc/`.length);
        monde.appelsBase.push({ fonction, apikey: opts.headers?.apikey, authorization: opts.headers?.Authorization });
        if (opts.headers?.apikey !== CLE_SUPABASE) return reponse(401, { message: 'Invalid API key' });
        const a = JSON.parse(opts.body);
        try {
          let r;
          if (fonction === 'sync_etat') r = await b.comme(null, 'select public.sync_etat() as r', [], 'service_role');
          else if (fonction === 'sync_appliquer') r = await b.comme(null, 'select public.sync_appliquer($1::jsonb) as r', [JSON.stringify(a.p_payload)], 'service_role');
          else if (fonction === 'sync_enregistrer_appel') {
            r = await b.comme(null, 'select public.sync_enregistrer_appel($1::text,$2::int,$3::boolean,$4::int,$5::text,$6::timestamptz) as r',
              [a.p_endpoint, a.p_http_status, a.p_ok, a.p_quota_restant, a.p_message, a.p_reset_a], 'service_role');
          } else return reponse(404, { message: 'fonction inconnue' });
          return reponse(200, r.rows[0].r ?? null);
        } catch (e) {
          return reponse(400, { message: e.message });
        }
      }
      throw new Error(`adresse inattendue dans le test : ${url}`);
    },
  };
  return monde;
}
