// Navigation par saison (5.2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlListeTournois, htmlOngletsSaisons } from '../../web/js/vues.js';

const t = (id, annee, nom, extra = {}) => ({ id, annee, nom, categorie: 'masters_1000', etat: 'a_venir', date_debut: `${annee}-03-01`, date_fin: `${annee}-03-10`, ville: 'X', surface: 'dur', indoor: false, ...extra });
const tournois = [t(1, 2025, 'Ancien', { etat: 'clos' }), t(2, 2026, 'Courant A'), t(3, 2026, 'Courant B'), t(4, 2027, 'Futur')];

test('onglets : seulement s’il y a plusieurs saisons ; la saison affichée est marquée', () => {
  assert.equal(htmlOngletsSaisons([2026], 2026), '');
  const h = htmlOngletsSaisons([2027, 2026, 2025], 2026);
  assert.match(h, /href="#\/saison\/2027"/);
  assert.match(h, /href="#\/saison\/2026" aria-current="page"/);
  assert.equal((h.match(/aria-current/g) ?? []).length, 1);
});

test('liste sans année choisie : comportement d’origine (toutes les saisons, sans onglets)', () => {
  const h = htmlListeTournois(tournois);
  assert.match(h, /Saison 2027/);
  assert.match(h, /Saison 2025/);
  assert.doesNotMatch(h, /onglets-saisons/);
});

test('liste avec une année choisie : une seule saison + onglets', () => {
  const h = htmlListeTournois(tournois, { anneeCourante: 2026, anneeAffichee: 2026 });
  assert.match(h, /onglets-saisons/);
  assert.match(h, /Courant A/);
  assert.match(h, /Courant B/);
  assert.doesNotMatch(h, /Futur|Ancien/);
  assert.match(h, /Saison 2026/);
  const futur = htmlListeTournois(tournois, { anneeCourante: 2026, anneeAffichee: 2027 });
  assert.match(futur, /Futur/);
  assert.doesNotMatch(futur, /Courant A/);
});

test('saison passée : lien vers la Race finale ; année inconnue : retombe sur l’année courante', () => {
  const race = { annee: 2026, tournoisClos: 0, lignes: [] };
  const passee = htmlListeTournois(tournois, { race, anneeCourante: 2026, anneeAffichee: 2025 });
  assert.match(passee, /#\/race\/2025/);
  const inconnue = htmlListeTournois(tournois, { anneeCourante: 2026, anneeAffichee: 2031 });
  assert.match(inconnue, /Courant A/);
  assert.match(inconnue, /aria-current="page">2026</);
});
