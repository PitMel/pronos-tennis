import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARAMETRES, heureLocale, dansLaFenetre, matchsASurveiller, directDu, afficheDue, afficheAttendue, decider, selectionnerDetails, idsAInterroger, tropTotPourLesAffiches } from '../../src/sync/planificateur.js';

const d = (s) => new Date(s);
// Heures d'été à Paris = UTC+2 (jusqu'au 25 oct. 2026 à 3 h), heures d'hiver = UTC+1 (ensuite).
const tournoi = (o = {}) => ({ id: 1, nom: 'Paris', categorie: 'masters_1000', etat: 'en_cours', date_debut: '2026-10-26', date_fin: '2026-11-01', api_ids: ['1725', '1726'], derniere_decouverte: null, finale_terminee: false, ...o });
const match = (o = {}) => ({ id: 1, api_id: 'A', tournament_id: 1, tour: 'QF', statut: 'a_venir', heure_prevue: '2026-10-28T09:00:00Z', debut_detecte: null, modifie_manuellement: false, ...o });
const etat = (o = {}) => ({ maintenant: null, appels_aujourdhui: 0, quota_epuise_jusqua: null, tournois: [tournoi()], matchs: [], ...o });

test('heureLocale et fenêtre 7 h – 1 h (heure de Paris), y compris au changement d\'heure', () => {
  assert.deepEqual(heureLocale(d('2026-10-24T12:00:00Z')), { heure: 14, minute: 0, jour: '2026-10-24' }); // été
  assert.deepEqual(heureLocale(d('2026-10-26T12:00:00Z')), { heure: 13, minute: 0, jour: '2026-10-26' }); // hiver
  assert.deepEqual(heureLocale(d('2026-10-24T22:30:00Z')), { heure: 0, minute: 30, jour: '2026-10-25' }); // passage au jour suivant
  // Été : 7 h Paris = 5 h UTC ; 1 h Paris = 23 h UTC
  assert.equal(dansLaFenetre(d('2026-10-24T04:59:00Z')), false);
  assert.equal(dansLaFenetre(d('2026-10-24T05:00:00Z')), true);
  assert.equal(dansLaFenetre(d('2026-10-24T22:59:00Z')), true);
  assert.equal(dansLaFenetre(d('2026-10-24T23:00:00Z')), false);
  // Hiver : 7 h Paris = 6 h UTC ; 1 h Paris = 0 h UTC
  assert.equal(dansLaFenetre(d('2026-10-26T05:59:00Z')), false);
  assert.equal(dansLaFenetre(d('2026-10-26T06:00:00Z')), true);
  assert.equal(dansLaFenetre(d('2026-10-26T23:59:00Z')), true);
  assert.equal(dansLaFenetre(d('2026-10-27T00:00:00Z')), false);
});

test('matchsASurveiller : résultat regardé 1 h 30 après l\'heure prévue (2 h en Grand Chelem) ; pas avant, ni les matchs verrouillés', () => {
  const now = d('2026-10-28T12:50:00Z');
  const gc = tournoi({ id: 2, categorie: 'grand_slam' });
  const e = etat({ tournois: [tournoi(), gc], matchs: [
    match({ api_id: 'encours', statut: 'en_cours', heure_prevue: '2026-10-28T10:00:00Z' }),
    match({ api_id: 'bientot', heure_prevue: '2026-10-28T13:10:00Z' }),
    match({ api_id: 'commence', heure_prevue: '2026-10-28T12:00:00Z' }), // 50 min : trop tôt
    match({ api_id: 'pile', heure_prevue: '2026-10-28T11:20:00Z' }), // 1 h 30
    match({ api_id: 'retard', heure_prevue: '2026-10-28T09:00:00Z' }),
    match({ api_id: 'tropretard', heure_prevue: '2026-10-28T03:00:00Z' }),
    match({ api_id: 'gc_1h45', tournament_id: 2, heure_prevue: '2026-10-28T11:05:00Z' }), // GC : pas avant 2 h
    match({ api_id: 'gc_2h', tournament_id: 2, heure_prevue: '2026-10-28T10:50:00Z' }),
    match({ api_id: 'sansheure', heure_prevue: null }),
    match({ api_id: 'manuel', statut: 'en_cours', modifie_manuellement: true }),
  ] });
  assert.deepEqual(matchsASurveiller(e, now).map((m) => m.api_id), ['encours', 'pile', 'retard', 'gc_2h', 'sansheure']);
});

test('directDu : une lecture du direct toutes les 20 minutes au plus (tolérance 5 min)', () => {
  const now = d('2026-10-28T12:00:00Z');
  assert.equal(directDu(etat(), now), true, 'jamais lu');
  assert.equal(directDu(etat({ derniere_lecture_direct: '2026-10-28T11:50:00Z' }), now), false, '10 min');
  assert.equal(directDu(etat({ derniere_lecture_direct: '2026-10-28T11:45:00Z' }), now), true, '15 min : tolérance du déclencheur');
  assert.equal(directDu(etat({ derniere_lecture_direct: '2026-10-28T11:30:00Z' }), now), true);
});

test('afficheDue : jamais lue = due ; intervalle de 30 min en tournoi (tolérance 5 min), 20 h hors tournoi ; finale terminée = jamais', () => {
  const now = d('2026-10-28T12:00:00Z');
  assert.equal(afficheDue(tournoi(), etat(), now).due, true);
  assert.equal(afficheDue(tournoi({ derniere_decouverte: '2026-10-28T11:40:00Z' }), etat(), now).due, false); // 20 min
  assert.equal(afficheDue(tournoi({ derniere_decouverte: '2026-10-28T11:36:00Z' }), etat(), now).due, false); // 24 min : encore trop tôt
  assert.equal(afficheDue(tournoi({ derniere_decouverte: '2026-10-28T11:35:00Z' }), etat(), now).due, true); // 25 min : dans la tolérance du déclencheur
  assert.equal(afficheDue(tournoi({ derniere_decouverte: '2026-10-28T11:29:00Z' }), etat(), now).due, true); // 31 min
  assert.equal(afficheDue(tournoi({ derniere_decouverte: '2026-10-28T09:30:00Z' }), etat(), now).due, true); // 2 h 30
  const hors = tournoi({ etat: 'a_venir', date_debut: '2026-10-31', date_fin: '2026-11-07' }); // commence dans 3 jours : une relecture par jour
  assert.equal(afficheDue({ ...hors, derniere_decouverte: '2026-10-28T00:00:00Z' }, etat(), now).due, false);
  assert.equal(afficheDue({ ...hors, derniere_decouverte: '2026-10-27T10:00:00Z' }, etat(), now).due, true); // 26 h
  const lointain = tournoi({ etat: 'a_venir', date_debut: '2027-03-01', date_fin: '2027-03-08' });
  assert.equal(afficheDue(lointain, etat(), now).due, false, 'plus de 3 jours avant le début : jamais lu, même sans lecture précédente');
  assert.equal(afficheDue(tournoi({ finale_terminee: true }), etat(), now).due, false);
  // la veille et le lendemain du tournoi comptent comme « actif »
  const veille = tournoi({ etat: 'a_venir', date_debut: '2026-10-29', date_fin: '2026-11-01', derniere_decouverte: '2026-10-28T08:00:00Z' });
  assert.equal(afficheDue(veille, etat(), now).due, true);
});

test('decider : hors fenêtre, quota épuisé annoncé, budget épuisé, aucun tournoi', () => {
  const nuit = d('2026-10-28T03:00:00Z');
  assert.deepEqual([decider({ maintenant: nuit, etat: etat() }).regime, decider({ maintenant: nuit, etat: etat() }).actions.length], ['hors_fenetre', 0]);
  const jour = d('2026-10-28T12:00:00Z');
  const ep = decider({ maintenant: jour, etat: etat({ quota_epuise_jusqua: '2026-10-29T00:00:00Z' }) });
  assert.equal(ep.regime, 'quota_epuise');
  assert.equal(decider({ maintenant: jour, etat: etat({ quota_epuise_jusqua: '2026-10-28T11:00:00Z' }) }).regime, 'actif', 'remise à zéro passée');
  assert.equal(decider({ maintenant: jour, etat: etat({ appels_aujourdhui: 90 }) }).regime, 'budget_epuise');
  assert.equal(decider({ maintenant: jour, etat: etat({ appels_aujourdhui: 89 }) }).restant, 1);
  assert.equal(decider({ maintenant: jour, etat: etat(), usage: { utilise_jour: 95, restant_jour: 5 } }).regime, 'budget_epuise', 'le compteur de l\'API prime s\'il est plus élevé');
  assert.equal(decider({ maintenant: jour, etat: etat(), usage: { utilise_jour: null, restant_jour: 12 } }).restant, 2, 'restant API moins réserve');
  const aucun = decider({ maintenant: jour, etat: etat({ tournois: [] }) });
  assert.deepEqual([aucun.regime, aucun.actions.length], ['repos', 0]);
});

test('decider : régime actif = direct si match à surveiller + affiches dues (une action par identifiant d\'API)', () => {
  const jour = d('2026-10-28T12:50:00Z');
  const p = decider({ maintenant: jour, etat: etat({ matchs: [match({ statut: 'en_cours' })] }) });
  assert.equal(p.regime, 'actif');
  assert.deepEqual(p.actions.map((a) => a.type === 'direct' ? 'direct' : `affiches:${a.api_id}`), ['direct', 'affiches:1725', 'affiches:1726']);
  assert.equal(p.restant, 90);
  // affiches déjà lues récemment : le direct seul
  const e2 = etat({ matchs: [match({ statut: 'en_cours' })], tournois: [tournoi({ derniere_decouverte: '2026-10-28T12:40:00Z' })] });
  assert.deepEqual(decider({ maintenant: jour, etat: e2 }).actions.map((a) => a.type), ['direct']);
  // direct lu il y a 10 minutes : pas de nouvelle lecture
  const e2b = etat({ matchs: [match({ statut: 'en_cours' })], derniere_lecture_direct: '2026-10-28T12:40:00Z', tournois: [tournoi({ derniere_decouverte: '2026-10-28T12:40:00Z' })] });
  assert.deepEqual(decider({ maintenant: jour, etat: e2b }).actions, []);
  // rien à surveiller et affiches récentes : rien
  const e3 = etat({ matchs: [match({ heure_prevue: '2026-10-28T12:00:00Z' })], tournois: [tournoi({ derniere_decouverte: '2026-10-28T12:40:00Z' })] });
  const p3 = decider({ maintenant: jour, etat: e3 });
  assert.deepEqual([p3.actions.length, p3.raison], [0, 'rien à faire pour le moment']);
});

test('decider : régime quotidien hors tournoi, et le tournoi en cours passe en premier', () => {
  const jour = d('2026-10-28T12:00:00Z');
  const loin = tournoi({ id: 2, nom: 'Turin', etat: 'a_venir', date_debut: '2026-10-31', date_fin: '2026-11-07', api_ids: ['2794'] }); // commence dans 3 jours : on le regarde, une fois par jour
  const p = decider({ maintenant: jour, etat: etat({ tournois: [loin] }) });
  assert.deepEqual([p.regime, p.actions.length], ['quotidien', 1]);
  const mix = decider({ maintenant: jour, etat: etat({ tournois: [loin, tournoi()] }) });
  assert.deepEqual(mix.actions.map((a) => a.api_id), ['1725', '1726', '2794']);
});

test('decider : le budget limite le nombre d\'actions', () => {
  const jour = d('2026-10-28T12:00:00Z');
  const p = decider({ maintenant: jour, etat: etat({ appels_aujourdhui: 88, matchs: [match({ statut: 'en_cours' })] }) });
  assert.equal(p.restant, 2);
  assert.equal(p.actions.length, 2);
  assert.match(p.raison, /limités par le budget/);
});

test('selectionnerDetails : seulement les matchs censés être en cours mais absents du direct, dans la limite du budget', () => {
  const cren = 1200000; // créneaux de 20 min : un match « à venir » en retard n'est vérifié qu'une fois par heure (1 créneau sur 3)
  const now = new Date(Math.floor(Date.parse('2026-10-28T13:00:00Z') / (3 * cren)) * 3 * cren + 3 * cren);
  assert.equal(Math.floor(now.getTime() / cren) % 3, 0);
  const il_y_a = (min) => new Date(now.getTime() - min * 60000).toISOString();
  const e = etat({ matchs: [
    match({ api_id: 'vu', statut: 'en_cours' }),
    match({ api_id: 'disparu', statut: 'en_cours' }),
    match({ api_id: 'enretard', heure_prevue: il_y_a(100) }),
    match({ api_id: 'tropot', heure_prevue: il_y_a(60) }), // pas encore 1 h 30
    match({ api_id: 'futur', heure_prevue: new Date(now.getTime() + 60 * 60000).toISOString() }),
    match({ api_id: 'manuel', statut: 'en_cours', modifie_manuellement: true }),
    match({ api_id: 'sansheure', heure_prevue: null }),
  ] });
  const r = (o = {}) => selectionnerDetails({ etat: e, maintenant: now, vusEnDirect: new Set(['vu']), restant: 10, ...o }).map((m) => m.api_id);
  assert.deepEqual(r().sort(), ['disparu', 'enretard']);
  assert.deepEqual(r({ restant: 1 }).length, 1);
  assert.deepEqual(r({ restant: 0 }), []);
  assert.deepEqual(r({ vusEnDirect: null }), [], 'sans lecture du direct, aucune conclusion');
  const suivant = new Date(now.getTime() + cren);
  assert.deepEqual(r({ maintenant: suivant }), ['disparu']);
});

test('paramètres par défaut conformes au cahier des charges', () => {
  assert.equal(PARAMETRES.quotaJour, 100);
  assert.equal(PARAMETRES.reserve, 10);
  assert.equal(PARAMETRES.heureDebut, 7);
  assert.equal(PARAMETRES.heureFin, 1);
  assert.equal(PARAMETRES.intervalleAffichesActifMin, 30, 'affiches : une relecture toutes les 30 min pendant un tournoi (demande de Pierre, 8 nov. 2026)');
  assert.equal(PARAMETRES.intervalleDirectMin, 20, 'direct : toutes les 20 min');
  assert.deepEqual([PARAMETRES.debutResultatMin, PARAMETRES.debutResultatGCMin], [90, 120]);
});

test('decider : sur une journée entière (cron toutes les 30 min, heure d\'hiver), les affiches sont relues toutes les 30 min de 7 h à 1 h, jamais la nuit (tournoi sans information de tours : relecture systématique)', () => {
  // Journée du 6 nov. 2026 à Paris (UTC+1) : du 5 nov. 22 h UTC (= 23 h Paris) au 6 nov. 23 h UTC. Un seul tournoi, 2 identifiants d'API, aucun match à surveiller.
  let derniere = null;
  const lectures = []; // heures de Paris (HH:MM) des relectures d'affiches
  for (let t = Date.parse('2026-11-05T23:00:00Z'); t < Date.parse('2026-11-06T23:00:00Z'); t += 30 * 60000) {
    const maintenant = new Date(t);
    const plan = decider({ maintenant, etat: etat({ tournois: [tournoi({ date_debut: '2026-11-02', date_fin: '2026-11-08', derniere_decouverte: derniere })] }) });
    const affiches = plan.actions.filter((a) => a.type === 'affiches');
    if (affiches.length > 0) {
      assert.equal(affiches.length, 2, 'un appel par identifiant d\'API (1725 et 1726)');
      derniere = maintenant.toISOString();
      const h = heureLocale(maintenant);
      lectures.push(`${String(h.heure).padStart(2, '0')}:${String(h.minute).padStart(2, '0')}`);
    }
  }
  assert.ok(lectures.every((l) => { const h = Number(l.slice(0, 2)); return h >= 7 || h < 1; }), `aucune relecture entre 1 h et 7 h : ${lectures.join(' ')}`);
  const attendues = ['00:00', '00:30'];
  for (let m = 7 * 60; m < 24 * 60; m += 30) attendues.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  assert.deepEqual(lectures, attendues);
  assert.equal(lectures.length * 2, 72, '36 relectures par jour (30 min), 2 appels chacune ici (2 identifiants non confirmés)');
});

test('affiches : un tournoi pas commencé n\'est regardé qu\'à partir de 3 jours avant son début (calendrier), pas avant', () => {
  const finals = tournoi({ id: 12, nom: 'ATP Finals', categorie: 'atp_finals', etat: 'a_venir', date_debut: '2026-11-15', date_fin: '2026-11-22', api_ids: ['2794', '2795'] });
  // 15 nov. − 3 jours = 12 nov. (jour de Paris)
  const veille = d('2026-11-11T22:30:00Z'); // 11 nov., 23 h 30 à Paris : fenêtre horaire fermée de toute façon, on teste le jour avec une heure ouverte juste après
  assert.equal(heureLocale(d('2026-11-11T12:00:00Z')).jour, '2026-11-11');
  assert.deepEqual(afficheDue(finals, etat(), d('2026-11-11T12:00:00Z')), { due: false, tropTot: true }, 'J-4 : trop tôt');
  assert.equal(afficheDue(finals, etat(), veille).due, false, 'encore le 11 nov. à Paris : trop tôt');
  assert.equal(afficheDue(finals, etat(), d('2026-11-12T06:30:00Z')).due, true, 'J-3, 7 h 30 à Paris : on commence');
  assert.equal(decider({ maintenant: d('2026-11-11T12:00:00Z'), etat: etat({ tournois: [finals] }) }).actions.length, 0, 'aucun appel avant J-3');
  assert.deepEqual(decider({ maintenant: d('2026-11-12T06:30:00Z'), etat: etat({ tournois: [finals] }) }).actions.map((a) => a.api_id), ['2794', '2795']);
  // pari tournoi déjà ouvert mais tournoi loin : pas de relecture non plus
  assert.equal(tropTotPourLesAffiches({ ...finals, etat: 'pari_tournoi_ouvert' }, '2026-11-10'), true);
  // un tournoi en cours, lui, n'est jamais « trop tôt » ; sans date de début, la règle ne s'applique pas
  assert.equal(tropTotPourLesAffiches(tournoi({ etat: 'en_cours', date_debut: '2026-12-25' }), '2026-11-10'), false);
  assert.equal(tropTotPourLesAffiches({ ...finals, date_debut: null }, '2026-11-10'), false);
  assert.equal(PARAMETRES.joursAvantDebutAffiches, 3);
});

test('identifiants d\'API : dès qu\'un identifiant a fourni des matchs, les autres ne sont plus interrogés ; sinon tous', () => {
  assert.deepEqual(idsAInterroger(tournoi()), ['1725', '1726'], 'rien de confirmé : on les interroge tous');
  assert.deepEqual(idsAInterroger(tournoi({ api_ids_confirmes: ['1725'] })), ['1725'], 'Paris : seul 1725 a donné des matchs');
  assert.deepEqual(idsAInterroger(tournoi({ api_ids_confirmes: ['1725', '1726'] })), ['1725', '1726'], 'les deux ont donné des matchs : on garde les deux');
  assert.deepEqual(idsAInterroger(tournoi({ api_ids_confirmes: ['9999'] })), ['1725', '1726'], 'un identifiant confirmé inconnu de la table ne restreint rien');
  assert.deepEqual(idsAInterroger(tournoi({ api_ids_confirmes: null })), ['1725', '1726']);
  const p = decider({ maintenant: d('2026-10-28T12:50:00Z'), etat: etat({ tournois: [tournoi({ api_ids_confirmes: ['1725'] })] }) });
  assert.deepEqual(p.actions.map((a) => a.api_id), ['1725'], 'une seule relecture d\'affiches au lieu de deux');
});

test('afficheAttendue : règle de Pierre (tour incomplet, moitié du tour terminée, aucune affiche) — sinon pas de lecture', () => {
  const tr = (tour, total, termines) => ({ tour, total, termines });
  const mm = (tours) => tournoi({ tours });
  assert.equal(afficheAttendue(tournoi()).attendue, true, 'sans information : on relit (ancien comportement)');
  assert.equal(afficheAttendue(mm([])).attendue, true, 'aucune affiche connue');
  assert.equal(afficheAttendue(mm([tr('QF', 3, 0)])).attendue, true, 'quarts incomplets (3 sur 4)');
  assert.equal(afficheAttendue(mm([tr('R16', 8, 8), tr('QF', 4, 1)])).attendue, false, 'quarts complets, 1 sur 4 terminé');
  assert.equal(afficheAttendue(mm([tr('QF', 4, 2)])).attendue, true, 'moitié des quarts terminée, demi-finales pas affichées');
  assert.equal(afficheAttendue(mm([tr('QF', 4, 2), tr('SF', 2, 0)])).attendue, false, 'demi-finales déjà affichées et complètes');
  assert.equal(afficheAttendue(mm([tr('QF', 4, 2), tr('SF', 1, 0)])).attendue, true, 'une seule demi-finale affichée');
  assert.equal(afficheAttendue(mm([tr('SF', 2, 2), tr('F', 1, 0)])).attendue, false, 'finale connue : plus rien à chercher');
  assert.equal(afficheAttendue(mm([tr('SF', 2, 1)])).attendue, true, 'une demi-finale terminée, finale pas affichée');
  const atpf = tournoi({ categorie: 'atp_finals', tours: [tr('RR1', 4, 2)] });
  assert.equal(afficheAttendue(atpf).attendue, true, 'poule : moitié de RR1 terminée, RR2 pas affiché');
  assert.equal(afficheAttendue(tournoi({ categorie: 'atp_finals', tours: [tr('RR1', 4, 0), tr('RR2', 4, 0), tr('RR3', 4, 0)] })).attendue, false);
  // dans afficheDue : même 2 h après la dernière lecture, rien de neuf = pas de lecture ; lecture due si la règle l'autorise
  const now = d('2026-11-07T12:00:00Z');
  const vieille = '2026-11-07T09:00:00Z';
  assert.equal(afficheDue(tournoi({ tours: [tr('SF', 2, 0), tr('F', 1, 0)], derniere_decouverte: vieille }), etat(), now).due, false);
  assert.equal(afficheDue(tournoi({ tours: [tr('SF', 2, 1)], derniere_decouverte: vieille }), etat(), now).due, true);
  assert.equal(afficheDue(tournoi({ tours: [tr('SF', 2, 1)], derniere_decouverte: '2026-11-07T11:45:00Z' }), etat(), now).due, false, 'au plus une fois toutes les 30 min');
});
