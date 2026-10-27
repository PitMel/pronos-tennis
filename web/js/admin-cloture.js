// Administration de la clôture d'un tournoi (4.4) : aperçu des scores finaux, clôture (même forcée), correction, réouverture.
// Fonctions pures : données → HTML. Le calcul des points vient du moteur partagé (calculerCloture) ; l'enregistrement passe par
// les fonctions réservées à l'administrateur (migration 0006).
import { echapper } from './outils.js';
import { htmlEnteteAdmin } from './admin.js';
import { ETATS } from './tournois.js';

/**
 * Calcule l'aperçu de la clôture. Ne lève jamais : renvoie { calcul } ou { erreur: 'texte français' }.
 * @param {object} moteur  le moteur (import dynamique côté navigateur)
 * @param {object} donnees  réponse de admin_donnees_cloture
 * @param {{vainqueurId?: number|null, finalisteId?: number|null}} imposes
 */
export function apercuCloture({ moteur, donnees, imposes = {} }) {
  const vainqueurId = imposes.vainqueurId ? Number(imposes.vainqueurId) : undefined;
  const finalisteId = imposes.finalisteId ? Number(imposes.finalisteId) : undefined;
  try {
    return { calcul: moteur.calculerCloture(donnees, { vainqueurId, finalisteId }) };
  } catch (e) {
    return { erreur: e.message || 'Calcul impossible.' };
  }
}

/** Raisons pour lesquelles la clôture automatique n'aurait pas lieu (pour avertir l'administrateur d'une clôture forcée). */
export function raisonsClotureForcee(donnees) {
  const raisons = [];
  const s = donnees?.situation;
  if (!s) return raisons;
  if (!s.finale_comptee) raisons.push('La finale n’a pas de vainqueur connu : choisis le vainqueur et le finaliste du tournoi.');
  const avec = (s.groupes ?? []).filter((g) => g.avec_paris);
  if (avec.length === 0) raisons.push('Personne n’a parié dans ce tournoi : l’archive sera vide.');
  for (const g of avec) {
    if (g.matchs_non_reveles > 0) {
      raisons.push(`${g.matchs_non_reveles} match${g.matchs_non_reveles > 1 ? 's' : ''} sans les paris de tous ou sans résultat (groupe ${g.test ? 'test' : 'réel'}) : les joueurs sans pari marqueront 0 point sur ces matchs.`);
    }
  }
  return raisons;
}

/** Erreur de la base → message français (clôture, correction, réouverture). */
export function messageErreurCloture(erreur) {
  const texte = String(erreur?.message ?? erreur ?? '');
  const bas = texte.toLowerCase();
  if (bas.includes('réservé à l') || erreur?.code === '42501' || bas.includes('permission denied')) return 'Action refusée : réservée à l’administrateur.';
  if (bas.includes('incomplets')) return 'Les joueurs concernés ont changé depuis l’affichage : recharge la page, puis recommence.';
  if (bas.includes('différents')) return 'Le vainqueur et le finaliste doivent être deux joueurs différents.';
  if (bas.includes('inconnu')) return 'Ce tournoi n’existe plus.';
  if (bas.includes('could not find the function') || erreur?.code === 'PGRST202' || erreur?.code === '42883') return 'La base n’est pas à jour (migration 0006 manquante).';
  if (bas.includes('failed to fetch') || bas.includes('network')) return 'Action impossible : vérifie ta connexion internet.';
  return 'L’opération a échoué. Réessaie dans un instant.';
}

const nomProfil = (profils, id) => profils.get(id)?.prenom ?? 'Joueur inconnu';

function tableGroupe({ moteur, groupe, calcul, profils, archive }) {
  const lignes = calcul.resultats.filter((r) => groupe.joueurs.includes(r.joueur_id)).sort((a, b) => a.rang - b.rang || nomProfil(profils, a.joueur_id).localeCompare(nomProfil(profils, b.joueur_id), 'fr'));
  const pts = (t) => moteur.formaterPoints(moteur.Fraction.de(t), { signe: false });
  const bonus = (t) => (moteur.Fraction.de(t).estNul() ? '–' : `+${pts(t)}`);
  const ecart = (r) => {
    const a = archive.find((x) => x.joueur_id === r.joueur_id);
    return !a || String(a.score_final) !== String(r.score_final) || a.rang !== r.rang;
  };
  const corps = lignes.map((r) => `
        <tr${archive.length && ecart(r) ? ' class="ecart"' : ''}><td class="nom">${echapper(nomProfil(profils, r.joueur_id))}</td>
          <td>${echapper(pts(r.points_matchs))}</td><td>${echapper(pts(r.points_pari_tournoi))}</td><td>${echapper(bonus(r.bonus_classement))}</td>
          <td><b>${echapper(pts(r.score_final))}</b></td><td>${echapper(r.rang)}</td></tr>`).join('');
  return `
    <h4>Groupe ${groupe.test ? 'test' : 'réel'}</h4>
    <div class="tableau-defilant"><table class="tableau-classement"><thead><tr><th>Joueur</th><th>Matchs</th><th>Pari</th><th>Bonus</th><th>Total</th><th>Rang</th></tr></thead><tbody>${corps}</tbody></table></div>`;
}

/**
 * Page « Clôture » d'un tournoi.
 * @param {{moteur: object, tournoi: object, donnees: object, profils: Map, joueurs: Map, archive: Array, imposes?: object, message?: string, erreurs?: string[]}} o
 *   joueurs : Map id → joueur de tennis (ceux du tournoi) ; archive : lignes de tournament_results de ce tournoi.
 */
export function htmlClotureAdmin({ moteur, tournoi, donnees, profils, joueurs, archive = [], imposes = {}, message = '', erreurs = [] }) {
  const clos = donnees.etat === 'clos';
  const sel = {
    vainqueurId: imposes.vainqueurId ?? (clos ? tournoi.vainqueur_id : donnees.resultat?.vainqueur_id) ?? '',
    finalisteId: imposes.finalisteId ?? (clos ? tournoi.finaliste_id : donnees.resultat?.finaliste_id) ?? '',
  };
  const { calcul, erreur } = apercuCloture({ moteur, donnees, imposes: sel });
  const choix = (nom, courant, libelle) => `
      <div class="champ"><label for="c-${nom}">${echapper(libelle)}</label>
        <select id="c-${nom}" name="${nom}" data-admin-cloture><option value="">— choisir —</option>${[...joueurs.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
    .map((j) => `<option value="${echapper(j.id)}"${String(courant) === String(j.id) ? ' selected' : ''}>${echapper(j.nom)}</option>`).join('')}</select></div>`;
  const raisons = clos ? [] : raisonsClotureForcee(donnees);
  const archiveDiffere = clos && calcul && (archive.length !== calcul.resultats.length
    || calcul.resultats.some((r) => { const a = archive.find((x) => x.joueur_id === r.joueur_id); return !a || String(a.score_final) !== String(r.score_final) || a.rang !== r.rang; })
    || String(tournoi.vainqueur_id) !== String(sel.vainqueurId) || String(tournoi.finaliste_id) !== String(sel.finalisteId));
  const tables = calcul
    ? donnees.groupes.map((g) => tableGroupe({ moteur, groupe: g, calcul, profils, archive: clos ? archive : [] })).join('') || '<p class="vide">Personne n’a parié : rien à calculer.</p>'
    : '';
  const peutAgir = Boolean(calcul);
  const etatTexte = ETATS[donnees.etat] ?? donnees.etat;
  return `
    ${htmlEnteteAdmin(`Clôture · ${tournoi.nom}`, { retour: { href: `#/admin/tournoi/${encodeURIComponent(tournoi.id)}`, texte: 'Fiche du tournoi' }, details: `État : ${etatTexte}.` })}
    ${message ? `<p class="succes" role="status">${echapper(message)}</p>` : ''}
    <section class="carte carte-admin">
      <h3>Vainqueur et finaliste du tournoi</h3>
      <p class="small">Proposés d’après la finale quand elle est terminée ; modifiables si besoin. Ils servent au pari tournoi.</p>
      <div class="deux">${choix('vainqueurId', sel.vainqueurId, 'Vainqueur')}${choix('finalisteId', sel.finalisteId, 'Finaliste')}</div>
    </section>
    <section class="carte carte-admin">
      <h3>${clos ? 'Scores finaux recalculés' : 'Aperçu des scores finaux'}</h3>
      ${erreur ? `<p class="erreur" role="alert">${echapper(erreur)}</p>` : tables}
      ${clos && calcul ? `<p class="small">${archiveDiffere ? '<b>L’archive enregistrée diffère de ce calcul</b> (lignes surlignées) : corrige la clôture pour la mettre à jour.' : 'L’archive enregistrée est à jour.'}</p>` : ''}
      ${raisons.length ? `<div class="avertissement"><b>Clôture manuelle</b><ul>${raisons.map((r) => `<li>${echapper(r)}</li>`).join('')}</ul></div>` : ''}
      ${erreurs.map((e) => `<p class="erreur" role="alert">${echapper(e)}</p>`).join('')}
      <div class="actions-admin">
        ${clos
    ? `<button type="button" class="btn main" data-action="ad-cloturer" data-tournoi="${echapper(tournoi.id)}"${peutAgir && archiveDiffere ? '' : ' disabled'}>Corriger la clôture</button>
           <button type="button" class="btn-petit danger" data-action="ad-rouvrir" data-tournoi="${echapper(tournoi.id)}">Rouvrir le tournoi</button>`
    : `<button type="button" class="btn main" data-action="ad-cloturer" data-tournoi="${echapper(tournoi.id)}" data-force="${raisons.length ? '1' : ''}"${peutAgir ? '' : ' disabled'}>${raisons.length ? 'Clôturer quand même' : 'Clôturer le tournoi'}</button>`}
      </div>
      ${clos ? '<p class="small">Rouvrir efface l’archive et remet le tournoi « en cours » ; la clôture automatique ne s’applique plus à lui, tu le reclôtures toi-même.</p>' : '<p class="small">Clôturer fige les scores, révèle les paris restants et alimente la Race.</p>'}
    </section>`;
}
