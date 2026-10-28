// Interface d'administration (étape 4). Fonctions pures : données → HTML. L'accès est protégé par la base (RLS) ;
// le contrôle « est administrateur » fait dans l'appli ne sert qu'à ne pas montrer ce qui serait refusé.
import { echapper, formaterHeureParis, depuisDuree } from './outils.js';

const HEURES = 3600000;
const LIMITE_JOUR = 100; // quota gratuit de l'API (cahier des charges, section 10)

/** Raccourcit un chemin d'API pour l'affichage : « /matches · tournoi 1725 · upcoming ». */
export function libelleEndpoint(endpoint) {
  const [chemin, requete = ''] = String(endpoint ?? '').split('?');
  const p = new URLSearchParams(requete);
  const morceaux = [chemin];
  if (p.get('tournament_id')) morceaux.push(`tournoi ${p.get('tournament_id')}`);
  if (p.get('status')) morceaux.push(p.get('status'));
  return morceaux.join(' · ');
}

/**
 * Résumé du journal de synchronisation (table sync_log, lecture réservée à l'administrateur).
 * @param {Array} lignes  lignes du journal, de n'importe quel ordre
 * @param {Date} [maintenant]
 */
export function resumerSynchro(lignes, maintenant = new Date()) {
  const tri = [...(lignes ?? [])].sort((a, b) => new Date(b.date_appel) - new Date(a.date_appel) || b.id - a.id);
  const limite = maintenant.getTime() - 24 * HEURES;
  const derniers24h = tri.filter((l) => new Date(l.date_appel).getTime() >= limite);
  // le quota se remet probablement à zéro à minuit UTC (non confirmé par l'API) ; le planificateur compte aussi les lignes du journal
  const minuitUtc = Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate());
  const appelsJour = tri.filter((l) => new Date(l.date_appel).getTime() >= minuitUtc).length;
  const avecQuota = tri.find((l) => l.quota_restant !== null && l.quota_restant !== undefined);
  const dernier = tri[0] ?? null;
  const dernierEchec = tri.find((l) => !l.ok) ?? null;
  const dernierSucces = tri.find((l) => l.ok) ?? null;
  const alertes = [];
  if (!dernier) alertes.push('Aucun appel enregistré : la synchronisation n’a jamais tourné.');
  else {
    if (!dernier.ok) alertes.push('Le dernier appel a échoué.');
    if (maintenant.getTime() - new Date(dernier.date_appel).getTime() > 48 * HEURES) alertes.push('Aucun appel depuis plus de 48 heures : vérifie que la synchronisation est activée.');
  }
  return {
    dernier,
    dernierSucces,
    dernierEchec,
    quotaRestant: avecQuota ? avecQuota.quota_restant : null,
    resetA: avecQuota?.reset_a ?? null,
    appelsJour,
    limiteJour: LIMITE_JOUR,
    appels24h: derniers24h.length,
    echecs24h: derniers24h.filter((l) => !l.ok).length,
    alertes,
    recents: tri.slice(0, 15),
  };
}

export function htmlEnteteAdmin(titre, { retour = null, details = '' } = {}) {
  return `
    <section class="hero hero-admin">
      ${retour ? `<a class="retour retour-clair" href="${echapper(retour.href)}">← ${echapper(retour.texte)}</a>` : ''}
      <h2 class="hero-titre">${echapper(titre)}</h2>
      ${details ? `<p class="hero-details">${echapper(details)}</p>` : ''}
    </section>`;
}

export function htmlAccesRefuse() {
  return '<section class="carte"><h2>Accès réservé</h2><p>Cette page est réservée à l’administrateur.</p><p><a href="#/">Retour à l’accueil</a></p></section>';
}

function htmlSynchro(resume, maintenant) {
  const { dernier } = resume;
  const chiffre = (valeur, libelle) => `<div class="chiffre"><b>${echapper(valeur)}</b><span>${echapper(libelle)}</span></div>`;
  const lignes = resume.recents.map((l) => `
      <li class="appel ${l.ok ? 'ok' : 'echec'}"><span class="coche" aria-label="${l.ok ? 'réussi' : 'échec'}">${l.ok ? '✓' : '✗'}</span>
        <span class="detail"><b>${echapper(libelleEndpoint(l.endpoint))}</b><small>${echapper(formaterHeureParis(l.date_appel))}${l.http_status ? ` · HTTP ${echapper(l.http_status)}` : ''}${l.message ? ` · ${echapper(l.message)}` : ''}</small></span></li>`).join('');
  return `
    <section class="carte carte-synchro">
      <h3>Synchronisation de l’API</h3>
      ${resume.alertes.map((a) => `<p class="alerte" role="alert">${echapper(a)}</p>`).join('')}
      <div class="chiffres">
        ${chiffre(dernier ? depuisDuree(dernier.date_appel, maintenant) : '—', 'dernier appel')}
        ${chiffre(`${resume.appelsJour} / ${resume.limiteJour}`, 'appels du jour (UTC)')}
        ${chiffre(String(resume.appels24h), 'appels sur 24 h')}
        ${chiffre(String(resume.echecs24h), 'échecs sur 24 h')}
      </div>
      ${resume.quotaRestant !== null ? `<p class="small">Quota annoncé par l’API : ${echapper(resume.quotaRestant)} requêtes restantes.</p>` : ''}
      ${resume.dernierEchec ? `<p class="small">Dernier échec : ${echapper(formaterHeureParis(resume.dernierEchec.date_appel))}${resume.dernierEchec.message ? ` — ${echapper(resume.dernierEchec.message)}` : ''}.</p>` : ''}
      ${lignes ? `<h4>Derniers appels</h4><ul class="journal">${lignes}</ul>` : '<p class="vide">Le journal est vide.</p>'}
    </section>`;
}

/** Page d'accueil de l'administration. */
export function htmlAdminAccueil({ synchro = [], maintenant = new Date() } = {}) {
  return `
    ${htmlEnteteAdmin('Administration', { retour: { href: '#/', texte: 'Accueil' }, details: 'Réservée à l’administrateur. Chaque action est contrôlée par la base de données.' })}
    <section class="carte carte-admin">
      <h3>Gérer</h3>
      <ul class="liste-admin">
        <li><a class="ligne-admin" href="#/admin/calendrier"><span><b>Calendrier des tournois</b><small>Dates, lieu, surface, catégorie, identifiants de l’API</small></span><i aria-hidden="true">›</i></a></li>
        <li><a class="ligne-admin" href="#/admin/comptes"><span><b>Comptes</b><small>Couleur, activation, groupe réel ou test</small></span><i aria-hidden="true">›</i></a></li>
      </ul>
    </section>
    ${htmlSynchro(resumerSynchro(synchro, maintenant), maintenant)}`;
}
