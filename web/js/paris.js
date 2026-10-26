// Aides pures autour des paris de match : ordre des colonnes, regroupement des lignes de la base, messages d'erreur.

/** Le compte connecté d'abord (colonne tout à gauche), puis les autres par prénom. */
export function ordonnerProfils(profils, moi) {
  const autres = profils.filter((p) => p.id !== moi).sort((a, b) => a.prenom.localeCompare(b.prenom, 'fr'));
  const mien = profils.find((p) => p.id === moi);
  return mien ? [mien, ...autres] : autres;
}

/** Lignes de la table bets → Map(idMatch → Map(idProfil → pari)). */
export function regrouperParis(lignes) {
  const parMatch = new Map();
  for (const l of lignes ?? []) {
    if (!parMatch.has(l.match_id)) parMatch.set(l.match_id, new Map());
    parMatch.get(l.match_id).set(l.joueur_id, l);
  }
  return parMatch;
}

/** Lignes de qui_a_parie → Map(idProfil → a parié). */
export function regrouperQui(lignes) {
  return new Map((lignes ?? []).map((l) => [l.joueur_id, Boolean(l.a_parie)]));
}

/** Pari existant → brouillon de modification. */
export function brouillonDepuisPari(bet) {
  return { choix: bet.choix, confiance: bet.confiance, ...(bet.sets ? { sets: bet.sets } : {}) };
}

/** Brouillon → valeurs à enregistrer (sets seulement en Grand Chelem). */
export function pariAEnregistrer(brouillon, categorie) {
  const pari = { choix: brouillon.choix, confiance: brouillon.confiance };
  if (categorie === 'grand_slam') pari.sets = brouillon.sets;
  return pari;
}

export const MESSAGE_PARI_FERME = 'Ton pari n’a pas été enregistré : le match a commencé ou tout le monde a déjà parié.';

/** Erreur de la base → message français pour le joueur. */
export function messageErreurPari(erreur) {
  const texte = String(erreur?.message ?? erreur ?? '');
  const bas = texte.toLowerCase();
  if (erreur?.code === 'PARI_FERME' || erreur?.code === '42501' || bas.includes('row-level security')) return MESSAGE_PARI_FERME;
  if (bas.includes('failed to fetch') || bas.includes('network')) return 'Enregistrement impossible : vérifie ta connexion internet.';
  // messages écrits en français par la base (« En Grand Chelem, indique le nombre de sets… »)
  if (/grand chelem|éliminé/i.test(texte)) return texte;
  return 'Ton pari n’a pas pu être enregistré. Réessaie dans un instant.';
}
