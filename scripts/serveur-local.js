// Petit serveur local (sans dépendance) pour voir l'application sur ton PC : http://localhost:8080
// Usage : npm run web   (assemble le site puis le sert ; Ctrl+C pour arrêter)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const racine = join(fileURLToPath(new URL('.', import.meta.url)), '..');
execFileSync(process.execPath, [join(racine, 'scripts', 'assembler-site.js')], { stdio: 'inherit' });
const site = join(racine, '_site');

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  const chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const fichier = normalize(join(site, chemin === '/' ? 'index.html' : chemin));
  if (!fichier.startsWith(site)) { res.writeHead(403).end('Interdit'); return; }
  try {
    const contenu = await readFile(fichier);
    res.writeHead(200, { 'Content-Type': types[extname(fichier)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(contenu);
  } catch {
    res.writeHead(404).end('Introuvable');
  }
}).listen(8080, () => console.log('Application sur http://localhost:8080 (Ctrl+C pour arrêter)'));
