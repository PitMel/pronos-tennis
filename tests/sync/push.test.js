import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirePush, executerPush } from '../../src/sync/push.js';
import { creerEnvoyeur } from '../../src/sync/push-cli.js';

const tournoi = { id: 11, nom: 'Rolex Paris Masters', categorie: 'masters_1000', annee: 2026 };
const lea = { joueur_id: 'a', prenom: 'Léa', abonnements: [{ endpoint: 'https://p.example/1', p256dh: 'k1', auth: 'a1' }, { endpoint: 'https://p.example/2', p256dh: 'k2', auth: 'a2' }] };

test('contenu push : titres « Nom - … », tournoi terminé sans phrase d’annonce, message pour le gagnant', () => {
  const o = { urlSite: 'https://x.example/app/' };
  assert.deepEqual(construirePush({ cle: 'k', type: 'tour_ouvert', tour: 'QF', tournoi }, lea, o),
    { titre: 'Rolex Paris Masters - Paris à poser', texte: 'Les quarts de finale sont à parier : toutes les affiches sont connues.', url: 'https://x.example/app/#/tournoi/11', tag: 'k' });
  const visibles = construirePush({ cle: 'k', type: 'paris_visibles', tour: 'RR2', tournoi }, lea, o);
  assert.equal(visibles.titre, 'Rolex Paris Masters - Paris visibles');
  assert.match(visibles.texte, /paris des matchs de poule \(Round Robin 2\) sont visibles/);
  const classement = [{ prenom: 'Marc', rang: 1 }, { prenom: 'Léa', rang: 2 }];
  const fini = construirePush({ cle: 'k', type: 'tournoi_termine', tournoi, classement }, lea, o);
  assert.equal(fini.titre, 'Rolex Paris Masters - Terminé');
  assert.equal(fini.texte, 'Marc l’emporte, tu finis 2e.');
  assert.equal(construirePush({ cle: 'k', type: 'tournoi_termine', tournoi, classement }, { prenom: 'Marc' }, o).texte, 'Tu remportes le tournoi !');
  assert.equal(construirePush({ cle: 'k', type: 'tournoi_termine', tournoi, classement }, { prenom: 'Inconnu' }, o).texte, 'Marc l’emporte.');
});

test('match terminé : « Vainqueur bat Perdant », puis chaque parieur avec ses points (confiance 8 : +8 gagné, −4 perdu ; ×2 en demi-finale)', () => {
  const ev = { cle: 'match_termine:5', type: 'match_termine', tour: 'SF', tournoi, match: { p1: 'Sinner', p2: 'Alcaraz', vainqueur: 2, sets_joues: 3, fin_match: 'normal' },
    paris: [{ prenom: 'Léa', choix: 2, confiance: 8, sets: null }, { prenom: 'Marc', choix: 1, confiance: 8, sets: null }, { prenom: 'Anne', choix: 2, confiance: 6, sets: null }] };
  const m = construirePush(ev, lea, { urlSite: 'https://x.example/' });
  assert.equal(m.titre, 'Rolex Paris Masters - Alcaraz bat Sinner');
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
