// Affichage français des points : virgule décimale, vrai signe moins (−), 2 décimales au plus,
// sans zéros inutiles (13,5 ; −0,75 ; 12,75). L'arrondi (moitié éloignée de zéro) ne touche jamais aux calculs.
import { Fraction } from './fraction.js';

export const SIGNE_MOINS = '−';

/**
 * @param {Fraction|string|number|bigint} valeur
 * @param {{signe?: boolean, decimales?: number}} [options] signe: préfixe « + » aux valeurs positives
 */
export function formaterPoints(valeur, { signe = false, decimales = 2 } = {}) {
  const echelle = 10n ** BigInt(decimales);
  const q = Fraction.de(valeur).arrondiEchelle(echelle);
  if (q === 0n) return '0';
  const negatif = q < 0n;
  const a = negatif ? -q : q;
  const entier = a / echelle;
  const dec = (a % echelle).toString().padStart(decimales, '0').replace(/0+$/, '');
  const corps = dec ? `${entier},${dec}` : `${entier}`;
  if (negatif) return SIGNE_MOINS + corps;
  return signe ? `+${corps}` : corps;
}
