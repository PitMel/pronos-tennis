import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { emailTechnique, messageErreurConnexion } from '../../web/js/identifiants.js';

test('emailTechnique : les 4 comptes existants', () => {
  assert.equal(emailTechnique('Pierre'), 'pierre@pronos.invalid');
  assert.equal(emailTechnique('André'), 'andre@pronos.invalid');
  assert.equal(emailTechnique('Paul'), 'paul@pronos.invalid');
  assert.equal(emailTechnique('Jacques'), 'jacques@pronos.invalid');
});

test('emailTechnique : majuscules, espaces et accents tolérés ; vide refusé', () => {
  assert.equal(emailTechnique('  ANDRÉ '), 'andre@pronos.invalid');
  assert.equal(emailTechnique('andre'), 'andre@pronos.invalid');
  assert.equal(emailTechnique('Jean-Luc'), 'jeanluc@pronos.invalid');
  assert.equal(emailTechnique('   '), null);
  assert.equal(emailTechnique(null), null);
  assert.equal(emailTechnique('!!!'), null);
});

test('messageErreurConnexion : messages français', () => {
  assert.equal(messageErreurConnexion({ message: 'Invalid login credentials' }), 'Nom ou mot de passe incorrect.');
  assert.match(messageErreurConnexion({ message: 'Failed to fetch' }), /internet/);
  assert.match(messageErreurConnexion({ message: 'email rate limit exceeded' }), /Trop de tentatives/);
  assert.match(messageErreurConnexion(new Error('???')), /connexion a échoué/);
});

test('sécurité : aucun secret dans web/ (dépôt public) et clé « publiable » seulement', () => {
  const config = readFileSync(new URL('../../web/config.js', import.meta.url), 'utf8');
  assert.match(config, /SUPABASE_CLE_PUBLIABLE = 'sb_publishable_[A-Za-z0-9_-]+'/);
  const fichiers = [];
  (function lister(dossier) {
    for (const nom of readdirSync(dossier)) {
      const chemin = join(dossier, nom);
      statSync(chemin).isDirectory() ? lister(chemin) : fichiers.push(chemin);
    }
  })(new URL('../../web', import.meta.url).pathname);
  for (const f of fichiers) {
    const texte = readFileSync(f, 'utf8');
    assert.doesNotMatch(texte, /sb_secret_/, `clé secrète Supabase trouvée dans ${f}`);
    assert.doesNotMatch(texte, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./, `jeton JWT trouvé dans ${f}`);
    assert.doesNotMatch(texte, /SERVICE_ROLE_KEY\s*=\s*['"][^'"]+['"]/, `clé service trouvée dans ${f}`);
    assert.doesNotMatch(texte, /LIVETENNIS_API_KEY\s*=\s*['"][^'"]+['"]/, `clé API trouvée dans ${f}`);
  }
});
