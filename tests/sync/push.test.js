import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirePush, executerPush, alerterQuota } from '../../src/sync/push.js';
import { creerEnvoyeur } from '../../src/sync/push-cli.js';

const tournoi = { id: 11, nom: 'Rolex Paris Masters', ville: 'Paris', categorie: 'masters_1000', annee: 2026 };
const lea = { joueur_id: 'a', prenom: 'Léa', abonnements: [{ endpoint: 'https://p.example/1', p256dh: 'k1', auth: 'a1' }, { endpoint: 'https://p.example/2', p256dh: 'k2', auth: 'a2' }] };

test('contenu push : titres « Nom - … », tournoi terminé sans phrase d’annonce, message pour le gagnant', () => {
  const o = { urlSite: 'https://x.example/app/' };
  assert.deepEqual(construirePush({ cle: 'k', type: 'tour_ouvert', tour: 'QF', tournoi }, lea, o),
    { titre: 'Paris - Paris à poser', texte: 'Les affiches des quarts sont connues : tes paris sont attendus.', url: 'https://x.example/app/#/tournoi/11', tag: 'k' });
  const visibles = construirePush({ cle: 'k', type: 'paris_visibles', tour: 'RR2', tournoi }, lea, o);
  assert.equal(visibles.titre, 'Paris - Paris visibles');
  assert.match(visibles.texte, /paris des matchs de poule \(Round Robin 2\) sont visibles/);
  const classement = [{ prenom: 'Marc', rang: 1 }, { prenom: 'Léa', rang: 2 }];
  const fini = construirePush({ cle: 'k', type: 'tournoi_termine', tournoi, classement }, lea, o);
  assert.equal(fini.titre, 'Paris - Terminé');
  assert.equal(fini.texte, 'Marc l’emporte, tu finis 2e.');
  assert.equal(construirePush({ cle: 'k', type: 'tournoi_termine', tournoi, classement }, { prenom: 'Marc' }, o).texte, 'Tu remportes le tournoi !');
  assert.equal(construirePush({ cle: 'k', type: 'tournoi_termine', tournoi, classement }, { prenom: 'Inconnu' }, o).texte, 'Marc l’emporte.');
});

test('titres : ville pour un Masters 1000, nom pour un Grand Chelem et les ATP Finals ; textes « Paris à poser » (pluriel, singulier pour la finale)', () => {
  const o = {};
  const ev = (t, tour) => construirePush({ cle: 'k', type: 'tour_ouvert', tour, tournoi: t }, lea, o);
  assert.equal(ev(tournoi, 'R16').texte, 'Les affiches des huitièmes sont connues : tes paris sont attendus.');
  assert.equal(ev(tournoi, 'SF').texte, 'Les affiches des demies sont connues : tes paris sont attendus.');
  assert.equal(ev(tournoi, 'F').texte, 'L’affiche de la finale est connue : ton pari est attendu.');
  assert.equal(ev({ id: 2, nom: 'Roland-Garros', ville: 'Paris', categorie: 'grand_slam' }, 'QF').titre, 'Roland-Garros - Paris à poser');
  assert.equal(ev({ id: 3, nom: 'Nitto ATP Finals', ville: 'Turin', categorie: 'atp_finals' }, 'RR1').titre, 'ATP Finals - Paris à poser');
  assert.equal(ev({ id: 4, nom: 'Masters du Canada', ville: 'Montréal', categorie: 'masters_1000' }, 'QF').titre, 'Montréal - Paris à poser');
  assert.equal(ev({ id: 5, nom: 'Madrid Open', categorie: 'masters_1000' }, 'QF').titre, 'Madrid Open - Paris à poser', 'sans ville : le nom');
});

test('match terminé : « Vainqueur bat Perdant », puis chaque parieur avec ses points (confiance 8 : +8 gagné, −4 perdu ; ×2 en demi-finale)', () => {
  const ev = { cle: 'match_termine:5', type: 'match_termine', tour: 'SF', tournoi, match: { p1: 'Sinner', p2: 'Alcaraz', vainqueur: 2, sets_joues: 3, fin_match: 'normal' },
    paris: [{ prenom: 'Léa', choix: 2, confiance: 8, sets: null }, { prenom: 'Marc', choix: 1, confiance: 8, sets: null }, { prenom: 'Anne', choix: 2, confiance: 6, sets: null }] };
  const m = construirePush(ev, lea, { urlSite: 'https://x.example/' });
  assert.equal(m.titre, 'Paris - Alcaraz bat Sinner');
  const pts = (choix, conf) => ({ prenom: 'x', ...ev.paris[0], choix, confiance: conf });
  assert.match(m.texte, /^(Léa \+[\d,]+ · Anne \+[\d,]+ · Marc [−-][\d,]+)$/, `tri par points décroissants : ${m.texte}`);
  assert.equal(m.tag, 'match_termine:5');
  assert.equal(pts(2, 8).choix, 2);
});

function monde({ echecs = {} } = {}) {
  const marques = []; const supprimes = []; const envoyes = [];
  const base = {
    notifAFaire: async () => [{ cle: 'tour_ouvert:11:QF', type: 'tour_ouvert', tour: 'QF', tournoi, destinataires: [], push_destinataires: [lea] }],
    notifMarquer: async (cle, joueur) => { marques.push([cle, joueur]); },
    pushSupprimer: async (e) => { supprimes.push(e); },
  };
  const envoyer = async (abo, contenu) => {
    if (echecs[abo.endpoint]) throw Object.assign(new Error('x'), { statusCode: echecs[abo.endpoint] });
    envoyes.push([abo.endpoint, contenu.titre]);
  };
  return { base, envoyer, marques, supprimes, envoyes };
}

test('envoi : un message par appareil, un seul marquage « push:… » par joueur', async () => {
  const m = monde();
  const bilan = await executerPush({ base: m.base, envoyer: m.envoyer, urlSite: 'https://x.example/' });
  assert.equal(bilan.envoyes, 2);
  assert.deepEqual(m.marques, [['push:tour_ouvert:11:QF', 'a']]);
});

test('abonnement périmé (410) supprimé ; l’autre appareil suffit à marquer', async () => {
  const m = monde({ echecs: { 'https://p.example/1': 410 } });
  const bilan = await executerPush({ base: m.base, envoyer: m.envoyer });
  assert.deepEqual([bilan.envoyes, bilan.supprimes], [1, 1]);
  assert.deepEqual(m.supprimes, ['https://p.example/1']);
  assert.equal(m.marques.length, 1);
});

test('erreur passagère partout : rien n’est marqué, tout repartira au passage suivant', async () => {
  const m = monde({ echecs: { 'https://p.example/1': 503, 'https://p.example/2': 500 } });
  const lignes = [];
  const bilan = await executerPush({ base: m.base, envoyer: m.envoyer, journal: (t) => lignes.push(t) });
  assert.deepEqual([bilan.envoyes, bilan.echecs, bilan.supprimes], [0, 2, 0]);
  assert.deepEqual(m.marques, []);
  assert.deepEqual(m.supprimes, []);
});

test('clés VAPID : créées une seule fois, la première paire enregistrée fait foi ; envoi chiffré par web-push', async () => {
  let stockees = null; const appels = [];
  const base = {
    pushCles: async () => stockees,
    pushEnregistrerCles: async (publique, privee) => { stockees ??= { publique, privee }; },
  };
  const webpush = { generateVAPIDKeys: () => ({ publicKey: 'PUB', privateKey: 'PRIV' }), sendNotification: async (...a) => { appels.push(a); } };
  const envoyer = await creerEnvoyeur({ base, urlSite: 'https://x.example/', webpush });
  await creerEnvoyeur({ base, urlSite: 'https://x.example/', webpush: { ...webpush, generateVAPIDKeys: () => { throw new Error('ne doit pas régénérer'); } } });
  assert.deepEqual(stockees, { publique: 'PUB', privee: 'PRIV' });
  await envoyer(lea.abonnements[0], { titre: 'T', texte: 'x', url: 'u', tag: 'g' });
  const [abo, charge, options] = appels[0];
  assert.deepEqual(abo, { endpoint: 'https://p.example/1', keys: { p256dh: 'k1', auth: 'a1' } });
  assert.deepEqual(JSON.parse(charge), { titre: 'T', texte: 'x', url: 'u', tag: 'g' });
  assert.deepEqual(options.vapidDetails, { subject: 'https://x.example/', publicKey: 'PUB', privateKey: 'PRIV' });
});

test('bibliothèque web-push réelle : les clés générées sont valides (le module se charge comme en production)', async () => {
  let stockees = null;
  const base = { pushCles: async () => stockees, pushEnregistrerCles: async (publique, privee) => { stockees ??= { publique, privee }; } };
  await creerEnvoyeur({ base, urlSite: 'https://x.example/' });
  assert.match(stockees.publique, /^[A-Za-z0-9_-]{87}$/, 'clé publique P-256 en base64url');
  assert.match(stockees.privee, /^[A-Za-z0-9_-]{43}$/);
});

test('alerte quota : rien sous 90 appels ; à 90, un message par appareil d\'administrateur et un marquage « push:quota:jour »', async () => {
  const envoyes = []; const marques = [];
  const base = (n) => ({ etat: async () => ({ appels_aujourdhui: n }), pushAdmins: async () => [lea], notifMarquer: async (c, j) => marques.push([c, j]), pushSupprimer: async () => {} });
  const envoyer = async (abo, c) => envoyes.push([abo.endpoint, c.titre, c.texte]);
  const maintenant = new Date('2026-11-08T15:00:00Z');
  assert.deepEqual(await alerterQuota({ base: base(89), envoyer, maintenant }), { alerte: false, utilises: 89 });
  assert.equal(envoyes.length, 0);
  const r = await alerterQuota({ base: base(90), envoyer, urlSite: 'https://x.example/app/', maintenant });
  assert.deepEqual([r.alerte, r.envoyes], [true, 2]);
  assert.equal(envoyes[0][1], 'API tennis - 90 appels aujourd’hui');
  assert.match(envoyes[0][2], /90 sur 100/);
  assert.deepEqual(marques, [['push:quota:2026-11-08', 'a']]);
});
