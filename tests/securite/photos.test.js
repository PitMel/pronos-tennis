// Migration 0007 — photos de profil : chacun sa photo, l'administrateur toutes, rien d'autre ; adresse de photo contrôlée.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { creerBase, ID } from './base.js';

let b;
before(async () => { b = await creerBase(); });

const URL_BASE = 'https://wmqyplehxtafxoilllfd.supabase.co/storage/v1/object/public/avatars';
const ajouter = (uid, nom, bucket = 'avatars') => b.comme(uid, 'insert into storage.objects (bucket_id, name) values ($1, $2)', [bucket, nom]);
const compter = async (nom) => Number((await b.admin('select count(*) n from storage.objects where bucket_id = $1 and name = $2', ['avatars', nom])).rows[0].n);

test('le bucket est public, limité à 300 Ko et au JPEG', async () => {
  const r = (await b.admin("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars'")).rows[0];
  assert.equal(r.public, true);
  assert.equal(Number(r.file_size_limit), 307200);
  assert.deepEqual(r.allowed_mime_types, ['image/jpeg']);
});

test('un joueur envoie sa propre photo, pas celle d’un autre', async () => {
  await ajouter(ID.lea, `${ID.lea}.jpg`);
  assert.equal(await compter(`${ID.lea}.jpg`), 1);
  await assert.rejects(ajouter(ID.lea, `${ID.marc}.jpg`), /row-level security/);
  await assert.rejects(ajouter(ID.lea, 'autre-nom.jpg'), /row-level security/);
  await assert.rejects(ajouter(ID.lea, `${ID.lea}.jpg`, 'autre-bucket'), /violates|row-level|foreign/);
  assert.equal(await compter(`${ID.marc}.jpg`), 0);
});

test('anonyme : aucun envoi', async () => {
  await assert.rejects(b.anonyme('insert into storage.objects (bucket_id, name) values ($1, $2)', ['avatars', `${ID.paul}.jpg`]), /permission denied|row-level/);
});

test('l’administrateur envoie, remplace et supprime la photo de n’importe quel compte, mais seulement sous un nom <uuid>.jpg', async () => {
  await ajouter(ID.pierre, `${ID.marc}.jpg`);
  assert.equal(await compter(`${ID.marc}.jpg`), 1);
  const maj = await b.comme(ID.pierre, "update storage.objects set owner = auth.uid() where bucket_id = 'avatars' and name = $1", [`${ID.marc}.jpg`]);
  assert.equal(maj.affectedRows, 1);
  await assert.rejects(ajouter(ID.pierre, 'fichier-quelconque.png'), /row-level security/);
  const sup = await b.comme(ID.pierre, "delete from storage.objects where bucket_id = 'avatars' and name = $1", [`${ID.marc}.jpg`]);
  assert.equal(sup.affectedRows, 1);
  assert.equal(await compter(`${ID.marc}.jpg`), 0);
});

test('un joueur ne remplace ni ne supprime la photo d’un autre', async () => {
  await ajouter(ID.pierre, `${ID.paul}.jpg`);
  const maj = await b.comme(ID.lea, "update storage.objects set name = name where bucket_id = 'avatars' and name = $1", [`${ID.paul}.jpg`]);
  assert.equal(maj.affectedRows, 0);
  const sup = await b.comme(ID.lea, "delete from storage.objects where bucket_id = 'avatars' and name = $1", [`${ID.paul}.jpg`]);
  assert.equal(sup.affectedRows, 0);
  assert.equal(await compter(`${ID.paul}.jpg`), 1);
  const sien = await b.comme(ID.lea, "delete from storage.objects where bucket_id = 'avatars' and name = $1", [`${ID.lea}.jpg`]);
  assert.equal(sien.affectedRows, 1);
});

test('photo_url : seule une photo du bucket est acceptée (par le joueur comme par l’administrateur)', async () => {
  const maj = (uid, cible, url) => b.comme(uid, 'update public.profiles set photo_url = $1 where id = $2', [url, cible]);
  await maj(ID.lea, ID.lea, `${URL_BASE}/${ID.lea}.jpg?v=1730000000000`);
  await maj(ID.pierre, ID.marc, `${URL_BASE}/${ID.marc}.jpg`);
  await maj(ID.lea, ID.lea, null);
  for (const mauvais of ['https://exemple.com/photo.jpg', 'javascript:alert(1)', `${URL_BASE}/${ID.lea}.png`, `${URL_BASE}/../x.jpg`, `${URL_BASE}/${ID.lea}.jpg?v=1;drop`, 'http://wmqyplehxtafxoilllfd.supabase.co/storage/v1/object/public/avatars/' + ID.lea + '.jpg']) {
    await assert.rejects(maj(ID.lea, ID.lea, mauvais), /profiles_photo_url_valide|check/, mauvais);
    await assert.rejects(maj(ID.pierre, ID.lea, mauvais), /profiles_photo_url_valide|check/, mauvais);
  }
});

test('un joueur ne change pas la photo d’un autre joueur', async () => {
  const r = await b.comme(ID.lea, 'update public.profiles set photo_url = $1 where id = $2', [`${URL_BASE}/${ID.marc}.jpg`, ID.marc]);
  assert.equal(r.affectedRows, 0);
  const a = await b.comme(ID.pierre, 'update public.profiles set photo_url = $1 where id = $2', [`${URL_BASE}/${ID.marc}.jpg`, ID.marc]);
  assert.equal(a.affectedRows, 1);
});
