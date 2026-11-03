import test from 'node:test';
import assert from 'node:assert/strict';
import { recompensesActuelles, htmlLigneRecompenses } from '../../web/js/recompenses.js';
import { htmlListeTournois, htmlPageRace } from '../../web/js/vues.js';

const profils = [{ id: 'a', prenom: 'André' }, { id: 'p', prenom: 'Paul' }, { id: 'j', prenom: 'Jacques' }];
const tn = (id, nom, categorie) => ({ id, nom, categorie, annee: 2026 });
const rg = tn(1, 'Roland-Garros', 'grand_slam');
const miami = tn(2, 'Miami Open', 'masters_1000');
const records = {
  grandChelem: [{ tournoi: rg, parieur: 'André', score: '50' }],
  masters: [{ tournoi: miami, parieur: 'Paul', score: '30' }],
  grandFou: { noms: ['André', 'Paul'], nombre: 4, autres: [] },
  gagnePetit: null,
  fullStrike: [{ id: 'a', prenom: 'André', tournoi: rg, sur: 8 }, { id: 'a', prenom: 'André', tournoi: miami, sur: 6 }],
  sniper: { tops: [{ id: 'j', prenom: 'Jacques', ok: 3, sur: 4, pourcentage: 75 }], autres: [] },
  contradicteur: null,
  strike: { tops: [{ prenom: 'Jacques', tournoi: miami, ok: 5, sur: 6, pourcentage: 83 }], autres: [] },
  ricRac: [{ tournoi: miami, premier: 'Paul', deuxieme: 'André', ecart: '1', pluriel: false }],
  berezina: [{ tournoi: rg, tour: 'Quarts de finale' }],
  pommeDiscorde: [{ tournoi: rg, tour: 'Finale', ecart: 6, paires: [] }],
};

test('recompensesActuelles : par joueur, ex æquo compris, full strike compté par tournoi', () => {
  const r = recompensesActuelles(records, profils);
  assert.deepEqual(r.get('a').map((x) => [x.cle, x.nombre]), [['biggest_gc', 1], ['grand_fou', 1], ['full_strike', 2]]);
  assert.deepEqual(r.get('p').map((x) => x.cle), ['biggest_m1000', 'grand_fou']);
  assert.deepEqual(r.get('j').map((x) => x.cle), ['sniper']);
  const html = htmlLigneRecompenses(records, profils);
  assert.match(html, /class="ligne-recompenses"/);
  assert.match(html, /<b>André<\/b>.*×2/);
  assert.equal(htmlLigneRecompenses(null, profils), '');
});

const ligne = (id, prenom, rang, texte, bonus = false) => ({ id, prenom, rang, final: { texte, negatif: false }, avantBonus: { texte, negatif: false }, bonus: { texte: '+12', positif: bonus } });
const classement = (lignes) => ({ cloture: true, lignes });
const clos = (t) => ({ ...t, etat: 'clos', vainqueur_id: null, date_debut: '2026-05-24', date_fin: '2026-06-07' });

test('page Saison : trophées dans les blocs de tournoi, ligne de récompenses sous la Race', () => {
  const race = { annee: 2026, tournoisClos: 2, terminee: false, lignes: profils.map((p, i) => ({ ...p, rang: i + 1, points: '10', trophees: [] })) };
  const classements = new Map([
    [1, classement([ligne('a', 'André', 1, '60', true), ligne('p', 'Paul', 2, '40'), ligne('j', 'Jacques', 3, '30')])],
    [2, classement([ligne('j', 'Jacques', 1, '35'), ligne('a', 'André', 2, '20')])],
  ]);
  const html = htmlListeTournois([clos(rg), clos(miami)], { race, anneeCourante: 2026, anneeAffichee: 2026, classements, stats: { records } });
  assert.match(html, /<section class="carte carte-race race-saison">[\s\S]*class="ligne-recompenses"[\s\S]*Détail de la saison/);
  const carte = (nom) => html.slice(html.indexOf(`<h3>${nom}</h3>`), html.indexOf('</a>', html.indexOf(`<h3>${nom}</h3>`)));
  const cRg = carte('Roland-Garros');
  assert.match(cRg, /aria-label="Biggest win – Grand Chelem"/); // le vainqueur André a le Biggest win ici…
  assert.match(cRg, /aria-label="Le full strike"/); // …et un full strike
  assert.doesNotMatch(cRg, /aria-label="Le strike"/);
  assert.match(cRg, /faits-tournoi[\s\S]*La bérézina[\s\S]*La pomme de discorde/);
  assert.doesNotMatch(cRg, /Ric rac/);
  const cMi = carte('Miami Open');
  assert.doesNotMatch(cMi, /Biggest win/); // Paul a le Biggest win Masters mais n'a pas gagné ce tournoi
  assert.doesNotMatch(cMi, /Le full strike/); // André a un full strike à Miami, mais n'a pas gagné
  assert.match(cMi, /Jacques <b[^>]*>35<\/b><svg[^>]*aria-label="Le strike"/); // strike juste après le score de Jacques
  assert.match(cMi, /faits-tournoi[\s\S]*Ric rac/);
});

test('page Race : la ligne de récompenses est sous le classement', () => {
  const detail = { annee: 2026, tournoisClos: 0, terminee: false, colonnes: profils.map((p, i) => ({ ...p, rang: i + 1, points: '0', trophees: [] })), tournois: [], evolution: null };
  const html = htmlPageRace(detail, { moi: 'a', stats: { records, detailPoints: null } });
  assert.match(html, /<h3>Classement<\/h3>[\s\S]*class="ligne-recompenses"/);
});
