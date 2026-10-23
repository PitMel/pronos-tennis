// Nombres rationnels exacts (entiers BigInt). Aucun flottant : 1/3 + 1/3 + 1/3 = 1 exactement.
// Module pur : fonctionne sous Node et dans le navigateur.

function pgcd(a, b) {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
}

export class Fraction {
  /** @param {bigint} num @param {bigint} den */
  constructor(num, den = 1n) {
    if (typeof num !== 'bigint' || typeof den !== 'bigint') {
      throw new TypeError('Fraction : numérateur et dénominateur doivent être des BigInt (utiliser Fraction.de).');
    }
    if (den === 0n) throw new RangeError('Fraction : division par zéro.');
    if (den < 0n) {
      num = -num;
      den = -den;
    }
    const g = pgcd(num, den);
    this.num = num / g;
    this.den = den / g;
    Object.freeze(this);
  }

  /**
   * Convertit une valeur en Fraction.
   * Accepte : Fraction, BigInt, entier, chaîne « 1.5 », « 1,5 », « −25,5 » ou « 5/3 ».
   * Refuse les nombres non entiers (flottants) pour ne jamais perdre d'exactitude.
   */
  static de(valeur) {
    if (valeur instanceof Fraction) return valeur;
    if (typeof valeur === 'bigint') return new Fraction(valeur);
    if (typeof valeur === 'number') {
      if (!Number.isSafeInteger(valeur)) {
        throw new TypeError(`Fraction.de : « ${valeur} » n'est pas un entier sûr ; écrire la valeur décimale en chaîne (ex. "1.5").`);
      }
      return new Fraction(BigInt(valeur));
    }
    if (typeof valeur === 'string') {
      const s = valeur.trim().replace(/−/g, '-').replace(',', '.');
      let m = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(s);
      if (m) {
        const [, signe, entier, dec = ''] = m;
        const n = BigInt(entier + dec) * (signe === '-' ? -1n : 1n);
        return new Fraction(n, 10n ** BigInt(dec.length));
      }
      m = /^([+-]?\d+)\/(\d+)$/.exec(s);
      if (m) return new Fraction(BigInt(m[1]), BigInt(m[2]));
    }
    throw new TypeError(`Fraction.de : valeur illisible (${String(valeur)}).`);
  }

  static somme(valeurs) {
    return valeurs.reduce((acc, v) => acc.plus(v), ZERO);
  }

  plus(autre) {
    const o = Fraction.de(autre);
    return new Fraction(this.num * o.den + o.num * this.den, this.den * o.den);
  }

  moins(autre) {
    const o = Fraction.de(autre);
    return new Fraction(this.num * o.den - o.num * this.den, this.den * o.den);
  }

  fois(autre) {
    const o = Fraction.de(autre);
    return new Fraction(this.num * o.num, this.den * o.den);
  }

  divise(autre) {
    const o = Fraction.de(autre);
    if (o.num === 0n) throw new RangeError('Fraction : division par zéro.');
    return new Fraction(this.num * o.den, this.den * o.num);
  }

  oppose() {
    return new Fraction(-this.num, this.den);
  }

  /** -1, 0 ou 1 */
  comparer(autre) {
    const o = Fraction.de(autre);
    const g = this.num * o.den;
    const d = o.num * this.den;
    return g < d ? -1 : g > d ? 1 : 0;
  }

  egal(autre) {
    return this.comparer(autre) === 0;
  }

  estNul() {
    return this.num === 0n;
  }

  /**
   * Valeur × echelle, arrondie à l'entier le plus proche (moitié éloignée de zéro), en BigInt.
   * Sert à l'affichage uniquement : les calculs restent exacts.
   */
  arrondiEchelle(echelle) {
    const e = BigInt(echelle);
    const absolu = (this.num < 0n ? -this.num : this.num) * e;
    let q = absolu / this.den;
    if (2n * (absolu % this.den) >= this.den) q += 1n;
    return this.num < 0n ? -q : q;
  }

  /** Approximation pour usages non critiques (graphiques). Ne jamais s'en servir pour calculer des points. */
  versNombre() {
    return Number(this.num) / Number(this.den);
  }

  toString() {
    return this.den === 1n ? `${this.num}` : `${this.num}/${this.den}`;
  }

  toJSON() {
    return this.toString();
  }
}

export const ZERO = new Fraction(0n);
export const UN = new Fraction(1n);

/** Raccourci : f(3, 2) = 3/2 ; f("1.5") = 3/2. */
export function f(a, b = 1) {
  return b === 1 ? Fraction.de(a) : Fraction.de(a).divise(Fraction.de(b));
}
