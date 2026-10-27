// Page d'accueil et pastille « à parier » (3.7).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as moteur from '../../src/moteur/index.js';
import { dateDuJour } from '../../web/js/outils.js';
import { matchsAParier } from '../../web/js/cartes.js';
import { tournoisPourAccueil, statutPariTournoi, htmlAccueil } from '../../web/js/accueil.js';
import { htmlPageTournoi } from '../../web/js/vues.js';

const t = (id, etat, debut, extra = {}) => ({ id, annee: 2026, nom: `T${id}`, ville: 'Paris', surface: 'dur', indoor: true, categorie: 'masters_1000', date_debut: debut, date_fin: null, etat, ...extra });
const m = (id, extra = {}) => ({ id, tour: 'QF', p1_id: 1, p2_id: 2, statut: 'a_venir', neutralise: false, verrouille: false, resultat_visible: false, vainqueur: null, ...extra });

test('dateDuJour : date de Paris (pas celle d’UTC)', () => {
  assert.equal(dateDuJour(new Date('2026-11-02T23:30:00Z')), '2026-11-03');
  assert.equal(dateDuJour(new Date('2026-07-01T10:00:00Z')), '2026-07-01');
});

test('tournoisPourAccueil : les tournois en cours, sinon le prochain daté', () => {
  const ts = [t(1, 'clos', '2026-03-01'), t(2, 'en_cours', '2026-11-02'), t(3, 'pari_tournoi_ouvert', '2026-10-30'), t(4, 'a_venir', '2026-12-01')];
  const r = tournoisPourAccueil(ts, '2026-11-03');
  assert.deepEqual(r.encours.map((x) => x.id), [3, 2]);
  assert.equal(r.prochain, null);
  const sans = tournoisPourAccueil([t(1, 'clos', '2026-03-01'), t(5, 'a_venir', null), t(6, 'a_venir', '2027-01-18'), t(4, 'a_venir', '2026-12-01'), t(7, 'a_venir', '2026-01-01')], '2026-11-03');
  assert.deepEqual(sans.encours, []);
  assert.equal(sans.prochain.id, 4); // le plus proche à venir ; ni sans date, ni déjà passé
  assert.equal(tournoisPourAccueil([], '2026-11-03').prochain, null);
});

test('matchsAParier : ouverts, sans pari de moi, où je ne suis pas exclu', () => {
  const matchs = [m(1), m(2), m(3, { verrouille: true }), m(4, { neutralise: true }), m(5, { statut: 'en_cours' }), m(6), m(7, { statut: 'termine' })];
  const paris = new Map([[2, new Map([['moi', { choix: 1 }]])]]);
  const qui = new Map([[6, new Map([['autre', true]])]]); // je ne suis pas dans « qui » pour le match 6 : exclu
  assert.deepEqual([...matchsAParier(matchs, { moi: 'moi', paris, qui })], [1]);
  assert.deepEqual([...matchsAParier(matchs, { moi: 'moi', paris })].sort(), [1, 6]);
  assert.equal(matchsAParier(matchs, { moi: undefined, paris }).size, 0);
});

test('statutPariTournoi', () => {
  const ouvert = t(1, 'en_cours', null);
  const moi = 'p';
  assert.equal(statutPariTournoi(ouvert, { monPari: { vainqueur_id: 1 }, qui: new Map(), moi }), 'fait');
  assert.equal(statutPariTournoi(ouvert, { monPari: null, qui: new Map([['p', false], ['l', true]]), moi }), 'afaire');
  assert.equal(statutPariTournoi(ouvert, { monPari: null, qui: new Map([['p', true], ['l', true]]), moi }), null); // tous ont parié (figé)
  assert.equal(statutPariTournoi(ouvert, { monPari: null, qui: new Map([['l', false]]), moi }), null); // exclu
  assert.equal(statutPariTournoi(t(1, 'a_venir', null), { monPari: null, qui: new Map([['p', false]]), moi }), null);
  assert.equal(statutPariTournoi(t(1, 'clos', null), { monPari: null, qui: new Map([['p', false]]), moi }), null);
});

test('htmlAccueil : à poser, à jour, prochain tournoi, rien', () => {
  const profil = { prenom: 'Pierre <b>' };
  const bloc = (extra) => ({ tournoi: t(2, 'en_cours', '2026-11-02', { nom: 'Rolex Paris Masters' }), nbAParier: 0, pariTournoi: null, ...extra });
  const h = htmlAccueil({ profil, blocs: [bloc({ nbAParier: 3, pariTournoi: 'afaire' })] });
  assert.match(h, /Bonjour Pierre &lt;b&gt;/);
  assert.match(h, /<b>3<\/b> paris de match à poser/);
  assert.match(h, /href="#\/tournoi\/2\/pari">Pari tournoi à poser/);
  assert.doesNotMatch(h, /Tu es à jour/);
  assert.match(htmlAccueil({ profil, blocs: [bloc({ nbAParier: 1 })] }), /<b>1<\/b> pari de match à poser/);
  assert.match(htmlAccueil({ profil, blocs: [bloc({ pariTournoi: 'fait' })] }), /Pari tournoi posé[\s\S]*Tu es à jour/);
  assert.match(htmlAccueil({ profil, blocs: [bloc()] }), /Tu es à jour/);
  assert.match(htmlAccueil({ profil, prochain: t(4, 'a_venir', '2026-12-01', { nom: 'Turin' }) }), /Prochain tournoi[\s\S]*Turin[\s\S]*Les paris ouvrent quand le tableau est connu/);
  assert.match(htmlAccueil({ profil }), /Aucun tournoi en cours/);
  assert.match(htmlAccueil({ profil }), /href="#\/saison"/);
});

test('page tournoi : pastille « à parier » sur les tours où il reste des paris', () => {
  const tournoi = t(1, 'en_cours', null);
  const matchs = [m(1, { tour: 'R16', statut: 'termine' }), m(2, { tour: 'QF' }), m(3, { tour: 'QF' }), m(4, { tour: 'QF' })];
  const ctx = { moi: 'p', moteur, profils: [{ id: 'p', prenom: 'Pierre' }], paris: new Map([[3, new Map([['p', { choix: 1, confiance: 7 }]])]]), qui: new Map() };
  const html = htmlPageTournoi({ tournoi, matchs, joueurs: new Map(), ctx });
  assert.match(html, /Quarts de finale<span class="reste"[^>]*>2 à parier<\/span>/);
  assert.doesNotMatch(html, /Huitièmes de finale<span class="reste"/);
  const sansMoi = htmlPageTournoi({ tournoi, matchs, joueurs: new Map(), ctx: { ...ctx, moi: undefined } });
  assert.doesNotMatch(sansMoi, /class="reste"/);
});
