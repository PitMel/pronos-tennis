// enregistrerPari : insertion, mise à jour, repli sur 23505, pari fermé — avec un faux client Supabase.
import test from 'node:test';
import assert from 'node:assert/strict';
import { creerDonnees } from '../../web/js/donnees.js';

function fauxSupabase({ insertErreur = null, majLignes = [{ id: 1 }], majErreur = null } = {}) {
  const appels = [];
  const client = {
    appels,
    from(table) {
      return {
        insert(valeurs) { appels.push(['insert', table, valeurs]); return Promise.resolve({ error: insertErreur }); },
        update(valeurs) {
          appels.push(['update', table, valeurs]);
          const filtres = {};
          const chaine = {
            eq(col, v) { filtres[col] = v; return chaine; },
            select() { appels.push(['filtres', filtres]); return Promise.resolve({ data: majLignes, error: majErreur }); },
          };
          return chaine;
        },
      };
    },
  };
  return client;
}

const pari = { choix: 2, confiance: 8, sets: 4 };

test('enregistrerPari : premier pari = insertion (sans identifiant de parieur : la base le pose)', async () => {
  const c = fauxSupabase();
  const r = await creerDonnees(c).enregistrerPari({ matchId: 5, moi: 'u1', pari, existe: false });
  assert.equal(r, 'cree');
  assert.deepEqual(c.appels, [['insert', 'bets', { match_id: 5, choix: 2, confiance: 8, sets: 4 }]]);
});

test('enregistrerPari : pari existant = mise à jour de choix, confiance, sets seulement', async () => {
  const c = fauxSupabase();
  const r = await creerDonnees(c).enregistrerPari({ matchId: 5, moi: 'u1', pari: { choix: 1, confiance: 6 }, existe: true });
  assert.equal(r, 'remplace');
  assert.deepEqual(c.appels[0], ['update', 'bets', { choix: 1, confiance: 6, sets: null }]);
  assert.deepEqual(c.appels[1], ['filtres', { match_id: 5, joueur_id: 'u1' }]);
});

test('enregistrerPari : pari déjà posé ailleurs (23505) = on le remplace', async () => {
  const c = fauxSupabase({ insertErreur: { code: '23505' } });
  const r = await creerDonnees(c).enregistrerPari({ matchId: 5, moi: 'u1', pari, existe: false });
  assert.equal(r, 'remplace');
  assert.deepEqual(c.appels.map((a) => a[0]), ['insert', 'update', 'filtres']);
});

test('enregistrerPari : mise à jour sans ligne touchée = pari fermé ; autres erreurs remontées', async () => {
  await assert.rejects(
    creerDonnees(fauxSupabase({ majLignes: [] })).enregistrerPari({ matchId: 5, moi: 'u1', pari, existe: true }),
    { code: 'PARI_FERME' },
  );
  await assert.rejects(
    creerDonnees(fauxSupabase({ insertErreur: { code: '42501', message: 'rls' } })).enregistrerPari({ matchId: 5, moi: 'u1', pari, existe: false }),
    { code: '42501' },
  );
  await assert.rejects(
    creerDonnees(fauxSupabase({ majErreur: { code: 'XX', message: 'x' } })).enregistrerPari({ matchId: 5, moi: 'u1', pari, existe: true }),
    { code: 'XX' },
  );
});
