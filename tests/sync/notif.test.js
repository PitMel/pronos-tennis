import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as moteur from '../../src/moteur/index.js';
import { construireCourriel, envoyerBrevo, executerNotifications } from '../../src/sync/notif.js';

const dest = { joueur_id: 'a', prenom: 'Léa', email: 'lea@example.org' };
const tournoi = { id: 11, nom: 'Rolex Paris Masters', categorie: 'masters_1000', annee: 2026 };

test('courriel « tour ouvert » : affiches, lien, rappel des préférences', () => {
  const c = construireCourriel({ type: 'tour_ouvert', tour: 'R16', tournoi, matchs: [{ p1: 'Paul', p2: 'Halys', heure: '2026-11-05T10:10:00Z' }] }, dest, { urlSite: 'https://x.example/app/' });
  assert.match(c.sujet, /Paris Masters : les huitièmes de finale sont à parier/);
  assert.match(c.texte, /Bonjour Léa,/);
  assert.match(c.texte, /Paul – Halys \(.*11:10\)/);
  assert.match(c.texte, /https:\/\/x\.example\/app\/#\/tournoi\/11/);
  assert.match(c.html, /page Profil/);
});

test('courriel « paris visibles »', () => {
  const c = construireCourriel({ type: 'paris_visibles', tour: 'QF', tournoi }, dest, {});
  assert.match(c.sujet, /paris des quarts de finale sont visibles/);
});

test('courriel « tournoi terminé » : vainqueur, classement du tournoi et Race', () => {
  const ev = {
    type: 'tournoi_termine', tournoi, vainqueur: 'Jannik Sinner', finaliste: 'Carlos Alcaraz',
    classement: [{ prenom: 'Léa', rang: 1, score_final: '12' }, { prenom: 'Marc', rang: 2, score_final: '8' }],
    race_donnees: {
      tournois: [{ id: 11, annee: 2026, etat: 'clos' }],
      resultats: [{ tournament_id: 11, joueur_id: 'a', score_final: '12' }, { tournament_id: 11, joueur_id: 'b', score_final: '8' }],
      profils: [{ id: 'a', prenom: 'Léa' }, { id: 'b', prenom: 'Marc' }],
    },
  };
  const c = construireCourriel(ev, dest, { moteur });
  assert.match(c.sujet, /terminé — Léa l’emporte/);
  assert.match(c.texte, /Vainqueur : Jannik Sinner · finaliste : Carlos Alcaraz/);
  assert.match(c.texte, /1\. Léa — 12/);
  assert.match(c.texte, /Race 2026 :\n1\. Léa — 12/);
});

test('envoi Brevo : requête, et erreur sans révéler la clé', async () => {
  let vu;
  await envoyerBrevo({ cle: 'SECRET', expediteur: { email: 'e@x.fr', name: 'P' }, destinataire: dest, sujet: 's', texte: 't', html: 'h',
    fetchImpl: async (url, o) => { vu = { url, o }; return { ok: true }; } });
  assert.equal(vu.url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(vu.o.headers['api-key'], 'SECRET');
  assert.equal(JSON.parse(vu.o.body).to[0].email, 'lea@example.org');
  await assert.rejects(envoyerBrevo({ cle: 'SECRET', expediteur: {}, destinataire: dest, sujet: '', texte: '', html: '',
    fetchImpl: async () => ({ ok: false, status: 401, text: async () => 'bad key SECRET' }) }), (e) => /401/.test(e.message) && !/SECRET/.test(e.message));
});

test('passe de notifications : marque les envois réussis, continue après un échec, ne fait rien sans configuration', async () => {
  const marques = [];
  const base = {
    notifAFaire: async () => [{ cle: 'tour_ouvert:11:R16', type: 'tour_ouvert', tour: 'R16', tournoi, matchs: [], destinataires: [dest, { joueur_id: 'b', prenom: 'Marc', email: 'marc@example.org' }] }],
    notifMarquer: async (cle, j) => { marques.push([cle, j]); },
  };
  const envoyes = [];
  const b = await executerNotifications({ base, moteur, configure: true,
    envoyer: async (m) => { if (m.destinataire.prenom === 'Léa') throw new Error('panne'); envoyes.push(m.destinataire.email); } });
  assert.deepEqual(envoyes, ['marc@example.org']);
  assert.deepEqual(marques, [['tour_ouvert:11:R16', 'b']]);
  assert.equal(b.echecs, 1);
  let appele = false;
  const rien = await executerNotifications({ base: { notifAFaire: async () => { appele = true; return []; } }, configure: false });
  assert.equal(appele, false);
  assert.ok(rien.ignore);
});
