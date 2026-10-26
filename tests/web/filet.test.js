// Terrain « Filet » : géométrie, saisie au toucher, rendu SVG.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CRAN, DEMI, MARGE, NET, HAUTEUR, positionsColonnes, largeurBarre, longueurBarre, pariDepuisY, svgTerrain, svgBrouillon,
} from '../../web/js/filet.js';

test('longueurBarre : un cran par point de confiance au-dessus de 5', () => {
  assert.equal(longueurBarre(6), CRAN);
  assert.equal(longueurBarre(10), 5 * CRAN);
  assert.equal(longueurBarre(10), DEMI);
});

test('pariDepuisY : moitié haute = joueur 1, basse = joueur 2, crans = confiance', () => {
  assert.deepEqual(pariDepuisY(NET - 1), { choix: 1, confiance: 6 });
  assert.deepEqual(pariDepuisY(NET + 1), { choix: 2, confiance: 6 });
  assert.deepEqual(pariDepuisY(NET - CRAN * 2 - 1), { choix: 1, confiance: 8 });
  assert.deepEqual(pariDepuisY(NET + CRAN * 4 + 1), { choix: 2, confiance: 10 });
  // hors terrain : on reste dans les bornes
  assert.deepEqual(pariDepuisY(-50), { choix: 1, confiance: 10 });
  assert.deepEqual(pariDepuisY(HAUTEUR + 50), { choix: 2, confiance: 10 });
  assert.equal(pariDepuisY(MARGE).confiance, 10);
});

test('positionsColonnes : n colonnes régulières, dans l’ordre, dans le terrain', () => {
  for (const n of [1, 2, 3, 4, 6]) {
    const xs = positionsColonnes(n);
    assert.equal(xs.length, n);
    assert.deepEqual([...xs].sort((a, b) => a - b), xs);
    assert.ok(xs[0] > 24 && xs[n - 1] < 226);
  }
  assert.ok(largeurBarre(4) <= 34 && largeurBarre(8) >= 18);
});

test('svgTerrain : barres de la bonne taille, couleurs selon le résultat, marqueurs', () => {
  const html = svgTerrain({
    colonnes: [
      { id: 'a', lettre: 'P', moi: true, pari: { choix: 1, confiance: 8 }, nuance: 'faux', texte: '−1,5' },
      { id: 'b', lettre: 'L', pari: { choix: 2, confiance: 7 }, nuance: 'juste', texte: '+3' },
      { id: 'c', lettre: 'M', pari: null, aParie: false },
    ],
    gagnant: 2,
  });
  assert.match(html, /^<svg/);
  assert.match(html, /barre-faux" data-choix="1" data-confiance="8"/);
  assert.match(html, /barre-juste" data-choix="2" data-confiance="7"/);
  assert.match(html, /<rect[^>]*height="72"/); // confiance 8 → 3 crans de 24
  assert.match(html, /−1,5/);
  assert.match(html, /marqueur-attend/); // Marc n'a pas encore parié
  assert.doesNotMatch(html, /class="brouillon"/);
});

test('svgTerrain : en saisie, un groupe « brouillon » pour la colonne du compte connecté, et le barème', () => {
  const annotations = [6, 7, 8, 9, 10].map((c) => ({ confiance: c, gagne: '+1', perdu: '−1', perduNegatif: true }));
  const html = svgTerrain({
    colonnes: [{ id: 'a', lettre: 'P', moi: true, pari: null }], brouillon: { choix: 1, confiance: 9 }, edition: true, annotations,
  });
  assert.match(html, /class="brouillon" data-cx="[\d.]+" data-largeur="\d+"/);
  assert.match(html, /stroke-dasharray="5 3"/);
  assert.equal((html.match(/<tspan fill="#fff"/g) ?? []).length, 5); // barème sur la seule moitié choisie
});

test('svgBrouillon : rien tant que le pari est incomplet', () => {
  assert.equal(svgBrouillon(50, 20, null), '');
  assert.equal(svgBrouillon(50, 20, { choix: 1 }), '');
  assert.equal(svgBrouillon(50, 20, { choix: 3, confiance: 8 }), '');
  assert.match(svgBrouillon(50, 20, { choix: 2, confiance: 6 }), /<rect/);
});
