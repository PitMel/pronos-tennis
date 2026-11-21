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
  const { rows } = await db.query('select type, texte, image_url, actif from public.ecran_ouverture_contenus');
  const nb = (t, actif) => rows.filter((r) => r.type === t && r.actif === actif).length;
  assert.equal(nb('image', true), 12);
  assert.equal(nb('citation', true), 48);
  assert.equal(nb('citation', false), 0);
  assert.equal(nb('info', true), 5);
  assert.equal(nb('info', false), 0);
  assert.ok(rows.some((r) => r.texte?.startsWith('Pendant l’ère Open, aucun joueur')), 'la statistique précise l’ère Open');
  for (const r of rows.filter((x) => x.type === 'image')) {
    assert.match(r.image_url, /^\.\/images\/ouverture\/[a-z0-9-]+\.jpg$/);
    assert.ok(existsSync(join(racine, 'web', r.image_url.slice(2))), `image manquante : ${r.image_url}`);
  }
  assert.ok(rows.some((r) => r.texte?.includes('Ça fait un record')), 'les apostrophes et accents sont conservés');
  const { rows: reglage } = await db.query('select actif from public.ecran_ouverture_reglage');
  assert.deepEqual(reglage, [{ actif: false }], 'le script n’allume pas l’interrupteur');
});
