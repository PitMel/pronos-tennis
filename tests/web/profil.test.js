// Profil (5.1) : recadrage, contrôle du fichier, messages, blocs HTML, pastille avec photo, écritures de photo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { carreCentre, erreurFichierPhoto, messageErreurPhoto, htmlBlocPhoto, htmlBlocCouleur, htmlPageProfil, PALETTE, TAILLE_FICHIER_MAX } from '../../web/js/profil.js';
import { htmlPastille } from '../../web/js/vues.js';
import { htmlFormulaireCompte } from '../../web/js/admin-comptes.js';
import { creerDonnees } from '../../web/js/donnees.js';

const ID = '11111111-2222-4333-8444-555555555555';
const URL_PHOTO = `https://wmqyplehxtafxoilllfd.supabase.co/storage/v1/object/public/avatars/${ID}.jpg?v=1730000000000`;

test('carreCentre : paysage, portrait, carré', () => {
  assert.deepEqual(carreCentre(400, 300), { sx: 50, sy: 0, cote: 300 });
  assert.deepEqual(carreCentre(300, 500), { sx: 0, sy: 100, cote: 300 });
  assert.deepEqual(carreCentre(256, 256), { sx: 0, sy: 0, cote: 256 });
});

test('erreurFichierPhoto', () => {
  assert.match(erreurFichierPhoto(null), /Aucune/);
  assert.equal(erreurFichierPhoto({ type: 'image/jpeg', size: 2e6 }), null);
  assert.equal(erreurFichierPhoto({ type: '', size: 1000 }), null); // type inconnu : le navigateur décidera à la lecture
  assert.match(erreurFichierPhoto({ type: 'application/pdf', size: 1000 }), /pas une image/);
  assert.match(erreurFichierPhoto({ type: 'image/png', size: TAILLE_FICHIER_MAX + 1 }), /trop lourde/);
});

test('messageErreurPhoto', () => {
  assert.match(messageErreurPhoto({ message: 'new row violates row-level security policy' }), /ta propre photo/);
  assert.match(messageErreurPhoto({ message: 'The object exceeded the maximum allowed size' }), /trop lourde/);
  assert.match(messageErreurPhoto({ message: 'Failed to fetch' }), /connexion/);
  assert.match(messageErreurPhoto(new Error('boum')), /pas pu être enregistrée/);
});

test('htmlPastille : photo valide affichée, adresse étrangère ou piégée ignorée', () => {
  const avec = htmlPastille({ prenom: 'Léa', couleur: '#D8A21E', photo_url: URL_PHOTO });
  assert.match(avec, /pastille-photo/);
  assert.match(avec, /background-image:url\('https:\/\/wmqyplehxtafxoilllfd\.supabase\.co\/storage/);
  assert.match(avec, /background-color:#D8A21E/);
  for (const mauvaise of ['https://exemple.com/x.jpg', "javascript:alert(1)", `${URL_PHOTO}'); background:red;/*`, 'https://a.supabase.co/storage/v1/object/public/avatars/x.png']) {
    const h = htmlPastille({ prenom: 'Léa', couleur: null, photo_url: mauvaise });
    assert.doesNotMatch(h, /pastille-photo|url\(/, mauvaise);
    assert.match(h, />L</);
  }
  assert.match(htmlPastille({ prenom: 'Léa' }), />L</);
});

test('htmlBlocPhoto : choisir/remplacer, retirer, mention administrateur, messages échappés', () => {
  const sans = htmlBlocPhoto({ profil: { id: ID, prenom: 'Léa', photo_url: null } });
  assert.match(sans, /Choisir une photo/);
  assert.doesNotMatch(sans, /photo-retirer/);
  assert.match(sans, new RegExp(`data-photo="${ID}"`));
  assert.match(sans, /Ma photo/);
  const avec = htmlBlocPhoto({ profil: { id: ID, prenom: 'Léa', photo_url: URL_PHOTO }, autre: true, erreur: '<b>x</b>', message: 'Ok <i>' });
  assert.match(avec, /Remplacer la photo/);
  assert.match(avec, /data-action="photo-retirer"/);
  assert.match(avec, /Photo de ce joueur/);
  assert.match(avec, /administrateur/);
  assert.match(avec, /&lt;b&gt;x/);
  assert.match(avec, /Ok &lt;i&gt;/);
});

test('htmlBlocCouleur et page Profil complète', () => {
  const c = htmlBlocCouleur({ profil: { id: ID, couleur: '#d8a21e' } });
  assert.match(c, /value="#D8A21E" checked/);
  assert.equal((c.match(/type="radio"/g) ?? []).length, PALETTE.length + 1);
  const p = htmlPageProfil({ profil: { id: ID, prenom: 'Léa <b>', couleur: null, photo_url: null } });
  assert.match(p, /Léa &lt;b&gt;/);
  assert.match(p, /data-bloc-photo/);
  assert.match(p, /data-profil-couleur/);
  assert.match(p, /data-mdp/);
});

test('fiche de compte de l’administrateur : bloc photo « de ce joueur » ; sur son propre compte : « Ma photo »', () => {
  const profil = { id: ID, prenom: 'Paul', couleur: null, photo_url: URL_PHOTO, is_test: true, actif: true, is_admin: false };
  assert.match(htmlFormulaireCompte({ profil, moi: 'autre' }), /Photo de ce joueur/);
  assert.match(htmlFormulaireCompte({ profil, moi: ID }), /Ma photo/);
});

test('donnees : envoi de photo (upsert, adresse versionnée, profil mis à jour) et retrait', async () => {
  const appels = [];
  const supabase = {
    storage: { from: (b) => ({
      upload: async (chemin, blob, options) => { appels.push(['upload', b, chemin, options]); return { error: null }; },
      getPublicUrl: (chemin) => ({ data: { publicUrl: `https://wmqyplehxtafxoilllfd.supabase.co/storage/v1/object/public/${b}/${chemin}` } }),
      remove: async (liste) => { appels.push(['remove', b, liste]); return { error: null }; },
    }) },
    from: (t) => ({ update: (v) => ({ eq: (c, id) => ({ select: () => { appels.push(['update', t, v.photo_url === null ? null : 'url', id]); return Promise.resolve({ data: [{ id }], error: null }); } }) }) }),
  };
  const d = creerDonnees(supabase);
  const url = await d.televerserPhoto(ID, new Blob(['x']));
  assert.match(url, new RegExp(`/avatars/${ID}\\.jpg\\?v=\\d+$`));
  await d.retirerPhoto(ID);
  assert.deepEqual(appels, [
    ['upload', 'avatars', `${ID}.jpg`, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' }],
    ['update', 'profiles', 'url', ID],
    ['update', 'profiles', null, ID],
    ['remove', 'avatars', [`${ID}.jpg`]],
  ]);
  const refus = creerDonnees({ storage: { from: () => ({ upload: async () => ({ error: { message: 'new row violates row-level security policy' } }) }) } });
  await assert.rejects(refus.televerserPhoto(ID, new Blob(['x'])), (e) => /row-level/.test(e.message));
});
