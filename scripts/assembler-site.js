// Assemble le site à publier dans _site/ : l'application (web/) + le moteur de points (src/moteur/ → _site/moteur/).
// Aucune compilation : on copie des fichiers. Utilisé par le déploiement GitHub Pages et par « npm run web ».
import { cpSync, rmSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const sortie = join(racine, '_site');

rmSync(sortie, { recursive: true, force: true });
mkdirSync(sortie, { recursive: true });
cpSync(join(racine, 'web'), sortie, { recursive: true });
cpSync(join(racine, 'src', 'moteur'), join(sortie, 'moteur'), { recursive: true });
writeFileSync(join(sortie, '.nojekyll'), '');

if (!existsSync(join(sortie, 'index.html')) || !existsSync(join(sortie, 'moteur', 'index.js'))) {
  console.error('Assemblage incomplet : index.html ou moteur/index.js manquant.');
  process.exit(1);
}
console.log('Site assemblé dans _site/');
