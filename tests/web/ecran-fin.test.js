import test from 'node:test';
import assert from 'node:assert/strict';
import { construireRace } from '../../web/js/classement.js';
import * as moteur from '../../src/moteur/index.js';
import { classementTournoi } from '../../web/js/classement.js';
import { titreFinTournoi, ecransEnAttente, htmlEcranFin, ecransSaisonEnAttente, htmlEcranFinSaison } from '../../web/js/ecran-fin.js';

test('titreFinTournoi : article du tournoi, sans année ; rien pour Wimbledon et Roland-Garros ; « Les » pour les ATP Finals', () => {
  const t = (nom, categorie = 'masters_1000') => titreFinTournoi({ nom, categorie });
  assert.equal(t('Rolex Paris Masters'), 'Le Rolex Paris Masters est terminé\u00A0!');
  assert.equal(t('Rolex Shanghai Masters'), 'Le Rolex Shanghai Masters est terminé\u00A0!');
  assert.equal(t('Indian Wells Masters'), 'L’Indian Wells Masters est terminé\u00A0!');
  assert.equal(t('Miami Open'), 'Le Miami Open est terminé\u00A0!');
  assert.equal(t('Monte-Carlo Masters'), 'Le Monte-Carlo Masters est terminé\u00A0!');
  assert.equal(t('Madrid Open'), 'Le Madrid Open est terminé\u00A0!');
  assert.equal(t('Masters de Rome'), 'Le Masters de Rome est terminé\u00A0!');
  assert.equal(t('Masters du Canada'), 'Le Masters du Canada est terminé\u00A0!');
  assert.equal(t('Cincinnati Masters'), 'Le Cincinnati Masters est terminé\u00A0!');
  assert.equal(t('Open d\'Australie', 'grand_slam'), 'L’Open d\'Australie est terminé\u00A0!');
  assert.equal(t('US Open', 'grand_slam'), 'L’US Open est terminé\u00A0!');
  assert.equal(t('Roland-Garros', 'grand_slam'), 'Roland-Garros est terminé\u00A0!');
  assert.equal(t('Wimbledon', 'grand_slam'), 'Wimbledon est terminé\u00A0!');
  assert.equal(t('Nitto ATP Finals', 'atp_finals'), 'Les Nitto ATP Finals sont terminés\u00A0!');
  assert.equal(t('US Open 2026', 'grand_slam'), 'L’US Open est terminé\u00A0!', 'l’année est retirée');
});

const tournois = [
  { id: 1, etat: 'clos', date_fin: '2026-03-01' }, { id: 2, etat: 'clos', date_fin: '2026-02-01' },
  { id: 3, etat: 'en_cours', date_fin: '2026-04-01' }, { id: 4, etat: 'clos', date_fin: '2026-05-01' },
];
const res = (t, j) => ({ tournament_id: t, joueur_id: j });

test('ecransEnAttente : clos, joué par moi, pas encore vu ; du plus ancien au plus récent', () => {
  const resultats = [res(1, 'moi'), res(2, 'moi'), res(3, 'moi'), res(4, 'autre')];
  assert.deepEqual(ecransEnAttente({ tournois, resultats, vus: [], moi: 'moi' }).map((t) => t.id), [2, 1], 'ni le tournoi en cours, ni celui où je n’ai pas joué');
  assert.deepEqual(ecransEnAttente({ tournois, resultats, vus: [{ tournament_id: 2 }], moi: 'moi' }).map((t) => t.id), [1]);
  assert.deepEqual(ecransEnAttente({ tournois, resultats, vus: [{ tournament_id: 2 }, { tournament_id: 1 }], moi: 'moi' }), []);
});

const profils = [{ id: 'p', prenom: 'Paul' }, { id: 'a', prenom: 'André' }, { id: 'j', prenom: 'Jacques' }];
const tournoi = { id: 9, etat: 'clos', categorie: 'masters_1000', nom: 'Rolex Paris Masters', annee: 2026 };
const archive = (j, matchs, pari, bonus, rang) => ({ tournament_id: 9, joueur_id: j, points_matchs: matchs, points_pari_tournoi: pari, bonus_classement: bonus, score_final: String(Number(matchs) + Number(pari) + Number(bonus)), rang });
const classement = (archives) => classementTournoi({ moteur, tournoi, matchs: [], paris: new Map(), archives, profils });

test('htmlEcranFin : le vainqueur voit le trophée en grand et « Tu remportes le tournoi ! » ; classement, une ligne par joueur, bonification entre parenthèses', () => {
  const c = classement([archive('p', '100', '12', '12', 1), archive('a', '90', '0', '5', 2), archive('j', '-19', '0', '0', 3)]);
  const html = htmlEcranFin({ tournoi, classement: c, moi: 'p' });
  assert.match(html, /Le Rolex Paris Masters est terminé\u00A0!/);
  assert.match(html, /class="ecran-fin-trophee"/);
  assert.match(html, /width="260"/);
  assert.match(html, /Tu remportes le tournoi !/);
  assert.equal((html.match(/<li /g) ?? []).length, 3);
  assert.match(html, /Paul<\/span> <b class="">112<\/b> <span class="ecran-fin-bonus">\(\+12\)<\/span>/);
  assert.match(html, /André<\/span> <b class="">90<\/b> <span class="ecran-fin-bonus">\(\+5\)<\/span>/);
  assert.match(html, /Jacques<\/span> <b class="neg">−19<\/b>(?! <span)/, 'pas de bonification pour le 3e, score négatif signalé');
  assert.match(html, /class="isme"><span class="ecran-fin-prenom">Paul/);
  assert.match(html, /data-action="ecran-fin-continuer">Continuer</);
  // dans l'ordre : trophée, phrase, puis classement (Paul, André, Jacques)
  assert.ok(html.indexOf('ecran-fin-trophee') < html.indexOf('Tu remportes') && html.indexOf('Tu remportes') < html.indexOf('<ol'));
  assert.ok(html.indexOf('Paul</span>') < html.indexOf('André</span>') && html.indexOf('André</span>') < html.indexOf('Jacques</span>'));
});

test('htmlEcranFin : les autres joueurs n’ont pas de trophée, et la phrase nomme le vainqueur', () => {
  const c = classement([archive('p', '100', '12', '12', 1), archive('a', '90', '0', '5', 2), archive('j', '-19', '0', '0', 3)]);
  const html = htmlEcranFin({ tournoi, classement: c, moi: 'a' });
  assert.doesNotMatch(html, /ecran-fin-trophee|<svg/);
  assert.match(html, /Paul remporte le tournoi</);
  assert.doesNotMatch(html, /Tu remportes/);
  assert.ok(html.indexOf('Paul remporte le tournoi') < html.indexOf('<ol'), 'la phrase vient avant le classement');
});

test('htmlEcranFin : ex aequo en tête → « X et Y remportent le tournoi » ; chacun des deux voit « Tu remportes le tournoi ! »', () => {
  const c = classement([archive('p', '50', '0', '10', 1), archive('a', '50', '0', '10', 1), archive('j', '10', '0', '0', 3)]);
  assert.match(htmlEcranFin({ tournoi, classement: c, moi: 'j' }), /André et Paul remportent le tournoi</);
  const html = htmlEcranFin({ tournoi, classement: c, moi: 'a' });
  assert.match(html, /Tu remportes le tournoi !/);
  assert.match(html, /<svg/);
});

test('htmlEcranFin : ATP Finals → trophée des ATP Finals et titre au pluriel ; le texte des noms est échappé', () => {
  const finals = { id: 12, etat: 'clos', categorie: 'atp_finals', nom: 'Nitto ATP Finals', annee: 2026 };
  const c = classementTournoi({ moteur, tournoi: finals, matchs: [], paris: new Map(), archives: [{ tournament_id: 12, joueur_id: 'x', points_matchs: '5', points_pari_tournoi: '0', bonus_classement: '0', score_final: '5', rang: 1 }], profils: [{ id: 'x', prenom: '<b>Zoé</b>' }] });
  const html = htmlEcranFin({ tournoi: finals, classement: c, moi: 'x' });
  assert.match(html, /Les Nitto ATP Finals sont terminés\u00A0!/);
  assert.match(html, /Trophée : Nitto ATP Finals 2026/);
  assert.doesNotMatch(html, /<b>Zoé<\/b>/);
});

test('ecransSaisonEnAttente : tous les tournois de l’année clos, un résultat à mon nom, pas déjà vue', () => {
  const ts = [{ id: 1, annee: 2025, etat: 'clos' }, { id: 2, annee: 2026, etat: 'clos' }, { id: 3, annee: 2026, etat: 'en_cours' }, { id: 4, annee: 2027, etat: 'clos' }];
  const r = [res(1, 'a'), res(2, 'a'), res(4, 'b')];
  assert.deepEqual(ecransSaisonEnAttente({ tournois: ts, resultats: r, vus: [], moi: 'a' }), [2025], '2026 attend ses ATP Finals');
  assert.deepEqual(ecransSaisonEnAttente({ tournois: ts, resultats: r, vus: [{ annee: 2025 }], moi: 'a' }), []);
  ts[2].etat = 'clos';
  assert.deepEqual(ecransSaisonEnAttente({ tournois: ts, resultats: r, vus: [{ annee: 2025 }], moi: 'a' }), [2026]);
  assert.deepEqual(ecransSaisonEnAttente({ tournois: ts, resultats: r, vus: [], moi: 'b' }), [2027], 'rien sans résultat à mon nom');
});

const race = { lignes: [
  { id: 'a', prenom: 'Léa', rang: 1, points: '120' }, { id: 'b', prenom: 'Marc', rang: 2, points: '95' },
  { id: 'c', prenom: 'Zoé', rang: 3, points: '−4' } ] };

test('htmlEcranFinSaison : champion = trophée en grand + « Tu es champion de la saison ! »', () => {
  const h = htmlEcranFinSaison({ annee: 2026, race, moi: 'a' });
  assert.match(h, /La saison 2026 est terminée\u00A0!/);
  assert.match(h, /ecran-fin-trophee/);
  assert.match(h, /Tu es champion de la saison !/);
  assert.ok(h.indexOf('ecran-fin-phrase') < h.indexOf('ecran-fin-classement'), 'phrase avant les scores');
  assert.equal((h.match(/<li /g) || []).length, 3);
  assert.match(h, /class="neg">−4/);
});

test('htmlEcranFinSaison : vice-champion, puis les autres sans trophée', () => {
  const v = htmlEcranFinSaison({ annee: 2026, race, moi: 'b' });
  assert.match(v, /ecran-fin-trophee/); assert.match(v, /Tu es vice-champion de la saison !/);
  const c = htmlEcranFinSaison({ annee: 2026, race, moi: 'c' });
  assert.doesNotMatch(c, /ecran-fin-trophee/); assert.match(c, /Léa est champion de la saison/);
});

test('htmlEcranFinSaison : ex aequo en tête → « X et Y sont champions de la saison »', () => {
  const ex = { lignes: [{ id: 'a', prenom: 'Léa', rang: 1, points: '90' }, { id: 'b', prenom: 'Marc', rang: 1, points: '90' }, { id: 'c', prenom: 'Zoé', rang: 3, points: '10' }] };
  assert.match(htmlEcranFinSaison({ annee: 2026, race: ex, moi: 'c' }), /Léa et Marc sont champions de la saison/);
  assert.match(htmlEcranFinSaison({ annee: 2026, race: ex, moi: 'a' }), /Tu es champion de la saison !/);
});

test('htmlEcranFinSaison : « Tes trophées de saison » après les scores, avec les autres récompenses du joueur ; « Aucun » sinon', () => {
  const h = htmlEcranFinSaison({ annee: 2026, race, moi: 'a', recompenses: [{ cle: 'sniper', titre: 'Le sniper', court: 'Sniper', nombre: 1 }, { cle: 'full_strike', titre: 'Le full strike', court: 'Full strike', nombre: 2 }] });
  assert.ok(h.indexOf('ecran-fin-classement') < h.indexOf('Tes trophées de saison'));
  assert.ok(h.indexOf('Tes trophées de saison') < h.indexOf('ecran-fin-continuer'));
  assert.match(h, /Sniper/); assert.match(h, /Full strike ×2/);
  assert.match(htmlEcranFinSaison({ annee: 2026, race, moi: 'a' }), /Tes trophées de saison[\s\S]*Aucun cette saison/);
});

test('enchaînement à la clôture des ATP Finals : écran du tournoi, puis bilan de la saison (même ouverture)', () => {
  const ts = [
    { id: 1, annee: 2026, etat: 'clos', categorie: 'masters_1000', nom: 'Paris', date_fin: '2026-11-01' },
    { id: 2, annee: 2026, etat: 'clos', categorie: 'atp_finals', nom: 'Nitto ATP Finals', date_fin: '2026-11-16' },
  ];
  const arch = (tid, j, f, r) => ({ tournament_id: tid, joueur_id: j, points_matchs: f, points_pari_tournoi: '0', bonus_classement: '0', score_final: f, rang: r });
  const resultats = [arch(1, 'a', '50', 1), arch(1, 'b', '40', 2), arch(2, 'a', '30', 2), arch(2, 'b', '35', 1)];
  const vus = [{ tournament_id: 1 }]; // Paris déjà vu, ATPF jamais vu
  const profils = [{ id: 'a', prenom: 'Léa' }, { id: 'b', prenom: 'Marc' }];
  assert.deepEqual(ecransEnAttente({ tournois: ts, resultats, vus, moi: 'a' }).map((t) => t.id), [2]);
  assert.deepEqual(ecransSaisonEnAttente({ tournois: ts, resultats, vus: [], moi: 'a' }), [2026]);
  const r = construireRace({ moteur, annee: 2026, tournois: ts, resultats, profils });
  assert.equal(r.terminee, true);
  assert.match(htmlEcranFinSaison({ annee: 2026, race: r, moi: 'a' }), /Tu es champion de la saison/);
  ts[1].etat = 'en_cours';
  assert.deepEqual(ecransSaisonEnAttente({ tournois: ts, resultats, vus: [], moi: 'a' }), [], 'tant que les ATP Finals ne sont pas clos : pas de bilan');
});
