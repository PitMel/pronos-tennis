// Notifications push (web push) : mêmes événements et mêmes trois cases que les courriels (voir notif.js, migration 0018).
// Fonctions pures + passe d'envoi ; l'envoi réel (bibliothèque web-push) est injecté pour pouvoir tester sans réseau.
import { pointsPari, formaterPoints } from '../moteur/index.js';

const TOURS = { R16: 'huitièmes de finale', QF: 'quarts de finale', SF: 'demi-finales', F: 'finale', RR1: 'matchs de poule (Round Robin 1)', RR2: 'matchs de poule (Round Robin 2)', RR3: 'matchs de poule (Round Robin 3)' };

const AFFICHES = { R16: 'huitièmes', QF: 'quarts', SF: 'demies', RR1: 'matchs de poule (Round Robin 1)', RR2: 'matchs de poule (Round Robin 2)', RR3: 'matchs de poule (Round Robin 3)' };

/** Titre des notifications : le lieu (ville) du tournoi, sauf Grands Chelems et ATP Finals (leur nom). */
export function libelleTournoi(t) {
  return t.categorie === 'grand_slam' || t.categorie === 'atp_finals' ? t.nom : (t.ville || t.nom);
}

/** Contenu d'une notification push : { titre, texte, url, tag }. Court : un écran de verrouillage n'affiche que deux ou trois lignes. */
export function construirePush(ev, dest, { urlSite } = {}) {
  const nom = libelleTournoi(ev.tournoi);
  const racine = urlSite ? urlSite.replace(/\/+$/, '') : '';
  const url = `${racine}/#/tournoi/${ev.tournoi.id}`;
  const tour = TOURS[ev.tour] ?? ev.tour;
  if (ev.type === 'tour_ouvert') {
    const texte = ev.tour === 'F' ? 'L’affiche de la finale est connue : ton pari est attendu.' : `Les affiches des ${AFFICHES[ev.tour] ?? tour} sont connues : tes paris sont attendus.`;
    return { titre: `${nom} - Paris à poser`, texte, url, tag: ev.cle };
  }
  if (ev.type === 'paris_visibles') {
    return { titre: `${nom} - Paris visibles`, texte: `Tout le monde a parié : les paris des ${tour} sont visibles.`, url, tag: ev.cle };
  }
  if (ev.type === 'match_termine') {
    const { p1, p2, vainqueur, sets_joues: setsJoues, fin_match: finMatch } = ev.match;
    const [gagnant, perdant] = vainqueur === 1 ? [p1, p2] : [p2, p1];
    const match = { categorie: ev.tournoi.categorie, tour: ev.tour, vainqueur, setsJoues, finMatch: finMatch ?? 'normal', neutralise: false };
    const lignes = (ev.paris ?? []).map((x) => {
      try {
        const pts = pointsPari({ choix: x.choix, confiance: x.confiance, sets: x.sets ?? null }, match);
        return { prenom: x.prenom, pts, texte: `${x.prenom} ${formaterPoints(pts, { signe: true })}` };
      } catch { return { prenom: x.prenom, pts: null, texte: `${x.prenom} —` }; }
    }).sort((a, b) => (a.pts && b.pts ? b.pts.comparer(a.pts) : Number(Boolean(b.pts)) - Number(Boolean(a.pts))) || a.prenom.localeCompare(b.prenom, 'fr'));
    return { titre: `${nom} - ${gagnant} bat ${perdant}`, texte: lignes.map((l) => l.texte).join(' · '), url, tag: ev.cle };
  }
  const premier = ev.classement?.[0];
  const moi = (ev.classement ?? []).find((c) => c.prenom === dest.prenom);
  const texte = !premier ? '' : moi?.rang === 1 ? 'Tu remportes le tournoi !' : `${premier.prenom} l’emporte${moi ? `, tu finis ${moi.rang}e` : ''}.`;
  return { titre: `${nom} - Terminé`, texte, url, tag: ev.cle };
}

/**
 * Passe d'envoi push : un message par abonnement, un seul marquage par (événement, joueur) dès qu'au moins un appareil l'a reçu.
 * Un abonnement refusé définitivement par le service de push (404 ou 410 : appli désinstallée, autorisation retirée) est supprimé.
 * Une erreur passagère ne marque rien : le message repartira au passage suivant.
 */
export async function executerPush({ base, envoyer, urlSite, journal = () => {}, limite = 100 }) {
  const bilan = { evenements: 0, envoyes: 0, echecs: 0, supprimes: 0 };
  const evenements = (await base.notifAFaire()) ?? [];
  let total = 0;
  for (const ev of evenements) {
    const destinataires = ev.push_destinataires ?? [];
    if (destinataires.length) bilan.evenements += 1;
    for (const dest of destinataires) {
      const contenu = construirePush(ev, dest, { urlSite });
      let recu = false;
      for (const abo of dest.abonnements ?? []) {
        if (total >= limite) { journal('limite de messages push par passage atteinte : le reste partira au prochain passage'); return bilan; }
        total += 1;
        try {
          await envoyer(abo, contenu);
          recu = true;
          bilan.envoyes += 1;
        } catch (e) {
          if (e?.statusCode === 404 || e?.statusCode === 410) {
            bilan.supprimes += 1;
            try { await base.pushSupprimer(abo.endpoint); } catch { /* sera retenté */ }
          } else {
            bilan.echecs += 1;
            journal(`échec push (${ev.cle}, ${dest.prenom}) : ${e?.statusCode ?? ''} ${String(e?.message ?? e).slice(0, 120)}`.trim());
          }
        }
      }
      if (recu) await base.notifMarquer(`push:${ev.cle}`, dest.joueur_id);
    }
  }
  journal(`push : ${bilan.evenements} événement(s), ${bilan.envoyes} message(s) envoyé(s), ${bilan.echecs} échec(s), ${bilan.supprimes} abonnement(s) supprimé(s)`);
  return bilan;
}
