import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirePush, executerPush } from '../../src/sync/push.js';
import { creerEnvoyeur } from '../../src/sync/push-cli.js';

const tournoi = { id: 11, nom: 'Rolex Paris Masters', categorie: 'masters_1000', annee: 2026 };
const lea = { joueur_id: 'a', prenom: 'Léa', abonnements: [{ endpoint: 'https://p.example/1', p256dh: 'k1', auth: 'a1' }, { endpoint: 'https://p.example/2', p256dh: 'k2', auth: 'a2' }] };

test('contenu push : tour ouvert, paris visibles, tournoi terminé (avec la place du destinataire)', () => {
  const o = { urlSite: 'https://x.example/app/' };
  assert.deepEqual(construirePush({ cle: 'k', type: 'tour_ouvert', tour: 'QF', tournoi }, lea, o),
    { titre: 'Rolex Paris Masters', texte: 'Les quarts de finale sont à parier : toutes les affiches sont connues.', url: 'https://x.example/app/#/tournoi/11', tag: 'k' });
  assert.match(construirePush({ cle: 'k', type: 'paris_visibles', tour: 'RR2', tournoi }, lea, o).texte, /paris des matchs de poule \(Round Robin 2\) sont visibles/);
  const fini = construirePush({ cle: 'k', type: 'tournoi_termine', tournoi, classement: [{ prenom: 'Marc', rang: 1 }, { prenom: 'Léa', rang: 2 }] }, lea, o);
  assert.equal(fini.titre, 'Rolex Paris Masters terminé');
  assert.equal(fini.texte, 'Le tournoi est terminé. Marc l’emporte, tu finis 2e.');
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
