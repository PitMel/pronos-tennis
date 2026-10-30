// Page des règles : les barèmes affichés viennent du moteur (donc ne peuvent pas diverger) ; on vérifie quelques valeurs du cahier.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as moteur from '../../src/moteur/index.js';
import { htmlPageRegles } from '../../web/js/regles.js';

const html = htmlPageRegles({ moteur });
const texte = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('règles : les huit sections sont là', () => {
  for (const titre of ['1. Un pari de match', '2. Multiplicateurs de tour', '3. Bonus de sets', '4. Abandon, forfait', '5. Qui voit quoi', '6. Le pari tournoi', '7. Classement du tournoi et bonus', '8. La Race']) {
    assert.ok(html.includes(titre), titre);
  }
});

test('règles : barème de base et barème complet (cahier §4.2 et §4.4)', () => {
  assert.match(html, /<th scope="row">10<\/th><td>\+10<\/td><td>−17<\/td>/);
  assert.match(html, /<th scope="row">6<\/th><td>\+6<\/td><td>\+4<\/td>/);
  assert.match(html, /<th scope="row">9<\/th><td>9 \/ −6<\/td><td>13,5 \/ −9<\/td><td>18 \/ −12<\/td>/);
  assert.match(html, /<th scope="row">10<\/th><td>10 \/ −17<\/td><td>15 \/ −25,5<\/td><td>20 \/ −34<\/td>/);
  assert.match(texte, /Quarts ×1,5/);
  assert.match(texte, /confiance 8 en quart de finale, ton joueur gagne : 12 points ; il perd : −1,5/);
});

test('règles : pari tournoi, bonus de classement, bonus de sets (cahier §4.3, §6, §7)', () => {
  assert.match(html, /Maximum<\/th><td>24<\/td><td>12<\/td>/);
  assert.match(html, /Masters 1000<\/th><td>\+12<\/td><td>\+5<\/td>/);
  assert.match(html, /Grand Chelem<\/th><td>\+24<\/td><td>\+10<\/td>/);
  assert.match(html, /ATP Finals<\/th><td>\+10<\/td><td>\+4<\/td>/);
  assert.match(texte, /\+1 si tu trouves le vainqueur et le nombre de sets/);
  assert.match(texte, /\+0,5 si tu annonçais 5 sets/);
  assert.match(texte, /divisés par 2/);
  assert.match(texte, /Race/);
});

test('règles : explication du pourcentage, phrases retirées, tableaux réordonnés', () => {
  assert.match(texte, /Ce chiffre correspond au pourcentage de chances de victoire estimé/);
  assert.match(texte, /parie toujours 7 sur un joueur qui gagne 7 matchs sur 10/);
  assert.doesNotMatch(texte, /4ᵉ tour/);
  assert.doesNotMatch(texte, /Gagné = ta confiance/);
  assert.match(html, /table-regles centre-premiere/);
  assert.ok(html.indexOf('Grand Chelem</th><td>+24') < html.indexOf('Masters 1000</th><td>+12'));
});
