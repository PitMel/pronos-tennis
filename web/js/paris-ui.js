// Interactions de la saisie d'un pari (DOM). Toucher ou cliquer sur le terrain choisit le joueur (moitié du terrain)
// et la confiance (distance au filet) ; à la souris on peut aussi glisser. Sur téléphone, seul le toucher est utilisé :
// glisser le doigt continue de faire défiler la page. Toute la logique de calcul est dans filet.js / cartes.js (testés).
import { pariDepuisY, svgBrouillon } from './filet.js';
import { htmlResume, nomCourt } from './cartes.js';
import { brouillonDepuisPari } from './paris.js';

/**
 * @param {HTMLElement} conteneur  élément qui contient les cartes (écouteurs délégués : survit aux rafraîchissements)
 * @param {object} o
 * @param {{brouillons: Map, edition: Set, messages: Map}} o.etat
 * @param {() => object|null} o.contexte         contexte complet des cartes (joueurs, profils, paris, moteur…)
 * @param {(id:number) => object|undefined} o.matchParId
 * @param {(id:number) => void} o.rafraichirCarte
 * @param {(id:number) => Promise<void>} o.valider
 */
export function brancherParis(conteneur, { etat, contexte, matchParId, rafraichirCarte, valider }) {
  let glissement = null;
  let dernierGlissement = 0;

  const idMatch = (el) => Number(el.closest('article.match')?.dataset.match);

  function yDansSvg(svg, clientY) {
    const r = svg.getBoundingClientRect();
    return ((clientY - r.top) / (r.height || 1)) * Number(svg.dataset.hauteur);
  }

  function enregistrerChoix(id, svg, clientY) {
    const { choix, confiance } = pariDepuisY(yDansSvg(svg, clientY));
    etat.brouillons.set(id, { ...(etat.brouillons.get(id) ?? {}), choix, confiance });
    etat.messages.delete(id);
  }

  /** Mise à jour « en direct » pendant le glissement : seulement la barre fantôme et le résumé (la carte n'est pas recréée). */
  function apercu(id, svg) {
    const ctx = contexte();
    const match = matchParId(id);
    if (!ctx || !match) return;
    const brouillon = etat.brouillons.get(id);
    const g = svg.querySelector('g.brouillon');
    if (g) g.innerHTML = svgBrouillon(Number(g.dataset.cx), Number(g.dataset.largeur), brouillon);
    const zone = svg.closest('article.match')?.querySelector('[data-resume]');
    if (zone) zone.innerHTML = htmlResume(ctx, match, brouillon, [nomCourt(ctx.joueurs.get(match.p1_id)), nomCourt(ctx.joueurs.get(match.p2_id))]);
  }

  const terrainEditable = (cible) => cible.closest?.('svg.filet[data-edition="1"]') ?? null;

  conteneur.addEventListener('pointerdown', (e) => {
    const svg = terrainEditable(e.target);
    if (!svg || e.pointerType !== 'mouse' || e.button !== 0) return;
    const id = idMatch(svg);
    glissement = { id, svg };
    svg.setPointerCapture?.(e.pointerId);
    enregistrerChoix(id, svg, e.clientY);
    apercu(id, svg);
  });

  conteneur.addEventListener('pointermove', (e) => {
    if (!glissement) return;
    enregistrerChoix(glissement.id, glissement.svg, e.clientY);
    apercu(glissement.id, glissement.svg);
  });

  const finGlissement = (e) => {
    if (!glissement) return;
    const { id, svg } = glissement;
    glissement = null;
    dernierGlissement = Date.now();
    if (e.type === 'pointerup') enregistrerChoix(id, svg, e.clientY);
    rafraichirCarte(id);
  };
  conteneur.addEventListener('pointerup', finGlissement);
  conteneur.addEventListener('pointercancel', finGlissement);

  conteneur.addEventListener('click', (e) => {
    const svg = terrainEditable(e.target);
    if (svg) {
      if (Date.now() - dernierGlissement < 400) return; // le clic qui suit un glissement à la souris
      const id = idMatch(svg);
      enregistrerChoix(id, svg, e.clientY);
      rafraichirCarte(id);
      return;
    }
    const bouton = e.target.closest?.('button[data-action]');
    if (!bouton || !conteneur.contains(bouton)) return;
    const id = idMatch(bouton);
    const b = etat.brouillons.get(id) ?? {};
    switch (bouton.dataset.action) {
      case 'sets':
        etat.brouillons.set(id, { ...b, sets: Number(bouton.dataset.valeur) });
        etat.messages.delete(id);
        rafraichirCarte(id);
        break;
      case 'modifier': {
        const mien = contexte()?.paris.get(id)?.get(contexte().moi);
        if (mien) etat.brouillons.set(id, brouillonDepuisPari(mien));
        etat.edition.add(id);
        etat.messages.delete(id);
        rafraichirCarte(id);
        break;
      }
      case 'annuler':
        etat.edition.delete(id);
        etat.brouillons.delete(id);
        etat.messages.delete(id);
        rafraichirCarte(id);
        break;
      case 'valider':
        valider(id);
        break;
      default:
    }
  });
}
