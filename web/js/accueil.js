// Page d'accueil (cahier des charges, 12.2 n° 2) : le tournoi en cours (ou le prochain), ce qu'il reste à parier, la Race.
// Fonctions pures : données → HTML.
import { echapper, formaterPeriode } from './outils.js';
import { CATEGORIES, ETATS, lieuEtSurface } from './tournois.js';
import { pariTournoiRevele } from './pari-tournoi.js';
import { htmlRace } from './vues.js';

const OUVERT = ['pari_tournoi_ouvert', 'en_cours'];
const parDate = (a, b) => (a.date_debut ?? '9999-12-31').localeCompare(b.date_debut ?? '9999-12-31') || String(a.nom).localeCompare(String(b.nom), 'fr');

/**
 * Tournois à mettre en avant : tous ceux qui sont en cours (ou ouverts au pari tournoi), sinon le prochain à venir daté.
 * @param {string} aujourdhui AAAA-MM-JJ (Paris)
 */
export function tournoisPourAccueil(tournois, aujourdhui) {
  const encours = tournois.filter((t) => OUVERT.includes(t.etat)).sort(parDate);
  const prochain = encours.length ? null
    : tournois.filter((t) => t.etat === 'a_venir' && t.date_debut && t.date_debut >= aujourdhui).sort(parDate)[0] ?? null;
  return { encours, prochain };
}

/**
 * Situation de la personne face au pari tournoi : 'fait' (j'ai parié) · 'afaire' (je peux encore parier) · null (rien à faire :
 * pas encore ouvert, déjà figé, tournoi terminé, ou je n'y participe pas).
 */
export function statutPariTournoi(tournoi, { monPari, qui, moi }) {
  if (monPari) return 'fait';
  if (!OUVERT.includes(tournoi.etat)) return null;
  if (qui && !qui.has(moi)) return null;
  if (pariTournoiRevele(qui)) return null;
  return 'afaire';
}

function entete(t, surtitre) {
  return `<p class="surtitre">${echapper(surtitre)}</p>
      <div class="ligne-titre"><h3><a href="#/tournoi/${encodeURIComponent(t.id)}">${echapper(t.nom)}</a></h3>
        <span class="badge badge-categorie">${echapper(CATEGORIES[t.categorie] ?? t.categorie)}</span></div>
      <p class="periode">${echapper(formaterPeriode(t.date_debut, t.date_fin))}</p>
      <p class="lieu">${echapper(lieuEtSurface(t))}</p>`;
}

function htmlBloc({ tournoi, nbAParier, pariTournoi }) {
  const id = encodeURIComponent(tournoi.id);
  const actions = [];
  if (nbAParier > 0) actions.push(`<li class="afaire"><a href="#/tournoi/${id}"><span><b>${nbAParier}</b> pari${nbAParier > 1 ? 's' : ''} de match à poser</span><i aria-hidden="true">›</i></a></li>`);
  if (pariTournoi === 'afaire') actions.push(`<li class="afaire"><a href="#/tournoi/${id}/pari">Pari tournoi à poser<i aria-hidden="true">›</i></a></li>`);
  if (pariTournoi === 'fait') actions.push(`<li><a href="#/tournoi/${id}/pari">Pari tournoi posé<i aria-hidden="true">›</i></a></li>`);
  const reste = nbAParier > 0 || pariTournoi === 'afaire';
  return `
    <section class="carte carte-accueil categorie-${echapper(tournoi.categorie)}">
      ${entete(tournoi, 'Tournoi en cours')}
      <span class="badge badge-etat etat-${echapper(tournoi.etat)}">${echapper(ETATS[tournoi.etat] ?? tournoi.etat)}</span>
      ${actions.length ? `<ul class="a-faire">${actions.join('')}</ul>` : ''}
      ${reste ? '' : '<p class="a-jour">Tu es à jour : rien à parier pour l’instant.</p>'}
    </section>`;
}

/**
 * @param {object} o
 * @param {{prenom:string}} o.profil
 * @param {object|null} o.race  Race de l'année (construireRace)
 * @param {Array<{tournoi:object, nbAParier:number, pariTournoi:'fait'|'afaire'|null}>} o.blocs
 * @param {object|null} o.prochain  tournoi à venir à montrer quand rien n'est en cours
 */
export function htmlAccueil({ profil, race = null, blocs = [], prochain = null }) {
  const corps = blocs.length
    ? blocs.map(htmlBloc).join('')
    : prochain
      ? `<section class="carte carte-accueil categorie-${echapper(prochain.categorie)}">${entete(prochain, 'Prochain tournoi')}
           <p class="a-jour">Les paris ouvrent quand le tableau est connu.</p></section>`
      : '<section class="carte"><h3>Aucun tournoi en cours</h3><p>Rien à parier pour l’instant.</p></section>';
  return `
    <h2 class="titre-annee">Bonjour ${echapper(profil.prenom)}</h2>
    ${corps}
    ${race ? htmlRace(race) : ''}
    <p class="lien-archive"><a href="#/saison">Tous les tournois de la saison ›</a></p>`;
}
