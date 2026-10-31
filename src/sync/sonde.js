// Sonde d'exploration de l'API (lecture seule, aucune écriture dans la base) : retrouver les éditions 2026 des tournois déjà joués
// et voir quels appels gratuits renvoient des matchs terminés. Lancée par « node src/sync/cli.js --sonde ».

const RECHERCHES = ['Australian Open', 'Roland Garros', 'Wimbledon', 'US Open', 'Indian Wells', 'Miami', 'Monte Carlo', 'Madrid', 'Rome', 'Montreal', 'Toronto', 'Cincinnati'];
const SANS_STATUT = ['1253', '1903']; // Indian Wells : les deux identifiants du catalogue

const court = (v, n = 1500) => {
  const t = typeof v === 'string' ? v : JSON.stringify(v);
  return t.length > n ? `${t.slice(0, n)} … (tronqué)` : t;
};
const liste = (json) => (Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : []);

export async function sonde({ api, ecrire }) {
  for (const terme of RECHERCHES) {
    try {
      const r = await api.get('/tournaments', { search: terme, limit: 40 });
      const l = liste(r.json).filter((t) => (t.tour ?? 'atp') === 'atp' && (t.gender ?? 'men') === 'men');
      ecrire(`recherche « ${terme} » : ${liste(r.json).length} résultat(s), ${l.length} ATP messieurs`);
      for (const t of l) ecrire(`  ${court(t, 600)}`);
    } catch (e) {
      ecrire(`recherche « ${terme} » : ÉCHEC ${e.message}`);
    }
  }
  for (const id of SANS_STATUT) {
    try {
      const r = await api.get('/matches', { tournament_id: id, draw: 'singles', limit: 200 });
      const l = liste(r.json);
      const compte = {};
      for (const m of l) { const k = `${m.status}/${m.round_code}`; compte[k] = (compte[k] ?? 0) + 1; }
      ecrire(`matchs du tournoi ${id} sans filtre de statut : ${l.length} — ${court(compte)}`);
      if (r.json?.meta) ecrire(`  meta : ${court(r.json.meta, 300)}`);
      const f = l.find((m) => m.status === 'completed');
      if (f) ecrire(`  exemple terminé : ${court(f, 1800)}`);
    } catch (e) {
      ecrire(`matchs du tournoi ${id} sans statut : ÉCHEC ${e.message}`);
    }
  }
  try {
    const r = await api.get('/fixtures', { tournament_id: SANS_STATUT[0], limit: 5 });
    ecrire(`fixtures du tournoi ${SANS_STATUT[0]} : clés racine ${Object.keys(r.json ?? {}).join(', ')} — ${court(liste(r.json).slice(0, 2), 1500)}`);
  } catch (e) {
    ecrire(`fixtures : ÉCHEC ${e.message}`);
  }
}
