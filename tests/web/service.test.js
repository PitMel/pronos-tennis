import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classerErreurService, messageService, htmlServiceIndisponible } from '../../web/js/service.js';

test('classerErreurService : hors ligne, indisponible, autre', () => {
  assert.equal(classerErreurService(new Error('x'), { enLigne: false }), 'hors-ligne');
  // formes réelles d'erreurs supabase-js quand la base est en pause ou injoignable
  assert.equal(classerErreurService({ message: 'TypeError: Failed to fetch', details: '' }), 'indisponible');
  assert.equal(classerErreurService({ message: '', details: 'TypeError: NetworkError when attempting to fetch resource.' }), 'indisponible');
  assert.equal(classerErreurService({ message: 'Load failed' }), 'indisponible');
  assert.equal(classerErreurService({ message: 'upstream', status: 503 }), 'indisponible');
  assert.equal(classerErreurService({ message: 'x', status: 540 }), 'indisponible');
  assert.equal(classerErreurService({ message: 'The operation timed out' }), 'indisponible');
  // vraies erreurs applicatives : pas de faux diagnostic « service indisponible »
  assert.equal(classerErreurService({ message: 'permission denied for table profiles', code: '42501', status: 403 }), 'autre');
  assert.equal(classerErreurService({ message: 'JWT expired', status: 401 }), 'autre');
  assert.equal(classerErreurService(null), 'autre');
  assert.equal(classerErreurService(undefined), 'autre');
});

test('messageService : messages clairs, null pour les autres erreurs', () => {
  assert.match(messageService(new Error('x'), { enLigne: false }).texte, /pas connecté/);
  const m = messageService({ message: 'Failed to fetch' }, { enLigne: true });
  assert.match(m.titre, /indisponible/);
  assert.match(m.texte, /préviens Pierre/);
  assert.equal(messageService({ message: 'permission denied', status: 403 }), null);
});

test('htmlServiceIndisponible : bouton Réessayer, texte échappé', () => {
  const h = htmlServiceIndisponible({ titre: 'T <b>', texte: 'x & y' });
  assert.match(h, /data-reessayer/);
  assert.match(h, /T &lt;b&gt;/);
  assert.match(h, /x &amp; y/);
});

test('index.html : filet de sécurité si le chargement ne se termine pas', () => {
  const html = readFileSync(new URL('../../web/index.html', import.meta.url), 'utf8');
  assert.match(html, /setTimeout\(function \(\)/);
  assert.match(html, /Le chargement prend trop de temps/);
  // le filet doit précéder le module pour exister même si app.js échoue à se charger
  assert.ok(html.indexOf('setTimeout') < html.indexOf('type="module"'));
});

test('workflow Entretien : planifié toute l’année, indépendant de SYNCHRO_ACTIVE, réveille Supabase et fait un marqueur', () => {
  const y = readFileSync(new URL('../../.github/workflows/entretien.yml', import.meta.url), 'utf8');
  assert.match(y, /cron: '\d+ \d+ \* \* [\d,*]+'/);
  assert.doesNotMatch(y, /SYNCHRO_ACTIVE\s*==/);
  assert.match(y, /contents: write/);
  assert.match(y, /rest\/v1\/tournaments/);
  assert.match(y, /derniere-activite\.txt/);
  assert.doesNotMatch(y, /eyJ[A-Za-z0-9_-]{20,}/, 'aucune clé en clair');
});
