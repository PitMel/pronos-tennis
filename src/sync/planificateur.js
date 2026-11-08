// Planificateur : décide QUELS appels faire à l'API (et combien), sans rien appeler. Fonctions pures, testées.
// Règles (cahier des charges, section 10.4, adaptées aux filtres réels de l'API) :
//   * aucun appel entre 1 h et 7 h (heure de Paris) ;
//   * régime « actif » : toutes les 30 min (cadence du cron) dès qu'un match suivi est prévu et non terminé :
//       - 1 lecture des matchs en direct si un match est à surveiller (en cours, ou qui commence dans moins de 30 min, ou en retard) ;
//       - relecture des affiches (matchs à venir d'un tournoi), au plus une fois par heure (7 h – 1 h seulement), et seulement si
//         elles peuvent avoir changé (voir afficheAttendue) : un tour affiché est incomplet, ou la moitié du tour en cours est terminée
//         et le suivant n'est pas encore affiché, ou aucune affiche n'est connue ;
//       - le détail d'un match (GET /matches/{id}) pour confirmer la fin des matchs qui ont disparu du direct (planifié après la lecture du direct) ;
//   * régime « quotidien » sinon : une relecture des affiches par jour et par tournoi ;
//   * jamais plus que le quota du jour moins une réserve ; arrêt immédiat si l'API a annoncé un quota épuisé.

export const PARAMETRES = {
  quotaJour: 100,
  reserve: 10,
  fuseau: 'Europe/Paris',
  heureDebut: 7, // premier créneau actif
  heureFin: 1, // dernier créneau actif : jusqu'à 1 h (exclue)
  avanceMinutes: 30, // surveiller un match qui commence dans moins de 30 minutes
  retardMaxHeures: 8, // un match prévu depuis plus de 8 h n'est plus surveillé automatiquement
  intervalleAffichesActifMin: 60, // une relecture des affiches par heure pendant un tournoi (était 180 jusqu'au 5 nov. 2026)
  intervalleAffichesQuotidienMin: 20 * 60,
  joursAvantDebutAffiches: 3, // tournoi pas commencé : ses affiches ne sont regardées qu'à partir de 3 jours avant son début (calendrier)
  toleranceAffichesMin: 5, // le cron de GitHub se déclenche à quelques minutes près : un passage à 58 min compte comme « une heure »
  maxDetailsParCycle: 6,
};

/** Heure, minute et date (AAAA-MM-JJ) à Paris. */
export function heureLocale(date, fuseau = PARAMETRES.fuseau) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: fuseau, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(date);
  const g = (t) => parts.find((p) => p.type === t).value;
  return { heure: Number(g('hour')), minute: Number(g('minute')), jour: `${g('year')}-${g('month')}-${g('day')}` };
}

export function dansLaFenetre(date, p = PARAMETRES) {
  const { heure } = heureLocale(date, p.fuseau);
  return heure >= p.heureDebut || heure < p.heureFin;
}

const minutes = (a, b) => (a.getTime() - b.getTime()) / 60000;
const date = (x) => (x ? new Date(x) : null);

/** Matchs suivis (non terminés) qui méritent une lecture du direct maintenant. */
export function matchsASurveiller(etat, now, p = PARAMETRES) {
  return (etat.matchs ?? []).filter((m) => {
    if (m.modifie_manuellement) return false;
    if (m.statut === 'en_cours') return true;
    const h = date(m.heure_prevue);
    if (!h) return true; // horaire inconnu : on regarde
    const dans = minutes(h, now); // minutes avant le début (négatif = déjà passé)
    return dans <= p.avanceMinutes && dans >= -p.retardMaxHeures * 60;
  });
}

const ajouterJours = (j, n) => new Date(Date.parse(`${j}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

function jourDansLaFenetre(t, jourParis) {
  if (!t.date_debut || !t.date_fin) return false;
  return jourParis >= ajouterJours(t.date_debut, -1) && jourParis <= ajouterJours(t.date_fin, 1);
}

/**
 * Identifiants d'API à interroger pour un tournoi. Un même tournoi peut en avoir plusieurs dans l'API (ex. Paris : 1725 et 1726) ;
 * dès qu'au moins un d'eux a fourni des matchs (identifiant d'origine enregistré dans la base), on ne garde que ceux-là.
 * Tant qu'aucun n'est confirmé, on les interroge tous.
 */
export function idsAInterroger(t) {
  const tous = (t.api_ids ?? []).map(String);
  const confirmes = (t.api_ids_confirmes ?? []).map(String).filter((id) => tous.includes(id));
  return confirmes.length > 0 ? confirmes : tous;
}

/** Tournoi pas encore commencé et encore trop loin de son début (calendrier) : ses affiches ne sont pas regardées. */
export function tropTotPourLesAffiches(t, jourParis, p = PARAMETRES) {
  const pasCommence = t.etat === 'a_venir' || t.etat === 'pari_tournoi_ouvert';
  if (!pasCommence || !t.date_debut) return false;
  return jourParis < ajouterJours(t.date_debut, -p.joursAvantDebutAffiches);
}

const ORDRE_TOURS = ['RR1', 'RR2', 'RR3', 'R16', 'QF', 'SF', 'F'];
const attendus = (t, tour) => (tour.startsWith('RR') ? 4 : { R16: 8, QF: 4, SF: 2, F: 1 }[tour]);

/**
 * Tournoi en cours : y a-t-il une raison de croire que de nouvelles affiches sont disponibles ?
 * Entrée : t.tours = [{ tour, total, termines }] (matchs connus par tour). Sans cette information : on relit (ancien comportement).
 *  1. aucune affiche connue (le tournoi est dans sa fenêtre de 3 jours, voir tropTotPourLesAffiches) ;
 *  2. un tour déjà affiché est incomplet (moins de matchs que prévu) ;
 *  3. la moitié des matchs du tour en cours sont terminés et le tour suivant n'est pas encore affiché.
 */
export function afficheAttendue(t) {
  if (!Array.isArray(t.tours)) return { attendue: true, motif: 'information indisponible' };
  const tours = [...t.tours].filter((x) => ORDRE_TOURS.includes(x.tour)).sort((a, b) => ORDRE_TOURS.indexOf(a.tour) - ORDRE_TOURS.indexOf(b.tour));
  if (tours.length === 0) return { attendue: true, motif: 'aucune affiche connue' };
  const incomplet = tours.find((x) => x.total < attendus(t, x.tour));
  if (incomplet) return { attendue: true, motif: `tour ${incomplet.tour} incomplet` };
  const courant = tours.find((x) => x.termines < x.total);
  if (courant && courant.tour !== 'F') {
    const suivant = ORDRE_TOURS[ORDRE_TOURS.indexOf(courant.tour) + 1];
    const suivantAffiche = tours.some((x) => x.tour === suivant);
    if (!suivantAffiche && courant.termines * 2 >= courant.total) return { attendue: true, motif: `moitié du tour ${courant.tour} terminée` };
  }
  return { attendue: false, motif: 'toutes les affiches utiles sont connues' };
}

/** Les affiches de ce tournoi doivent-elles être relues maintenant ? */
export function afficheDue(t, etat, now, p = PARAMETRES) {
  if (t.finale_terminee) return { due: false };
  if (tropTotPourLesAffiches(t, heureLocale(now, p.fuseau).jour, p)) return { due: false, tropTot: true };
  const aDesMatchsSuivis = (etat.matchs ?? []).some((m) => m.tournament_id === t.id);
  const enCours = t.etat === 'en_cours' || t.etat === 'pari_tournoi_ouvert';
  const actif = enCours || aDesMatchsSuivis || jourDansLaFenetre(t, heureLocale(now, p.fuseau).jour);
  if (enCours && !afficheAttendue(t).attendue) return { due: false, actif, rien_de_neuf: true };
  const intervalle = actif ? p.intervalleAffichesActifMin : p.intervalleAffichesQuotidienMin;
  const derniere = date(t.derniere_decouverte);
  const due = !derniere || minutes(now, derniere) >= intervalle - (p.toleranceAffichesMin ?? 0);
  return { due, actif };
}

/**
 * @param entree { maintenant: Date, etat (résultat de sync_etat), usage?: {utilise_jour, restant_jour}, parametres? }
 * @returns { regime, raison, restant, actions: [{type:'direct'} | {type:'affiches', tournoi_id, nom, api_id}] }
 */
export function decider({ maintenant, etat, usage = null, parametres = {} }) {
  const p = { ...PARAMETRES, ...parametres };
  const base = { regime: 'repos', raison: '', restant: 0, actions: [] };

  const epuiseJusqua = date(etat.quota_epuise_jusqua);
  if (epuiseJusqua && epuiseJusqua > maintenant) {
    return { ...base, regime: 'quota_epuise', raison: `quota de l'API épuisé jusqu'à ${epuiseJusqua.toISOString()}` };
  }
  if (!dansLaFenetre(maintenant, p)) {
    return { ...base, regime: 'hors_fenetre', raison: `aucun appel entre ${p.heureFin} h et ${p.heureDebut} h (heure de Paris)` };
  }

  const utilise = Math.max(etat.appels_aujourdhui ?? 0, usage?.utilise_jour ?? 0);
  let restant = p.quotaJour - utilise - p.reserve;
  if (usage?.restant_jour !== null && usage?.restant_jour !== undefined) restant = Math.min(restant, usage.restant_jour - p.reserve);
  if (restant <= 0) {
    return { ...base, regime: 'budget_epuise', raison: `budget du jour atteint (${utilise} appels, réserve ${p.reserve})` };
  }

  const tournois = etat.tournois ?? [];
  if (tournois.length === 0) return { ...base, restant, raison: 'aucun tournoi suivi (ni identifiant d\'API)' };

  const actif = (etat.matchs ?? []).length > 0 || tournois.some((t) => t.etat === 'en_cours');
  const actions = [];
  if (matchsASurveiller(etat, maintenant, p).length > 0) actions.push({ type: 'direct' });

  const dus = tournois
    .map((t) => ({ t, ...afficheDue(t, etat, maintenant, p) }))
    .filter((x) => x.due)
    .sort((a, b) => Number(b.t.etat === 'en_cours') - Number(a.t.etat === 'en_cours'));
  for (const { t } of dus) {
    for (const apiId of idsAInterroger(t)) actions.push({ type: 'affiches', tournoi_id: t.id, nom: t.nom, api_id: String(apiId) });
  }

  const retenues = actions.slice(0, restant);
  return {
    regime: actif ? 'actif' : 'quotidien',
    raison: retenues.length === 0 ? 'rien à faire pour le moment' : `${retenues.length} appel(s) prévu(s)${retenues.length < actions.length ? ' (limités par le budget)' : ''}`,
    restant,
    actions: retenues,
  };
}

/**
 * Après la lecture du direct : quels matchs suivis faut-il interroger un par un ?
 * (en cours ou censés avoir commencé, mais absents de la liste du direct => probablement terminés, suspendus ou forfaits)
 */
export function selectionnerDetails({ etat, maintenant, vusEnDirect, restant, parametres = {} }) {
  const p = { ...PARAMETRES, ...parametres };
  if (!(vusEnDirect instanceof Set)) return [];
  const heureRonde = Math.floor(maintenant.getTime() / 1800000) % 2 === 0; // un match « à venir » en retard n'est vérifié qu'une fois par heure
  const candidats = (etat.matchs ?? []).filter((m) => {
    if (m.modifie_manuellement || vusEnDirect.has(String(m.api_id))) return false;
    if (m.statut === 'en_cours') return true;
    const h = date(m.heure_prevue);
    if (!h) return false;
    const retard = minutes(maintenant, h);
    return retard >= p.avanceMinutes && retard <= p.retardMaxHeures * 60 && heureRonde;
  });
  const tries = candidats.sort((a, b) => String(a.heure_prevue ?? '').localeCompare(String(b.heure_prevue ?? '')));
  return tries.slice(0, Math.max(0, Math.min(p.maxDetailsParCycle, restant)));
}
