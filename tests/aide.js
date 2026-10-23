// Aides de test (pas un fichier de test). Les valeurs attendues sont écrites en dur d'après le cahier des charges.
import assert from 'node:assert/strict';
import { Fraction } from '../src/moteur/index.js';

/** Vérifie l'égalité EXACTE d'une Fraction avec une valeur attendue (chaîne « 13,5 », « −0,75 », « 5/3 », entier). */
export function egal(reel, attendu, message = '') {
  assert.ok(reel instanceof Fraction, `${message} : le moteur doit renvoyer une Fraction, reçu ${String(reel)}`);
  assert.ok(reel.egal(attendu), `${message} attendu ${attendu}, obtenu ${reel.toString()}`);
}

/** Vérifie un objet { joueur: Fraction } contre { joueur: valeur attendue }. */
export function egalObjet(reel, attendu, message = '') {
  assert.deepEqual(Object.keys(reel).sort(), Object.keys(attendu).sort(), `${message} : joueurs différents`);
  for (const [joueur, valeur] of Object.entries(attendu)) egal(reel[joueur], valeur, `${message} [${joueur}]`);
}
