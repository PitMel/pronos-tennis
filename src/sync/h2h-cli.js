// Lancement de la tâche H2H (voir h2h-job.js).
//   node src/sync/h2h-cli.js --besoin        affiche « besoin=true|false » (et l'écrit dans $GITHUB_OUTPUT) : y a-t-il des paires à calculer ?
//   node src/sync/h2h-cli.js                 calcule et enregistre
//   node src/sync/h2h-cli.js --simulation    calcule et affiche, sans rien enregistrer
//   node src/sync/h2h-cli.js --essai         comme --simulation, avec une paire fictive (Sinner – Alcaraz) : vérifie les téléchargements et le rapprochement, sans toucher à la base
// Variables : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ; H2H_DOSSIER (dossier de travail, défaut « h2h-donnees »).
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { creerBaseSupabase } from './base.js';
import { executerH2H } from './h2h-job.js';

const masquer = (t, secrets) => secrets.filter(Boolean).reduce((s, x) => s.split(x).join('***'), String(t));

async function telechargerTexte(url, fetchImpl) {
  let derniere = null;
  for (const pause of [0, 2000, 8000]) {
    if (pause) await new Promise((r) => setTimeout(r, pause));
    try {
      const r = await fetchImpl(url, { headers: { 'User-Agent': 'pronos-tennis (usage personnel, non commercial)' } });
      if (!r.ok) { derniere = new Error(`HTTP ${r.status} pour ${url}`); if (r.status < 500 && r.status !== 429) throw derniere; continue; }
      const texte = await r.text();
      if (!texte.startsWith('tourney_id,')) throw new Error(`contenu inattendu pour ${url} (le site a peut-être changé)`);
      return texte;
    } catch (e) { derniere = e; if (/inattendu|HTTP 4/.test(e.message)) break; }
  }
  throw derniere;
}

export async function lancer({ argv = [], env = {}, fetchImpl = globalThis.fetch, sortie = console.log, maintenant = new Date() } = {}) {
  const ecrire = (t) => sortie(masquer(t, [env.SUPABASE_SERVICE_ROLE_KEY]));
  if (!argv.includes('--essai') && (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)) { ecrire('ERREUR : SUPABASE_URL et/ou SUPABASE_SERVICE_ROLE_KEY absents.'); return 1; }
  const essai = argv.includes('--essai');
  const base = essai
    ? { h2hACalculer: async () => [{ joueur_a: 1, joueur_b: 2, nom_a: 'Jannik Sinner', nom_b: 'Carlos Alcaraz', atp_a: null, atp_b: null, tournois: ['essai'] }], h2hEnregistrer: async () => ({}) }
    : creerBaseSupabase({ url: env.SUPABASE_URL, cle: env.SUPABASE_SERVICE_ROLE_KEY, fetchImpl });
  const seulementBesoin = argv.includes('--besoin');
  try {
    const r = await executerH2H({
      base, telecharger: (u) => telechargerTexte(u, fetchImpl), dossier: env.H2H_DOSSIER || 'h2h-donnees', maintenant,
      simulation: essai || argv.includes('--simulation'), seulementBesoin, journal: ecrire,
    });
    if (seulementBesoin) {
      ecrire(`besoin=${r.besoin}`);
      if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `besoin=${r.besoin}\n`);
      return 0;
    }
    ecrire(`Résultat : ${r.paires} paire(s) à calculer, ${r.enregistrees} enregistrée(s), ${r.indisponibles} indisponible(s), ${r.telecharges} fichier(s) téléchargé(s)`);
    for (const e of r.erreurs) ecrire(`  erreur ${e}`);
    if (r.resultat) {
      for (const p of r.resultat) ecrire(`  [simulation] ${p.joueur_a}-${p.joueur_b} : ${p.statut} ${p.victoires_a ?? ''}-${p.victoires_b ?? ''} ${p.raison ?? ''}`);
      if (essai) for (const x of r.resultat[0]?.rencontres?.slice(0, 5) ?? []) ecrire(`    ${x.annee} ${x.tournoi} (${x.surface}, ${x.tour}) ${x.score} — vainqueur : ${x.vainqueur === 'a' ? 'Sinner' : 'Alcaraz'}`);
    }
    if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `modifie=${r.modifie}\n`);
    return r.erreurs.length > 0 ? 1 : 0;
  } catch (e) {
    ecrire(`ERREUR : ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  lancer({ argv: process.argv.slice(2), env: process.env }).then((code) => { process.exitCode = code; });
}
