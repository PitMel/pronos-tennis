import test from 'node:test';
import assert from 'node:assert/strict';
import { couleursTournoi, styleCouleursTournoi, assombrir } from '../../web/js/couleurs-tournoi.js';
import { htmlPageTournoi } from '../../web/js/vues.js';
import { htmlEcranFin } from '../../web/js/ecran-fin.js';

test('couleurs choisies par Pierre, d’une année à l’autre', () => {
  for (const nom of ['Monte-Carlo Masters', 'Madrid Open', 'Masters de Rome', 'Roland-Garros 2027']) {
    assert.deepEqual([couleursTournoi({ nom }).fond, couleursTournoi({ nom }).terrain], ['#EB6510', '#EB6510'], nom);
  }
  assert.deepEqual([couleursTournoi({ nom: 'Wimbledon' }).fond, couleursTournoi({ nom: 'Wimbledon' }).terrain], ['#8AA74B', '#8AA74B']);
  assert.deepEqual(couleursTournoi({ nom: 'Nitto ATP Finals' }), { fond: '#6BA7ED', terrain: null, bareme: '#1F4E96' });
  assert.equal(couleursTournoi({ nom: 'Open d’Australie' }).fond, '#0091D2');
  assert.equal(couleursTournoi({ nom: 'Open d\'Australie' }).terrain, null, 'terrain inchangé');
});

test('autres tournois : rien (couleurs habituelles)', () => {
  assert.equal(couleursTournoi({ nom: 'US Open' }), null);
  assert.equal(styleCouleursTournoi({ nom: 'Miami Open' }), '');
});

test('le barème est une nuance plus sombre du fond', () => {
  assert.equal(assombrir('#EB6510', 0), '#eb6510');
  assert.equal(assombrir('#FFFFFF', 0.5), '#808080');
  const c = couleursTournoi({ nom: 'Wimbledon' });
  const lum = (h) => { const n = parseInt(h.slice(1), 16); return (n >> 16) + ((n >> 8) & 255) + (n & 255); };
  assert.ok(lum(c.bareme) < lum(c.fond));
});

test('variables posées sur la page du tournoi et sur l’écran de fin ; terrain seulement s’il est choisi', () => {
  assert.equal(styleCouleursTournoi({ nom: 'Wimbledon' }), `--fond-tournoi:#8AA74B;--bareme-tournoi:${assombrir('#8AA74B', 0.32)};--terrain:#8AA74B`);
  assert.doesNotMatch(styleCouleursTournoi({ nom: 'Open d’Australie' }), /--terrain/);
  const t = { id: 1, annee: 2026, nom: 'Roland-Garros', categorie: 'grand_slam', etat: 'en_cours', surface: 'terre' };
  assert.match(htmlPageTournoi({ tournoi: t, matchs: [], joueurs: new Map() }), /class="page-tournoi" style="--fond-tournoi:#EB6510/);
  assert.match(htmlPageTournoi({ tournoi: { ...t, nom: 'US Open' }, matchs: [], joueurs: new Map() }), /class="page-tournoi" style=""/);
  const classement = { lignes: [{ id: 'a', prenom: 'Léa', rang: 1, avantBonus: { texte: '10' } }] };
  assert.match(htmlEcranFin({ tournoi: t, classement, moi: 'a' }), /class="ecran-fin" style="--fond-tournoi:#EB6510/);
});
