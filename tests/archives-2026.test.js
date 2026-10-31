// Données d'archives 2026 (supabase/archives-2026.sql) : contrôles de structure (11 tournois × 15 matchs, vainqueur = vainqueur de la finale).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/archives-2026.sql', import.meta.url), 'utf8');
const tournois = [...sql.matchAll(/^  \('((?:[^']|'')+)', '[^']+', '(?:dur|terre|gazon)', '(grand_slam|masters_1000)', '[\d-]+', '[\d-]+', '([^']+)', '([^']+)'\)[,;]$/gm)]
  .map((m) => ({ nom: m[1].replace(/''/g, "'"), categorie: m[2], vainqueur: m[3], finaliste: m[4] }));
const matchs = [...sql.matchAll(/^  \('((?:[^']|'')+)', (\d+), '(R16|QF|SF|F)', '((?:[^']|'')+)', '((?:[^']|'')+)', ([12]), (\d+|null), /gm)]
  .map((m) => ({ t: m[1].replace(/''/g, "'"), ordre: Number(m[2]), tour: m[3], p1: m[4].replace(/''/g, "'"), p2: m[5].replace(/''/g, "'"), v: Number(m[6]) }));

test('archives 2026 : 4 Grands Chelems et 7 Masters 1000, 15 matchs chacun (8 + 4 + 2 + 1)', () => {
  assert.equal(tournois.length, 11);
  assert.equal(tournois.filter((t) => t.categorie === 'grand_slam').length, 4);
  for (const t of tournois) {
    const ms = matchs.filter((m) => m.t === t.nom);
    assert.deepEqual(['R16', 'QF', 'SF', 'F'].map((r) => ms.filter((m) => m.tour === r).length), [8, 4, 2, 1], t.nom);
  }
});

test('archives 2026 : les vainqueurs d’un tour jouent le tour suivant ; vainqueur et finaliste = ceux de la finale', () => {
  const gagnant = (m) => (m.v === 1 ? m.p1 : m.p2);
  const perdant = (m) => (m.v === 1 ? m.p2 : m.p1);
  for (const t of tournois) {
    const ms = matchs.filter((m) => m.t === t.nom);
    for (const [tour, suite] of [['R16', 'QF'], ['QF', 'SF'], ['SF', 'F']]) {
      const g = new Set(ms.filter((m) => m.tour === tour).map(gagnant));
      const p = new Set(ms.filter((m) => m.tour === suite).flatMap((m) => [m.p1, m.p2]));
      assert.deepEqual([...g].sort(), [...p].sort(), `${t.nom} ${tour}`);
    }
    const finale = ms.find((m) => m.tour === 'F');
    assert.equal(gagnant(finale), t.vainqueur, t.nom);
    assert.equal(perdant(finale), t.finaliste, t.nom);
  }
});
