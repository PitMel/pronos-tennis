// Orchestration d'un passage de synchronisation : état de la base -> plan -> appels à l'API -> mise en forme -> base.
// N'ouvre aucune connexion elle-même : `api` et `base` sont fournis (voir cli.js ; faux dans les tests).
// Principe : un échec d'appel ne casse jamais la tâche ; il est journalisé et on continue.

import { ErreurApi, ErreurQuotaJour, interpreterUsage } from './client-api.js';
import { normaliserListe } from './normaliser.js';
import { decider, selectionnerDetails } from './planificateur.js';

const PARAMS_DIRECT = { status: 'live', tour: 'atp', gender: 'men', draw: 'singles', limit: 200 };
// `tournament_id` d'abord et suivi d'un autre paramètre : le journal d'appels s'en sert pour retrouver la dernière relecture.
const paramsAffiches = (apiId) => ({ tournament_id: apiId, status: 'upcoming', draw: 'singles', limit: 200 });

const liste = (json) => (Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : []);

export async function executerSynchro({ api, base, maintenant = new Date(), parametres = {}, simulation = false, journal = () => {} }) {
  const resume = {
    maintenant: maintenant.toISOString(), regime: null, raison: null, appels: 0, erreurs: [], crees: 0, maj: 0, ignores: 0, anomalies: [], arret: null,
  };

  const etat = await base.etat();
  let plan = decider({ maintenant, etat, parametres });
  if (plan.actions.length > 0) {
    // Le compteur d'usage ne coûte rien : on le consulte seulement quand il y a quelque chose à faire.
    try {
      const r = await api.get('/usage');
      const usage = interpreterUsage(r.json);
      resume.usage = usage;
      plan = decider({ maintenant, etat, usage, parametres });
    } catch (e) {
      journal(`usage illisible : ${e.message}`);
      if (e instanceof ErreurQuotaJour) plan = { ...plan, actions: [], raison: e.message };
    }
  }
  resume.regime = plan.regime;
  resume.raison = plan.raison;
  journal(`régime ${plan.regime} — ${plan.raison}`);
  if (plan.actions.length === 0) return resume;

  const suivis = new Set((etat.tournois ?? []).flatMap((t) => (t.api_ids ?? []).map(String)));
  const dejaVues = new Set();
  let restant = plan.restant;
  let stop = false;

  async function noter(anomalies) {
    for (const a of anomalies) {
      const cle = `${a.code}|${a.api_id}|${a.detail ?? ''}`;
      if (dejaVues.has(cle)) continue;
      dejaVues.add(cle);
      resume.anomalies.push(a);
      if (!simulation) {
        try {
          await base.enregistrerAppel({ ok: false, message: `anomalie ${a.code} (match ${a.api_id}) : ${a.detail ?? ''}`.slice(0, 480) });
        } catch { /* le journal ne doit jamais casser la tâche */ }
      }
    }
  }

  async function traiter(donnees) {
    const n = normaliserListe(donnees, suivis);
    for (const [k, v] of Object.entries(n.ignores)) resume.ignores += k ? v : 0;
    await noter(n.anomalies);
    if (n.matchs.length === 0) return;
    if (simulation) {
      resume.crees += n.matchs.length;
      return;
    }
    const r = await base.appliquer({ matchs: n.matchs });
    resume.crees += r.crees ?? 0;
    resume.maj += r.maj ?? 0;
    resume.ignores += r.ignores ?? 0;
    await noter(r.anomalies ?? []);
  }

  async function appel(chemin, params, suite) {
    if (stop || restant <= 0) return null;
    restant -= 1;
    resume.appels += 1;
    try {
      const r = await api.get(chemin, params);
      return await suite(r.json);
    } catch (e) {
      if (e instanceof ErreurQuotaJour) {
        stop = true;
        resume.arret = e.message;
      } else if (e instanceof ErreurApi) {
        resume.erreurs.push(`${chemin} : ${e.message}`);
      } else {
        resume.erreurs.push(`${chemin} : ${e.message}`);
      }
      journal(`échec ${chemin} : ${e.message}`);
      return null;
    }
  }

  let vusEnDirect = null;
  for (const action of plan.actions) {
    if (action.type === 'direct') {
      await appel('/matches', PARAMS_DIRECT, async (json) => {
        const l = liste(json);
        vusEnDirect = new Set(l.map((m) => String(m.id)));
        await traiter(l);
      });
    } else if (action.type === 'affiches') {
      await appel('/matches', paramsAffiches(action.api_id), (json) => traiter(liste(json)));
    }
  }

  // Confirmation un par un des matchs qui ont disparu du direct (fin de match, forfait, suspension).
  for (const m of selectionnerDetails({ etat, maintenant, vusEnDirect, restant, parametres })) {
    await appel(`/matches/${m.api_id}`, {}, async (json) => {
      const un = json?.data && !Array.isArray(json.data) ? json.data : json;
      await traiter([un]);
    });
  }

  journal(`${resume.appels} appel(s) — ${resume.crees} créé(s), ${resume.maj} mis à jour, ${resume.anomalies.length} anomalie(s), ${resume.erreurs.length} erreur(s)`);
  return resume;
}
