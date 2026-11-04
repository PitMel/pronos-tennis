import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executerH2H, URL_GITHUB, URL_SITE } from '../../src/sync/h2h-job.js';

const ENTETE = 'tourney_id,tourney_name,surface,tourney_date,winner_id,winner_name,loser_id,loser_name,score,round';
const csvAnnee = (annee, lignes = []) => [ENTETE, ...lignes].join('\n');
const m = (annee, tournoi, w, wn, l, ln) => `${annee}-1,${tournoi},Hard,${annee}0601,${w},${wn},${l},${ln},6-4 6-4,F`;

function monde({ paires, courant2027 = [] }) {
  const appels = [];
  const enregistre = [];
  const base = {
    h2hACalculer: async () => paires.current,
    h2hEnregistrer: async (payload) => { enregistre.push(payload); return { paires: payload.paires.length, joueurs: payload.joueurs.length }; },
  };
  const telecharger = async (url) => {
    appels.push(url);
    if (url === URL_SITE(2027)) return csvAnnee(2027, courant2027);
    const annee = Number(url.match(/(\d{4})\.csv$/)[1]);
    return csvAnnee(annee, annee === 2025 ? [m(2025, 'Wimbledon', 'S1', 'Jannik Sinner', 'A1', 'Carlos Alcaraz')] : []);
  };
  return { base, telecharger, appels, enregistre };
}
const paire = (tournois = [7]) => ({ joueur_a: 10, joueur_b: 20, nom_a: 'Jannik Sinner', nom_b: 'Carlos Alcaraz', atp_a: null, atp_b: null, tournois });

test('H2H : rien à calculer → aucun téléchargement', async () => {
  const w = monde({ paires: { current: [] } });
  const dossier = await mkdtemp(join(tmpdir(), 'h2h-'));
  const r = await executerH2H({ base: w.base, telecharger: w.telecharger, dossier, maintenant: new Date('2027-03-01T10:00:00Z'), premiereAnnee: 2024 });
  assert.equal(r.besoin, false);
  assert.equal(w.appels.length, 0);
});

test('H2H : seulement « besoin » ne télécharge rien', async () => {
  const w = monde({ paires: { current: [paire()] } });
  const dossier = await mkdtemp(join(tmpdir(), 'h2h-'));
  const r = await executerH2H({ base: w.base, telecharger: w.telecharger, dossier, seulementBesoin: true, premiereAnnee: 2024 });
  assert.deepEqual([r.besoin, w.appels.length], [true, 0]);
});

test('H2H : années terminées une seule fois, année courante au début de chaque nouveau tournoi, résultat enregistré', async () => {
  const w = monde({ paires: { current: [paire([7])] }, courant2027: [m(2027, 'Rome', 'A1', 'Carlos Alcaraz', 'S1', 'Jannik Sinner')] });
  const dossier = await mkdtemp(join(tmpdir(), 'h2h-'));
  const maintenant = new Date('2027-03-01T10:00:00Z');
  const r = await executerH2H({ base: w.base, telecharger: w.telecharger, dossier, maintenant, premiereAnnee: 2024 });
  // 2024 et 2025 depuis GitHub, 2026 (après 2025) depuis le site, 2027 (courante) depuis le site
  assert.deepEqual(w.appels, [URL_GITHUB(2024), URL_GITHUB(2025), URL_SITE(2026), URL_SITE(2027)]);
  assert.equal(r.enregistrees, 1);
  const p = w.enregistre[0].paires[0];
  assert.deepEqual([p.statut, p.victoires_a, p.victoires_b], ['ok', 1, 1]); // Sinner 1 (2025) – Alcaraz 1 (2027)
  assert.equal(p.rencontres[0].annee, 2027);
  assert.deepEqual(w.enregistre[0].joueurs.map((j) => j.atp_id).sort(), ['A1', 'S1']);

  // même tournoi, nouvelle affiche : rien n'est retéléchargé
  w.appels.length = 0;
  await executerH2H({ base: w.base, telecharger: w.telecharger, dossier, maintenant: new Date('2027-03-02T10:00:00Z'), premiereAnnee: 2024 });
  assert.deepEqual(w.appels, []);
  // un nouveau tournoi : seul le fichier de l'année courante est retéléchargé
  await executerH2H({ base: { ...w.base, h2hACalculer: async () => [paire([7, 8])] }, telecharger: w.telecharger, dossier, maintenant: new Date('2027-03-10T10:00:00Z'), premiereAnnee: 2024 });
  assert.deepEqual(w.appels, [URL_SITE(2027)]);
  const meta = JSON.parse(await readFile(join(dossier, 'meta.json'), 'utf8'));
  assert.deepEqual(meta.courant.tournois.sort(), ['7', '8']);
});

test('H2H : année 2026 téléchargée avant la fin de l’année → retéléchargée l’année suivante ; joueur inconnu → indisponible', async () => {
  const w = monde({ paires: { current: [{ ...paire([7]), nom_b: 'Illustre Inconnu' }] } });
  const dossier = await mkdtemp(join(tmpdir(), 'h2h-'));
  await executerH2H({ base: w.base, telecharger: w.telecharger, dossier, maintenant: new Date('2026-11-04T10:00:00Z'), premiereAnnee: 2025 });
  const meta = JSON.parse(await readFile(join(dossier, 'meta.json'), 'utf8'));
  assert.equal(meta.annees[2026].telecharge_le.slice(0, 4), '2026');
  const p = w.enregistre[0].paires[0];
  assert.equal(p.statut, 'indisponible');
  assert.match(p.raison, /Illustre Inconnu/);
  w.appels.length = 0;
  const w2 = { ...w, base: { ...w.base, h2hACalculer: async () => [paire([9])] } };
  await executerH2H({ base: w2.base, telecharger: async (u) => { w.appels.push(u); return csvAnnee(2026); }, dossier, maintenant: new Date('2027-01-05T10:00:00Z'), premiereAnnee: 2025 });
  assert.ok(w.appels.includes(URL_SITE(2026))); // le fichier 2026 pris en cours d'année est remplacé par la version finale
  assert.equal(w.appels.filter((u) => u === URL_GITHUB(2025)).length, 0); // 2025 déjà conservé
});

test('H2H : échec de téléchargement de l’historique → rien n’est enregistré ; échec de l’année courante avec ancien fichier → on continue', async () => {
  const dossier = await mkdtemp(join(tmpdir(), 'h2h-'));
  const enregistre = [];
  const base = { h2hACalculer: async () => [paire([7])], h2hEnregistrer: async (p) => { enregistre.push(p); return { paires: 1 }; } };
  const r = await executerH2H({ base, telecharger: async () => { throw new Error('réseau'); }, dossier, maintenant: new Date('2027-03-01T10:00:00Z'), premiereAnnee: 2025 });
  assert.equal(enregistre.length, 0);
  assert.match(r.erreurs.join(' '), /historique incomplet/);
  // les années passées sont maintenant en place ; le site courant tombe en panne mais on avait déjà un fichier 2027
  const w = monde({ paires: { current: [paire([7])] } });
  await executerH2H({ base: w.base, telecharger: w.telecharger, dossier, maintenant: new Date('2027-03-01T10:00:00Z'), premiereAnnee: 2025 });
  const r3 = await executerH2H({ base: { ...w.base, h2hACalculer: async () => [paire([7, 99])] }, telecharger: async () => { throw new Error('site en panne'); }, dossier, maintenant: new Date('2027-03-20T10:00:00Z'), premiereAnnee: 2025 });
  assert.match(r3.erreurs.join(' '), /site en panne/);
  assert.equal(w.enregistre.length, 2); // calcul fait quand même avec le fichier précédent
});

test('H2H : le programme en ligne de commande signale les variables absentes et écrit « besoin » pour GitHub', async () => {
  const { lancer } = await import('../../src/sync/h2h-cli.js');
  const sortie = [];
  assert.equal(await lancer({ env: {}, sortie: (t) => sortie.push(t) }), 1);
  assert.match(sortie.join(' '), /SUPABASE_URL/);
  const sortie2 = [];
  const fetchImpl = async (url) => ({ ok: true, status: 200, text: async () => JSON.stringify([]) });
  assert.equal(await lancer({ argv: ['--besoin'], env: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_abc' }, fetchImpl, sortie: (t) => sortie2.push(t) }), 0);
  assert.match(sortie2.join(' '), /besoin=false/);
  assert.doesNotMatch(sortie2.join(' '), /sb_secret_abc/);
});
