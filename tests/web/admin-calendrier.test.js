// Calendrier admin (4.2) : validation, conversion vers la base, messages d'erreur, HTML, écriture via faux Supabase.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validerTournoi, tournoiPourBase, messageErreurAdmin, htmlCalendrierAdmin, htmlFormulaireTournoi } from '../../web/js/admin-calendrier.js';
import { creerDonnees } from '../../web/js/donnees.js';

const valide = { nom: 'Masters de Paris', annee: '2026', categorie: 'masters_1000', surface: 'dur', date_debut: '2026-11-02', date_fin: '2026-11-08' };

test('validerTournoi : un formulaire correct ne produit aucune erreur', () => {
  assert.deepEqual(validerTournoi(valide), []);
  assert.deepEqual(validerTournoi({ ...valide, surface: '', date_debut: '', date_fin: '' }), []);
});

test('validerTournoi : nom, année, catégorie, surface, dates', () => {
  assert.equal(validerTournoi({ ...valide, nom: '   ' }).length, 1);
  assert.match(validerTournoi({ ...valide, nom: 'x'.repeat(81) })[0], /trop long/);
  assert.match(validerTournoi({ ...valide, annee: '1999' })[0], /année/i);
  assert.match(validerTournoi({ ...valide, annee: 'abc' })[0], /année/i);
  assert.match(validerTournoi({ ...valide, categorie: 'itf' })[0], /catégorie/i);
  assert.match(validerTournoi({ ...valide, surface: 'moquette' })[0], /Surface/);
  assert.match(validerTournoi({ ...valide, date_debut: '02/11/2026' })[0], /début/);
  assert.match(validerTournoi({ ...valide, date_fin: '2026-13-45' })[0], /fin/);
  assert.match(validerTournoi({ ...valide, date_debut: '2026-11-09' })[0], /précéder/);
});

test('validerTournoi : plusieurs erreurs à la fois', () => {
  assert.equal(validerTournoi({ nom: '', annee: '', categorie: '' }).length, 3);
});

test('tournoiPourBase : chaînes vides = absent, nombre, booléen', () => {
  assert.deepEqual(tournoiPourBase({ ...valide, nom: '  Paris  ', ville: ' ', surface: '', indoor: 'on', date_debut: '', date_fin: '2026-11-08' }), {
    annee: 2026, nom: 'Paris', ville: null, surface: null, indoor: true, categorie: 'masters_1000', date_debut: null, date_fin: '2026-11-08',
  });
  assert.equal(tournoiPourBase({ ...valide }).indoor, false);
});

test('messageErreurAdmin : doublons, refus, réseau, défaut', () => {
  assert.match(messageErreurAdmin({ code: '23505', message: 'duplicate key value violates unique constraint "tournament_api_ids_pkey"' }), /identifiant/);
  assert.match(messageErreurAdmin({ code: '23505', message: 'duplicate key ... "tournaments_annee_nom_key"' }), /existe déjà/);
  assert.match(messageErreurAdmin({ code: '23514' }), /refusée/);
  assert.match(messageErreurAdmin({ code: '42501' }), /administrateur/);
  assert.match(messageErreurAdmin({ message: 'new row violates row-level security policy' }), /administrateur/);
  assert.match(messageErreurAdmin(new TypeError('Failed to fetch')), /connexion/);
  assert.match(messageErreurAdmin(null), /échoué/);
});

const tournois = [
  { id: 1, annee: 2026, nom: 'Roland-Garros', ville: 'Paris', surface: 'terre', indoor: false, categorie: 'grand_slam', etat: 'a_venir', date_debut: '2026-05-24', date_fin: '2026-06-07' },
  { id: 2, annee: 2026, nom: 'Australian Open', ville: 'Melbourne', surface: 'dur', indoor: false, categorie: 'grand_slam', etat: 'clos', date_debut: '2026-01-18', date_fin: '2026-02-01' },
  { id: 3, annee: 2025, nom: 'Wimbledon <b>', ville: null, surface: null, indoor: false, categorie: 'grand_slam', etat: 'clos', date_debut: null, date_fin: null },
];

test('htmlCalendrierAdmin : années décroissantes, ordre chronologique, échappement, lien d’ajout', () => {
  const h = htmlCalendrierAdmin({ tournois });
  assert.ok(h.indexOf('Saison 2026') < h.indexOf('Saison 2025'));
  assert.ok(h.indexOf('Australian Open') < h.indexOf('Roland-Garros'));
  assert.match(h, /href="#\/admin\/tournoi\/1"/);
  assert.match(h, /href="#\/admin\/tournoi\/nouveau"/);
  assert.ok(!h.includes('<b>Wimbledon <b>'));
  assert.match(h, /Wimbledon &lt;b&gt;/);
  assert.match(h, /lieu à renseigner/);
});

test('htmlCalendrierAdmin : vide et message', () => {
  assert.match(htmlCalendrierAdmin({ tournois: [] }), /Aucun tournoi/);
  assert.match(htmlCalendrierAdmin({ tournois, message: 'Tournoi créé.' }), /role="status">Tournoi créé\./);
});

test('htmlFormulaireTournoi : création = pas de bloc API, valeurs par défaut', () => {
  const h = htmlFormulaireTournoi({ anneeParDefaut: 2027 });
  assert.match(h, /data-id="nouveau"/);
  assert.match(h, /value="2027"/);
  assert.match(h, /Créer le tournoi/);
  assert.ok(!h.includes('api-ajouter'));
});

test('htmlFormulaireTournoi : modification = valeurs, identifiants, avertissement tournoi clos', () => {
  const h = htmlFormulaireTournoi({ tournoi: tournois[1], idsApi: ['111', '222'] });
  assert.match(h, /data-id="2"/);
  assert.match(h, /value="Australian Open"/);
  assert.match(h, /<option value="dur" selected>/);
  assert.match(h, /data-api="111" data-tournoi="2"/);
  assert.match(h, /data-api="222"/);
  assert.match(h, /scores sont figés/);
  assert.match(htmlFormulaireTournoi({ tournoi: tournois[0] }), /Aucun identifiant/);
  assert.match(htmlFormulaireTournoi({ tournoi: tournois[0] }), /change le barème/);
});

test('htmlFormulaireTournoi : erreurs et saisie conservée et échappée', () => {
  const h = htmlFormulaireTournoi({ valeurs: { nom: '"><script>', annee: '2026', categorie: 'grand_slam' }, erreurs: ['Oups'] });
  assert.ok(!h.includes('<script>'));
  assert.match(h, /role="alert">Oups/);
});

test('htmlFormulaireTournoi : erreur propre au bloc des identifiants', () => {
  const h = htmlFormulaireTournoi({ tournoi: tournois[0], erreurApi: 'Déjà utilisé' });
  assert.ok(h.indexOf('Déjà utilisé') > h.indexOf('Identifiants de l’API'));
  assert.match(h, /role="alert">Déjà utilisé/);
});

// --- écriture (faux client Supabase) ---
function faux({ data = [{ id: 7 }], error = null } = {}) {
  const appels = [];
  const chaine = (op, table, valeurs) => {
    const c = {
      eq(col, v) { appels.push(['eq', col, v]); return c; },
      select() { appels.push([op, table, valeurs]); return Promise.resolve({ data, error }); },
      then(res, rej) { appels.push([op, table, valeurs]); return Promise.resolve({ error }).then(res, rej); },
    };
    return c;
  };
  return { appels, from: (t) => ({ insert: (v) => chaine('insert', t, v), update: (v) => chaine('update', t, v), delete: () => chaine('delete', t) }) };
}

test('enregistrerTournoi : création renvoie le nouvel identifiant', async () => {
  const c = faux();
  assert.equal(await creerDonnees(c).enregistrerTournoi({ valeurs: { nom: 'X' } }), 7);
  assert.deepEqual(c.appels[0], ['insert', 'tournaments', { nom: 'X' }]);
});

test('enregistrerTournoi : modification ; 0 ligne touchée = refus (RLS)', async () => {
  const c = faux();
  assert.equal(await creerDonnees(c).enregistrerTournoi({ id: 4, valeurs: { nom: 'Y' } }), 4);
  assert.deepEqual(c.appels, [['eq', 'id', 4], ['update', 'tournaments', { nom: 'Y' }]]);
  await assert.rejects(creerDonnees(faux({ data: [] })).enregistrerTournoi({ id: 4, valeurs: {} }), { code: '42501' });
});

test('enregistrerTournoi : erreur de la base remontée', async () => {
  await assert.rejects(creerDonnees(faux({ data: null, error: { code: '23505' } })).enregistrerTournoi({ valeurs: {} }), { code: '23505' });
});

test('ajouterIdApi / retirerIdApi', async () => {
  const c = faux();
  await creerDonnees(c).ajouterIdApi(4, '555');
  assert.deepEqual(c.appels[0], ['insert', 'tournament_api_ids', { api_id: '555', tournament_id: 4 }]);
  await assert.rejects(creerDonnees(faux({ error: { code: '23505' } })).ajouterIdApi(4, '555'), { code: '23505' });
  const d = faux({ data: [{ api_id: '555' }] });
  await creerDonnees(d).retirerIdApi(4, '555');
  assert.deepEqual(d.appels.slice(0, 2), [['eq', 'api_id', '555'], ['eq', 'tournament_id', 4]]);
  await assert.rejects(creerDonnees(faux({ data: [] })).retirerIdApi(4, '555'), { code: '42501' });
});
