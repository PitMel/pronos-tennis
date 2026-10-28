// Changement de mot de passe par le joueur lui-même. Aucun secret : Supabase Auth, avec la session du joueur connecté.
import { echapper } from './outils.js';

export const LONGUEUR_MIN = 8;

/** Valide le formulaire (valeurs brutes). Renvoie la liste des erreurs, en français. */
export function validerMotDePasse({ actuel = '', nouveau = '', confirmation = '' }) {
  const erreurs = [];
  if (!actuel) erreurs.push('Saisis ton mot de passe actuel.');
  if (nouveau.length < LONGUEUR_MIN) erreurs.push(`Le nouveau mot de passe doit faire au moins ${LONGUEUR_MIN} caractères.`);
  else if (nouveau === actuel) erreurs.push('Le nouveau mot de passe doit être différent de l’actuel.');
  if (nouveau !== confirmation) erreurs.push('La confirmation ne correspond pas au nouveau mot de passe.');
  return erreurs;
}

/** Erreur de Supabase Auth → message français. */
export function messageErreurMotDePasse(erreur, { etape = 'changement' } = {}) {
  const texte = String(erreur?.message ?? erreur ?? '').toLowerCase();
  if (etape === 'verification' && (texte.includes('invalid login') || texte.includes('invalid credentials'))) return 'Ton mot de passe actuel est incorrect.';
  if (texte.includes('same password') || texte.includes('different from the old')) return 'Le nouveau mot de passe doit être différent de l’actuel.';
  if (texte.includes('weak') || texte.includes('at least') || texte.includes('should be')) return 'Ce mot de passe est trop faible : choisis-en un plus long ou plus varié.';
  if (texte.includes('rate limit') || texte.includes('too many')) return 'Trop de tentatives : attends une minute avant de réessayer.';
  if (texte.includes('failed to fetch') || texte.includes('network')) return 'Action impossible : vérifie ta connexion internet.';
  return 'Le changement a échoué. Réessaie dans un instant.';
}

export function htmlPageMotDePasse({ erreurs = [], message = '' } = {}) {
  return `
    <section class="carte">
      <h2>Changer mon mot de passe</h2>
      ${message ? `<p class="succes" role="status">${echapper(message)}</p>` : ''}
      <form class="formulaire-admin" data-mdp novalidate>
        <div class="champ"><label for="mdp-actuel">Mot de passe actuel</label><input id="mdp-actuel" name="actuel" type="password" autocomplete="current-password"></div>
        <div class="champ"><label for="mdp-nouveau">Nouveau mot de passe</label><input id="mdp-nouveau" name="nouveau" type="password" autocomplete="new-password" minlength="${LONGUEUR_MIN}">
          <p class="small">Au moins ${LONGUEUR_MIN} caractères.</p></div>
        <div class="champ"><label for="mdp-confirmation">Confirmer le nouveau mot de passe</label><input id="mdp-confirmation" name="confirmation" type="password" autocomplete="new-password"></div>
        ${erreurs.map((e) => `<p class="erreur" role="alert">${echapper(e)}</p>`).join('')}
        <button type="submit" class="btn main">Changer le mot de passe</button>
      </form>
    </section>`;
}
