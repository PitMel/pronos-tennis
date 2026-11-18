// Migration 0029 — écran de fin de saison : une fois par joueur, chacun ne touche qu'à ses lignes,
// rien pour les saisons déjà terminées ni pour un compte créé après. Vraies migrations, vraies tentatives d'accès.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { creerBase, ID, REFUSE } from './base.js';

let b;
before(async () => { b = await creerBase(); });

const refuse = (p) => assert.rejects(p, REFUSE);
const vus = async (uid) => (await b.comme(uid, 'select joueur_id, annee from public.ecrans_fin_saison_vus order by annee')).rows;
const marquer = (uid, joueur, annee) =>
  b.comme(uid, 'insert into public.ecrans_fin_saison_vus (joueur_id, annee) values ($1, $2)', [joueur, annee]);

test('visiteur non connecté : table illisible et non inscriptible', async () => {
  await refuse(b.anonyme('select * from public.ecrans_fin_saison_vus'));
  await refuse(b.anonyme('insert into public.ecrans_fin_saison_vus (joueur_id, annee) values ($1, 2026)', [ID.lea]));
});

test('un joueur inscrit son écran vu, ne voit que ses lignes, et ne peut ni écrire pour un autre ni modifier ni supprimer', async () => {
  await marquer(ID.lea, ID.lea, 2026);
  await marquer(ID.marc, ID.marc, 2026);
  assert.deepEqual(await vus(ID.lea), [{ joueur_id: ID.lea, annee: 2026 }]);
  assert.deepEqual(await vus(ID.marc), [{ joueur_id: ID.marc, annee: 2026 }]);
  await refuse(marquer(ID.lea, ID.marc, 2027));                                // pour un autre joueur
  await refuse(marquer(ID.pierre, ID.lea, 2027));                              // même l'administrateur : pas pour un autre
  await refuse(marquer(ID.lea, ID.lea, 2026));                                 // déjà inscrit (clé unique)
  await b.comme(ID.lea, 'update public.ecrans_fin_saison_vus set vu_le = now() - interval \'1 day\'').then(
    () => assert.fail('modification autorisée'), () => {});
  const m = await b.comme(ID.lea, 'delete from public.ecrans_fin_saison_vus').then((r) => r, (e) => e);
  assert.ok(m instanceof Error || m.affectedRows === 0, 'suppression impossible');
  assert.equal((await vus(ID.lea)).length, 1, 'la ligne est toujours là');
});

test('l’appli inscrit l’écran avec « insérer sans doublon » : refaire l’appel n’est pas une erreur', async () => {
  const sql = 'insert into public.ecrans_fin_saison_vus (joueur_id, annee) values ($1, $2) on conflict (joueur_id, annee) do nothing';
  await b.comme(ID.jacques, sql, [ID.jacques, 2026]);
  await b.comme(ID.jacques, sql, [ID.jacques, 2026]);
  assert.equal((await vus(ID.jacques)).length, 1);
  await refuse(b.comme(ID.jacques, sql, [ID.paul, 2026]));
});

test('l’administrateur ne lit pas les écrans vus des autres joueurs', async () => {
  assert.deepEqual(await vus(ID.pierre), []);
});

test('saisons déjà terminées : marquées vues à la migration et pour un compte créé plus tard ; la saison en cours reste à voir', async () => {
  const dossier = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'migrations');
  const db = new PGlite();
  await db.exec(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'supabase-simule.sql'), 'utf8'));
  const fichiers = readdirSync(dossier).filter((n) => n.endsWith('.sql')).sort();
  for (const f of fichiers.filter((n) => n < '0029')) await db.exec(readFileSync(join(dossier, f), 'utf8'));
  // avant la migration : deux comptes ; 2025 entièrement clos ; 2026 un tournoi clos et les ATP Finals en cours
  await db.exec(`
    insert into auth.users (id, email) values ('${ID.lea}', 'lea@x.invalid'), ('${ID.marc}', 'marc@x.invalid');
    insert into public.profiles (id, prenom) values ('${ID.lea}', 'Léa'), ('${ID.marc}', 'Marc');
    insert into public.tournaments (annee, nom, ville, surface, categorie, etat) values
      (2025, 'Ancien', 'A', 'dur', 'masters_1000', 'clos'), (2025, 'Ancien Finals', 'A', 'dur', 'atp_finals', 'clos'),
      (2026, 'Clos', 'B', 'dur', 'masters_1000', 'clos'), (2026, 'Finals', 'B', 'dur', 'atp_finals', 'en_cours');
  `);
  await db.exec(readFileSync(join(dossier, fichiers.find((n) => n.startsWith('0029'))), 'utf8'));
  const lignes = async () => (await db.query('select p.prenom, e.annee from public.ecrans_fin_saison_vus e join public.profiles p on p.id = e.joueur_id order by 1, 2')).rows;
  assert.deepEqual(await lignes(), [{ prenom: 'Léa', annee: 2025 }, { prenom: 'Marc', annee: 2025 }], '2026 n’est pas terminée : son écran reste à voir');
  await db.exec(`insert into auth.users (id, email) values ('${ID.andre}', 'andre@x.invalid'); insert into public.profiles (id, prenom, is_test) values ('${ID.andre}', 'André', true);`);
  assert.deepEqual((await lignes()).filter((l) => l.prenom === 'André'), [{ prenom: 'André', annee: 2025 }], 'compte créé plus tard : 2025 déjà vue, 2026 pas encore terminée');
  // la clôture des ATP Finals ne marque rien : l'écran de 2026 sera montré
  await db.exec("update public.tournaments set etat = 'clos' where nom = 'Finals'");
  assert.equal((await lignes()).filter((l) => l.annee === 2026).length, 0);
});
