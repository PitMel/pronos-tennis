// Connexion « nom + mot de passe » : le joueur ne voit que son prénom ;
// Supabase Auth, lui, a besoin d'une adresse e-mail. On en fabrique une, fictive et stable
// (« André » → andre@pronos.invalid), identique à celle saisie à la création des comptes.

export const DOMAINE_TECHNIQUE = 'pronos.invalid';

/** Prénom saisi → adresse technique, ou null si le prénom est vide. */
export function emailTechnique(nom) {
  const radical = String(nom ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // accents
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return radical ? `${radical}@${DOMAINE_TECHNIQUE}` : null;
}

/** Message d'erreur de Supabase Auth → message français. */
export function messageErreurConnexion(erreur) {
  const texte = String(erreur?.message ?? erreur ?? '').toLowerCase();
  if (texte.includes('invalid login') || texte.includes('invalid credentials')) return 'Nom ou mot de passe incorrect.';
  if (texte.includes('email not confirmed')) return 'Ce compte n’est pas encore activé : préviens Pierre.';
  if (texte.includes('rate limit') || texte.includes('too many')) return 'Trop de tentatives : attends une minute avant de réessayer.';
  if (texte.includes('failed to fetch') || texte.includes('network')) return 'Connexion impossible : vérifie ta connexion internet.';
  return 'La connexion a échoué. Réessaie, ou préviens Pierre si cela continue.';
}
