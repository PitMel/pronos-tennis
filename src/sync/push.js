// Notifications push (web push) : mêmes événements et mêmes trois cases que les courriels (voir notif.js, migration 0018).
// Fonctions pures + passe d'envoi ; l'envoi réel (bibliothèque web-push) est injecté pour pouvoir tester sans réseau.
const TOURS = { R16: 'huitièmes de finale', QF: 'quarts de finale', SF: 'demi-finales', F: 'finale', RR1: 'matchs de poule (Round Robin 1)', RR2: 'matchs de poule (Round Robin 2)', RR3: 'matchs de poule (Round Robin 3)' };

/** Contenu d'une notification push : { titre, texte, url, tag }. Court : un écran de verrouillage n'affiche que deux ou trois lignes. */
export function construirePush(ev, dest, { urlSite } = {}) {
  const nom = ev.tournoi.nom;
  const racine = urlSite ? urlSite.replace(/\/+$/, '') : '';
  const url = `${racine}/#/tournoi/${ev.tournoi.id}`;
  const tour = TOURS[ev.tour] ?? ev.tour;
  if (ev.type === 'tour_ouvert') {
    return { titre: nom, texte: `Les ${tour} sont à parier : toutes les affiches sont connues.`, url, tag: ev.cle };
  }
  if (ev.type === 'paris_visibles') {
    return { titre: nom, texte: `Tout le monde a parié : les paris des ${tour} sont visibles.`, url, tag: ev.cle };
  }
  const premier = ev.classement?.[0];
  const moi = (ev.classement ?? []).find((c) => c.prenom === dest.prenom);
  const fin = premier ? ` ${premier.prenom} l’emporte${moi && moi.rang !== 1 ? `, tu finis ${moi.rang}e` : ''}.` : '';
  return { titre: `${nom} terminé`, texte: `Le tournoi est terminé.${fin}`.trim(), url, tag: ev.cle };
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
