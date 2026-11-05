import test from 'node:test';
import assert from 'node:assert/strict';
import { formaterMaj } from '../../web/js/outils.js';

test('MAJ : heure de Paris au format HH:MM (hiver, UTC+1)', () => {
  assert.equal(formaterMaj('2026-11-05T20:35:36Z'), 'MAJ 21:35');
});

test('MAJ : heure de Paris en été (UTC+2) et zéro devant', () => {
  assert.equal(formaterMaj('2026-07-01T05:07:00Z'), 'MAJ 07:07');
});

test('MAJ : minuit s’écrit 00:xx, jamais 24:xx', () => {
  assert.equal(formaterMaj('2026-11-05T23:05:00Z'), 'MAJ 00:05');
});

test('MAJ : date absente ou illisible = rien à afficher', () => {
  assert.equal(formaterMaj(null), '');
  assert.equal(formaterMaj(''), '');
  assert.equal(formaterMaj('pas une date'), '');
});
