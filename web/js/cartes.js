// Carte de match « Filet » (maquette 1) : en-tête (heure + pastille d'état), tableau de score à gauche du terrain,
// terrain avec une barre par joueur, puis panneau clair en dessous (résumé des points, scénarios, saisie du pari).
// Fonctions pures : données → HTML. Le moteur de points est reçu dans le contexte (ctx.moteur).
import { echapper, formaterHeureParis } from './outils.js';
import { formaterScore, LIBELLES_TOURS } from './tournois.js';
import { svgTerrain } from './filet.js';

const NBSP = ' ';

/** « Davidovich Fokina » (le prénom est retiré) ; « de Minaur » ; nom en un seul mot conservé. */
export function nomCourt(joueur) {
  if (!joueur) return 'À déterminer';
  const mots = String(joueur.nom ?? '').trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return 'À déterminer';
  return mots.length > 1 ? mots.slice(1).join(' ') : mots[0];
}

/** Lettre de chaque parieur sur le terrain : l'initiale, ou deux lettres si deux prénoms commencent pareil. */
export function lettresProfils(profils) {
  const initiale = (prenom) => (String(prenom ?? '?').trim().charAt(0) || '?').toUpperCase();
  const comptes = new Map();
  for (const p of profils) comptes.set(initiale(p.prenom), (comptes.get(initiale(p.prenom)) ?? 0) + 1);
  return new Map(profils.map((p) => {
    const l = initiale(p.prenom);
    const deux = l + String(p.prenom ?? '').trim().slice(1, 2).toLowerCase();
    return [p.id, comptes.get(l) > 1 ? deux : l];
  }));
}

/** « A », « A et B », « A, B et C ». */
export function listeFrancaise(noms) {
  if (noms.length <= 1) return noms.join('');
  return `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`;
}

/**
 * État d'une carte, pour la personne connectée :
 *  neutralise · termine · termine-masque · en-cours · revele (à venir, paris révélés et figés) ·
 *  verrouille · attente (j'ai parié, modifiable) · ouvert (je n'ai pas parié, modifiable)
 */
export function etatCarte(match, { aParie }) {
  if (match.neutralise) return 'neutralise';
  if (match.statut === 'termine') return match.resultat_visible ? 'termine' : 'termine-masque';
  if (match.statut === 'en_cours') return 'en-cours';
  if (match.verrouille) return match.paris_reveles ? 'revele' : 'verrouille';
  return aParie ? 'attente' : 'ouvert';
}

function fmt(ctx, valeur, signe = true) {
  return ctx.moteur ? ctx.moteur.formaterPoints(valeur, { signe }) : '';
}

function pariPourMoteur(bet) {
  return { choix: bet.choix, confiance: bet.confiance, sets: bet.sets ?? undefined };
}

function matchPourMoteur(match, ctx, vainqueur) {
  return {
    categorie: ctx.categorie,
    tour: match.tour,
    vainqueur,
    setsJoues: match.sets_joues ?? undefined,
    finMatch: match.fin_match ?? 'normal',
    neutralise: Boolean(match.neutralise),
  };
}

/** Points de chaque pari visible d'un match compté (terminé avec résultat visible, ou neutralisé) ; sinon null. */
export function pointsDuMatch(match, ctx, parisMatch) {
  if (!ctx.moteur) return null;
  if (!match.neutralise && !(match.statut === 'termine' && match.resultat_visible)) return null;
  const paris = {};
  for (const [id, bet] of parisMatch) paris[id] = pariPourMoteur(bet);
  try {
    return ctx.moteur.pointsMatch(matchPourMoteur(match, ctx, match.vainqueur ?? null), paris);
  } catch {
    return null;
  }
}

/** Phrase « Léa et Marc ont parié, Thomas pas encore. » (sans soi-même), ou avertissement si l'on est seul. */
export function phraseQui(profils, moi, qui) {
  if (!qui) return '';
  const autres = profils.filter((p) => p.id !== moi && qui.has(p.id));
  if (autres.length === 0) {
    return 'Tu es le seul joueur de ton groupe : ton pari sera révélé et figé dès que tu le valides.';
  }
  const oui = autres.filter((p) => qui.get(p.id)).map((p) => p.prenom);
  const non = autres.filter((p) => !qui.get(p.id)).map((p) => p.prenom);
  const parts = [];
  if (oui.length) parts.push(`${listeFrancaise(oui)} ${oui.length > 1 ? 'ont' : 'a'} parié`);
  if (non.length) parts.push(`${listeFrancaise(non)} pas encore`);
  return `${parts.join(', ')}.`;
}

function chip(etat, { attendus, participe }) {
  switch (etat) {
    case 'termine': return '<span class="chip fin"><svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7" fill="none" stroke="#1B7F44" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>Terminé</span>';
    case 'termine-masque': return '<span class="chip fin">Terminé · résultat masqué</span>';
    case 'en-cours': return '<span class="chip live">En cours</span>';
    case 'neutralise': return '<span class="chip fin">Neutralisé</span>';
    case 'revele': return '<span class="chip fin">Paris révélés</span>';
    case 'verrouille': return '<span class="chip wait">Paris verrouillés</span>';
    case 'attente': return `<span class="chip wait">${attendus.length ? `Pari posé, en attente de ${echapper(listeFrancaise(attendus))}` : 'Pari posé'}</span>`;
    default: return participe ? '<span class="chip open">À toi de parier</span>' : '<span class="chip fin">Tu ne participes pas</span>';
  }
}

/** Tableau de score « façon télévision », à gauche du terrain, centré sur le filet. */
function htmlTableauScore(match, p1, p2, gagnant) {
  const jeux = match.resultat_visible && Array.isArray(match.score?.games)
    ? match.score.games.filter((s) => Array.isArray(s) && s.length === 2 && s.every((n) => Number.isFinite(n)))
    : [];
  const ligne = (joueur, numero, indice) => {
    const classes = ['ligne-joueur'];
    if (gagnant === numero) classes.push('gagnant');
    else if (gagnant) classes.push('perdant');
    return `<div class="${classes.join(' ')}"><span class="identite"><span class="nom-joueur">${echapper(nomCourt(joueur))}</span>`
      + `${joueur?.classement ? `<span class="rang-joueur">n°${NBSP}${echapper(joueur.classement)}</span>` : ''}</span>`
      + `<span class="sets">${jeux.map((s) => `<b>${echapper(s[indice])}</b>`).join('')}</span></div>`;
  };
  return `<div class="tableau-score">${ligne(p1, 1, 0)}<div class="filet-ligne"></div>${ligne(p2, 2, 1)}</div>`;
}

/** Barème sur la moitié choisie pendant la saisie : « +12 / −1,5 » pour chaque confiance. */
export function annotationsBareme(ctx, match) {
  if (!ctx.moteur) return null;
  return [6, 7, 8, 9, 10].map((confiance) => {
    const g = ctx.moteur.gainsPossibles(confiance, ctx.categorie, match.tour);
    return {
      confiance,
      gagne: fmt(ctx, g.gagne),
      perdu: fmt(ctx, g.perdu),
      perduNegatif: g.perdu.comparer(ctx.moteur.ZERO) < 0,
    };
  });
}

function htmlPilules(ctx, match, confiance) {
  if (!ctx.moteur) return '';
  const g = ctx.moteur.gainsPossibles(confiance, ctx.categorie, match.tour);
  const negatif = g.perdu.comparer(ctx.moteur.ZERO) < 0;
  return `<div class="mine"><span class="pill pos">gagné ${echapper(fmt(ctx, g.gagne))}</span>`
    + `<span class="pill ${negatif ? 'neg' : 'pos'}">perdu ${echapper(fmt(ctx, g.perdu))}</span></div>`;
}

function setsTexte(bet) {
  return bet?.sets ? ` · ${bet.sets} sets` : '';
}

/** Résumé du pari (titre + pilules gagné/perdu). Réutilisé en direct pendant le glissement. */
export function htmlResume(ctx, match, pari, noms) {
  if (!pari || !pari.choix || !pari.confiance) {
    return '<div class="t">Choisis ton joueur <small>touche le terrain : le côté de ton joueur, et la distance au filet pour la confiance</small></div>';
  }
  const nom = pari.choix === 1 ? noms[0] : noms[1];
  return `<div class="t">${echapper(nom)}, confiance ${pari.confiance}${echapper(setsTexte(pari))} <small>touche le terrain pour changer</small></div>`
    + htmlPilules(ctx, match, pari.confiance);
}

function htmlChoixSets(ctx, match, brouillon) {
  if (ctx.categorie !== 'grand_slam') return '';
  const boutons = [3, 4, 5].map((n) => `<button type="button" class="btn-sets${brouillon?.sets === n ? ' choisi' : ''}" data-action="sets" data-valeur="${n}" aria-pressed="${brouillon?.sets === n}">${n}</button>`).join('');
  return `<div class="choix-sets" role="group" aria-label="Nombre de sets"><span>Nombre de sets</span>${boutons}</div>`
    + '<p class="small">Bonus : +1 si tu trouves le vainqueur et le nombre de sets ; +0,5 si tu annonces 5 sets, que le vainqueur est faux et que le match va en 5 sets.</p>';
}

function brouillonValide(ctx, brouillon) {
  if (!ctx.moteur || !brouillon) return false;
  const pari = { choix: brouillon.choix, confiance: brouillon.confiance };
  if (brouillon.sets) pari.sets = brouillon.sets;
  return ctx.moteur.validerPari(pari, ctx.categorie).length === 0;
}

function sousTexteCommun(profils, moi, qui) {
  const phrase = phraseQui(profils, moi, qui);
  return `${phrase ? `${echapper(phrase)} ` : ''}Les paris des autres s’ouvrent quand tout le monde a parié. Modifiable jusqu’au début du match ou jusqu’à ce que tout le monde ait parié.`;
}

/**
 * @param {object} match  ligne de matches_visibles
 * @param {object} ctx
 *   categorie, joueurs: Map(idTennis → {nom, pays, classement}), profils: [{id, prenom, couleur}] (moi d'abord),
 *   moi: id du compte connecté, moteur: module du moteur de points,
 *   paris: Map(idMatch → Map(idProfil → pari)), qui: Map(idMatch → Map(idProfil → a parié)),
 *   brouillons: Map(idMatch → pari en cours), edition: Set(idMatch) en modification, enCours: Set(idMatch) en enregistrement,
 *   messages: Map(idMatch → message d'erreur)
 */
export function htmlCarteMatch(match, ctx = {}) {
  const joueurs = ctx.joueurs ?? new Map();
  const profils = ctx.profils ?? [];
  const moi = ctx.moi ?? null;
  const parisMatch = ctx.paris?.get(match.id) ?? new Map();
  const qui = ctx.qui?.get(match.id) ?? null;
  const monPari = moi ? parisMatch.get(moi) ?? null : null;
  const p1 = joueurs.get(match.p1_id);
  const p2 = joueurs.get(match.p2_id);
  const noms = [nomCourt(p1), nomCourt(p2)];
  const etat = etatCarte(match, { aParie: Boolean(monPari) });
  const participe = !qui || !moi || qui.has(moi);
  const modifiable = (etat === 'attente' || etat === 'ouvert') && participe;
  const enEdition = modifiable && (etat === 'ouvert' || ctx.edition?.has(match.id));
  const brouillon = enEdition ? (ctx.brouillons?.get(match.id) ?? null) : null;
  const gagnant = match.resultat_visible ? match.vainqueur : null;
  const points = pointsDuMatch(match, ctx, parisMatch);
  const lettres = lettresProfils(profils);
  const attendus = profils.filter((p) => p.id !== moi && qui?.has(p.id) && !qui.get(p.id)).map((p) => p.prenom);

  // colonnes du terrain : une par parieur, moi en premier
  const colonnes = profils.map((p) => {
    const pari = parisMatch.get(p.id) ?? null;
    const c = { id: p.id, lettre: lettres.get(p.id), moi: p.id === moi, pari: pari ? { choix: pari.choix, confiance: pari.confiance } : null, aParie: qui ? Boolean(qui.get(p.id)) : null };
    if (pari && points && points[p.id]) {
      c.texte = fmt(ctx, points[p.id]);
      if (match.neutralise || match.fin_match === 'forfait') c.nuance = 'zero';
      else c.nuance = pari.choix === match.vainqueur ? 'juste' : 'faux';
    }
    return c;
  });

  const aide = `Terrain du match ${noms[0]} contre ${noms[1]}`;
  const terrain = svgTerrain({
    colonnes, gagnant, brouillon, edition: enEdition, annotations: enEdition ? annotationsBareme(ctx, match) : null, libelle: aide,
  });

  // panneau clair sous le terrain
  let dessous = '';
  const erreur = ctx.messages?.get(match.id);
  const enregistrement = ctx.enCours?.has(match.id);

  if (etat === 'termine') {
    const nomGagnant = noms[gagnant - 1];
    const nomPerdant = noms[gagnant === 1 ? 1 : 0];
    const score = formaterScore(match.score, match.fin_match, gagnant);
    const titre = match.fin_match === 'forfait'
      ? `Forfait <small>0 point pour tout le monde</small>`
      : `${echapper(nomGagnant)} bat ${echapper(nomPerdant)} <small>${echapper(score)}</small>`;
    const cases = profils.map((p) => {
      const pari = parisMatch.get(p.id);
      if (!pari) return `<div><u>${echapper(p.prenom)}</u><s>pas de pari</s><strong>—</strong></div>`;
      const v = points?.[p.id];
      const perdu = match.vainqueur && pari.choix !== match.vainqueur;
      return `<div class="${p.id === moi ? 'isme' : ''}"><u>${echapper(p.prenom)}</u>`
        + `<s>${echapper(nomCourt(pari.choix === 1 ? p1 : p2))}${NBSP}${pari.confiance}${echapper(setsTexte(pari))}</s>`
        + `<strong class="${perdu ? 'neg' : 'pos'}">${v ? echapper(fmt(ctx, v)) : '—'}</strong></div>`;
    }).join('');
    dessous = `<div class="under"><div class="t">${titre}</div><div class="four" style="--n:${Math.max(1, profils.length)}">${cases}</div></div>`;
  } else if (etat === 'termine-masque') {
    dessous = `<div class="under"><div class="t">Résultat masqué <small>il s’affiche quand tout le monde a parié</small></div>${monPari ? `<p class="small">Ton pari : ${echapper(nomCourt(monPari.choix === 1 ? p1 : p2))}, confiance ${monPari.confiance}${echapper(setsTexte(monPari))}.</p>` : ''}</div>`;
  } else if (etat === 'neutralise') {
    const cases = profils.filter((p) => parisMatch.has(p.id)).map((p) => `<div class="${p.id === moi ? 'isme' : ''}"><u>${echapper(p.prenom)}</u><s>${echapper(nomCourt(parisMatch.get(p.id).choix === 1 ? p1 : p2))}${NBSP}${parisMatch.get(p.id).confiance}</s><strong>0</strong></div>`).join('');
    dessous = `<div class="under"><div class="t">Match neutralisé <small>0 point pour tout le monde</small></div>${cases ? `<div class="four" style="--n:${Math.max(1, profils.length)}">${cases}</div>` : ''}</div>`;
  } else if ((etat === 'revele' || etat === 'en-cours') && match.paris_reveles) {
    // scénarios « Si X gagne » (maquette : état « live »)
    let table = '';
    if (ctx.moteur && parisMatch.size) {
      const scenario = (v) => {
        const paris = {};
        for (const [id, bet] of parisMatch) paris[id] = pariPourMoteur(bet);
        return ctx.moteur.pointsMatch(matchPourMoteur(match, ctx, v), paris) ?? {};
      };
      const s = { 1: scenario(1), 2: scenario(2) };
      const entetes = profils.map((p) => `<th>${echapper(p.prenom)}</th>`).join('');
      const ligne = (v) => `<tr><td>Si ${echapper(noms[v - 1])} gagne</td>${profils.map((p) => {
        const x = s[v][p.id];
        return `<td class="${x && x.comparer(ctx.moteur.ZERO) < 0 ? 'neg' : 'pos'}">${x ? echapper(fmt(ctx, x)) : '—'}</td>`;
      }).join('')}</tr>`;
      table = `<table class="scn"><tr><th></th>${entetes}</tr>${ligne(1)}${ligne(2)}</table>`;
    }
    const note = ctx.categorie === 'grand_slam' ? '<p class="small">Hors bonus de sets, qui dépend du nombre de sets joués.</p>' : '';
    dessous = `<div class="under"><div class="t">Paris révélés <small>le score reste masqué jusqu’à la fin</small></div>${table}${note}<p class="small">Chaque barre est un pari : plus elle monte, plus la confiance est haute.</p></div>`;
  } else if (etat === 'en-cours' || etat === 'verrouille') {
    const titre = etat === 'en-cours' ? 'Match en cours' : 'Paris verrouillés';
    dessous = `<div class="under"><div class="t">${titre} <small>les paris des autres restent cachés tant que tout le monde n’a pas parié</small></div>`
      + `${monPari ? `<p class="small">Ton pari : ${echapper(nomCourt(monPari.choix === 1 ? p1 : p2))}, confiance ${monPari.confiance}${echapper(setsTexte(monPari))}.</p>${htmlPilules(ctx, match, monPari.confiance)}` : '<p class="small">Tu n’as pas parié sur ce match.</p>'}</div>`;
  } else if (!participe) {
    dessous = '<div class="under"><div class="t">Tu ne participes pas à ce match <small>l’administrateur t’en a exclu</small></div></div>';
  } else if (enEdition) {
    const valide = brouillonValide(ctx, brouillon);
    dessous = `<div class="under"><div class="resume" data-resume>${htmlResume(ctx, match, brouillon, noms)}</div>`
      + `${htmlChoixSets(ctx, match, brouillon)}`
      + `${erreur ? `<p class="erreur" role="alert">${echapper(erreur)}</p>` : ''}`
      + `<button type="button" class="btn main" data-action="valider"${valide && !enregistrement ? '' : ' disabled'}>${enregistrement ? 'Enregistrement…' : (monPari ? 'Enregistrer la modification' : 'Valider mon pari')}</button>`
      + `${monPari ? '<button type="button" class="btn alt" data-action="annuler">Annuler la modification</button>' : ''}`
      + `<p class="small">${sousTexteCommun(profils, moi, qui)}</p></div>`;
  } else {
    // pari posé, modifiable
    dessous = `<div class="under"><div class="t">Ton pari : ${echapper(nomCourt(monPari.choix === 1 ? p1 : p2))}, confiance ${monPari.confiance}${echapper(setsTexte(monPari))}</div>`
      + `${htmlPilules(ctx, match, monPari.confiance)}`
      + `${monPari.corrige_par_admin ? '<p class="small">Corrigé par l’administrateur.</p>' : ''}`
      + '<button type="button" class="btn alt" data-action="modifier">Modifier mon pari</button>'
      + `<p class="small">${sousTexteCommun(profils, moi, qui)}</p></div>`;
  }

  return `
    <article class="match carte-filet" data-match="${echapper(match.id)}" data-etat="${etat}">
      <div class="ch"><time>${echapper(formaterHeureParis(match.heure_prevue) || 'Horaire à venir')}</time>${chip(etat, { attendus, participe })}</div>
      <div class="terrain">${htmlTableauScore(match, p1, p2, gagnant)}${terrain}</div>
      ${dessous}
    </article>`;
}

/** Barème d'un tour (maquette : « Barème des quarts de finale »). */
export function htmlBaremeTour(categorie, tour, moteur) {
  if (!moteur) return '';
  const mult = moteur.multiplicateurTour(categorie, tour);
  const multTexte = moteur.formaterPoints(mult);
  const cases = (cle) => [6, 7, 8, 9, 10].map((c) => {
    const g = moteur.gainsPossibles(c, categorie, tour)[cle];
    const neg = g.comparer(moteur.ZERO) < 0;
    return `<div class="v ${cle === 'gagne' ? 'g' : (neg ? 'l' : 'l ok')}">${echapper(moteur.formaterPoints(g, { signe: true }))}</div>`;
  }).join('');
  const rond = [6, 7, 8, 9, 10].map((c) => `<div class="c">${c}</div>`).join('');
  const libelle = (LIBELLES_TOURS[tour] ?? tour).toLowerCase();
  return `<section class="bareme"><h4>Barème : ${echapper(libelle)}</h4>`
    + `<p>Points du match multipliés par ${echapper(multTexte)}. Plus tu es confiant, plus la chute est lourde.</p>`
    + `<div class="grid5"><div class="rl">Confiance</div>${rond}<div class="rl">Gagné</div>${cases('gagne')}<div class="rl">Perdu</div>${cases('perdu')}</div></section>`;
}

/** Points cumulés de chaque parieur sur les matchs comptés d'un tour : Map(idProfil → Fraction), ou null sans moteur. */
export function bilanDuTour(matchs, ctx) {
  if (!ctx.moteur) return null;
  const total = new Map();
  let compte = 0;
  for (const m of matchs) {
    const pts = pointsDuMatch(m, ctx, ctx.paris?.get(m.id) ?? new Map());
    if (!pts) continue;
    compte += 1;
    for (const [id, v] of Object.entries(pts)) total.set(id, (total.get(id) ?? ctx.moteur.ZERO).plus(v));
  }
  return compte ? total : null;
}

/**
 * Matchs sur lesquels la personne connectée peut encore parier et n'a pas parié (pastille « à parier », page d'accueil).
 * Exclus : matchs commencés, verrouillés ou neutralisés, ceux où elle a déjà parié, ceux dont l'administrateur l'a exclue.
 * @returns {Set<number>} identifiants de match
 */
export function matchsAParier(matchs, { moi, paris, qui } = {}) {
  const ids = new Set();
  if (!moi) return ids;
  for (const m of matchs) {
    if (m.neutralise || m.statut !== 'a_venir' || m.verrouille) continue;
    if (paris?.get(m.id)?.has(moi)) continue;
    const q = qui?.get(m.id);
    if (q && !q.has(moi)) continue;
    ids.add(m.id);
  }
  return ids;
}
