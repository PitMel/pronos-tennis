// Page Profil : photo (vraie photo, réduite dans le navigateur), couleur, mot de passe.
// Les mêmes blocs « photo » et « couleur » servent à l'administrateur pour un autre compte (admin-comptes.js).
import { echapper } from './outils.js';
import { htmlPastille } from './vues.js';
import { htmlPageMotDePasse } from './mot-de-passe.js';

export const PALETTE = [
  ['#2F6CC2', 'Bleu'], ['#D8A21E', 'Or'], ['#0F766E', 'Vert'], ['#C2410C', 'Orange'], ['#7C3AED', 'Violet'],
  ['#BE185D', 'Rose'], ['#475569', 'Ardoise'], ['#15803D', 'Prairie'], ['#B91C1C', 'Rouge'], ['#0E7490', 'Turquoise'],
];
export const TAILLE_PHOTO = 256;
export const TYPES_PHOTO = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
export const TAILLE_FICHIER_MAX = 15 * 1024 * 1024; // photo d'origine (réduite ensuite à quelques dizaines de Ko)

/** Carré centré dans une image largeur × hauteur : { sx, sy, cote }. */
export function carreCentre(largeur, hauteur) {
  const cote = Math.min(largeur, hauteur);
  return { sx: Math.floor((largeur - cote) / 2), sy: Math.floor((hauteur - cote) / 2), cote };
}

/** Contrôle du fichier choisi (avant toute lecture). Renvoie un message d'erreur ou null. */
export function erreurFichierPhoto(fichier) {
  if (!fichier) return 'Aucune photo choisie.';
  if (fichier.type && !TYPES_PHOTO.includes(fichier.type) && !String(fichier.type).startsWith('image/')) return 'Ce fichier n’est pas une image.';
  if (fichier.size > TAILLE_FICHIER_MAX) return 'Cette photo est trop lourde (15 Mo au plus).';
  return null;
}

/** Erreur de la base ou du stockage → message français. */
export function messageErreurPhoto(erreur) {
  const texte = String(erreur?.message ?? erreur ?? '').toLowerCase();
  if (texte.includes('row-level security') || texte.includes('unauthorized') || erreur?.code === '42501') return 'Action refusée : tu ne peux modifier que ta propre photo.';
  if (texte.includes('too large') || texte.includes('exceeded') || texte.includes('maximum allowed size')) return 'La photo est trop lourde même réduite : essaie une autre image.';
  if (texte.includes('mime') || texte.includes('invalid')) return 'Ce format d’image n’est pas accepté.';
  if (texte.includes('failed to fetch') || texte.includes('network')) return 'Envoi impossible : vérifie ta connexion internet.';
  return 'La photo n’a pas pu être enregistrée. Réessaie dans un instant.';
}

/** Bloc photo : pastille actuelle, choix d'un fichier, retrait. `profil` = compte concerné. */
export function htmlBlocPhoto({ profil, autre = false, erreur = '', message = '' }) {
  const a = autre ? 'Photo de ce joueur' : 'Ma photo';
  return `
    <section class="carte carte-admin bloc-photo" data-bloc-photo="${echapper(profil.id)}">
      <h3>${a}</h3>
      <div class="ligne-photo">${htmlPastille(profil, 'pastille pastille-grande')}
        <div>
          <label class="btn-petit principal btn-fichier">${profil.photo_url ? 'Remplacer la photo' : 'Choisir une photo'}
            <input type="file" accept="image/*" data-photo="${echapper(profil.id)}" hidden></label>
          ${profil.photo_url ? `<button type="button" class="btn-petit danger" data-action="photo-retirer" data-profil="${echapper(profil.id)}">Retirer la photo</button>` : ''}
        </div>
      </div>
      <p class="small">${autre ? 'En tant qu’administrateur, tu peux remplacer ou retirer la photo de n’importe quel joueur.' : 'La photo est recadrée au carré et réduite automatiquement. Elle s’affiche dans les classements et à côté des paris, pour ton groupe.'}</p>
      ${message ? `<p class="succes" role="status">${echapper(message)}</p>` : ''}
      ${erreur ? `<p class="erreur" role="alert">${echapper(erreur)}</p>` : ''}
    </section>`;
}

/** Bloc couleur (compte courant). */
export function htmlBlocCouleur({ profil, message = '', erreur = '' }) {
  const courant = String(profil.couleur ?? '').toUpperCase();
  const choix = [['', 'Aucune (bleu par défaut)'], ...PALETTE].map(([hex, nom]) => `
        <label class="choix-couleur"><input type="radio" name="couleur" value="${echapper(hex)}"${courant === hex.toUpperCase() ? ' checked' : ''}>
          <span class="echantillon" style="background:${hex || '#2F6CC2'}"></span><span class="nom-couleur">${echapper(nom)}</span></label>`).join('');
  return `
    <section class="carte carte-admin">
      <h3>Ma couleur</h3>
      <form class="formulaire-admin" data-profil-couleur novalidate>
        <fieldset class="couleurs-admin"><legend class="small">Elle colore ta pastille quand tu n’as pas de photo.</legend>${choix}</fieldset>
        ${message ? `<p class="succes" role="status">${echapper(message)}</p>` : ''}
        ${erreur ? `<p class="erreur" role="alert">${echapper(erreur)}</p>` : ''}
        <button type="submit" class="btn-petit principal">Enregistrer la couleur</button>
      </form>
    </section>`;
}

export const NOTIFICATIONS = [
  ['tour_ouvert', 'Les affiches d’un tour sont toutes connues (pour parier)'],
  ['paris_visibles', 'Les paris d’un tour sont tous visibles (tout le monde a parié)'],
  ['tournoi_termine', 'Un tournoi est terminé (résultat et état de la Race)'],
];

/** Adresse e-mail valide (même règle que la base) ? Chaîne vide acceptée (= pas de notification). */
export function emailValide(texte) {
  const t = String(texte ?? '').trim();
  return t === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t);
}

/** Bloc « Notifications par e-mail » : adresse + une case par notification (toutes cochées par défaut). */
export function htmlBlocNotifications({ prefs = null, message = '', erreur = '' } = {}) {
  const p = prefs ?? { email: '', tour_ouvert: true, paris_visibles: true, tournoi_termine: true };
  const cases = NOTIFICATIONS.map(([cle, texte]) => `
        <label class="radio"><input type="checkbox" name="${cle}"${p[cle] !== false ? ' checked' : ''}> ${echapper(texte)}</label>`).join('');
  return `
    <section class="carte carte-admin">
      <h3>Notifications par e-mail</h3>
      <form class="formulaire-admin" data-profil-notif novalidate>
        <label for="notif-email">Mon adresse e-mail</label>
        <input id="notif-email" name="email" type="email" autocomplete="email" inputmode="email" value="${echapper(p.email ?? '')}" placeholder="prenom@exemple.fr">
        <p class="small">Elle ne sert qu’aux notifications (ce n’est pas ton identifiant de connexion) et n’est visible que de toi et de l’administrateur. Laisse vide pour ne rien recevoir.</p>
        <fieldset class="couleurs-admin"><legend class="small">Je veux être prévenu quand :</legend>${cases}</fieldset>
        ${message ? `<p class="succes" role="status">${echapper(message)}</p>` : ''}
        ${erreur ? `<p class="erreur" role="alert">${echapper(erreur)}</p>` : ''}
        <button type="submit" class="btn-petit principal">Enregistrer</button>
      </form>
    </section>`;
}

/** Bloc « Installer l'appli » : explications statiques (Android / iPhone). */
export function htmlBlocInstallation() {
  return `
    <section class="carte carte-admin" data-installer>
      <h3>Installer l’appli</h3>
      <p class="small">Pour l’ouvrir comme une vraie appli, avec son icône sur ton écran d’accueil :</p>
      <ul class="aide-installation">
        <li><strong>iPhone (Safari)</strong> : bouton Partager, puis « Sur l’écran d’accueil ».</li>
        <li><strong>Android (Chrome)</strong> : menu ⋮, puis « Installer l’application » (ou « Ajouter à l’écran d’accueil »).</li>
        <li><strong>Ordinateur (Chrome ou Edge)</strong> : icône d’installation à droite de la barre d’adresse.</li>
      </ul>
    </section>`;
}

/** Page Profil complète. */
export function htmlPageProfil({ profil, photo = {}, couleur = {}, motDePasse = {}, notifications = {} }) {
  return `
    <section class="hero hero-admin"><h2 class="hero-titre">${echapper(profil.prenom)}</h2><p class="hero-details">Ton profil</p></section>
    ${htmlBlocPhoto({ profil, ...photo })}
    ${htmlBlocCouleur({ profil, ...couleur })}
    ${htmlBlocNotifications(notifications)}
    ${htmlPageMotDePasse(motDePasse)}
    ${htmlBlocInstallation()}`;
}

/**
 * Photo choisie → image JPEG carrée de 256 px (Blob). Fonction « navigateur » (canvas), non testée en unitaire.
 * @param {File} fichier
 */
export async function reduirePhoto(fichier) {
  const image = await createImageBitmap(fichier, { imageOrientation: 'from-image' });
  const { sx, sy, cote } = carreCentre(image.width, image.height);
  const canevas = document.createElement('canvas');
  canevas.width = TAILLE_PHOTO;
  canevas.height = TAILLE_PHOTO;
  const ctx = canevas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, TAILLE_PHOTO, TAILLE_PHOTO);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, sx, sy, cote, cote, 0, 0, TAILLE_PHOTO, TAILLE_PHOTO);
  image.close?.();
  return new Promise((resolve, reject) => {
    canevas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image illisible'))), 'image/jpeg', 0.85);
  });
}
