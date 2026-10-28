// Administration des comptes (4.6) : liste des comptes, couleur, activation, groupe (réel ou test).
// Le prénom n'est PAS modifiable ici : la connexion se fait avec une adresse technique dérivée du prénom
// (« André » → andre@pronos.invalid, voir identifiants.js) ; renommer un compte sans changer cette adresse l'empêcherait de se connecter.
// La création de compte et le changement de mot de passe exigent la clé secrète de Supabase : ils ne se font pas depuis le navigateur.
import { echapper } from './outils.js';
import { htmlEnteteAdmin } from './admin.js';
import { htmlPastille } from './vues.js';

export const PALETTE = [
  ['#2F6CC2', 'Bleu'], ['#D8A21E', 'Or'], ['#0F766E', 'Vert'], ['#C2410C', 'Orange'], ['#7C3AED', 'Violet'],
  ['#BE185D', 'Rose'], ['#475569', 'Ardoise'], ['#15803D', 'Prairie'], ['#B91C1C', 'Rouge'], ['#0E7490', 'Turquoise'],
];
const COULEUR = /^#[0-9A-Fa-f]{6}$/;

/** Valide le formulaire d'un compte (valeurs brutes). */
export function validerCompte(v) {
  const erreurs = [];
  const c = String(v.couleur ?? '').trim();
  if (c !== '' && !COULEUR.test(c)) erreurs.push('Couleur invalide.');
  return erreurs;
}

/** Valeurs du formulaire → colonnes modifiables de profiles (le prénom n'en fait pas partie). */
export function comptePourBase(v) {
  const c = String(v.couleur ?? '').trim();
  return {
    couleur: c === '' ? null : c.toUpperCase(),
    actif: v.actif === true || v.actif === 'on',
    is_test: v.is_test === true || v.is_test === 'on',
  };
}

/** Erreur de la base → message français. */
export function messageErreurCompte(erreur) {
  const texte = String(erreur?.message ?? erreur ?? '');
  const bas = texte.toLowerCase();
  if (erreur?.code === '23505') return 'Un compte de ce prénom existe déjà dans ce groupe : le changement de groupe est impossible.';
  if (erreur?.code === '42501' || bas.includes('row-level security') || bas.includes('seul l')) return 'Action refusée : réservée à l’administrateur.';
  if (bas.includes('failed to fetch') || bas.includes('network')) return 'Enregistrement impossible : vérifie ta connexion internet.';
  return 'L’enregistrement a échoué. Réessaie dans un instant.';
}

function ligneCompte(p, moi) {
  return `
      <li><a class="ligne-admin" href="#/admin/compte/${encodeURIComponent(p.id)}">
        <span class="ligne-compte">${htmlPastille(p)}<span><b>${echapper(p.prenom)}</b>${p.id === moi ? ' <small>(toi)</small>' : ''}<small>${p.is_admin ? 'Administrateur' : 'Joueur'}</small></span></span>
        <span class="etiquettes">${p.actif ? '' : '<em class="etat-clos">Désactivé</em>'}</span>
      </a></li>`;
}

/** Liste des comptes, par groupe. */
export function htmlComptesAdmin({ profils, moi, message = '' }) {
  const groupe = (test) => [...profils].filter((p) => Boolean(p.is_test) === test).sort((a, b) => a.prenom.localeCompare(b.prenom, 'fr'));
  const section = (titre, liste, vide) => `
    <section class="carte carte-admin"><h3>${echapper(titre)}</h3>
      ${liste.length ? `<ul class="liste-admin">${liste.map((p) => ligneCompte(p, moi)).join('')}</ul>` : `<p class="vide">${echapper(vide)}</p>`}
    </section>`;
  return `
    ${htmlEnteteAdmin('Comptes', { retour: { href: '#/admin', texte: 'Administration' }, details: 'Les joueurs, leur couleur, leur activation et leur groupe.' })}
    ${message ? `<p class="succes" role="status">${echapper(message)}</p>` : ''}
    ${section('Groupe réel', groupe(false), 'Aucun compte réel.')}
    ${section('Groupe test (faux comptes)', groupe(true), 'Aucun faux compte.')}
    <section class="carte carte-admin"><h3>Ajouter un compte, changer un mot de passe</h3>
      <p class="small">Ces deux actions demandent la clé secrète de Supabase : elles ne se font pas depuis l’application. La procédure est dans <code>supabase/comptes.sql</code> (création) et dans le tableau de bord Supabase, rubrique Authentication (mot de passe).</p>
    </section>`;
}

/** Formulaire d'un compte. */
export function htmlFormulaireCompte({ profil, moi, valeurs = null, erreurs = [], message = '' }) {
  const v = valeurs ?? { couleur: profil.couleur ?? '', actif: profil.actif, is_test: profil.is_test };
  const soiMeme = profil.id === moi;
  const couleurs = [['', 'Aucune (bleu par défaut)'], ...PALETTE];
  const pastilles = couleurs.map(([hex, nom]) => `
        <label class="choix-couleur"><input type="radio" name="couleur" value="${echapper(hex)}"${String(v.couleur ?? '').toUpperCase() === hex.toUpperCase() ? ' checked' : ''}>
          <span class="echantillon" style="background:${hex || '#2F6CC2'}"></span><span class="nom-couleur">${echapper(nom)}</span></label>`).join('');
  const groupeChange = Boolean(v.is_test) !== Boolean(profil.is_test);
  const form = `
    <form class="formulaire-admin" data-admin="compte" data-id="${echapper(profil.id)}" novalidate>
      <p class="small">Prénom : <b>${echapper(profil.prenom)}</b>. Il ne se modifie pas ici : l’adresse de connexion en dépend.</p>
      <fieldset class="couleurs-admin"><legend>Couleur</legend>${pastilles}</fieldset>
      <div class="champ case"><label><input name="actif" type="checkbox"${v.actif ? ' checked' : ''}${soiMeme ? ' disabled' : ''}> Compte actif</label>
        <p class="small">${soiMeme ? 'Tu ne peux pas désactiver ton propre compte.' : 'Un compte désactivé ne peut plus parier et n’est plus compté dans « tous ont parié ». Ses scores déjà archivés restent.'}</p></div>
      <div class="champ case"><label><input name="is_test" type="checkbox"${v.is_test ? ' checked' : ''}${soiMeme ? ' disabled' : ''}> Faux compte (groupe test)</label>
        <p class="small">${soiMeme ? 'Ton compte reste dans le groupe réel.' : 'Les faux comptes ne se mélangent jamais aux vrais : classements, paris et archives sont séparés.'}</p></div>
      ${groupeChange ? '<div class="avertissement"><b>Changement de groupe</b><p>Le compte change de groupe : ses paris passent avec lui, mais ses archives de tournois clos restent affichées dans l’ancien classement tant qu’elles ne sont pas recalculées. À éviter en dehors des essais.</p></div>' : ''}
      ${erreurs.map((e) => `<p class="erreur" role="alert">${echapper(e)}</p>`).join('')}
      <button type="submit" class="btn main">Enregistrer</button>
    </form>`;
  return `
    ${htmlEnteteAdmin(`Compte · ${profil.prenom}`, { retour: { href: '#/admin/comptes', texte: 'Comptes' }, details: `${profil.is_admin ? 'Administrateur' : 'Joueur'} · groupe ${profil.is_test ? 'test' : 'réel'}${profil.actif ? '' : ' · désactivé'}` })}
    ${message ? `<p class="succes" role="status">${echapper(message)}</p>` : ''}
    <section class="carte carte-admin">${form}</section>`;
}
