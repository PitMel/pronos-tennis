import test from 'node:test';
import assert from 'node:assert/strict';
import * as moteur from '../../src/moteur/index.js';
import { detailRace } from '../../web/js/classement.js';
import { statsRace } from '../../web/js/stats-race.js';
import { htmlPageRace } from '../../web/js/vues.js';

const profils = [{ id: 'a', prenom: 'André', couleur: null }, { id: 'p', prenom: 'Paul', couleur: null }];
const tournois = [
  { id: 1, annee: 2026, nom: 'Roland-Garros', categorie: 'grand_slam', etat: 'clos', date_debut: '2026-05-24', vainqueur_id: 10, finaliste_id: 11 },
  { id: 2, annee: 2026, nom: 'Monte-Carlo', categorie: 'masters_1000', etat: 'en_cours' }, // pas terminé : ignoré
];
const resultats = [
  { tournament_id: 1, joueur_id: 'a', points_matchs: '8', points_pari_tournoi: '24', bonus_classement: '24', score_final: '56', rang: 1 },
  { tournament_id: 1, joueur_id: 'p', points_matchs: '14', points_pari_tournoi: '0', bonus_classement: '12', score_final: '26', rang: 2 },
];
// Joueur 10 (Alcaraz) joue les 6 matchs en p1 et en gagne 4 ; ses adversaires : 11 à 16.
const vainqueurs = [1, 1, 2, 1, 2, 1];
const sets = [3, 4, 3, 5, 4, 3];
const matchs = vainqueurs.map((v, i) => ({ id: 100 + i, tournament_id: 1, tour: 'R16', p1_id: 10, p2_id: 11 + i, vainqueur: v, sets_joues: sets[i], fin_match: 'normal', neutralise: false }));
matchs.push({ id: 200, tournament_id: 2, tour: 'R16', p1_id: 10, p2_id: 99, vainqueur: 1, sets_joues: 2, neutralise: false }); // tournoi non terminé : ignoré
const paris = new Map();
// André : Alcaraz à 10 partout, en pariant 3 sets ; Paul : contre Alcaraz sur les 3 premiers matchs, à 6, en pariant 5 sets
matchs.slice(0, 6).forEach((m) => paris.set(m.id, new Map([['a', { choix: 1, confiance: 10, sets: 3 }]])));
matchs.slice(0, 3).forEach((m) => paris.get(m.id).set('p', { choix: 2, confiance: 6, sets: 5 }));
const parisTournoi = [{ tournament_id: 1, joueur_id: 'a', vainqueur_id: 10, finaliste_id: 11 }];
const joueurs = new Map([[10, { nom: 'Alcaraz' }], [11, { nom: 'Bublik' }], [12, { nom: 'Cobolli' }], [13, { nom: 'Draper' }]]);
const calculer = () => statsRace({ moteur, annee: 2026, tournois, resultats, profils, matchs, paris, parisTournoi, joueurs });

test('détail des points : matchs, sets, vainqueur et finaliste, bonification, total', () => {
  const [a, p] = calculer().detailPoints;
  assert.deepEqual([a.matchs.texte, a.sets.texte, a.pari.texte, a.bonus.texte, a.total.texte], ['6', '2', '24', '24', '56']);
  assert.deepEqual([p.matchs.texte, p.sets.texte, p.pari.texte, p.bonus.texte, p.total.texte], ['14', '0', '0', '12', '26']);
});

test('vaches à lait : points cumulés par joueur de tennis (matchs et pari tournoi), trois au plus', () => {
  const [a, p] = calculer().vachesALait;
  assert.deepEqual(a.joueurs.map((j) => [j.nom, j.points]), [['Alcaraz', '24'], ['Bublik', '8']]);
  assert.deepEqual(p.joueurs.map((j) => [j.nom, j.points]), [['Draper', '6'], ['Bublik', '4'], ['Cobolli', '4']]);
});

test('chouchous : joueurs vus au moins 5 fois, rapport paris sur sa victoire / matchs', () => {
  const [a, p] = calculer().chouchous;
  assert.deepEqual(a.joueurs.map((j) => [j.nom, j.rapport, j.pourcentage]), [['Alcaraz', '6/6', 100]]);
  assert.deepEqual(p.joueurs, []); // Paul n'a jamais misé sur Alcaraz
});

test('amours impossibles : au moins trois paris, victoires du joueur / paris sur lui', () => {
  const [a, p] = calculer().amoursImpossibles;
  assert.deepEqual(a.joueurs.map((j) => [j.nom, j.rapport, j.pourcentage]), [['Alcaraz', '4/6', 67]]);
  assert.deepEqual(p.joueurs, []); // un seul pari sur chaque adversaire
});

test('records : plus gros score avant bonification, ric rac, grand fou, gagne-petit ; tournois non terminés ignorés', () => {
  const r = calculer().records;
  assert.equal(r.grandChelem.length, 1);
  assert.deepEqual([r.grandChelem[0].tournoi.nom, r.grandChelem[0].parieur, r.grandChelem[0].score], ['Roland-Garros', 'André', '32']);
  assert.equal(r.masters, null);
  assert.deepEqual(r.ricRac.map((x) => [x.tournoi.nom, x.premier, x.deuxieme, x.ecart, x.pluriel]), [['Roland-Garros', 'André', 'Paul', '18', true]]);
  assert.deepEqual([r.grandFou.noms, r.grandFou.nombre, r.grandFou.autres], [['André'], 6, [{ id: 'p', prenom: 'Paul', nombre: 0 }]]);
  assert.deepEqual([r.gagnePetit.noms, r.gagnePetit.nombre, r.gagnePetit.autres], [['Paul'], 3, [{ id: 'a', prenom: 'André', nombre: 0 }]]);
});

test('récompenses de parieur : comptent aussi les matchs terminés (paris révélés) d’un tournoi pas encore terminé ; strike et scores de tournoi restent aux tournois clos', () => {
  const tn = [...tournois, { id: 99, nom: 'En cours', categorie: 'masters_1000', annee: 2026, etat: 'en_cours', date_debut: '2026-11-01' }];
  const mt = [{ id: 901, tournament_id: 99, tour: 'R16', p1_id: 1, p2_id: 2, vainqueur: 1, neutralise: false, statut: 'termine' },
              { id: 902, tournament_id: 99, tour: 'R16', p1_id: 3, p2_id: 4, vainqueur: null, neutralise: false, statut: 'en_cours' }];
  const base = calculer();
  const avec = statsRace({ moteur, annee: 2026, tournois: tn, resultats, profils, matchs: [...matchs, ...mt],
    paris: new Map([...paris, [901, new Map([['p', { choix: 1, confiance: 10 }], ['a', { choix: 2, confiance: 10 }]])],
                                         [902, new Map([['p', { choix: 1, confiance: 10 }]])]]), parisTournoi, joueurs });
  assert.equal(avec.nbMatchsRecompenses, base.nbMatchsRecompenses + 1, 'seul le match terminé en plus est compté');
  assert.equal(avec.nbTournois, base.nbTournois, 'le compteur de tournois ne compte que les terminés');
  assert.equal(avec.records.grandFou.nombre, base.records.grandFou.nombre + 1);
});

test('« Autres récompenses » indique, comme « Faits de l’année », le nombre de tournois et de matchs comptés', () => {
  const d = detailRace({ moteur, annee: 2026, tournois, resultats, profils });
  const stats = calculer();
  const html = htmlPageRace(d, { moi: 'p', stats });
  const compteur = `${stats.nbTournois} tournoi${stats.nbTournois > 1 ? 's' : ''} terminé${stats.nbTournois > 1 ? 's' : ''} · ${stats.nbMatchsRecompenses} match${stats.nbMatchsRecompenses > 1 ? 's' : ''}`;
  const compteurFaits = `${stats.nbTournois} tournoi${stats.nbTournois > 1 ? 's' : ''} terminé${stats.nbTournois > 1 ? 's' : ''} · ${stats.nbMatchs} match${stats.nbMatchs > 1 ? 's' : ''}`;
  const apres = html.slice(html.indexOf('Autres récompenses'));
  assert.ok(apres.slice(0, 400).includes(compteur), 'compteur sous « Autres récompenses »');
  assert.ok(html.includes(compteurFaits), 'compteur sous « Faits de l’année »');
});

test('page Race : les sections viennent dans l’ordre demandé', () => {
  const d = detailRace({ moteur, annee: 2026, tournois, resultats, profils });
  const html = htmlPageRace(d, { moi: 'p', stats: calculer() });
  const ordre = ['<h3>Classement</h3>', '<h3>Détail des points</h3>', '<h3>Détail par tournoi</h3>', '<h3>Évolution</h3>', 'Autres récompenses', 'Les vaches à lait', 'Les chouchous', 'Les amours impossibles', 'Faits de l’année'];
  const positions = ordre.map((t) => html.indexOf(t));
  assert.ok(positions.every((x) => x >= 0), `section manquante : ${positions}`);
  assert.deepEqual([...positions].sort((x, y) => x - y), positions);
  assert.match(html, /Biggest win – Grand Chelem/);
  assert.match(html, /Ric rac !/);
  assert.match(html, /Le grand fou/);
  assert.match(html, /2 tournois terminés · 7 matchs|1 tournoi terminé · 6 matchs/);
  assert.match(html, /6\/6 \(100&nbsp;%\)/);
  assert.match(html, /<td class="[^"]*gagnant"><span class="cellule-score"><span class="medaille"[^>]*>🥇<\/span><span class="cadre-gagnant">/); // médaille et cadre dans « Détail des points »
  assert.match(html, /Le gagne-petit/);
  assert.match(html, /<b>Alcaraz<\/b> <span class="valeur">\(24\)<\/span>/);
  // sans statistiques (échec de chargement) : la page s'affiche quand même
  assert.doesNotMatch(htmlPageRace(d, { moi: 'p' }), /vaches à lait/);
});

test('records « paris » : sniper, contradicteur, strike, bérézina, confiance', () => {
  const trois = [{ id: 'a', prenom: 'André', couleur: null }, { id: 'p', prenom: 'Paul', couleur: null }, { id: 'j', prenom: 'Jacques', couleur: null }];
  const ms = [
    { id: 1, tournament_id: 1, tour: 'R16', p1_id: 10, p2_id: 11, vainqueur: 1, sets_joues: 3, neutralise: false },
    { id: 2, tournament_id: 1, tour: 'QF', p1_id: 10, p2_id: 11, vainqueur: 2, sets_joues: 3, score: { games: [[3, 6], [4, 6]] }, fin_match: 'normal', neutralise: false },
    { id: 3, tournament_id: 1, tour: 'SF', p1_id: 10, p2_id: 11, vainqueur: 1, sets_joues: 3, neutralise: false },
    { id: 4, tournament_id: 1, tour: 'F', p1_id: 10, p2_id: 11, vainqueur: 1, sets_joues: 3, neutralise: false },
  ];
  const pr = new Map([
    [1, new Map([['a', { choix: 1, confiance: 10, sets: 3 }], ['p', { choix: 1, confiance: 10, sets: 3 }], ['j', { choix: 2, confiance: 6, sets: 3 }]])],
    [2, new Map([['a', { choix: 1, confiance: 10, sets: 3 }], ['p', { choix: 1, confiance: 10, sets: 3 }], ['j', { choix: 2, confiance: 6, sets: 3 }]])],
    [3, new Map([['a', { choix: 1, confiance: 7, sets: 3 }], ['p', { choix: 1, confiance: 7, sets: 3 }], ['j', { choix: 1, confiance: 7, sets: 3 }]])],
    [4, new Map([['a', { choix: 1, confiance: 8, sets: 3 }]])],
  ]);
  const rs = trois.map((x) => ({ tournament_id: 1, joueur_id: x.id, points_matchs: '10', points_pari_tournoi: '0', bonus_classement: '0', score_final: '10', rang: 1 }));
  const st = statsRace({ moteur, annee: 2026, tournois: [tournois[0]], resultats: rs, profils: trois, matchs: ms, paris: pr, parisTournoi: [], joueurs });
  const r = st.records;
  // sniper : André 3/4, Paul et Jacques 2/3
  assert.deepEqual(r.sniper.tops.map((x) => [x.prenom, x.ok, x.sur, x.pourcentage]), [['André', 3, 4, 75]]);
  assert.deepEqual(r.sniper.autres.map((x) => [x.prenom, `${x.ok}/${x.sur}`, x.pourcentage]), [['Jacques', '2/3', 67], ['Paul', '2/3', 67]]);
  // contradicteur : Jacques seul contre tous aux matchs 1 et 2, raison une fois (match 2)
  assert.deepEqual(r.contradicteur.tops.map((x) => [x.prenom, x.bons, x.solo]), [['Jacques', 1, 2]]);
  // strike : André a trouvé 3 vainqueurs sur les 4 matchs du tournoi
  assert.deepEqual(r.strike.tops.map((x) => [x.prenom, x.ok, x.sur, x.pourcentage, x.tournoi.nom]), [['André', 3, 4, 75, 'Roland-Garros']]);
  assert.deepEqual(r.strike.autres.map((x) => [x.prenom, x.ok, x.sur, x.tournois.map((t) => t.nom)]), [['Paul', 2, 4, ['Roland-Garros']], ['Jacques', 2, 4, ['Roland-Garros']]]);
  assert.deepEqual(r.fullStrike, []); // personne n'a trouvé les 4 vainqueurs
  // pomme de discorde : 10 sur le joueur 1 (+5) contre 6 sur le joueur 2 (−1) = écart de 6, aux matchs 1 et 2 (André et Paul contre Jacques)
  assert.deepEqual(r.pommeDiscorde.map((x) => [x.ecart, x.tour, x.paires.length]), [[6, 'Huitièmes de finale', 2], [6, 'Quarts de finale', 2]]);
  assert.deepEqual(r.pommeDiscorde[0].paires.map(([x, y]) => [x.prenom, x.confiance, y.prenom, y.confiance]), [['André', 10, 'Jacques', 6], ['Paul', 10, 'Jacques', 6]]);
  // bérézina : match 2, quart de finale ×1,5 (−25,5 −25,5 +10,5 avec le bonus de sets = −40,5), score vu du vainqueur (joueur 2)
  assert.equal(r.berezina.length, 1);
  assert.equal(r.berezina[0].total, '−40,5');
  assert.deepEqual([r.berezina[0].tour, r.berezina[0].vainqueur, r.berezina[0].perdant, r.berezina[0].score], ['Quarts de finale', 'Bublik', 'Alcaraz', '6-3 6-4']);
  assert.deepEqual(r.berezina[0].parieurs.map((x) => [x.prenom, x.points]), [['André', '−25,5'], ['Paul', '−25,5'], ['Jacques', '+10,5']]);
  // confiance : André a parié 10 deux fois, 7 une fois, 8 une fois
  const a = st.confiances.find((c) => c.id === 'a');
  assert.deepEqual(a.repartition.map((x) => [x.confiance, x.n, x.pourcentage]), [[6, 0, 0], [7, 1, 25], [8, 1, 25], [9, 0, 0], [10, 2, 50]]);
  const html = htmlPageRace(detailRace({ moteur, annee: 2026, tournois: [tournois[0]], resultats: rs, profils: trois }), { moi: 'a', stats: st });
  const ordre = ['Les amours impossibles', 'Le thermomètre de la confiance', 'Faits de l’année'].map((t) => html.indexOf(t));
  assert.ok(ordre.every((x) => x >= 0) && ordre[0] < ordre[1] && ordre[1] < ordre[2]);
  assert.match(html, /<td><b>50&nbsp;%<\/b><small>2<\/small><\/td>/); // pourcentage en grand, nombre dessous
  assert.doesNotMatch(html.slice(html.indexOf('Thermomètre')), /<polyline /); // thermomètre : tableau seul, sans graphique
  for (const t of ['Le sniper', 'Le contradicteur', 'Le strike', 'La bérézina']) assert.match(html, new RegExp(t));
});

test('strike : tous les ex æquo sont mis en avant (parieurs différents, ou même parieur dans plusieurs tournois)', () => {
  const duo = [{ id: 'a', prenom: 'André', couleur: null }, { id: 'p', prenom: 'Paul', couleur: null }];
  const ts = [
    { id: 1, annee: 2026, nom: 'Open d’Australie', categorie: 'grand_slam', etat: 'clos', date_debut: '2026-01-18' },
    { id: 2, annee: 2026, nom: 'Indian Wells', categorie: 'masters_1000', etat: 'clos', date_debut: '2026-03-04' },
    { id: 3, annee: 2026, nom: 'Miami', categorie: 'masters_1000', etat: 'clos', date_debut: '2026-03-18' },
  ];
  const mk = (id, t) => ({ id, tournament_id: t, tour: 'R16', p1_id: 10, p2_id: 11, vainqueur: 1, sets_joues: 3, neutralise: false });
  const ms = [mk(1, 1), mk(2, 1), mk(3, 2), mk(4, 2), mk(5, 3), mk(6, 3)];
  const bet = (choix) => ({ choix, confiance: 6, sets: 3 });
  const pr = new Map([
    [1, new Map([['a', bet(1)], ['p', bet(2)]])], [2, new Map([['a', bet(1)], ['p', bet(2)]])], // Open d’Australie : André 2/2
    [3, new Map([['a', bet(2)], ['p', bet(1)]])], [4, new Map([['a', bet(2)], ['p', bet(1)]])], // Indian Wells : Paul 2/2
    [5, new Map([['a', bet(1)], ['p', bet(2)]])], [6, new Map([['a', bet(1)], ['p', bet(2)]])], // Miami : André 2/2 encore
  ]);
  const st = statsRace({ moteur, annee: 2026, tournois: ts, resultats: [], profils: duo, matchs: ms, paris: pr, parisTournoi: [], joueurs });
  assert.deepEqual(st.records.strike.tops.map((x) => [x.prenom, x.tournoi.nom, `${x.ok}/${x.sur}`]), [['André', 'Open d’Australie', '2/2'], ['Paul', 'Indian Wells', '2/2'], ['André', 'Miami', '2/2']]);
  assert.deepEqual(st.records.strike.autres, []); // tous les parieurs sont déjà en avant
  assert.deepEqual(st.records.fullStrike.map((x) => [x.prenom, x.tournoi.nom, x.sur]).sort(), [['André', 'Miami', 2], ['André', 'Open d’Australie', 2], ['Paul', 'Indian Wells', 2]]); // 2/2 = tous les vainqueurs
  const html = htmlPageRace(detailRace({ moteur, annee: 2026, tournois: ts, resultats: [], profils: duo }), { moi: 'a', stats: st });
  assert.equal((html.match(/%\) bons vainqueurs/g) ?? []).length, 3);
});

test('records : en cas d’égalité parfaite, tous les ex æquo sont donnés (sniper, contradicteur, grand fou, ric rac, bérézina)', () => {
  const trois = [{ id: 'a', prenom: 'André', couleur: null }, { id: 'p', prenom: 'Paul', couleur: null }, { id: 'j', prenom: 'Jacques', couleur: null }];
  const ts = [
    { id: 1, annee: 2026, nom: 'Open d’Australie', categorie: 'grand_slam', etat: 'clos', date_debut: '2026-01-18' },
    { id: 2, annee: 2026, nom: 'Roland-Garros', categorie: 'grand_slam', etat: 'clos', date_debut: '2026-05-24' },
  ];
  const mk = (id, t) => ({ id, tournament_id: t, tour: 'R16', p1_id: 10, p2_id: 11, vainqueur: 1, sets_joues: 3, neutralise: false });
  const ms = [mk(1, 1), mk(2, 2)]; // même confiance, même résultat dans les deux tournois
  const bet = (choix) => ({ choix, confiance: 10, sets: 3 });
  const pr = new Map([[1, new Map([['a', bet(1)], ['p', bet(1)], ['j', bet(2)]])], [2, new Map([['a', bet(1)], ['p', bet(1)], ['j', bet(2)]])]]);
  const rs = [1, 2].flatMap((t) => trois.map((x) => ({ tournament_id: t, joueur_id: x.id, points_matchs: x.id === 'j' ? '-17' : '10', points_pari_tournoi: '0', bonus_classement: '0', score_final: '0', rang: 1 })));
  const r = statsRace({ moteur, annee: 2026, tournois: ts, resultats: rs, profils: trois, matchs: ms, paris: pr, parisTournoi: [], joueurs }).records;
  assert.deepEqual(r.sniper.tops.map((x) => x.prenom), ['André', 'Paul']); // 2/2 chacun
  assert.deepEqual(r.sniper.autres.map((x) => x.prenom), ['Jacques']);
  assert.deepEqual(r.grandFou.noms, ['André', 'Paul', 'Jacques']);
  assert.deepEqual(r.ricRac.map((x) => x.tournoi.nom), ['Open d’Australie', 'Roland-Garros']); // même écart (0) dans les deux tournois
  assert.deepEqual(r.berezina.map((x) => x.tournoi.nom), ['Open d’Australie', 'Roland-Garros']); // même total
  assert.equal(r.contradicteur, null); // personne n'a eu raison seul contre tous
});

test('statistiques par joueur : vainqueur du match (comme le sniper), sets, vainqueurs et finalistes du pari tournoi', () => {
  const [a, p] = calculer().statistiques;
  const r = (x) => (x ? [x.ok, x.sur, x.pourcentage] : null);
  assert.deepEqual([r(a.vainqueurMatch), r(a.sets), r(a.vainqueurs), r(a.finalistes)], [[4, 6, 67], [3, 6, 50], [1, 1, 100], [2, 2, 100]]);
  assert.deepEqual([r(p.vainqueurMatch), r(p.sets), r(p.vainqueurs), r(p.finalistes)], [[1, 3, 33], [0, 3, 0], null, null]);
  const sniper = calculer().records.sniper;
  assert.equal(sniper.tops[0].pourcentage, a.vainqueurMatch.pourcentage, 'même statistique que le sniper');
});

test('page détail de l’année : section « Statistiques » après le thermomètre, une ligne par joueur', () => {
  const stats = calculer();
  const h = htmlPageRace(detailRace({ moteur, annee: 2026, tournois, resultats, profils }), { moi: 'a', stats });
  const i = h.indexOf('Le thermomètre de la confiance');
  const j = h.indexOf('Vainqueur du match');
  assert.ok(i > 0 && j > i, 'section placée après le thermomètre');
  assert.match(h, /<th scope="col">Nombre de sets<\/th><th scope="col">Vainqueurs<\/th><th scope="col">Finalistes<\/th>/);
  assert.match(h, /<b>67&nbsp;%<\/b><small>4\/6<\/small>/);
});

test('chouchous et amours impossibles sont recalculés à chaque affichage : un tournoi qui se termine entre dans le décompte', () => {
  const tournoisEnCours = tournois.map((t) => (t.id === 1 ? { ...t, etat: 'en_cours' } : t));
  const avant = statsRace({ moteur, annee: 2026, tournois: tournoisEnCours, resultats, profils, matchs, paris, parisTournoi, joueurs });
  assert.deepEqual(avant.chouchous[0].joueurs, [], 'tournoi pas terminé : aucun match compté');
  const apres = calculer();
  assert.deepEqual(apres.chouchous[0].joueurs.map((j) => [j.nom, j.rapport]), [['Alcaraz', '6/6']]);
  // un deuxième tournoi terminé s'ajoute : le rapport est recalculé avec ses matchs (André parie sur l'adversaire d'Alcaraz)
  const tournois3 = [...tournois, { id: 3, annee: 2026, nom: 'Wimbledon', categorie: 'grand_slam', etat: 'clos', date_debut: '2026-06-29', vainqueur_id: 10, finaliste_id: 11 }];
  const matchs3 = [...matchs, { id: 300, tournament_id: 3, tour: 'R16', p1_id: 10, p2_id: 50, vainqueur: 1, sets_joues: 3, fin_match: 'normal', neutralise: false },
    { id: 301, tournament_id: 3, tour: 'QF', p1_id: 10, p2_id: 51, vainqueur: 1, sets_joues: 3, fin_match: 'normal', neutralise: false }];
  const paris3 = new Map(paris);
  paris3.set(300, new Map([['a', { choix: 2, confiance: 7, sets: 3 }]])); // pari sur l'adversaire
  paris3.set(301, new Map([['a', { choix: 1, confiance: 7, sets: 3 }]]));
  const r = statsRace({ moteur, annee: 2026, tournois: tournois3, resultats, profils, matchs: matchs3, paris: paris3, parisTournoi, joueurs });
  assert.deepEqual(r.chouchous[0].joueurs.map((j) => [j.nom, j.rapport]), [['Alcaraz', '7/8']]);
});
