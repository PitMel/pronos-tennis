import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { htmlBlocPush, htmlPageProfil } from '../../web/js/profil.js';

test('bloc push : un message et le bon bouton selon l’état de l’appareil', () => {
  assert.match(htmlBlocPush({ etat: 'inactif' }), /data-push-activer/);
  assert.doesNotMatch(htmlBlocPush({ etat: 'inactif' }), /data-push-desactiver/);
  assert.match(htmlBlocPush({ etat: 'actif' }), /data-push-desactiver/);
  assert.match(htmlBlocPush({ etat: 'ios-installer' }), /Sur l’écran d’accueil/);
  assert.match(htmlBlocPush({ etat: 'refuse' }), /bloquées/);
  assert.match(htmlBlocPush({ etat: 'pas-pret' }), /pas encore prêtes/);
  for (const e of ['ios-installer', 'refuse', 'indisponible', 'pas-pret']) assert.doesNotMatch(htmlBlocPush({ etat: e }), /<button/);
  assert.match(htmlBlocPush({ etat: 'actif', erreur: '<b>' }), /&lt;b&gt;/);
});

test('page Profil : le bloc push suit le bloc e-mail', () => {
  const html = htmlPageProfil({ profil: { prenom: 'Léa', id: 'a' }, push: { etat: 'inactif' } });
  assert.ok(html.indexOf('Notifications par e-mail') < html.indexOf('Notifications push'));
});

test('service worker : affiche le message reçu et ouvre le tournoi au clic', () => {
  const sw = readFileSync(new URL('../../web/sw.js', import.meta.url), 'utf8');
  assert.match(sw, /addEventListener\('push'/);
  assert.match(sw, /showNotification\(/);
  assert.match(sw, /addEventListener\('notificationclick'/);
  assert.match(sw, /openWindow\(/);
});

test('plus de bandeau d’invitation : ni zone, ni bouton « Plus tard »', () => {
  const app = readFileSync(new URL('../../web/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /zone-invitation|push-plus-tard|htmlInvitationPush/);
});

test('activation par défaut : démarrage automatique, respect du choix « désactiver »', () => {
  const app = readFileSync(new URL('../../web/app.js', import.meta.url), 'utf8');
  assert.match(app, /notificationsParDefaut\(\);/, 'lancée au démarrage de l’appli');
  assert.match(app, /lireLocal\('push-coupe'\) === '1'\) return/, 'un appareil désactivé volontairement n’est pas réactivé');
});

test('quatrième case « match terminé » dans les préférences', async () => {
  const { NOTIFICATIONS } = await import('../../web/js/profil.js');
  assert.deepEqual(NOTIFICATIONS.map((n) => n[0]), ['tour_ouvert', 'paris_visibles', 'tournoi_termine', 'match_termine']);
});
