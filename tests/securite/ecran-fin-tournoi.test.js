// Migration 0028 — écran de fin de tournoi : une fois par joueur, chacun ne touche qu'à ses lignes,
// rien pour les tournois déjà clos ni pour un compte créé après. Vraies migrations, vraies tentatives d'accès.
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
const vus = async (uid) => (await b.comme(uid, 'select joueur_id, tournament_id from public.ecrans_fin_tournoi_vus order by tournament_id')).rows;
const marquer = (uid, joueur, tournoi) =>
  b.comme(uid, 'insert into public.ecrans_fin_tournoi_vus (joueur_id, tournament_id) values ($1, $2)', [joueur, tournoi]);

test('visiteur non connecté : table illisible et non inscriptible', async () => {
  await refuse(b.anonyme('select * from public.ecrans_fin_tournoi_vus'));
  await refuse(b.anonyme('insert into public.ecrans_fin_tournoi_vus (joueur_id, tournament_id) values ($1, 1)', [ID.lea]));
});

test('un joueur inscrit son écran vu, ne voit que ses lignes, et ne peut ni écrire pour un autre ni modifier ni supprimer', async () => {
  await marquer(ID.lea, ID.lea, 1);
  await marquer(ID.marc, ID.marc, 1);
  assert.deepEqual(await vus(ID.lea), [{ joueur_id: ID.lea, tournament_id: 1 }]);
  assert.deepEqual(await vus(ID.marc), [{ joueur_id: ID.marc, tournament_id: 1 }]);
  await refuse(marquer(ID.lea, ID.marc, 2));                                   // pour un autre joueur
  await refuse(marquer(ID.pierre, ID.lea, 2));                                 // même l'administrateur : pas pour un autre
  await refuse(marquer(ID.lea, ID.lea, 1));                                    // déjà inscrit (clé unique)
  await b.comme(ID.lea, 'update public.ecrans_fin_tournoi_vus set vu_le = now() - interval \'1 day\'').then(
    () => assert.fail('modification autorisée'), () => {});
  const m = await b.comme(ID.lea, 'delete from public.ecrans_fin_tournoi_vus').then((r) => r, (e) => e);
  assert.ok(m instanceof Error || m.affectedRows === 0, 'suppression impossible');
  assert.equal((await vus(ID.lea)).length, 1, 'la ligne est toujours là');
});

test('l’appli inscrit l’écran avec « insérer sans doublon » : refaire l’appel (double clic, deuxième appareil) n’est pas une erreur', async () => {
  const sql = 'insert into public.ecrans_fin_tournoi_vus (joueur_id, tournament_id) values ($1, $2) on conflict (joueur_id, tournament_id) do nothing';
  await b.comme(ID.jacques, sql, [ID.jacques, 1]);
  await b.comme(ID.jacques, sql, [ID.jacques, 1]);
  assert.equal((await vus(ID.jacques)).length, 1);
  await refuse(b.comme(ID.jacques, sql, [ID.paul, 1]));
});

test('l’administrateur ne lit pas les écrans vus des autres joueurs', async () => {
  assert.deepEqual(await vus(ID.pierre), []);
});

test('tournois déjà clos : marqués vus pour les comptes existants à la migration ; compte créé plus tard : idem', async () => {
  const dossier = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'migrations');
  const db = new PGlite();
  await db.exec(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'supabase-simule.sql'), 'utf8'));
  const fichiers = readdirSync(dossier).filter((n) => n.endsWith('.sql')).sort();
  const avant = fichiers.filter((n) => n < '0028');
  for (const f of avant) await db.exec(readFileSync(join(dossier, f), 'utf8'));
  // état d'avant la migration : deux comptes, un tournoi clos, un tournoi en cours
  await db.exec(`
    insert into auth.users (id, email) values ('${ID.lea}', 'lea@x.invalid'), ('${ID.marc}', 'marc@x.invalid');
    insert into public.profiles (id, prenom) values ('${ID.lea}', 'Léa'), ('${ID.marc}', 'Marc');
    insert into public.tournaments (annee, nom, ville, surface, categorie, etat) values
      (2026, 'Clos', 'A', 'dur', 'masters_1000', 'clos'), (2026, 'En cours', 'B', 'dur', 'atp_finals', 'en_cours');
  `);
  await db.exec(readFileSync(join(dossier, fichiers.find((n) => n.startsWith('0028'))), 'utf8'));
  const lignes = async () => (await db.query('select p.prenom, t.nom from public.ecrans_fin_tournoi_vus e join public.profiles p on p.id = e.joueur_id join public.tournaments t on t.id = e.tournament_id order by 1, 2')).rows;
  assert.deepEqual(await lignes(), [{ prenom: 'Léa', nom: 'Clos' }, { prenom: 'Marc', nom: 'Clos' }], 'le tournoi en cours reste à voir');
  // compte créé après la migration : le tournoi déjà clos ne lui sera pas montré
  await db.exec(`insert into auth.users (id, email) values ('${ID.andre}', 'andre@x.invalid'); insert into public.profiles (id, prenom, is_test) values ('${ID.andre}', 'André', true);`);
  assert.deepEqual((await lignes()).filter((l) => l.prenom === 'André'), [{ prenom: 'André', nom: 'Clos' }]);
  // et le tournoi en cours, une fois clos, sera bien à voir pour tout le monde
  await db.exec("update public.tournaments set etat = 'clos' where nom = 'En cours'");
  assert.equal((await lignes()).filter((l) => l.nom === 'En cours').length, 0);
});
