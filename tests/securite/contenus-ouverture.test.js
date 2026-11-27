// Le script d'insertion des contenus de l'écran d'ouverture (supabase/contenus-ouverture.sql) passe les règles de la migration 0031,
// et chaque image qu'il cite existe dans web/images/ouverture/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const ici = dirname(fileURLToPath(import.meta.url));
const racine = join(ici, '..', '..');

test('le script d’insertion est valide, rend des contenus complets, et toutes ses images existent', async () => {
  const db = new PGlite();
  await db.exec(readFileSync(join(ici, 'supabase-simule.sql'), 'utf8'));
  const dossier = join(racine, 'supabase', 'migrations');
  for (const f of readdirSync(dossier).filter((n) => n.endsWith('.sql')).sort()) await db.exec(readFileSync(join(dossier, f), 'utf8'));
  await db.exec(readFileSync(join(racine, 'supabase', 'contenus-ouverture.sql'), 'utf8'));
  const { rows } = await db.query('select type, texte, source, image_url, actif from public.ecran_ouverture_contenus');
  const nb = (t, actif) => rows.filter((r) => r.type === t && r.actif === actif).length;
  assert.equal(nb('image', true), 22);
  assert.equal(nb('citation', true), 48);
  assert.equal(nb('citation', false), 0);
  assert.equal(nb('info', true), 14);
  assert.equal(nb('info', false), 0);
  assert.ok(rows.some((r) => r.texte?.startsWith('Pendant l’ère Open, aucun joueur')), 'la statistique précise l’ère Open');
  for (const r of rows.filter((x) => x.type === 'image')) {
    assert.match(r.image_url, /^\.\/images\/ouverture\/[a-z0-9-]+\.jpg$/);
    assert.ok(existsSync(join(racine, 'web', r.image_url.slice(2))), `image manquante : ${r.image_url}`);
  }
  assert.ok(rows.some((r) => r.texte?.includes('Ça fait un record')), 'les apostrophes et accents sont conservés');
  const cobolli = rows.find((r) => r.image_url?.includes('cobolli'));
  assert.equal(cobolli.texte, 'C’est à moi que tu parles ?!');
  assert.equal(cobolli.source, 'Flavio Cobolli 2026', 'détails (joueur, année) séparés du titre');
  const images = rows.filter((r) => r.type === 'image');
  assert.equal(images.filter((r) => r.texte === null && r.source === null).length, 6, 'six images sans légende');
  assert.equal(images.filter((r) => r.texte === null && r.source !== null).length, 5, 'cinq images avec détails seulement');
  assert.equal(images.filter((r) => r.texte !== null && r.source !== null).length, 10, 'dix images avec titre et détails');
  assert.equal(images.filter((r) => r.texte !== null && r.source === null).length, 1, '« Ouch.... » : titre seul');
  assert.ok(images.every((r) => !/\s-\s/.test(r.texte ?? '')), 'plus de « - » dans les titres : le reste est dans les détails');
  const classement = rows.find((r) => r.texte?.startsWith('🏆 Meilleur ratio'));
  const pourcents = [...classement.texte.matchAll(/\((\d+,\d)\u00a0%\)/g)].map((m) => Number(m[1].replace(',', '.')));
  assert.deepEqual(pourcents, [40.7, 33.3, 28.6, 26.9, 25.0, 15.6], 'classement des ratios, ordre décroissant');
  assert.match(classement.texte, /🥇 Björn Borg : 11\/27/);
  assert.ok(rows.some((r) => r.texte?.includes('forfait 7 fois à Wimbledon')));
  for (const debut of ['🏆 Séries record de finales', '🏆 Séries record de demi-finales', '🏆 Séries record de quarts de finale']) {
    const s = rows.find((r) => r.texte?.startsWith(debut));
    assert.ok(s, `statistique manquante : ${debut}`);
    const series = [...s.texte.matchAll(/ : (\d+) \(/g)].map((m) => Number(m[1]));
    assert.ok(series.length >= 4, `${debut} : au moins quatre lignes`);
    assert.deepEqual(series, [...series].sort((a, b) => b - a), `${debut} : ordre décroissant`);
  }
  assert.ok(rows.some((r) => r.texte?.includes('Masters 1000, Djokovic, Nadal et Federer occupent le podium')), 'podium Masters 1000');
  const { rows: reglage } = await db.query('select actif from public.ecran_ouverture_reglage');
  assert.deepEqual(reglage, [{ actif: false }], 'le script n’allume pas l’interrupteur');
});
