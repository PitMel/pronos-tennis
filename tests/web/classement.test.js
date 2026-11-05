import test from 'node:test';
import assert from 'node:assert/strict';
import * as moteur from '../../src/moteur/index.js';
import { construireRace, classementTournoi, detailRace } from '../../web/js/classement.js';
import { htmlRace, htmlListeTournois, htmlClassementTournoi, htmlPageRace, htmlTrophee, htmlPageTournoi } from '../../web/js/vues.js';
import { cleTrophee } from '../../web/js/trophees.js';

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
  assert.match(html, /<h2 class="hero-titre">Détail de la saison 2026<\/h2>/);
  assert.match(html, /Somme des scores finaux de 1 tournoi terminé\./);
  assert.match(html, /<td class="gagnant"><span class="cellule-score"><span class="medaille" role="img" aria-label="1re place">🥇<\/span><span class="cadre-gagnant">20<\/span><\/span><\/td>/);
  assert.match(html, /<td class="neg"><span class="cellule-score"><span class="medaille" role="img" aria-label="2e place">🥈<\/span>−4<\/span><\/td>/);
  assert.match(html, /Total du classement final 2026/);
  assert.match(html, /Miami &lt;b&gt;/);
  assert.match(html, /<a class="nom-tournoi" href="#\/tournoi\/1">/);
  assert.doesNotMatch(html, /Miami <b>/);
  const vide = htmlPageRace(detailRace({ moteur, annee: 2030, tournois: ts, resultats: rs, profils }));
  assert.match(vide, /Aucun tournoi terminé pour l’instant/);
  assert.doesNotMatch(vide, /detail-race/);
});

test('vues : page Race — joueur du compte en 1re colonne, médailles, évolution (écart au dernier), trophées après les noms', () => {
  const ts = [
    { id: 1, annee: 2026, nom: 'Miami', categorie: 'masters_1000', etat: 'clos', date_debut: '2026-03-18', vainqueur_id: 5 },
    { id: 2, annee: 2026, nom: 'Roland-Garros', categorie: 'grand_slam', etat: 'clos', date_debut: '2026-05-24', vainqueur_id: 6 },
  ];
  const rs = [
    { tournament_id: 1, joueur_id: 'a', score_final: '20' }, { tournament_id: 1, joueur_id: 'p', score_final: '12' }, { tournament_id: 1, joueur_id: 'j', score_final: '5' },
    { tournament_id: 2, joueur_id: 'a', score_final: '-5' }, { tournament_id: 2, joueur_id: 'p', score_final: '30' }, { tournament_id: 2, joueur_id: 'j', score_final: '10' },
  ];
  const d = detailRace({ moteur, annee: 2026, tournois: ts, resultats: rs, profils });
  // totaux : Paul 42, Jacques 15, André 15 → retard sur le premier (négatif) : après Miami André en tête, après Roland-Garros Paul
  assert.deepEqual(d.evolution.tournois.map((t) => t.nom), ['Miami', 'Roland-Garros']);
  assert.deepEqual(d.evolution.series.find((x) => x.id === 'p').ecarts, [-8, 0]);
  assert.deepEqual(d.evolution.series.find((x) => x.id === 'a').ecarts, [0, -27]);
  assert.deepEqual(d.evolution.series.find((x) => x.id === 'j').ecarts, [-15, -27]);
  const html = htmlPageRace(d, { moi: 'a' });
  const entetes = [...html.matchAll(/<th scope="col" class="col-joueur">.*?<span>(.*?)<\/span><\/th>/g)].map((m) => m[1]);
  assert.deepEqual(entetes, ['André', 'Paul', 'Jacques']);
  assert.match(html, /aria-label="3e place">🥉/);
  assert.match(htmlTrophee('masters_1000', 'Miami <b>'), /data-nom="Miami &lt;b&gt;"/);
  assert.match(html, /<section class="carte carte-race race-saison"><h3>Classement<\/h3>/);
  assert.match(html, /<h3>Évolution<\/h3>/);
  assert.match(html, /<svg class="evo-svg"/);
  assert.equal((html.match(/<polyline /g) ?? []).length, 3);
  assert.match(html, /pastille-detail/);
  const sansTournoi = htmlPageRace(detailRace({ moteur, annee: 2030, tournois: ts, resultats: rs, profils }));
  assert.doesNotMatch(sansTournoi, /Évolution/);
});

test('vues : Saison et Accueil — Race 2026 en classe race-saison, titre de saison centré, « Palmarès de la saison »', () => {
  const race = { annee: 2026, tournoisClos: 1, lignes: [{ id: 'a', prenom: 'André', rang: 1, points: '20', trophees: [{ categorie: 'masters_1000', nom: 'Miami' }] }] };
  const html = htmlListeTournois([{ id: 1, annee: 2026, nom: 'Miami', categorie: 'masters_1000', etat: 'clos' }], { race, anneeCourante: 2026, anneeAffichee: 2026 });
  assert.match(html, /<section class="carte carte-race race-saison">/);
  assert.match(html, /<h2 class="titre-annee titre-saison">Saison 2026<\/h2>/);
  assert.match(html, /Détail de la saison ›<\/a>\s*<a class="lien-detail lien-palmares" href="#\/palmares">Palmarès de la saison ›<\/a>\s*<\/section>/);
  assert.equal((html.match(/Palmarès de la saison/g) ?? []).length, 1);
  assert.doesNotMatch(html, /Palmarès des saisons/);
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
  assert.match(html, /href="#\/race\/2026">Détail de la saison/);
  assert.match(html, /href="#\/race\/2025">Détail de la saison 2025 ›/);
});

test('vues : la page tournoi affiche le classement du tournoi quand il est fourni', () => {
  const tournoi = { id: 1, annee: 2026, nom: 'Paris', ville: 'Paris', surface: 'dur', indoor: true, categorie: 'masters_1000', date_debut: null, date_fin: null, etat: 'en_cours', vainqueur_id: null, finaliste_id: null };
  const classement = classementTournoi({ moteur, tournoi, matchs: [], paris: new Map(), archives: [], profils });
  const html = htmlPageTournoi({ tournoi, matchs: [], joueurs: new Map(), ctx: { moi: 'a', moteur, profils, paris: new Map(), classement, parisTournoi: new Map(), quiTournoi: new Map(), saisiePariTournoi: {} } });
  assert.match(html, /Classement du tournoi/);
  assert.ok(html.indexOf('Classement du tournoi') < html.indexOf('id="pari-tournoi"')); // le pari tournoi vient juste après le classement
});

test('saison : résumé du tournoi = score avant bonification, puis bonus du 1er et du 2e entre parenthèses (exemple Shanghai)', () => {
  const t = { id: 9, annee: 2026, nom: 'Shanghai', ville: 'Shanghai', surface: 'dur', indoor: false, categorie: 'masters_1000', date_debut: '2026-10-07', date_fin: '2026-10-18', etat: 'clos' };
  const archives = [
    { tournament_id: 9, joueur_id: 'p', points_matchs: '100', points_pari_tournoi: '12', bonus_classement: '12', score_final: '124' },
    { tournament_id: 9, joueur_id: 'a', points_matchs: '367/4', points_pari_tournoi: '0', bonus_classement: '5', score_final: '387/4' },
    { tournament_id: 9, joueur_id: 'j', points_matchs: '-19', points_pari_tournoi: '0', bonus_classement: '0', score_final: '-19' },
  ];
  const c = classementTournoi({ moteur, tournoi: t, matchs: [], paris: new Map(), archives, profils });
  const html = htmlListeTournois([t], { race: null, anneeCourante: 2026, classements: new Map([[9, c]]) });
  const resume = /<p class="scores-groupe">([\s\S]*?)<\/p>/.exec(html)[1];
  assert.match(resume, /^Paul <b class="">112<\/b> <b class="bonus-classement">\(\+12\)<\/b> · André <b class="">91,75<\/b> <b class="bonus-classement">\(\+5\)<\/b> · Jacques <b class="neg">−19<\/b>$/);
  assert.doesNotMatch(resume, /124|96,75/); // le score final n'est pas dans cette ligne
});

test('saison : l’étiquette d’état est sous l’étiquette de catégorie, à droite du titre', () => {
  const t = { id: 9, annee: 2026, nom: 'Shanghai', ville: 'Shanghai', surface: 'dur', indoor: false, categorie: 'masters_1000', date_debut: null, date_fin: null, etat: 'a_venir' };
  const html = htmlListeTournois([t], { race: null, anneeCourante: 2026 });
  assert.match(html, /<span class="etiquettes">\s*<span class="badge badge-categorie">Masters 1000<\/span>\s*<span class="badge badge-etat etat-a_venir">À venir<\/span>\s*<\/span>/);
  assert.equal(html.match(/badge-etat/g).length, 1); // plus d'étiquette d'état en bas de la carte
});

test('trophées : un par Grand Chelem et un par Masters 1000 (reconnus par le nom), un pour les ATP Finals', () => {
  const cles = [
    ['grand_slam', "Open d'Australie"], ['grand_slam', 'Australian Open'], ['grand_slam', 'Roland-Garros'], ['grand_slam', 'Roland Garros'],
    ['grand_slam', 'Wimbledon'], ['grand_slam', 'US Open'], ['grand_slam', 'Tournoi inconnu'],
    ['masters_1000', 'Rolex Paris Masters'], ['masters_1000', 'Miami Open'], ['atp_finals', 'Nitto ATP Finals'],
  ].map(([c, n]) => cleTrophee(c, n));
  assert.deepEqual(cles, ['ao', 'ao', 'rg', 'rg', 'wi', 'us', 'gs', 'pa', 'mi', 'atpf']);
  const dessins = new Set(['ao', 'rg', 'wi', 'us', 'gs', 'm1000', 'atpf'].map((k) => htmlTrophee(k === 'm1000' ? 'masters_1000' : k === 'atpf' ? 'atp_finals' : 'grand_slam', { ao: "Open d'Australie", rg: 'Roland-Garros', wi: 'Wimbledon', us: 'US Open', gs: 'Autre' }[k])));
  assert.equal(dessins.size, 7); // sept dessins différents
  assert.match(htmlTrophee('grand_slam', 'Wimbledon'), /aria-label="Trophée : Wimbledon"/);
  assert.match(htmlTrophee('grand_slam', 'Wimbledon', { id: 9, annee: 2026 }), /aria-label="Trophée : Wimbledon 2026"[^>]*data-nom="Wimbledon 2026" data-tournoi="9"/);
  assert.match(htmlTrophee('masters_1000'), /aria-label="Trophée Masters 1000"/);
  // une coupe différente pour chacun des 9 Masters 1000 ; un nom inconnu garde la coupe « 1000 »
  const masters = ['Indian Wells Masters', 'Miami Open', 'Monte-Carlo Masters', 'Madrid Open', 'Masters de Rome', 'Masters du Canada', 'Cincinnati Masters', 'Rolex Shanghai Masters', 'Rolex Paris Masters'];
  assert.equal(new Set(masters.map((n) => cleTrophee('masters_1000', n))).size, 9);
  assert.equal(new Set(masters.map((n) => htmlTrophee('masters_1000', n).replace(/aria-label="[^"]*"|data-nom="[^"]*"|<title>[^<]*<\/title>/g, ''))).size, 9);
  assert.equal(cleTrophee('masters_1000', 'Tournoi inconnu'), 'm1000');
  assert.doesNotMatch(htmlTrophee('masters_1000', 'Miami Open'), />1000</);
});

test('Race : les trophées gagnés suivent le nom du joueur — Grand Chelem, puis Masters 1000, puis ATP Finals, chacun dans l’ordre chronologique', () => {
  const ts = [
    { id: 1, annee: 2026, nom: 'Miami Open', categorie: 'masters_1000', date_debut: '2026-03-18', etat: 'clos' },
    { id: 2, annee: 2026, nom: 'Wimbledon', categorie: 'grand_slam', date_debut: '2026-06-29', etat: 'clos' },
    { id: 3, annee: 2026, nom: "Open d'Australie", categorie: 'grand_slam', date_debut: '2026-01-18', etat: 'clos' },
    { id: 4, annee: 2026, nom: 'Rolex Paris Masters', categorie: 'masters_1000', date_debut: '2026-11-02', etat: 'clos' },
    { id: 5, annee: 2026, nom: 'Nitto ATP Finals', categorie: 'atp_finals', date_debut: '2026-11-15', etat: 'clos' },
    { id: 6, annee: 2026, nom: 'Monte-Carlo', categorie: 'masters_1000', date_debut: '2026-04-12', etat: 'en_cours' }, // pas terminé : aucun trophée
    { id: 7, annee: 2025, nom: 'US Open', categorie: 'grand_slam', date_debut: '2025-08-24', etat: 'clos' }, // autre année : ignoré
  ];
  const r = (t, j, rang) => ({ tournament_id: t, joueur_id: j, score_final: '10', rang });
  const rs = [
    r(1, 'p', 1), r(1, 'a', 2), r(2, 'p', 1), r(2, 'a', 2), r(3, 'p', 1), r(3, 'a', 2), r(4, 'a', 1), r(4, 'p', 2),
    r(5, 'p', 1), r(5, 'a', 1) /* ex æquo : les deux */, r(6, 'a', 1), r(7, 'a', 1), r(1, 'zzz', 1),
  ];
  const race = construireRace({ moteur, annee: 2026, tournois: ts, resultats: rs, profils });
  const noms = (id) => race.lignes.find((l) => l.id === id).trophees.map((t) => t.nom);
  assert.deepEqual(noms('p'), ["Open d'Australie", 'Wimbledon', 'Miami Open', 'Nitto ATP Finals']);
  assert.deepEqual(noms('a'), ['Rolex Paris Masters', 'Nitto ATP Finals']);
  assert.deepEqual(noms('j'), []);
  const html = htmlRace(race);
  const ligne = (prenom) => new RegExp(`<span class="nom-race">${prenom}<span class="trophees-race">([\\s\\S]*?)</span></span>`).exec(html)[1];
  const labels = (prenom) => [...ligne(prenom).matchAll(/aria-label="Trophée : ([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(labels('Paul'), ["Open d&#39;Australie 2026", 'Wimbledon 2026', 'Miami Open 2026', 'Nitto ATP Finals 2026']); // le nom est suivi de l'année
  assert.match(ligne('Paul'), /data-tournoi="3"/); // clic sur ordinateur : page du tournoi
  assert.doesNotMatch(html, /<span class="nom-race">Jacques<span class="trophees-race">/); // aucun trophée : rien d'affiché
});

test('saison : les dates sont dans la même colonne que le titre, juste dessous', () => {
  const t = { id: 9, annee: 2026, nom: 'Shanghai', ville: 'Shanghai', surface: 'dur', indoor: false, categorie: 'masters_1000', date_debut: '2026-10-07', date_fin: '2026-10-18', etat: 'en_cours' };
  const html = htmlListeTournois([t], { race: null, anneeCourante: 2026 });
  assert.match(html, /<div class="titre-tournoi">\s*<h3>Shanghai<\/h3>\s*<p class="periode">7 au 18 octobre 2026<\/p>\s*<\/div>\s*<span class="etiquettes">/);
  assert.match(html, /badge-etat etat-en_cours">En cours/);
});

test('classement du tournoi : une fois terminé, le trophée suit le nom du vainqueur (et lui seul)', () => {
  const t = { id: 9, annee: 2026, nom: 'Wimbledon', categorie: 'grand_slam', etat: 'clos' };
  const archives = [
    { tournament_id: 9, joueur_id: 'p', points_matchs: '10', points_pari_tournoi: '0', bonus_classement: '0', score_final: '20', rang: 1 },
    { tournament_id: 9, joueur_id: 'a', points_matchs: '10', points_pari_tournoi: '0', bonus_classement: '0', score_final: '5', rang: 2 },
  ];
  const c = classementTournoi({ moteur, tournoi: t, matchs: [], paris: new Map(), archives, profils });
  const html = htmlClassementTournoi(c, { tournoi: t });
  assert.match(html, /<span>Paul<\/span><span class="trophee-vainqueur"><svg class="trophee"[^>]*aria-label="Trophée : Wimbledon 2026"[^>]*data-tournoi="9"/);
  assert.equal(html.match(/trophee-vainqueur/g).length, 1); // André n'en a pas
  // tournoi en cours : aucun trophée
  const enCours = classementTournoi({ moteur, tournoi: { ...t, etat: 'en_cours' }, matchs: [], paris: new Map(), archives: [], profils });
  assert.doesNotMatch(htmlClassementTournoi(enCours, { tournoi: { ...t, etat: 'en_cours' } }), /trophee-vainqueur/);
});

test('saison : tournoi terminé = ligne « Vainqueur : Prénom Nom » entre le lieu et le vainqueur des pronos', () => {
  const t = { id: 9, annee: 2026, nom: 'Shanghai', ville: 'Shanghai', surface: 'dur', indoor: false, categorie: 'masters_1000', date_debut: '2026-10-07', date_fin: '2026-10-18', etat: 'clos', vainqueur_id: 59 };
  const archives = [{ tournament_id: 9, joueur_id: 'p', points_matchs: '100', points_pari_tournoi: '12', bonus_classement: '12', score_final: '124', rang: 1 }];
  const c = classementTournoi({ moteur, tournoi: t, matchs: [], paris: new Map(), archives, profils });
  const joueurs = new Map([[59, { id: 59, nom: 'Alejandro Davidovich Fokina' }]]);
  const html = htmlListeTournois([t], { race: null, anneeCourante: 2026, classements: new Map([[9, c]]), joueurs });
  const lieu = html.indexOf('class="lieu"');
  const vt = html.indexOf('class="vainqueur-tennis"');
  const pronos = html.indexOf('class="palmares-groupe"');
  assert.ok(lieu > 0 && lieu < vt && vt < pronos, `ordre : ${lieu}, ${vt}, ${pronos}`);
  assert.match(html, /Vainqueur : <strong>Alejandro Davidovich Fokina<\/strong>/);
  // pas de ligne si le tournoi n'est pas terminé, ou si le vainqueur est inconnu
  assert.doesNotMatch(htmlListeTournois([{ ...t, etat: 'en_cours' }], { joueurs }), /vainqueur-tennis/);
  assert.doesNotMatch(htmlListeTournois([{ ...t, vainqueur_id: null }], { joueurs }), /vainqueur-tennis/);
  assert.doesNotMatch(htmlListeTournois([t], {}), /vainqueur-tennis/); // joueurs non fournis : rien ne plante
});

test('trophée : infobulle au survol avec le nom du tournoi ; plus de balle dans le cadre du vainqueur', () => {
  assert.match(htmlTrophee('grand_slam', 'Roland-Garros'), /<title>Roland-Garros<\/title>/);
  assert.match(htmlTrophee('masters_1000', 'Shanghai'), /<title>Shanghai<\/title>/);
  const t = { id: 1, nom: 'Shanghai', categorie: 'masters_1000', etat: 'clos', vainqueur_id: 5 };
  const h = htmlListeTournois([t], { joueurs: new Map([[5, { nom: 'Jannik Sinner' }]]) });
  assert.match(h, /class="vainqueur-tennis">Vainqueur : <strong>Jannik Sinner<\/strong>/);
  assert.doesNotMatch(h, /vt-balle/);
});

test('saison : « | Moi · score » après le vainqueur des pronos, sauf si je suis le vainqueur', () => {
  const t = { id: 1, annee: 2026, nom: 'Shanghai', categorie: 'masters_1000', etat: 'clos', date_debut: '2026-10-07', date_fin: '2026-10-18' };
  const cl = { cloture: true, lignes: [
    { id: 'p', prenom: 'Paul', rang: 1, final: { texte: '124' }, avantBonus: { texte: '112' }, bonus: { positif: true, texte: '+12' } },
    { id: 'a', prenom: 'André', rang: 2, final: { texte: '96,75' }, avantBonus: { texte: '91,75' }, bonus: { positif: true, texte: '+5' } }] };
  const h = (moi) => htmlListeTournois([t], { classements: new Map([[1, cl]]), moi });
  assert.match(h('a'), /<b>Paul<\/b> · 124<\/span><span class="sep-moi"[^>]*>\|<\/span><span><b>Moi<\/b> · 96,75<\/span>/);
  assert.doesNotMatch(h('p'), /Moi/);
  assert.doesNotMatch(h(null), /Moi/);
});

test('saison terminée : « Classement final », trophées Champion et Vice-champion de la saison en tête des trophées', () => {
  const ts = [
    { id: 1, annee: 2026, nom: 'Roland-Garros', categorie: 'grand_slam', etat: 'clos', date_debut: '2026-05-24' },
    { id: 2, annee: 2026, nom: 'Miami Open', categorie: 'masters_1000', etat: 'clos', date_debut: '2026-03-18' },
  ];
  const rs = [
    { tournament_id: 1, joueur_id: 'a', score_final: '30', rang: 1 }, { tournament_id: 1, joueur_id: 'p', score_final: '20', rang: 2 }, { tournament_id: 1, joueur_id: 'j', score_final: '5', rang: 3 },
    { tournament_id: 2, joueur_id: 'a', score_final: '10', rang: 2 }, { tournament_id: 2, joueur_id: 'p', score_final: '12', rang: 1 }, { tournament_id: 2, joueur_id: 'j', score_final: '1', rang: 3 },
  ];
  const race = construireRace({ moteur, annee: 2026, tournois: ts, resultats: rs, profils });
  assert.equal(race.terminee, true);
  const [premier, deuxieme, troisieme] = race.lignes;
  assert.deepEqual(premier.trophees.map((t) => t.categorie), ['champion_saison', 'grand_slam']); // le champion d'abord, puis le Grand Chelem
  assert.deepEqual(deuxieme.trophees.map((t) => t.categorie), ['vice_champion_saison', 'masters_1000']);
  assert.deepEqual(troisieme.trophees, []);
  const html = htmlRace(race);
  assert.match(html, /<h3>Classement final 2026<\/h3>/);
  assert.match(html, /aria-label="Trophée : Champion de la saison 2026"[^>]*data-nom="Champion de la saison 2026"/);
  assert.match(html, /aria-label="Trophée : Vice-champion de la saison 2026"/);
  assert.notEqual(cleTrophee('champion_saison', 'Champion de la saison'), cleTrophee('vice_champion_saison', 'Vice-champion de la saison'));
  // un tournoi pas encore terminé : on reste à « Race » et aucun trophée de saison
  const enCours = construireRace({ moteur, annee: 2026, tournois: [...ts, { id: 3, annee: 2026, nom: 'Paris', categorie: 'masters_1000', etat: 'en_cours' }], resultats: rs, profils });
  assert.equal(enCours.terminee, false);
  assert.match(htmlRace(enCours), /<h3>Race 2026<\/h3>/);
  assert.ok(enCours.lignes.every((l) => !l.trophees.some((t) => /champion/.test(t.categorie))));
});

test('classement du tournoi : une colonne de points par tour (Huitièmes, Quarts…) au lieu de « Matchs »', () => {
  const match = (id, tour, vainqueur) => ({ id, tour, p1_id: 1, p2_id: 2, statut: 'termine', neutralise: false, paris_reveles: true, verrouille: true, resultat_visible: true, vainqueur, sets_joues: 2, fin_match: 'normal' });
  const bet = (joueur, choix, confiance) => [joueur, { choix, confiance, sets: null }];
  const matchs = [match(1, 'R16', 1), match(2, 'QF', 2), { ...match(3, 'SF', null), statut: 'a_venir', resultat_visible: false, paris_reveles: false }];
  const paris = new Map([[1, new Map([bet('p', 1, 8)])], [2, new Map([bet('p', 2, 7)])]]);
  const c = classementTournoi({ moteur, tournoi: { id: 1, etat: 'en_cours', categorie: 'masters_1000' }, matchs, paris, archives: [], profils: quatre });
  assert.deepEqual(c.tours.map((t) => t.tour), ['R16', 'QF'], 'seuls les tours comptés ont une colonne');
  const html = htmlClassementTournoi(c, {});
  assert.match(html, /<th>Huitièmes<\/th><th>Quarts<\/th>/);
  assert.doesNotMatch(html, /<th>Matchs<\/th>/);
  const p = c.lignes.find((l) => l.prenom === 'Pierre');
  assert.ok(p.parTour.R16 && p.parTour.QF);
  // sans matchs fournis (liste des tournois) : retour à la colonne unique
  const sans = classementTournoi({ moteur, tournoi: { id: 1, etat: 'en_cours', categorie: 'masters_1000' }, matchs: [], paris: new Map(), archives: [], profils: quatre });
  assert.match(htmlClassementTournoi(sans, {}), /<th>Matchs<\/th>/);
});
