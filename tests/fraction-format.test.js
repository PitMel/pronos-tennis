import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Fraction, f, ZERO, formaterPoints } from '../src/moteur/index.js';

test('Fraction : tiers exacts (aucun flottant)', () => {
  const tiers = f(1, 3);
  assert.ok(tiers.plus(tiers).plus(tiers).egal(1));
  assert.ok(f(5, 3).fois(3).egal(5));
  assert.ok(f(10).divise(3).fois(3).egal(10));
});

test('Fraction : normalisation et signe du dénominateur', () => {
  assert.equal(f(2, 4).toString(), '1/2');
  assert.equal(new Fraction(3n, -6n).toString(), '-1/2');
  assert.equal(f(0, 7).toString(), '0');
});

test('Fraction.de : lecture de chaînes décimales françaises et anglaises', () => {
  assert.equal(Fraction.de('1.5').toString(), '3/2');
  assert.equal(Fraction.de('1,5').toString(), '3/2');
  assert.equal(Fraction.de('−25,5').toString(), '-51/2');
  assert.equal(Fraction.de('-0.75').toString(), '-3/4');
  assert.equal(Fraction.de('5/3').toString(), '5/3');
  assert.equal(Fraction.de(12).toString(), '12');
});

test('Fraction.de : refuse les flottants et les chaînes illisibles', () => {
  assert.throws(() => Fraction.de(1.5), TypeError);
  assert.throws(() => Fraction.de('abc'), TypeError);
  assert.throws(() => Fraction.de(NaN), TypeError);
  assert.throws(() => Fraction.de(null), TypeError);
});

test('Fraction : division par zéro refusée', () => {
  assert.throws(() => f(1).divise(0), RangeError);
  assert.throws(() => new Fraction(1n, 0n), RangeError);
});

test('Fraction : comparaisons, opposé, somme', () => {
  assert.equal(f(1, 3).comparer(f(1, 2)), -1);
  assert.equal(f('0.5').comparer(f(1, 2)), 0);
  assert.equal(f(3).comparer(2), 1);
  assert.ok(f(5).oppose().egal(-5));
  assert.ok(Fraction.somme([f(1, 2), f(1, 3), f(1, 6)]).egal(1));
  assert.ok(Fraction.somme([]).egal(ZERO));
});

test('Fraction : immuable', () => {
  const x = f(3);
  assert.throws(() => {
    'use strict';
    x.num = 9n;
  });
});

test('formaterPoints : virgule décimale, vrai signe moins, 2 décimales au plus, sans zéros inutiles', () => {
  assert.equal(formaterPoints('13.5'), '13,5');
  assert.equal(formaterPoints('-0.75'), '−0,75');
  assert.equal(formaterPoints('12.75'), '12,75');
  assert.equal(formaterPoints(9), '9');
  assert.equal(formaterPoints('-1.5'), '−1,5');
  assert.equal(formaterPoints('-25.5'), '−25,5');
  assert.equal(formaterPoints(0), '0');
});

test('formaterPoints : le signe moins est bien U+2212, jamais le tiret ASCII', () => {
  assert.ok(formaterPoints(-3).startsWith('−'));
  assert.ok(!formaterPoints(-3).includes('-'));
});

test('formaterPoints : option signe (+ aux positifs, rien à zéro)', () => {
  assert.equal(formaterPoints('10.5', { signe: true }), '+10,5');
  assert.equal(formaterPoints(0, { signe: true }), '0');
  assert.equal(formaterPoints(-6, { signe: true }), '−6');
});

test('formaterPoints : tiers arrondis à 2 décimales, calcul interne intact', () => {
  assert.equal(formaterPoints(f(1, 3)), '0,33');
  assert.equal(formaterPoints(f(2, 3)), '0,67');
  assert.equal(formaterPoints(f(5, 3)), '1,67');
  assert.equal(formaterPoints(f(10, 3)), '3,33');
  assert.equal(formaterPoints(f(-1, 3)), '−0,33');
  assert.equal(formaterPoints(f(4, 3)), '1,33');
});

test('formaterPoints : moitié arrondie en s’éloignant de zéro, valeur ~0 affichée « 0 » sans signe', () => {
  assert.equal(formaterPoints('0.005'), '0,01');
  assert.equal(formaterPoints('-0.005'), '−0,01');
  assert.equal(formaterPoints('0.004'), '0');
  assert.equal(formaterPoints('-0.004'), '0');
});
