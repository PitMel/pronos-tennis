import test from 'node:test';
import assert from 'node:assert/strict';
import * as moteur from '../../src/moteur/index.js';
import { monPalmares } from '../../web/js/mon-palmares.js';
import { htmlMonPalmares } from '../../web/js/vues-palmares.js';

const profils = [{ id: 'm', prenom: 'Moi', couleur: '#2F6CC2' }, { id: 'a', prenom: 'Aline', couleur: null }];
const joueurs = new Map([[10, { nom: 'Alcaraz' }], [11, { nom: 'Sinner' }], [12, { nom: 'Zverev' }]]);
// 2025 : Roland-Garros (GC, je gagne) et Turin (ATP Finals, Aline gagne) ; 2026 : Roland-Garros (Aline gagne) et Miami (je gagne), tout est terminé
const tournois = [
  { id: 1, annee: 2025, nom: 'Roland-Garros', categorie: 'grand_slam', etat: 'clos', date_debut: '2025-05-25', vainqueur_id: 10, finaliste_id: 11 },
  { id: 2, annee: 2025, nom: 'Nitto ATP Finals', categorie: 'atp_finals', etat: 'clos', date_debut: '2025-11-09', vainqueur_id: 11, finaliste_id: 10 },
  { id: 3, annee: 2026, nom: 'Roland-Garros', categorie: 'grand_slam', etat: 'clos', date_debut: '2026-05-24', vainqueur_id: 10, finaliste_id: 12 },
  { id: 4, annee: 2026, nom: 'Miami Open', categorie: 'masters_1000', etat: 'clos', date_debut: '2026-03-18', vainqueur_id: 12, finaliste_id: 10 },
];
const arch = (t, j, pm, pt, b, rang) => ({ tournament_id: t, joueur_id: j, points_matchs: String(pm), points_pari_tournoi: String(pt), bonus_classement: String(b), score_final: String(pm + pt + b), rang });
const resultats = [
  arch(1, 'm', 20, 8, 24, 1), arch(1, 'a', 10, 0, 12, 2), arch(2, 'm', 5, 0, 4, 2), arch(2, 'a', 12, 4, 10, 1),
  arch(3, 'm', 6, 0, 10, 2), arch(3, 'a', 18, 8, 24, 1), arch(4, 'm', 14, 4, 12, 1), arch(4, 'a', 3, 0, 6, 2),
];
const mk = (id, t, v, sets) => ({ id, tournament_id: t, tour: 'R16', p1_id: 10, p2_id: 11, vainqueur: v, sets_joues: sets, fin_match: 'normal', neutralise: false });
const matchs = [mk(1, 1, 1, 3), mk(2, 1, 2, 4), mk(3, 3, 1, 5), mk(4, 4, 1, 2)];
const b = (choix, confiance, sets) => ({ choix, confiance, sets });
const paris = new Map([
  [1, new Map([['m', b(1, 10, 3)], ['a', b(2, 6, 4)]])], // moi : bon vainqueur, bons sets ; Aline : faux
  [2, new Map([['m', b(1, 10, 3)], ['a', b(2, 6, 4)]])], // moi : faux (vainqueur 2), mauvais sets ; Aline : bon, bons sets
  [3, new Map([['m', b(1, 8, 5)]])],
  [4, new Map([['m', b(1, 7)], ['a', b(1, 7)]])],
]);
const parisTournoi = [
  { tournament_id: 1, joueur_id: 'm', vainqueur_id: 10, finaliste_id: 11 }, // bon vainqueur
  { tournament_id: 3, joueur_id: 'm', vainqueur_id: 11, finaliste_id: 10 }, // mauvais vainqueur
];
const d = monPalmares({ moteur, moi: 'm', profils, tournois, resultats, matchs, paris, parisTournoi, joueurs });

test('palmarès : armoire à trophées — victoires du joueur par catégorie, saison terminée : champion ou vice-champion', () => {
  assert.deepEqual(d.annees, [2026, 2025]);
  assert.deepEqual(d.armoire.grand_slam.map((t) => [t.nom, t.annee]), [['Roland-Garros', 2025]]);
  assert.deepEqual(d.armoire.masters_1000.map((t) => [t.nom, t.annee]), [['Miami Open', 2026]]);
  assert.deepEqual(d.armoire.atp_finals, []);
  // 2025 : moi 57 contre Aline 38 → champion ; 2026 : moi 46 contre Aline 51 → vice-champion
  assert.deepEqual(d.armoire.saison.map((t) => [t.categorie, t.annee]), [['vice_champion_saison', 2026], ['champion_saison', 2025]]);
});

test('palmarès : parcours — une colonne par tournoi dans l’ordre du calendrier, une ligne par année', () => {
  assert.deepEqual(d.parcours.colonnes.map((c) => c.nom), ['Miami Open', 'Roland-Garros', 'Nitto ATP Finals']);
  assert.deepEqual(d.parcours.lignes.map((l) => l.annee), [2026, 2025]);
  const l2026 = d.parcours.lignes[0].cases;
  assert.equal(l2026[0].gagne, true); // Miami 2026 gagné
  assert.equal(l2026[1].gagne, false); // Roland-Garros 2026 disputé, pas gagné
  assert.equal(l2026[2], null); // pas d'ATP Finals en 2026
  assert.equal(d.parcours.lignes[1].cases[1].gagne, true); // Roland-Garros 2025
});

test('palmarès : statistiques par saison et records personnels', () => {
  const s = d.statistiques;
  const an = (annee) => s.parSaison.find((x) => x.annee === annee);
  assert.deepEqual([an(2025).vainqueurMatch.ok, an(2025).vainqueurMatch.sur, an(2025).vainqueurMatch.pourcentage], [1, 2, 50]);
  assert.deepEqual([an(2026).vainqueurMatch.ok, an(2026).vainqueurMatch.sur], [2, 2]);
  assert.deepEqual([an(2025).sets.ok, an(2025).sets.sur], [1, 2]); // Roland-Garros 2025 : sets 3 trouvés, puis 3 contre 4
  assert.deepEqual([an(2026).sets.ok, an(2026).sets.sur], [1, 1]);
  assert.deepEqual([an(2025).vainqueurTournoi.ok, an(2025).vainqueurTournoi.sur], [1, 1]);
  assert.deepEqual([an(2026).vainqueurTournoi.ok, an(2026).vainqueurTournoi.sur], [0, 1]);
  // finalistes : deux par tournoi, les deux noms du pari comptent quel que soit l'ordre (2026 : pari 11 + 10, finale 10 – 12 → 1 sur 2)
  assert.deepEqual([an(2025).finalistes.ok, an(2025).finalistes.sur, an(2025).finalistes.pourcentage], [2, 2, 100]);
  assert.deepEqual([an(2026).finalistes.ok, an(2026).finalistes.sur, an(2026).finalistes.pourcentage], [1, 2, 50]);
  assert.deepEqual(s.meilleurGrandChelem.map((x) => [x.annee, x.score]), [[2025, '28']]);
  assert.deepEqual(s.meilleurMasters.map((x) => [x.annee, x.score]), [[2026, '18']]);
  assert.deepEqual(s.recordSaison.map((x) => [x.annee, x.score]), [[2025, '33']]); // 28 + 5, avant bonification
  assert.ok(s.meilleurStrike.length >= 1);
});

test('palmarès : profil des paris par saison et juste prix', () => {
  const p2025 = d.profilDesParis.find((l) => l.annee === 2025);
  assert.deepEqual(p2025.repartition.map((r) => [r.confiance, r.n, r.pourcentage]), [[6, 0, 0], [7, 0, 0], [8, 0, 0], [9, 0, 0], [10, 2, 100]]);
  const ligne10 = d.justePrix.lignes.find((l) => l.confiance === 10);
  assert.deepEqual(d.justePrix.colonnes.map((c) => c.prenom), ['Moi', 'Aline']);
  assert.deepEqual([ligne10.cases[0].ok, ligne10.cases[0].sur, ligne10.cases[0].pourcentage], [1, 2, 50]); // mes deux paris à 10 : un gagné
  const ligne6 = d.justePrix.lignes.find((l) => l.confiance === 6);
  assert.deepEqual([ligne6.cases[1].ok, ligne6.cases[1].sur], [1, 2]); // Aline à 6 : un gagné
  assert.deepEqual([ligne6.total.ok, ligne6.total.sur], [1, 2]);
  assert.equal(d.justePrix.lignes.find((l) => l.confiance === 9).total.pourcentage, null);
});

test('palmarès : la page contient toutes les sections dans l’ordre demandé', () => {
  const html = htmlMonPalmares(d, { prenom: 'Pit' });
  const ordre = ['Armoire à trophées', 'Parcours dans les tournois', 'Mes vaches à lait', 'Mes chouchous', 'Mes amours impossibles', 'Mes statistiques', 'Profil des paris', 'Le juste prix'].map((t) => html.indexOf(t));
  assert.ok(ordre.every((x) => x >= 0), `section manquante : ${ordre}`);
  assert.deepEqual([...ordre].sort((x, y) => x - y), ordre);
  for (const t of ['Récompenses de saison', 'Grand Chelem', 'Masters 1000', 'ATP Finals', 'Pari sur le vainqueur du match', 'Pari sur les sets', 'Pari sur le vainqueur du tournoi', 'Mon meilleur strike', 'Mon meilleur tournoi du Grand Chelem', 'Mon meilleur Master 1000', 'Mon record saison']) assert.match(html, new RegExp(t));
  assert.match(html, /width="64" height="64"[^>]*data-nom="Roland-Garros 2025"/); // trophée en grand format, avec nom et année
  assert.match(html, /aria-label="Trophée : Champion de la saison 2025"/);
  assert.equal((html.match(/<th scope="col">Total<\/th>/g) ?? []).length, 1);
  // aucun tournoi terminé : message d'attente
  const vide = monPalmares({ moteur, moi: 'm', profils, tournois: [], resultats: [], matchs: [], paris: new Map(), parisTournoi: [], joueurs });
  assert.match(htmlMonPalmares(vide), /Aucun tournoi terminé/);
});

test('palmarès : autres récompenses de saison — décernées une fois l’année terminée, ex æquo compris', () => {
  const rs = d.recompensesSaison;
  assert.deepEqual(rs.colonnes.map((c) => c.cle), ['biggest_gc', 'biggest_m1000', 'grand_fou', 'gagne_petit', 'sniper', 'strike', 'full_strike', 'contradicteur']);
  const gagnees = (annee) => rs.lignes.find((l) => l.annee === annee).cases.map((c, i) => (c?.gagne ? rs.colonnes[i].cle : null)).filter(Boolean);
  assert.deepEqual(gagnees(2025), ['biggest_gc', 'grand_fou', 'sniper', 'strike']); // sniper : ex æquo 1/2 avec Aline
  assert.deepEqual(gagnees(2026), ['biggest_m1000', 'sniper', 'strike', 'full_strike']);
  assert.equal(rs.lignes.find((l) => l.annee === 2026).cases[6].nombre, 2); // full strike à Miami et à Roland-Garros 2026 (un seul match joué, trouvé)
  assert.deepEqual(d.armoire.autres.map((a) => [a.cle, a.annee]), [['biggest_m1000', 2026], ['sniper', 2026], ['strike', 2026], ['full_strike', 2026], ['full_strike', 2026], ['biggest_gc', 2025], ['grand_fou', 2025], ['sniper', 2025], ['strike', 2025]]);
  const html = htmlMonPalmares(d);
  for (const t of ['Championnat de saison', 'Autres récompenses', 'Récompenses de saison']) assert.ok(html.includes(t), t);
  assert.ok(html.indexOf('Autres récompenses') > html.indexOf('ATP Finals'));
  assert.ok(html.indexOf('Parcours dans les tournois') < html.indexOf('>Récompenses de saison<') || html.indexOf('Parcours dans les tournois') < html.indexOf('Récompenses de saison</h3>'));
  assert.match(html, /aria-label="Biggest win – Grand Chelem 2025"/);
});

test('palmarès : « Pari sur les finalistes » affiché après « Pari sur le vainqueur du tournoi », pourcentage en gros, valeur en petit', () => {
  const h = htmlMonPalmares(d);
  const i = h.indexOf('Pari sur le vainqueur du tournoi');
  const j = h.indexOf('Pari sur les finalistes');
  assert.ok(i > 0 && j > i);
  assert.match(h.slice(j, j + 600), /<b>100&nbsp;%<\/b><small>2\/2<\/small>/);
});
