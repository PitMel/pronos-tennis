// Accès à Supabase pour la tâche de synchronisation : uniquement les fonctions SQL « sync_* » (réservées au rôle service),
// appelées par l'interface REST de Supabase (PostgREST). Aucune dépendance. La clé « service » vient d'une variable
// d'environnement (secret GitHub) ; elle n'est jamais écrite ni journalisée.

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export function creerBaseSupabase({ url, cle, fetchImpl = globalThis.fetch, dormirImpl = dormir, pauses = [1000, 4000, 10000] } = {}) {
  if (!url || !cle) throw new Error('Adresse Supabase ou clé de service absente.');
  const racine = url.replace(/\/+$/, '');

  async function rpc(fonction, args = {}) {
    // Les nouvelles clés « secrètes » (sb_secret_…) ne sont pas des jetons : elles ne vont que dans « apikey ».
    const entetes = { apikey: cle, 'Content-Type': 'application/json', Accept: 'application/json' };
    if (cle.startsWith('eyJ')) entetes.Authorization = `Bearer ${cle}`;
    let derniere = null;
    for (let essai = 0; essai <= pauses.length; essai += 1) {
      try {
        const r = await fetchImpl(`${racine}/rest/v1/rpc/${fonction}`, { method: 'POST', headers: entetes, body: JSON.stringify(args) });
        const texte = await r.text();
        if (r.ok) return texte ? JSON.parse(texte) : null;
        derniere = new Error(`Supabase ${fonction} : réponse ${r.status} ${texte.slice(0, 300)}`);
        if (r.status < 500 && r.status !== 429) throw derniere; // erreur de notre côté : inutile de réessayer
      } catch (e) {
        if (e === derniere) throw e;
        derniere = new Error(`Supabase ${fonction} : ${e?.cause?.code ?? e?.message ?? 'erreur réseau'}`);
      }
      if (essai < pauses.length) await dormirImpl(pauses[essai]);
    }
    throw derniere;
  }

  return {
    etat: () => rpc('sync_etat'),
    clotureCandidats: () => rpc('sync_cloture_candidats'),
    donneesCloture: (tournoi) => rpc('sync_donnees_cloture', { p_tournoi: tournoi }),
    cloturer: (tournoi, resultats) => rpc('sync_cloturer_tournoi', { p_tournoi: tournoi, p_resultats: resultats }),
    appliquer: (payload) => rpc('sync_appliquer', { p_payload: payload }),
    enregistrerAppel: ({ endpoint = null, httpStatus = null, ok = true, quotaRestant = null, message = null, resetA = null }) =>
      rpc('sync_enregistrer_appel', {
        p_endpoint: endpoint, p_http_status: httpStatus, p_ok: ok, p_quota_restant: quotaRestant, p_message: message, p_reset_a: resetA,
      }),
  };
}
