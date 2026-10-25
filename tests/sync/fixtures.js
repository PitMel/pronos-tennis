// Matchs « tels que l'API les renvoie » (forme documentée) pour les tests de la synchronisation.
let n = 0;
export function matchApi(o = {}) {
  n += 1;
  return {
    id: o.id ?? `M${n}`,
    tour: 'atp',
    gender: 'men',
    draw: 'singles',
    is_qualifying: false,
    tournament_id: '1725',
    round_code: 'QF',
    status: 'upcoming',
    outcome: null,
    event_status: null,
    winner: null,
    scheduled_time: '2026-10-30T14:00:00Z',
    score: null,
    players: {
      p1: { id: `P${n}a`, name: `Joueur ${n}a`, country: 'FRA', ranking: 10 },
      p2: { id: `P${n}b`, name: `Joueur ${n}b`, country: 'ESP', ranking: 20 },
    },
    ...o,
  };
}

export const termine = (o = {}) => matchApi({
  status: 'completed', outcome: 'completed', winner: 1,
  score: { sets: [2, 1], games: [[6, 4], [3, 6], [7, 5]] }, ...o,
});
