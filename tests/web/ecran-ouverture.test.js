import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { contenuValide, choisirContenu, htmlEcranOuverture, classeTaille } from '../../web/js/ecran-ouverture.js';

const cit = { id: 1, type: 'citation', texte: 'Texte A', auteur: 'Quelqu’un', source: '2010', actif: true };
const inf = { id: 2, type: 'info', texte: 'Une info', actif: true };
const img = { id: 3, type: 'image', image_url: 'https://exemple.org/a.jpg', texte: 'Légende', source: 'Crédit', actif: true };

test('contenuValide : actif et complet, adresse d’image sûre seulement', () => {
  assert.equal(contenuValide(cit), true);
  assert.equal(contenuValide({ ...cit, actif: false }), false);
  assert.equal(contenuValide({ ...cit, texte: '  ' }), false);
  assert.equal(contenuValide(img), true);
  assert.equal(contenuValide({ ...img, image_url: 'images/a.jpg' }), false, 'chemin sans « ./ » ni « / » refusé');
  assert.equal(contenuValide({ ...img, image_url: './images/a.jpg' }), true);
  assert.equal(contenuValide({ ...img, image_url: 'javascript:alert(1)' }), false);
  assert.equal(contenuValide({ ...img, image_url: 'data:image/png;base64,AAA' }), false);
  assert.equal(contenuValide({ type: 'autre', texte: 'x' }), false);
  assert.equal(contenuValide(null), false);
});

test('choisirContenu : tirage au hasard parmi les valides, null si aucun', () => {
  const tous = [cit, { ...inf, actif: false }, img];
  assert.equal(choisirContenu(tous, () => 0).id, 1);
  assert.equal(choisirContenu(tous, () => 0.99).id, 3);
  assert.equal(choisirContenu(tous, () => 0.5).id, 3);
  assert.equal(choisirContenu([], () => 0), null);
  assert.equal(choisirContenu(undefined), null);
  assert.equal(choisirContenu([{ ...cit, actif: false }]), null);
});

test('htmlEcranOuverture : citation, info et image ; texte échappé ; tout l’écran est le bouton de fermeture', () => {
  const h = htmlEcranOuverture(cit);
  assert.match(h, /data-action="ecran-ouverture-fermer"/);
  assert.match(h, /« Texte A »/);
  assert.match(h, /<p class="ouverture-auteur">Quelqu’un<\/p>/);
  assert.match(h, /<p class="ouverture-source">2010<\/p>/);
  assert.match(htmlEcranOuverture(inf), /Le saviez-vous/);
  const hi = htmlEcranOuverture(img);
  assert.match(hi, /<img [^>]*src="https:\/\/exemple\.org\/a\.jpg"/);
  assert.match(hi, /Légende/);
  assert.doesNotMatch(htmlEcranOuverture({ ...cit, texte: '<script>x</script>' }), /<script>/);
  assert.doesNotMatch(htmlEcranOuverture(inf), /ouverture-signature/, 'pas de signature vide');
});

test('classeTaille : court, moyen, long selon le nombre de caractères ; la taille est portée par le texte', () => {
  assert.equal(classeTaille('Dix Grands Chelems.'), 'court');
  assert.equal(classeTaille('x'.repeat(91)), 'moyen');
  assert.equal(classeTaille('x'.repeat(181)), 'long');
  assert.equal(classeTaille(null), 'court');
  assert.match(htmlEcranOuverture({ ...cit, texte: 'x'.repeat(200) }), /ouverture-citation t-long/);
  assert.match(htmlEcranOuverture(inf), /ouverture-info t-court/);
});

test('statistique sur plusieurs lignes : les retours à la ligne sont conservés et la feuille de style les respecte', () => {
  const h = htmlEcranOuverture({ type: 'info', texte: 'Titre :\n🥇 A\n🥈 B', actif: true });
  assert.match(h, /Titre :\n🥇 A\n🥈 B/);
  const css = readFileSync(new URL('../../web/style.css', import.meta.url), 'utf8');
  assert.match(css, /\.ouverture-info \{[^}]*white-space: pre-line/);
});
