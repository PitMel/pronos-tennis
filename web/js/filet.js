// Terrain « Filet » (maquette 1 + cahier des charges, section 12.1) : un terrain de tennis vu de dessus,
// le filet au milieu (50/50). Une colonne par joueur, toujours dans le même ordre (le compte connecté tout à gauche) ;
// une barre part du filet vers la moitié du joueur de tennis choisi, et monte jusqu'à la hauteur de la confiance (6 à 10).
// Barre verte = bon joueur, rouge = mauvais, points écrits dessus. Fonctions pures : données → texte SVG.
import { echapper } from './outils.js';

/** Hauteur d'un cran de confiance (la maquette en avait 30 ; on condense en hauteur). */
export const CRAN = 24;
export const DEMI = 5 * CRAN;          // un demi-terrain = 5 crans (confiances 6 à 10)
export const MARGE = 6;
export const NET = MARGE + DEMI;        // ordonnée du filet
export const LARGEUR = 250;
export const HAUTEUR = 2 * NET;

const X0 = 4;                           // bord gauche du terrain (double)
const X1 = 246;                         // bord droit
const COULOIR = 20;
const XS_G = X0 + COULOIR;              // ligne de simple gauche
const XS_D = X1 - COULOIR;              // ligne de simple droite

const BLEU = '#2F6CC2';
const BLANC = '#F4F7F2';
const BALLE = '#D8E64C';
const ENCRE = '#10303A';
const MARINE = '#17324B';
const VERT = '#1B7F44';
const ROUGE = '#D13B28';
const GRIS = '#7F948B';

/** Abscisses du centre des colonnes pour n joueurs, dans l'ordre. */
export function positionsColonnes(n) {
  const k = Math.max(1, n);
  return Array.from({ length: k }, (_, i) => Math.round((XS_G + ((XS_D - XS_G) * (i + 0.5)) / k) * 10) / 10);
}

export function largeurBarre(n) {
  return Math.max(18, Math.min(34, Math.floor(((XS_D - XS_G) / Math.max(1, n)) * 0.62)));
}

/** Longueur d'une barre : un cran de plus par point de confiance au-dessus de 5 (6 → 1 cran … 10 → 5 crans). */
export function longueurBarre(confiance) {
  return CRAN * (confiance - 5);
}

/**
 * Pari correspondant à un point du terrain (ordonnée dans le repère du SVG) :
 * moitié haute = joueur 1, moitié basse = joueur 2 ; la distance au filet donne la confiance (un cran = une confiance).
 */
export function pariDepuisY(y) {
  const yy = Math.min(Math.max(Number(y), MARGE), HAUTEUR - MARGE);
  const choix = yy < NET ? 1 : 2;
  const confiance = Math.min(10, Math.max(6, 6 + Math.floor(Math.abs(yy - NET) / CRAN)));
  return { choix, confiance };
}

function yBarre(choix, longueur) {
  return choix === 1 ? NET - longueur : NET;
}
function yTexteBarre(choix, longueur) {
  return choix === 1 ? NET - longueur + 14 : NET + longueur - 5;
}

const COULEURS = {
  neutre: { fond: BALLE, trait: MARINE, texte: ENCRE },
  juste: { fond: VERT, trait: BLANC, texte: '#fff' },
  faux: { fond: ROUGE, trait: BLANC, texte: '#fff' },
  zero: { fond: GRIS, trait: BLANC, texte: '#fff' },
};

function texteBarre(cx, choix, longueur, texte, couleur) {
  const taille = String(texte).length > 4 ? 10 : 11;
  return `<text x="${cx}" y="${yTexteBarre(choix, longueur)}" text-anchor="middle" font-size="${taille}" font-weight="800" fill="${couleur}">${echapper(texte)}</text>`;
}

function barre(cx, largeur, choix, confiance, nuance, texte) {
  const c = COULEURS[nuance] ?? COULEURS.neutre;
  const l = longueurBarre(confiance);
  return `<g class="barre barre-${nuance}" data-choix="${choix}" data-confiance="${confiance}">`
    + `<rect x="${cx - largeur / 2}" y="${yBarre(choix, l)}" width="${largeur}" height="${l}" rx="4" fill="${c.fond}" stroke="${c.trait}" stroke-width="1.1"/>`
    + texteBarre(cx, choix, l, texte, c.texte)
    + '</g>';
}

/** Barre « fantôme » : le pari en cours de saisie (pointillés jaunes), avec la confiance écrite dessus. */
export function svgBrouillon(cx, largeur, brouillon) {
  if (!brouillon || (brouillon.choix !== 1 && brouillon.choix !== 2) || !(brouillon.confiance >= 6 && brouillon.confiance <= 10)) return '';
  const l = longueurBarre(brouillon.confiance);
  return `<rect x="${cx - largeur / 2}" y="${yBarre(brouillon.choix, l)}" width="${largeur}" height="${l}" rx="4" fill="${BALLE}" fill-opacity=".5" stroke="${BALLE}" stroke-width="2" stroke-dasharray="5 3"/>`
    + texteBarre(cx, brouillon.choix, l, String(brouillon.confiance), '#fff');
}

const COCHE = '<circle cx="8" cy="-8" r="5" fill="#F4F7F2"/><path d="M5.6 -8 l1.8 1.9 l3 -3.6" fill="none" stroke="#1B7F44" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>';
const HORLOGE = '<circle cx="8" cy="-8" r="5" fill="#F4F7F2"/><circle cx="8" cy="-8" r="2.6" fill="none" stroke="#7A8A84" stroke-width="1.2"/><path d="M8 -9.4 v1.6 l1.1 .7" fill="none" stroke="#7A8A84" stroke-width="1" stroke-linecap="round"/>';

/** Pastille de lettre posée sur le filet, au pied de la colonne d'un joueur. */
function marqueur(cx, lettre, mode, moi) {
  const taille = String(lettre).length > 1 ? 8 : 10;
  const l = `<text y="3.4" text-anchor="middle" font-size="${taille}" font-weight="800"`;
  const g = (inner) => `<g class="marqueur marqueur-${mode}" transform="translate(${cx},${NET})">${inner}</g>`;
  const L = echapper(lettre);
  switch (mode) {
    case 'fantome':
      return g(`<circle r="9.5" fill="${BALLE}" fill-opacity=".95" stroke="${MARINE}" stroke-width="1.4" stroke-dasharray="3 2"/>${l} fill="${ENCRE}">${L}</text>`);
    case 'fait':
      return g(`<circle r="9.5" fill="#1E437A" stroke="${BLANC}" stroke-opacity=".7" stroke-width="1.5" stroke-dasharray="3 2"/>${l} fill="${BLANC}">${L}</text>${COCHE}`);
    case 'attend':
      return g(`<circle r="9.5" fill="#16345F" stroke="${BLANC}" stroke-opacity=".35" stroke-width="1.5" stroke-dasharray="3 2"/>${l} fill="${BLANC}" fill-opacity=".55">${L}</text>${HORLOGE}`);
    default: // 'balle' : pari visible
      return g(`${moi ? `<circle r="13" fill="none" stroke="${BLANC}" stroke-width="2"/>` : ''}<circle r="9.5" fill="${BALLE}" stroke="${MARINE}" stroke-width="1.3"/>`
        + `<path d="M-7.5 -4 Q-5.5 0 -7.5 4" fill="none" stroke="#fff" stroke-width="1.1" stroke-opacity=".9"/><path d="M7.5 -4 Q5.5 0 7.5 4" fill="none" stroke="#fff" stroke-width="1.1" stroke-opacity=".9"/>`
        + `${l} fill="${ENCRE}">${L}</text>`);
  }
}

/**
 * @param {object} o
 * @param {Array<{id:string, lettre:string, moi?:boolean, pari?:{choix:number, confiance:number}|null,
 *                aParie?:boolean|null, nuance?:'neutre'|'juste'|'faux'|'zero', texte?:string}>} o.colonnes
 * @param {1|2|null} o.gagnant       moitié gagnante (résultat visible)
 * @param {{choix?:number, confiance?:number}|null} o.brouillon  pari en cours de saisie (colonne « moi »)
 * @param {boolean} o.edition        le terrain réagit au toucher
 * @param {Array<{confiance:number, gagne:string, perdu:string, perduNegatif:boolean}>|null} o.annotations
 *        barème affiché sur la moitié choisie pendant la saisie (« +12 / −1,5 »)
 * @param {string} o.libelle         description pour les lecteurs d'écran
 */
export function svgTerrain({ colonnes = [], gagnant = null, brouillon = null, edition = false, annotations = null, libelle = 'Terrain du match' } = {}) {
  const n = colonnes.length;
  const xs = positionsColonnes(n);
  const bw = largeurBarre(n);
  const p = [];

  // surface et couloirs
  p.push(`<rect x="${X0}" y="${MARGE}" width="${X1 - X0}" height="${2 * DEMI}" rx="3" fill="${BLEU}"/>`);
  p.push(`<rect x="${X0}" y="${MARGE}" width="${COULOIR}" height="${2 * DEMI}" fill="#000" fill-opacity=".07"/>`);
  p.push(`<rect x="${XS_D}" y="${MARGE}" width="${COULOIR}" height="${2 * DEMI}" fill="#000" fill-opacity=".07"/>`);

  // teintes selon le résultat (maquette : moitié gagnante éclaircie, perdante assombrie)
  if (gagnant === 1 || gagnant === 2) {
    const haut = (c) => (c === 1 ? MARGE : NET);
    const perdant = gagnant === 1 ? 2 : 1;
    p.push(`<rect x="${X0}" y="${haut(gagnant)}" width="${X1 - X0}" height="${DEMI}" fill="#fff" fill-opacity=".13"/>`);
    p.push(`<rect x="${X0}" y="${haut(perdant)}" width="${X1 - X0}" height="${DEMI}" fill="#0B2347" fill-opacity=".38"/>`);
  }

  // moitié choisie pendant la saisie : pointillés jaunes
  if (edition && brouillon && (brouillon.choix === 1 || brouillon.choix === 2)) {
    const y = brouillon.choix === 1 ? MARGE : NET;
    p.push(`<rect x="${XS_G}" y="${y}" width="${XS_D - XS_G}" height="${DEMI}" fill="${BALLE}" fill-opacity=".10" stroke="${BALLE}" stroke-width="2" stroke-dasharray="7 5"/>`);
  }

  // lignes du terrain
  const ligne = `stroke="${BLANC}" stroke-width="2" fill="none" stroke-linecap="square"`;
  const service = Math.round(DEMI * 0.56);
  p.push(`<rect x="${X0}" y="${MARGE}" width="${X1 - X0}" height="${2 * DEMI}" ${ligne}/>`);
  p.push(`<line x1="${XS_G}" y1="${MARGE}" x2="${XS_G}" y2="${HAUTEUR - MARGE}" ${ligne}/><line x1="${XS_D}" y1="${MARGE}" x2="${XS_D}" y2="${HAUTEUR - MARGE}" ${ligne}/>`);
  for (const y of [NET - service, NET + service]) p.push(`<line x1="${XS_G}" y1="${y}" x2="${XS_D}" y2="${y}" ${ligne}/>`);
  const milieu = (XS_G + XS_D) / 2;
  p.push(`<line x1="${milieu}" y1="${NET - service}" x2="${milieu}" y2="${NET + service}" ${ligne}/>`);

  // séparations des crans et échelle de confiance dans le couloir gauche
  for (const cote of [1, 2]) {
    for (let i = 0; i < 5; i += 1) {
      if (i) {
        const y = cote === 1 ? NET - CRAN * i : NET + CRAN * i;
        p.push(`<line x1="${XS_G}" y1="${y}" x2="${XS_D}" y2="${y}" stroke="#fff" stroke-opacity=".16" stroke-dasharray="3 5"/>`);
      }
      const centre = CRAN * i + CRAN / 2;
      const y = (cote === 1 ? NET - centre : NET + centre) + 3.5;
      p.push(`<text x="${(X0 + XS_G) / 2}" y="${y}" text-anchor="middle" font-size="10" font-weight="600" fill="#fff" fill-opacity=".62">${6 + i}</text>`);
    }
  }

  // barème sur la moitié choisie (ou sur les deux tant que rien n'est choisi)
  if (edition && annotations) {
    const cotes = brouillon && (brouillon.choix === 1 || brouillon.choix === 2) ? [brouillon.choix] : [1, 2];
    for (const cote of cotes) {
      for (const a of annotations) {
        // le premier cran est décalé vers l'extérieur pour ne pas passer sous les pastilles posées sur le filet
        const centre = a.confiance === 6 ? 19 : CRAN * (a.confiance - 6) + CRAN / 2;
        const y = (cote === 1 ? NET - centre : NET + centre) + 3.5;
        p.push(`<text x="${XS_D - 4}" y="${y}" text-anchor="end" font-size="10" font-weight="700" fill="${BLANC}">${echapper(a.gagne)}`
          + `<tspan fill="#fff" fill-opacity=".5" font-weight="500"> / </tspan><tspan fill="${a.perduNegatif ? '#FFB8A8' : BLANC}">${echapper(a.perdu)}</tspan></text>`);
      }
    }
  }

  // filet
  p.push(`<line x1="0" y1="${NET}" x2="${LARGEUR}" y2="${NET}" stroke="#0B2347" stroke-opacity=".55" stroke-width="6"/>`);
  p.push(`<line x1="0" y1="${NET}" x2="${LARGEUR}" y2="${NET}" stroke="${BLANC}" stroke-width="2.5" stroke-dasharray="2 3"/>`);
  p.push(`<circle cx="2" cy="${NET}" r="3.5" fill="${BLANC}"/><circle cx="${LARGEUR - 2}" cy="${NET}" r="3.5" fill="${BLANC}"/>`);
  // barres des joueurs (colonnes), posées sur le filet
  colonnes.forEach((c, i) => {
    const cx = xs[i];
    if (c.moi && edition) {
      p.push(`<g class="brouillon" data-cx="${cx}" data-largeur="${bw}">${svgBrouillon(cx, bw, brouillon)}</g>`);
    } else if (c.pari) {
      p.push(barre(cx, bw, c.pari.choix, c.pari.confiance, c.nuance ?? 'neutre', c.texte ?? String(c.pari.confiance)));
    }
  });

  // pastilles de lettre sur le filet
  colonnes.forEach((c, i) => {
    let mode;
    if (c.moi && edition) mode = 'fantome';
    else if (c.pari) mode = 'balle';
    else if (c.aParie) mode = 'fait';
    else mode = 'attend';
    p.push(marqueur(xs[i], c.lettre, mode, Boolean(c.moi)));
  });

  return `<svg class="filet" viewBox="0 0 ${LARGEUR} ${HAUTEUR}" width="100%" role="img" aria-label="${echapper(libelle)}"`
    + ` data-edition="${edition ? '1' : '0'}" data-net="${NET}" data-hauteur="${HAUTEUR}">${p.join('')}</svg>`;
}
