import test from 'node:test';
import assert from 'node:assert/strict';
import { echapper, formaterHeureParis, formaterPeriode } from '../../web/js/outils.js';
import { ordreTours, grouperParTour, formaterScore, nomAvecClassement, grouperParAnnee } from '../../web/js/tournois.js';
import { htmlListeTournois, htmlPageTournoi, htmlCarteMatch } from '../../web/js/vues.js';

const m = (id, tour, extra = {}) => ({
  id, tour, tournament_id: 1, p1_id: 1, p2_id: 2, statut: 'a_venir', neutralise: false,
  paris_reveles: false, verrouille: false, resultat_visible: false, vainqueur: null, score: null, fin_match: null,
  heure_prevue: null, ...extra,
});
const joueurs = new Map([
  [1, { id: 1, nom: 'Alcaraz', pays: 'esp', classement: 1 }],
  [2, { id: 2, nom: 'Fritz', pays: 'usa', classement: 9 }],
]);

test('echapper neutralise le HTML', () => {
  assert.equal(echapper('<img src=x onerror="a()">&\''), '&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;');
  assert.equal(echapper(null), '');
});

test('formaterHeureParis : heure de Paris (hiver et été)', () => {
  assert.equal(formaterHeureParis('2026-11-02T13:30:00Z'), 'lun. 2 nov. · 14h30');
  assert.equal(formaterHeureParis('2026-07-01T12:05:00Z'), 'mer. 1 juil. · 14h05');
  assert.equal(formaterHeureParis(null), '');
  assert.equal(formaterHeureParis('pas une date'), '');
});

test('formaterPeriode', () => {
  assert.equal(formaterPeriode('2026-11-02', '2026-11-08'), '2 au 8 novembre 2026');
  assert.equal(formaterPeriode('2026-10-30', '2026-11-05'), '30 octobre au 5 novembre 2026');
  assert.equal(formaterPeriode('2026-12-30', '2027-01-03'), '30 décembre 2026 au 3 janvier 2027');
  assert.equal(formaterPeriode('2026-11-02', '2026-11-02'), '2 novembre 2026');
  assert.equal(formaterPeriode(null, null), 'Dates à venir');
  assert.equal(formaterPeriode('2026-11-02', null), 'À partir du 2 novembre 2026');
});

test('ordreTours : ATP Finals = poules, demi-finales, finale', () => {
  assert.deepEqual(ordreTours('atp_finals'), ['RR', 'SF', 'F']);
  assert.deepEqual(ordreTours('masters_1000'), ['R16', 'QF', 'SF', 'F']);
  assert.deepEqual(ordreTours('grand_slam'), ['R16', 'QF', 'SF', 'F']);
});

test('grouperParTour : tour courant = premier tour avec un match non terminé ; tours futurs grisés', () => {
  const sections = grouperParTour([
    m(1, 'R16', { statut: 'termine' }), m(2, 'R16', { neutralise: true }),
    m(3, 'QF', { statut: 'a_venir' }), m(4, 'QF', { statut: 'termine' }),
  ], 'masters_1000');
  assert.deepEqual(sections.map((s) => s.tour), ['R16', 'QF', 'SF', 'F']);
  assert.deepEqual(sections.map((s) => s.courant), [false, true, false, false]);
  assert.deepEqual(sections.map((s) => s.termine), [true, false, false, false]);
  assert.deepEqual(sections.map((s) => s.aVenir), [false, false, true, true]);
});

test('grouperParTour : tournoi fini = aucun tour courant ; matchs triés par heure puis identifiant', () => {
  const fini = grouperParTour([m(1, 'F', { statut: 'termine' })], 'masters_1000');
  assert.equal(fini.some((s) => s.courant), false);
  const tri = grouperParTour([
    m(5, 'SF', { heure_prevue: '2026-11-07T15:00:00Z' }), m(4, 'SF', { heure_prevue: '2026-11-07T12:00:00Z' }), m(3, 'SF'),
  ], 'masters_1000').find((s) => s.tour === 'SF');
  assert.deepEqual(tri.matchs.map((x) => x.id), [4, 5, 3]);
});

test('grouperParTour : ATP Finals, les poules passent avant les demi-finales', () => {
  const s = grouperParTour([m(1, 'RR', { statut: 'termine' }), m(2, 'RR')], 'atp_finals');
  assert.deepEqual(s.map((x) => [x.tour, x.courant]), [['RR', true], ['SF', false], ['F', false]]);
});

test('formaterScore', () => {
  assert.equal(formaterScore({ games: [[7, 6], [6, 4]] }, 'normal'), '7-6 6-4');
  assert.equal(formaterScore({ games: [[6, 3], [2, 1]] }, 'abandon'), '6-3 2-1 (abandon)');
  assert.equal(formaterScore(null, 'abandon'), 'Abandon');
  assert.equal(formaterScore(null, 'forfait'), 'Forfait');
  assert.equal(formaterScore(null, 'normal'), '');
  assert.equal(formaterScore({ games: [[6], 'x', [6, null]] }, 'normal'), '');
});

test('nomAvecClassement et grouperParAnnee', () => {
  assert.equal(nomAvecClassement({ nom: 'Fritz', classement: 9 }), 'Fritz (9)');
  assert.equal(nomAvecClassement({ nom: 'Fritz', classement: null }), 'Fritz');
  assert.equal(nomAvecClassement(undefined), 'À déterminer');
  const g = grouperParAnnee([
    { annee: 2026, nom: 'B', date_debut: null }, { annee: 2025, nom: 'Z', date_debut: '2025-01-01' },
    { annee: 2026, nom: 'A', date_debut: '2026-11-02' }, { annee: 2026, nom: 'C', date_debut: '2026-03-01' },
  ]);
  assert.deepEqual(g.map((x) => x.annee), [2026, 2025]);
  assert.deepEqual(g[0].tournois.map((t) => t.nom), ['C', 'A', 'B']);
});

test('vues : liste des tournois, échappement et lien', () => {
  const html = htmlListeTournois([{ id: 7, annee: 2026, nom: 'Paris <b>', ville: 'Paris', surface: 'dur', indoor: true, categorie: 'masters_1000', date_debut: '2026-11-02', date_fin: '2026-11-08', etat: 'a_venir' }]);
  assert.match(html, /href="#\/tournoi\/7"/);
  assert.match(html, /Masters 1000/);
  assert.match(html, /Paris &lt;b&gt;/);
  assert.doesNotMatch(html, /<b>/);
  assert.match(html, /2 au 8 novembre 2026/);
  assert.match(html, /\(en salle\)/);
  assert.match(htmlListeTournois([]), /Aucun tournoi/);
});

test('vues : le résultat reste masqué tant que resultat_visible est faux', () => {
  const masque = htmlCarteMatch(m(1, 'QF', { statut: 'termine', vainqueur: 1, score: { games: [[6, 4]] } }), joueurs);
  assert.doesNotMatch(masque, /6-4/);
  assert.doesNotMatch(masque, /gagnant/);
  assert.match(masque, /résultat masqué/);
  const visible = htmlCarteMatch(m(1, 'QF', { statut: 'termine', resultat_visible: true, paris_reveles: true, vainqueur: 2, score: { games: [[7, 6], [6, 4]] }, fin_match: 'normal' }), joueurs);
  assert.match(visible, /7-6 6-4/);
  assert.match(visible, /joueur-match gagnant">Fritz/);
  assert.match(visible, /Paris révélés/);
});

test('vues : badges de statut', () => {
  assert.match(htmlCarteMatch(m(1, 'QF', { neutralise: true, paris_reveles: true }), joueurs), /Neutralisé/);
  assert.match(htmlCarteMatch(m(1, 'QF', { statut: 'en_cours', verrouille: true }), joueurs), /En cours[\s\S]*Paris verrouillés/);
  assert.match(htmlCarteMatch(m(1, 'QF', { heure_prevue: '2026-11-02T13:30:00Z' }), joueurs), /14h30/);
  assert.match(htmlCarteMatch(m(1, 'QF'), joueurs), /Horaire à venir/);
});

test('vues : page tournoi (tour courant ouvert, tours futurs grisés, palmarès si clos)', () => {
  const tournoi = { id: 1, annee: 2026, nom: 'Rolex Paris Masters', ville: 'Paris', surface: 'dur', indoor: true, categorie: 'masters_1000', date_debut: null, date_fin: null, etat: 'en_cours', vainqueur_id: null, finaliste_id: null };
  const html = htmlPageTournoi({ tournoi, matchs: [m(1, 'R16')], joueurs });
  assert.match(html, /<details class="tour" open>/);
  assert.match(html, /tour-a-venir[\s\S]*Quarts de finale/);
  assert.match(html, /Dates à venir/);
  assert.doesNotMatch(html, /Vainqueur :/);
  const clos = htmlPageTournoi({ tournoi: { ...tournoi, etat: 'clos', vainqueur_id: 1, finaliste_id: 2 }, matchs: [m(1, 'F', { statut: 'termine' })], joueurs });
  assert.match(clos, /Vainqueur : <strong>Alcaraz<\/strong> · finaliste : Fritz/);
});
