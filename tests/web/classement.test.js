import test from 'node:test';
import assert from 'node:assert/strict';
import * as moteur from '../../src/moteur/index.js';
import { construireRace, classementTournoi, detailRace } from '../../web/js/classement.js';
import { htmlRace, htmlListeTournois, htmlClassementTournoi, htmlPageRace, htmlTrophee, htmlPageTournoi } from '../../web/js/vues.js';

const profils = [
  { id: 'a', prenom: 'André', couleur: '#aa0000' },
  { id: 'p', prenom: 'Paul', couleur: null },
  { id: 'j', prenom: 'Jacques', couleur: null },
];
const tournois = [
  { id: 1, annee: 2026, etat: 'clos' },
  { id: 2, annee: 2026, etat: 'en_cours' },
  { id: 3, annee: 2025, etat: 'clos' },
];
const resultats = [
  { tournament_id: 1, joueur_id: 'a', score_final: '27/2' }, // 13,5
  { tournament_id: 1, joueur_id: 'p', score_final: '-3/4' }, // −0,75
  { tournament_id: 1, joueur_id: 'j', score_final: '27/2' },
  { tournament_id: 1, joueur_id: 'zzz', score_final: '99' }, // hors groupe : ignoré
  { tournament_id: 2, joueur_id: 'a', score_final: '50' },   // tournoi non clos : ignoré
  { tournament_id: 3, joueur_id: 'a', score_final: '70' },   // autre année : ignoré
];

test('construireRace : somme des scores finaux des tournois clos de l\'année, rangs avec ex aequo', () => {
  const race = construireRace({ moteur, annee: 2026, tournois, resultats, profils });
  assert.equal(race.tournoisClos, 1);
  assert.deepEqual(race.lignes.map((l) => [l.prenom, l.rang, l.points]), [['André', 1, '13,5'], ['Jacques', 1, '13,5'], ['Paul', 3, '−0,75']]);
});

test('construireRace : aucun tournoi clos = tout le monde à 0, tous premiers', () => {
  const race = construireRace({ moteur, annee: 2026, tournois: [{ id: 2, annee: 2026, etat: 'en_cours' }], resultats, profils });
  assert.equal(race.tournoisClos, 0);
  assert.deepEqual(race.lignes.map((l) => [l.rang, l.points]), [[1, '0'], [1, '0'], [1, '0']]);
});

test('construireRace : un joueur absent des archives compte 0', () => {
  const race = construireRace({ moteur, annee: 2026, tournois, resultats: [{ tournament_id: 1, joueur_id: 'a', score_final: '5' }], profils });
  assert.deepEqual(race.lignes.map((l) => [l.prenom, l.rang, l.points]), [['André', 1, '5'], ['Jacques', 2, '0'], ['Paul', 2, '0']]);
});

test('vues : classement « Race 2026 » en haut de la saison en cours, ordre chronologique dessous', () => {
  const race = construireRace({ moteur, annee: 2026, tournois, resultats, profils });
  assert.match(htmlRace(race), /Race 2026/);
  assert.match(htmlRace(race), /1 tournoi terminé/);
  const t = (id, nom, debut) => ({ id, annee: 2026, nom, ville: 'X', surface: 'dur', indoor: false, categorie: 'masters_1000', date_debut: debut, date_fin: null, etat: 'a_venir' });
  const html = htmlListeTournois([t(1, 'Tardif', '2026-11-02'), t(2, 'Précoce', '2026-03-10'), t(3, 'Sans date', null)], { race, anneeCourante: 2026 });
  assert.ok(html.indexOf('Saison 2026') < html.indexOf('Race 2026'));
  assert.ok(html.indexOf('Race 2026') < html.indexOf('Précoce'));
  assert.ok(html.indexOf('Précoce') < html.indexOf('Tardif'));
  assert.ok(html.indexOf('Tardif') < html.indexOf('Sans date'));
});

test('vues : Race sans tournoi clos, et saison courante absente de la liste', () => {
  const race = construireRace({ moteur, annee: 2027, tournois: [], resultats: [], profils });
  assert.match(htmlRace(race), /Aucun tournoi terminé/);
  const html = htmlListeTournois([], { race, anneeCourante: 2027 });
  assert.match(html, /Saison 2027/);
  assert.match(html, /Race 2027/);
});

test('vues : prénoms échappés dans le classement', () => {
  const race = construireRace({ moteur, annee: 2026, tournois: [], resultats: [], profils: [{ id: 'x', prenom: '<script>', couleur: null }] });
  assert.doesNotMatch(htmlRace(race), /<script>/);
});

// ---------- Classement d'un tournoi en trois temps (3.5) ----------
const quatre = [{ id: 'l', prenom: 'Léa' }, { id: 'p', prenom: 'Pierre' }, { id: 't', prenom: 'Thomas' }, { id: 'm', prenom: 'Marc' }];

test('classementTournoi, tournoi clos : chiffres de l’archive, exemple F (Léa 47 → +12, Pierre 43,5 → +5)', () => {
  const archives = [
    { joueur_id: 'l', points_matchs: '47', points_pari_tournoi: '0', bonus_classement: '12', score_final: '59' },
    { joueur_id: 'p', points_matchs: '71/2', points_pari_tournoi: '8', bonus_classement: '5', score_final: '97/2' }, // 35,5 + 8 = 43,5 ; +5 = 48,5
    { joueur_id: 't', points_matchs: '42', points_pari_tournoi: '0', bonus_classement: '0', score_final: '42' },
    { joueur_id: 'm', points_matchs: '30', points_pari_tournoi: '0', bonus_classement: '0', score_final: '30' },
    { joueur_id: 'zzz', points_matchs: '99', points_pari_tournoi: '0', bonus_classement: '0', score_final: '99' }, // hors groupe : ignoré
  ];
  const c = classementTournoi({ moteur, tournoi: { id: 1, etat: 'clos', categorie: 'masters_1000' }, matchs: [], paris: new Map(), archives, profils: quatre });
  assert.equal(c.cloture, true);
  assert.deepEqual(c.lignes.map((l) => [l.prenom, l.rang, l.matchs.texte, l.pari.texte, l.bonus.texte, l.final.texte]), [
    ['Léa', 1, '+47', '0', '+12', '59'],
    ['Pierre', 2, '+35,5', '+8', '+5', '48,5'],
    ['Thomas', 3, '+42', '0', '0', '42'],
    ['Marc', 4, '+30', '0', '0', '30'],
  ]);
});

test('classementTournoi, en cours : points des matchs visibles seulement, pari tournoi et bonus absents', () => {
  const match = (id, extra = {}) => ({ id, tour: 'QF', p1_id: 1, p2_id: 2, statut: 'a_venir', neutralise: false, paris_reveles: false, verrouille: false, resultat_visible: false, vainqueur: null, sets_joues: null, fin_match: null, ...extra });
  const bet = (joueur, choix, confiance) => [joueur, { choix, confiance, sets: null }];
  // exemple A : Fritz (joueur 2) gagne ; Alcaraz = joueur 1
  const matchs = [
    match(1, { statut: 'termine', resultat_visible: true, paris_reveles: true, vainqueur: 2, fin_match: 'normal' }),
    match(2, { statut: 'termine', vainqueur: 1 }), // résultat masqué : ignoré
  ];
  const paris = new Map([
    [1, new Map([bet('p', 1, 8), bet('l', 1, 7), bet('m', 1, 9), bet('t', 2, 6)])],
    [2, new Map([bet('p', 1, 10)])],
  ]);
  const c = classementTournoi({ moteur, tournoi: { id: 1, etat: 'en_cours', categorie: 'masters_1000' }, matchs, paris, archives: [], profils: quatre });
  assert.equal(c.cloture, false);
  assert.equal(c.matchsComptes, 1);
  assert.deepEqual(c.lignes.map((l) => [l.prenom, l.rang, l.matchs.texte, l.pari, l.final]), [
    ['Thomas', 1, '+9', null, null], ['Léa', 2, '+3', null, null], ['Pierre', 3, '−1,5', null, null], ['Marc', 4, '−9', null, null],
  ]);
  assert.equal(c.lignes[3].matchs.negatif, true);
});

test('classementTournoi, sans aucun match compté : tous à 0, ex aequo', () => {
  const c = classementTournoi({ moteur, tournoi: { id: 1, etat: 'a_venir', categorie: 'masters_1000' }, matchs: [], paris: new Map(), archives: [], profils: quatre });
  assert.deepEqual(c.lignes.map((l) => [l.rang, l.matchs.texte]), [[1, '0'], [1, '0'], [1, '0'], [1, '0']]);
});

test('detailRace : un tournoi par ligne, ordre chronologique, gagnant de chaque tournoi, colonnes par rang de la Race', () => {
  const ts = [
    { id: 2, annee: 2026, nom: 'Roland-Garros', categorie: 'grand_slam', etat: 'clos', date_debut: '2026-05-24' },
    { id: 1, annee: 2026, nom: 'Miami', categorie: 'masters_1000', etat: 'clos', date_debut: '2026-03-18' },
    { id: 3, annee: 2026, nom: 'Paris', categorie: 'masters_1000', etat: 'en_cours', date_debut: '2026-11-02' },
  ];
  const rs = [
    { tournament_id: 1, joueur_id: 'a', score_final: '20' }, { tournament_id: 1, joueur_id: 'p', score_final: '12' },
    { tournament_id: 2, joueur_id: 'a', score_final: '-5' }, { tournament_id: 2, joueur_id: 'p', score_final: '30' }, { tournament_id: 2, joueur_id: 'j', score_final: '30' },
  ];
  const d = detailRace({ moteur, annee: 2026, tournois: ts, resultats: rs, profils });
  assert.equal(d.tournoisClos, 2);
  // totaux : Paul 42, Jacques 30, André 15
  assert.deepEqual(d.colonnes.map((c) => [c.prenom, c.rang, c.points]), [['Paul', 1, '42'], ['Jacques', 2, '30'], ['André', 3, '15']]);
  assert.deepEqual(d.tournois.map((t) => t.nom), ['Miami', 'Roland-Garros']);
  assert.equal(d.tournois[0].cellules.a.gagnant, true);
  assert.equal(d.tournois[0].cellules.j.texte, '—'); // pas dans l'archive
  assert.equal(d.tournois[1].cellules.a.texte, '−5');
  assert.equal(d.tournois[1].cellules.a.negatif, true);
  assert.equal(d.tournois[1].cellules.p.gagnant, true);
  assert.equal(d.tournois[1].cellules.j.gagnant, true); // ex aequo
});

test('vues : classement du tournoi clos (3 colonnes + score), en cours (matchs seulement), vide, groupe sans archive', () => {
  const archives = [
    { joueur_id: 'l', points_matchs: '47', points_pari_tournoi: '0', bonus_classement: '12', score_final: '59' },
    { joueur_id: 'p', points_matchs: '-3', points_pari_tournoi: '4', bonus_classement: '0', score_final: '1' },
  ];
  const duo = quatre.slice(0, 2);
  const clos = classementTournoi({ moteur, tournoi: { id: 1, etat: 'clos', categorie: 'masters_1000' }, matchs: [], paris: new Map(), archives, profils: duo });
  const html = htmlClassementTournoi(clos, { moi: 'p', tournoi: { etat: 'clos' } });
  assert.match(html, /<th>Pari tournoi<\/th><th>Bonus<\/th><th>Score<\/th>/);
  assert.match(html, /<tr class="isme">[\s\S]*Pierre/);
  assert.match(html, /<td class="neg">−3<\/td>/);
  assert.match(html, /figés à la clôture/);
  const cours = classementTournoi({ moteur, tournoi: { id: 1, etat: 'en_cours', categorie: 'masters_1000' }, matchs: [], paris: new Map(), archives: [], profils: duo });
  const h2 = htmlClassementTournoi(cours, { tournoi: { etat: 'en_cours' } });
  assert.doesNotMatch(h2, /Pari tournoi<\/th>/);
  assert.match(h2, /Aucun match compté/);
  const sansArchive = classementTournoi({ moteur, tournoi: { id: 1, etat: 'clos', categorie: 'masters_1000' }, matchs: [], paris: new Map(), archives: [], profils: duo });
  assert.match(htmlClassementTournoi(sansArchive, { tournoi: { etat: 'clos' } }), /Aucun score archivé pour ton groupe/);
  assert.equal(htmlClassementTournoi({ lignes: [] }), '');
});

test('vues : page Race (classement, détail par tournoi, total, vert pour le meilleur), prénoms échappés', () => {
  const ts = [{ id: 1, annee: 2026, nom: 'Miami <b>', categorie: 'masters_1000', etat: 'clos', date_debut: '2026-03-18' }];
  const rs = [{ tournament_id: 1, joueur_id: 'a', score_final: '20' }, { tournament_id: 1, joueur_id: 'p', score_final: '-4' }];
  const html = htmlPageRace(detailRace({ moteur, annee: 2026, tournois: ts, resultats: rs, profils }), { moi: 'p' });
  assert.match(html, /Race 2026/);
  assert.match(html, /Somme des scores finaux de 1 tournoi terminé\./);
  assert.match(html, /<td class="gagnant">20<\/td>/);
  assert.match(html, /<td class="neg">−4<\/td>/);
  assert.match(html, /Total Race 2026/);
  assert.match(html, /Miami &lt;b&gt;/);
  assert.doesNotMatch(html, /Miami <b>/);
  const vide = htmlPageRace(detailRace({ moteur, annee: 2030, tournois: ts, resultats: rs, profils }));
  assert.match(vide, /Aucun tournoi terminé pour l’instant/);
  assert.doesNotMatch(vide, /detail-race/);
});

test('vues : trophée différent par catégorie ; saison avec vainqueur du groupe, lien Race et archive des années passées', () => {
  const formes = ['grand_slam', 'masters_1000', 'atp_finals'].map((c) => htmlTrophee(c));
  assert.equal(new Set(formes).size, 3);
  assert.match(formes[0], /Trophée Grand Chelem/);
  const ts = [
    { id: 1, annee: 2026, nom: 'Miami', ville: 'Miami', surface: 'dur', indoor: false, categorie: 'masters_1000', date_debut: '2026-03-18', date_fin: null, etat: 'clos' },
    { id: 3, annee: 2025, nom: 'Turin', ville: 'Turin', surface: 'dur', indoor: true, categorie: 'atp_finals', date_debut: '2025-11-09', date_fin: null, etat: 'clos' },
  ];
  const archives = [{ joueur_id: 'a', points_matchs: '20', points_pari_tournoi: '0', bonus_classement: '0', score_final: '20' }, { joueur_id: 'p', points_matchs: '-4', points_pari_tournoi: '0', bonus_classement: '0', score_final: '-4' }];
  const classements = new Map([[1, classementTournoi({ moteur, tournoi: ts[0], matchs: [], paris: new Map(), archives: archives.map((r) => ({ ...r, tournament_id: 1 })), profils })]]);
  const race = construireRace({ moteur, annee: 2026, tournois: ts, resultats: archives.map((r) => ({ ...r, tournament_id: 1 })), profils });
  const html = htmlListeTournois(ts, { race, anneeCourante: 2026, classements });
  assert.match(html, /palmares-groupe[\s\S]*<b>André<\/b> · 20/);
  assert.match(html, /Paul <b class="neg">−4<\/b>/);
  assert.match(html, /href="#\/race\/2026">Détail par tournoi/);
  assert.match(html, /href="#\/race\/2025">Race 2025 : classement final/);
});

test('vues : la page tournoi affiche le classement du tournoi quand il est fourni', () => {
  const tournoi = { id: 1, annee: 2026, nom: 'Paris', ville: 'Paris', surface: 'dur', indoor: true, categorie: 'masters_1000', date_debut: null, date_fin: null, etat: 'en_cours', vainqueur_id: null, finaliste_id: null };
  const classement = classementTournoi({ moteur, tournoi, matchs: [], paris: new Map(), archives: [], profils });
  const html = htmlPageTournoi({ tournoi, matchs: [], joueurs: new Map(), ctx: { moi: 'a', moteur, profils, paris: new Map(), classement, parisTournoi: new Map(), quiTournoi: new Map(), saisiePariTournoi: {} } });
  assert.match(html, /Classement du tournoi/);
  assert.ok(html.indexOf('Classement du tournoi') < html.indexOf('id="pari-tournoi"')); // le pari tournoi vient juste après le classement
});
