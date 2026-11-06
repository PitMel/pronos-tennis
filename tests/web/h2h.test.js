import test from 'node:test';
import assert from 'node:assert/strict';
import { cleH2H, h2hDuMatch, htmlCompteurH2H, htmlFenetreH2H } from '../../web/js/h2h.js';
import { htmlCarteMatch } from '../../web/js/cartes.js';

const ligne = { joueur_a: 5, joueur_b: 9, statut: 'ok', victoires_a: 10, victoires_b: 7,
  par_surface: [{ surface: 'Dur', a: 6, b: 5 }, { surface: 'Gazon', a: 4, b: 2 }],
  rencontres: [{ annee: 2026, tournoi: 'Monte Carlo', surface: 'Terre battue', tour: 'Finale', score: '7-6(5) 6-3', vainqueur: 'b', classement_vainqueur: 2, classement_vaincu: 1 },
    { annee: 2025, tournoi: 'US Open', surface: 'Dur', tour: 'Finale', score: '6-2 3-6 6-1 6-4', vainqueur: 'a', classement_vainqueur: 1, classement_vaincu: 4 }] };
const h2h = new Map([['5-9', ligne], ['5-6', { joueur_a: 5, joueur_b: 6, statut: 'indisponible', raison: 'joueur non reconnu' }]]);

test('h2hDuMatch : orienté du point de vue de p1, quel que soit l’ordre des identifiants', () => {
  const direct = h2hDuMatch(h2h, { p1_id: 5, p2_id: 9 });
  assert.deepEqual([direct.v1, direct.v2], [10, 7]);
  assert.deepEqual(direct.rencontres.map((r) => r.vainqueur), [2, 1]);
  const inverse = h2hDuMatch(h2h, { p1_id: 9, p2_id: 5 });
  assert.deepEqual([inverse.v1, inverse.v2], [7, 10]);
  assert.deepEqual(inverse.rencontres.map((r) => r.vainqueur), [1, 2]);
  assert.deepEqual(inverse.parSurface[0], { surface: 'Dur', v1: 5, v2: 6 });
  assert.equal(h2hDuMatch(h2h, { p1_id: 5, p2_id: 6 }), null); // indisponible
  assert.equal(h2hDuMatch(h2h, { p1_id: 1, p2_id: 2 }), null); // pas encore calculé
  assert.equal(cleH2H(9, 5), '5-9');
});

test('compteur et fenêtre : chiffres de chaque côté, bouton H2H sur la ligne, tableau trié, deux couleurs', () => {
  const m = { p1_id: 9, p2_id: 5 };
  const c = htmlCompteurH2H(m, h2hDuMatch(h2h, m));
  assert.match(c, /<b>7<\/b>[\s\S]*data-action="h2h"[^>]*>H2H<\/button>[\s\S]*<b>10<\/b>/);
  assert.equal(htmlCompteurH2H(m, null), '<div class="h2h-indispo">H2H indisponible</div>');
  const f = htmlFenetreH2H(h2hDuMatch(h2h, m), 'Alcaraz', 'Sinner');
  assert.match(f, /h2h-gros[\s\S]*Alcaraz <b>7<\/b>[\s\S]*<b>10<\/b> Sinner/);
  // colonnes : « Classement vaincu » entre Vainqueur et Tournoi, sur deux lignes
  assert.deepEqual([...f.matchAll(/<th scope="col"[^>]*>(.+?)<\/th>/g)].map((x) => x[1].replace('<br>', '|')), ['Année', 'Vainqueur', 'Classement|vaincu', 'Tournoi', 'Tour', 'Surface', 'Score']);
  assert.ok(f.indexOf('2026') < f.indexOf('2025')); // le plus récent d'abord
  // p1 (Alcaraz) a gagné en 2026, n° 2 à l'époque, contre Sinner n° 1 ; le classement suit le nom, sans parenthèses
  assert.match(f, /<tr class="h2h-g1"><td>2026<\/td><th scope="row">Alcaraz\s<span class="h2h-rang">2<\/span><\/th><td class="h2h-centre">1<\/td><td>Monte Carlo<\/td>/);
  assert.match(f, /<tr class="h2h-g2"><td>2025<\/td><th scope="row">Sinner\s<span class="h2h-rang">1<\/span><\/th><td class="h2h-centre">4<\/td>/);
  assert.doesNotMatch(f, /\(\s*<span class="h2h-rang"|<b>\s*<span class="h2h-rang"/, 'ni parenthèses ni gras autour du classement du vainqueur');
  assert.match(f, /h2h-score h2h-centre/, 'scores centrés sous leur intitulé');
  assert.match(f, /TennisMyLife/);
  assert.match(htmlFenetreH2H({ v1: 0, v2: 0, parSurface: [], rencontres: [] }, 'A', 'B'), /Première rencontre/);
});

test('carte de match : le H2H remplace les scores tant qu’il n’y en a pas ; sans fonction activée, rien ne change', () => {
  const joueurs = new Map([[5, { id: 5, nom: 'Jannik Sinner' }], [9, { id: 9, nom: 'Carlos Alcaraz' }]]);
  const match = { id: 1, tournament_id: 1, tour: 'R16', p1_id: 9, p2_id: 5, statut: 'a_venir', heure_prevue: '2026-11-04T10:00:00Z', neutralise: false, verrouille: false, resultat_visible: false };
  const avec = htmlCarteMatch(match, { joueurs, profils: [], categorie: 'masters_1000', h2h });
  assert.match(avec, /class="tableau-score"[\s\S]*Alcaraz[\s\S]*<b>7<\/b>[\s\S]*>H2H<\/button>[\s\S]*<b>10<\/b>[\s\S]*Sinner/);
  const sans = htmlCarteMatch(match, { joueurs, profils: [], categorie: 'masters_1000', h2h: new Map() });
  assert.match(sans, /H2H indisponible/);
  assert.doesNotMatch(htmlCarteMatch(match, { joueurs, profils: [], categorie: 'masters_1000' }), /H2H/);
  // match terminé avec score visible : ce sont les jeux qui s'affichent
  const fini = { ...match, statut: 'termine', resultat_visible: true, vainqueur: 1, score: { games: [[6, 4], [6, 3]] }, sets_joues: 2 };
  const f = htmlCarteMatch(fini, { joueurs, profils: [], categorie: 'masters_1000', h2h });
  assert.doesNotMatch(f, /btn-h2h/);
  assert.match(f, /<div class="sets/);
});

test('fenêtre H2H : lignes calculées avant l\'ajout des classements (ou classement inconnu) : pas de classement affiché, tiret dans la colonne du vaincu', () => {
  const ancienne = { ...ligne, rencontres: [{ annee: 2025, tournoi: 'US Open', surface: 'Dur', tour: 'Finale', score: '6-2 6-4', vainqueur: 'a' }, { annee: 2024, tournoi: 'Rome', surface: 'Terre battue', tour: 'Demi-finale', score: '7-5 6-4', vainqueur: 'b', classement_vainqueur: null, classement_vaincu: null }] };
  const m = { p1_id: 5, p2_id: 9 };
  const f = htmlFenetreH2H(h2hDuMatch(new Map([['5-9', ancienne]]), m), 'Sinner', 'Alcaraz');
  assert.doesNotMatch(f, /h2h-rang/);
  assert.equal([...f.matchAll(/<td class="h2h-centre">—<\/td>/g)].length, 2);
  assert.deepEqual(h2hDuMatch(new Map([['5-9', ancienne]]), m).rencontres.map((r) => [r.rangVainqueur, r.rangVaincu]), [[null, null], [null, null]]);
});

test('feuille de style : rouge à la place du vert dans la fenêtre H2H, colonnes centrées, classement du tournoi centré', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../../web/style.css', import.meta.url), 'utf8');
  const regle = (sel) => css.split('\n').find((l) => l.startsWith(sel)) ?? '';
  assert.match(regle('.h2h-table tr.h2h-g1'), /background: #F8DDDA/);
  assert.match(regle('.h2h-g1 b'), /color: #B42318/);
  assert.doesNotMatch(css, /h2h-g1[^\n]*(#DCEFE5|#1F6B4F)/, 'plus de vert pour le joueur 1');
  assert.match(regle('.h2h-table .h2h-centre'), /text-align: center/);
  assert.match(regle('.h2h-table .h2h-rang'), /font-weight: 400/);
  assert.match(regle('.classement-tournoi thead th, .classement-tournoi td'), /text-align: center/);
});
