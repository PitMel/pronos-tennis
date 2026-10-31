// Sonde d'exploration de l'API (lecture seule, aucune écriture dans la base) : retrouver les éditions 2026 des tournois déjà joués
// et voir quels appels gratuits renvoient des matchs terminés. Lancée par « node src/sync/cli.js --sonde ».

// Identifiants du catalogue (reference/api/masters_1000.json + première sonde du 31 oct. 2026) : on cherche lesquels sont l'édition 2026.
const CANDIDATS = {
  'Open d\'Australie': ['1238', '1236'], Wimbledon: ['1380', '2053'], 'US Open': ['1217', '1219'],
  'Indian Wells': ['1253', '1903'], Miami: ['1257', '1928'], 'Monte-Carlo': ['1262', '1970'], Madrid: ['1269', '2004'],
  Rome: ['1270', '2011'], Montréal: ['2078', '7607'], Toronto: ['1507', '1531'], Cincinnati: ['1210', '1211'],
};
const RECHERCHES_RG = ['French Open', 'Roland-Garros', 'Roland Garros', 'Paris'];

const court = (v, n = 1500) => {
  const t = typeof v === 'string' ? v : JSON.stringify(v);
  return t.length > n ? `${t.slice(0, n)} … (tronqué)` : t;
};
const liste = (json) => (Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : []);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

export async function sonde({ api, ecrire, attente = 2300 }) {
  for (const terme of RECHERCHES_RG) {
    try {
      const r = await api.get('/tournaments', { search: terme, limit: 40 });
      const l = liste(r.json).filter((t) => t.tour === 'atp' && t.gender === 'men');
      ecrire(`recherche « ${terme} » : ${liste(r.json).length} résultat(s), ATP messieurs : ${l.map((t) => `${t.id}=${t.name}/${t.city}/${t.category}`).join(' ; ')}`);
    } catch (e) {
      ecrire(`recherche « ${terme} » : ÉCHEC ${e.message}`);
    }
    await pause(attente);
  }
  let exemple = null;
  for (const [nom, ids] of Object.entries(CANDIDATS)) {
    for (const id of ids) {
      try {
        const r = await api.get('/matches', { tournament_id: id, draw: 'singles', limit: 200 });
        const l = liste(r.json);
        const statuts = {};
        for (const m of l) statuts[m.status] = (statuts[m.status] ?? 0) + 1;
        const dates = l.map((m) => m.scheduled_time).filter(Boolean).sort();
        const tours = [...new Set(l.map((m) => m.round_code))].join(',');
        ecrire(`${nom} ${id} : ${l.length} match(s) ${court(statuts, 200)} du ${dates[0]?.slice(0, 10) ?? '?'} au ${dates.at(-1)?.slice(0, 10) ?? '?'} tours ${tours} ; total API ${r.json?.meta?.total ?? '?'}`);
        exemple ??= l.find((m) => m.status === 'completed' && m.round_code === 'F') ?? null;
      } catch (e) {
        ecrire(`${nom} ${id} : ÉCHEC ${e.message}`);
      }
      await pause(attente);
    }
  }
  if (exemple) ecrire(`exemple de finale terminée : ${court(exemple, 1800)}`);
  try {
    const r = await api.get('/fixtures', { limit: 3 });
    ecrire(`fixtures : clés racine ${Object.keys(r.json ?? {}).join(', ')} — ${court(liste(r.json).slice(0, 1), 700)}`);
  } catch (e) {
    ecrire(`fixtures : ÉCHEC ${e.message}`);
  }
}
