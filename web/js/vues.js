// Construction du HTML des écrans (fonctions pures : données → texte HTML). Tout texte vient échappé.
import { echapper, formaterHeureParis, formaterPeriode } from './outils.js';
import {
  CATEGORIES, SURFACES, ETATS, grouperParTour, grouperParAnnee, formaterScore, nomAvecClassement,
} from './tournois.js';

function infosTournoi(t) {
  const lieu = [t.ville, t.surface ? SURFACES[t.surface] : null].filter(Boolean).join(' · ');
  return `${echapper(lieu)}${t.indoor ? ' (en salle)' : ''}`;
}

export function htmlListeTournois(tournois) {
  const annees = grouperParAnnee(tournois);
  if (annees.length === 0) {
    return `<section class="carte"><h2>Tournois</h2><p>Aucun tournoi pour le moment.</p></section>`;
  }
  return annees.map(({ annee, tournois: liste }) => `
    <section>
      <h2 class="titre-annee">${echapper(annee)}</h2>
      ${liste.map((t) => `
        <a class="carte carte-tournoi categorie-${echapper(t.categorie)}" href="#/tournoi/${encodeURIComponent(t.id)}">
          <span class="badge badge-categorie">${echapper(CATEGORIES[t.categorie] ?? t.categorie)}</span>
          <h3>${echapper(t.nom)}</h3>
          <p>${infosTournoi(t)}</p>
          <p class="periode">${echapper(formaterPeriode(t.date_debut, t.date_fin))}</p>
          <span class="badge badge-etat etat-${echapper(t.etat)}">${echapper(ETATS[t.etat] ?? t.etat)}</span>
        </a>`).join('')}
    </section>`).join('');
}

function htmlJoueurMatch(joueur, numero, match) {
  const gagnant = match.resultat_visible && match.vainqueur === numero;
  const pays = joueur?.pays ? ` <span class="pays">${echapper(String(joueur.pays).toUpperCase())}</span>` : '';
  return `<div class="joueur-match${gagnant ? ' gagnant' : ''}">${echapper(nomAvecClassement(joueur))}${pays}${gagnant ? ' <span class="coupe" title="Vainqueur">✓</span>' : ''}</div>`;
}

export function htmlCarteMatch(match, joueurs) {
  const p1 = joueurs.get(match.p1_id);
  const p2 = joueurs.get(match.p2_id);
  const badges = [];
  if (match.neutralise) badges.push('<span class="badge badge-neutre">Neutralisé</span>');
  else if (match.statut === 'en_cours') badges.push('<span class="badge badge-direct">En cours</span>');
  else if (match.statut === 'termine' && !match.resultat_visible) badges.push('<span class="badge badge-neutre">Terminé · résultat masqué</span>');
  if (!match.neutralise && match.statut !== 'termine' && match.verrouille) badges.push('<span class="badge badge-verrou">Paris verrouillés</span>');
  if (match.paris_reveles && !match.neutralise) badges.push('<span class="badge badge-revele">Paris révélés</span>');
  const score = match.resultat_visible ? formaterScore(match.score, match.fin_match) : '';
  return `
    <article class="match" data-match="${echapper(match.id)}">
      <div class="match-entete">
        <span class="heure">${echapper(formaterHeureParis(match.heure_prevue) || 'Horaire à venir')}</span>
        <span class="badges">${badges.join('')}</span>
      </div>
      ${htmlJoueurMatch(p1, 1, match)}
      ${htmlJoueurMatch(p2, 2, match)}
      ${score ? `<div class="score">${echapper(score)}</div>` : ''}
    </article>`;
}

export function htmlPageTournoi({ tournoi, matchs, joueurs }) {
  const sections = grouperParTour(matchs, tournoi.categorie);
  const vainqueur = tournoi.etat === 'clos' && tournoi.vainqueur_id ? joueurs.get(tournoi.vainqueur_id) : null;
  const finaliste = tournoi.etat === 'clos' && tournoi.finaliste_id ? joueurs.get(tournoi.finaliste_id) : null;
  return `
    <a class="retour" href="#/">← Tous les tournois</a>
    <section class="carte entete-tournoi categorie-${echapper(tournoi.categorie)}">
      <span class="badge badge-categorie">${echapper(CATEGORIES[tournoi.categorie] ?? tournoi.categorie)}</span>
      <h2>${echapper(tournoi.nom)} ${echapper(tournoi.annee)}</h2>
      <p>${infosTournoi(tournoi)}</p>
      <p class="periode">${echapper(formaterPeriode(tournoi.date_debut, tournoi.date_fin))}</p>
      <span class="badge badge-etat etat-${echapper(tournoi.etat)}">${echapper(ETATS[tournoi.etat] ?? tournoi.etat)}</span>
      ${vainqueur ? `<p class="palmares">Vainqueur : <strong>${echapper(vainqueur.nom)}</strong>${finaliste ? ` · finaliste : ${echapper(finaliste.nom)}` : ''}</p>` : ''}
    </section>
    ${sections.map((s) => s.aVenir
      ? `<div class="tour tour-a-venir"><h3>${echapper(s.libelle)}</h3><p>Affiches à venir</p></div>`
      : `<details class="tour${s.termine ? ' tour-termine' : ''}"${s.courant ? ' open' : ''}>
           <summary><span>${echapper(s.libelle)}</span><span class="compte">${s.matchs.length} match${s.matchs.length > 1 ? 's' : ''}${s.termine ? ' · terminé' : ''}</span></summary>
           <div class="matchs">${s.matchs.map((m) => htmlCarteMatch(m, joueurs)).join('')}</div>
         </details>`).join('')}`;
}

export function htmlErreur(message) {
  return `<section class="carte"><h2>Oups</h2><p class="erreur">${echapper(message)}</p><p><a href="#/">Retour à l’accueil</a></p></section>`;
}
