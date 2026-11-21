// Migration 0031 — écran d'ouverture : lecture pour les joueurs connectés, écriture réservée à l'administrateur,
// interrupteur éteint par défaut, aucun contenu inséré par la migration. Vraies migrations, vraies tentatives d'accès.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { creerBase, ID, REFUSE } from './base.js';

let b;
before(async () => { b = await creerBase(); });
const refuse = (p) => assert.rejects(p, REFUSE);
const ajout = (uid, type = 'info', texte = 'Une info') =>
  b.comme(uid, 'insert into public.ecran_ouverture_contenus (type, texte) values ($1, $2)', [type, texte]);

test('l’interrupteur est éteint par défaut et aucun contenu n’est inséré par la migration', async () => {
  assert.deepEqual((await b.comme(ID.pierre, 'select actif from public.ecran_ouverture_reglage')).rows, [{ actif: false }]);
  assert.equal((await b.comme(ID.pierre, 'select count(*)::int as n from public.ecran_ouverture_contenus')).rows[0].n, 0);
});

test('visiteur non connecté : rien à lire, rien à écrire', async () => {
  await refuse(b.anonyme('select * from public.ecran_ouverture_contenus'));
  await refuse(b.anonyme('select * from public.ecran_ouverture_reglage'));
  await refuse(b.anonyme('insert into public.ecran_ouverture_contenus (type, texte) values (\'info\', \'x\')'));
});

test('administrateur : ajoute, modifie, allume l’interrupteur ; joueur : lit seulement', async () => {
  await ajout(ID.pierre);
  await ajout(ID.pierre, 'citation', 'Une citation');
  assert.equal((await b.comme(ID.lea, 'select count(*)::int as n from public.ecran_ouverture_contenus')).rows[0].n, 2, 'un joueur lit');
  await refuse(ajout(ID.lea));
  await b.comme(ID.lea, 'update public.ecran_ouverture_contenus set actif = false').then((r) => assert.equal(r.affectedRows ?? 0, 0), () => {});
  await b.comme(ID.lea, 'delete from public.ecran_ouverture_contenus').then((r) => assert.equal(r.affectedRows ?? 0, 0), () => {});
  assert.equal((await b.comme(ID.pierre, 'select count(*)::int as n from public.ecran_ouverture_contenus where actif')).rows[0].n, 2, 'rien n’a bougé');
  await b.comme(ID.lea, 'update public.ecran_ouverture_reglage set actif = true').then((r) => assert.equal(r.affectedRows ?? 0, 0), () => {});
  assert.equal((await b.comme(ID.lea, 'select actif from public.ecran_ouverture_reglage')).rows[0].actif, false, 'le joueur n’allume pas l’écran');
  await b.comme(ID.pierre, 'update public.ecran_ouverture_reglage set actif = true');
  assert.equal((await b.comme(ID.lea, 'select actif from public.ecran_ouverture_reglage')).rows[0].actif, true);
});

test('règles de contenu : une image sans adresse et un texte vide sont refusés ; une seule ligne d’interrupteur', async () => {
  await refuse(b.comme(ID.pierre, 'insert into public.ecran_ouverture_contenus (type) values (\'image\')'));
  await refuse(ajout(ID.pierre, 'info', '  '));
  await refuse(ajout(ID.pierre, 'blague', 'x'));
  await refuse(b.comme(ID.pierre, 'insert into public.ecran_ouverture_reglage (id, actif) values (false, true)'));
});
