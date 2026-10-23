// Barèmes et constantes du cahier des charges (sections 4 à 7). Les règles de points ne se modifient
// QUE sur instruction de Pierre, ici et dans CAHIER_DES_CHARGES.md / ETAT.md.
import { f } from './fraction.js';

export const GRAND_CHELEM = 'grand_slam';
export const MASTERS_1000 = 'masters_1000';
export const ATP_FINALS = 'atp_finals';
export const CATEGORIES = Object.freeze([GRAND_CHELEM, MASTERS_1000, ATP_FINALS]);

// Codes internes des tours. « RR » = phase de poules des ATP Finals (round robin).
// Le passage des codes de l'API vers ces codes se fera à l'étape 2 (point ouvert n° 2 du cahier des charges).
export const TOURS_PAR_CATEGORIE = Object.freeze({
  [GRAND_CHELEM]: Object.freeze(['R16', 'QF', 'SF', 'F']),
  [MASTERS_1000]: Object.freeze(['R16', 'QF', 'SF', 'F']),
  [ATP_FINALS]: Object.freeze(['RR', 'SF', 'F']),
});

/** 4.2 — confiance -> [points si le joueur choisi gagne, points s'il perd] (avant multiplicateur). */
export const BAREME = Object.freeze({
  6: Object.freeze({ gagne: f(6), perdu: f(4) }),
  7: Object.freeze({ gagne: f(7), perdu: f(2) }),
  8: Object.freeze({ gagne: f(8), perdu: f(-1) }),
  9: Object.freeze({ gagne: f(9), perdu: f(-6) }),
  10: Object.freeze({ gagne: f(10), perdu: f(-17) }),
});
export const CONFIANCES = Object.freeze([6, 7, 8, 9, 10]);

/** 4.3 — bonus de sets (Grand Chelem uniquement), avant multiplicateur. */
export const BONUS_SETS_BON_VAINQUEUR = f(1);
export const BONUS_SETS_CINQ_SETS_MAUVAIS_VAINQUEUR = f('0.5');
export const SETS_POSSIBLES_GRAND_CHELEM = Object.freeze([3, 4, 5]);

/** 4.4 — multiplicateurs de tour. */
export const MULTIPLICATEURS = Object.freeze({
  [GRAND_CHELEM]: Object.freeze({ R16: f(1), QF: f('1.5'), SF: f(2), F: f(2) }),
  [MASTERS_1000]: Object.freeze({ R16: f(1), QF: f('1.5'), SF: f(2), F: f(2) }),
  [ATP_FINALS]: Object.freeze({ RR: f(1), SF: f(2), F: f(2) }),
});

/** 4.5 — types de fin de match. */
export const FINS_DE_MATCH = Object.freeze(['normal', 'abandon', 'forfait']);

/** 6 — pari tournoi : points par joueur choisi arrivé en finale, et pour le vainqueur trouvé. */
export const POINTS_PARI_TOURNOI = Object.freeze({
  [GRAND_CHELEM]: f(8),
  [MASTERS_1000]: f(4),
  [ATP_FINALS]: f(4),
});

/** 7 — bonus de classement du tournoi : [1er, 2e]. */
export const BONUS_CLASSEMENT = Object.freeze({
  [MASTERS_1000]: Object.freeze([f(12), f(5)]),
  [GRAND_CHELEM]: Object.freeze([f(24), f(10)]),
  [ATP_FINALS]: Object.freeze([f(10), f(4)]),
});
