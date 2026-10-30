// Palmarès (5.3) : pour chaque saison, le champion de la Race et, pour chaque tournoi terminé, le vainqueur du tournoi de tennis
// et le meilleur pronostiqueur du groupe. Tout vient des archives de clôture (tournament_results) ; rien n'est recalculé ici
// sauf la Race, par le moteur partagé.
import { echapper, formaterPeriode } from './outils.js';
import { CATEGORIES } from './tournois.js';
import { htmlPastille, htmlTrophee } from './vues.js';
import { construireRace } from './classement.js';

/**
 * @returns {Array<{annee, race: lignes premières|null, tournois: Array<{id, nom, categorie, date_debut, date_fin, vainqueur, finaliste, meilleurs: Array<{id, prenom, couleur, photo_url, score}>}>}>}
 *   saisons de la plus récente à la plus ancienne ; seuls les tournois clos y figurent.
 */
export function construirePalmares({ moteur, tournois, resultats, profils, joueurs }) {
  const parProfil = new Map(profils.map((p) => [p.id, p]));
  const annees = [...new Set(tournois.filter((t) => t.etat === 'clos').map((t) => t.annee))].sort((a, b) => b - a);
  return annees.map((annee) => {
    const race = construireRace({ moteur, annee, tournois, resultats, profils });
    const champions = race.lignes.filter((l) => l.rang === 1);
    const clos = tournois.filter((t) => t.annee === annee && t.etat === 'clos')
      .sort((a, b) => (a.date_debut ?? '9999-12-31').localeCompare(b.date_debut ?? '9999-12-31') || a.nom.localeCompare(b.nom, 'fr'));
    return {
      annee,
      champions: profils.length ? champions : [],
      points: champions[0]?.points ?? null,
      tournois: clos.map((t) => {
        const lignes = resultats.filter((r) => r.tournament_id === t.id && parProfil.has(r.joueur_id));
        const premiers = lignes.filter((r) => r.rang === 1).map((r) => ({ ...parProfil.get(r.joueur_id), score: moteur.formaterPoints(moteur.Fraction.de(r.score_final), { signe: false }) }))
          .sort((a, b) => a.prenom.localeCompare(b.prenom, 'fr'));
        return {
          id: t.id, nom: t.nom, categorie: t.categorie, date_debut: t.date_debut, date_fin: t.date_fin,
          vainqueur: t.vainqueur_id ? joueurs.get(t.vainqueur_id)?.nom ?? null : null,
          finaliste: t.finaliste_id ? joueurs.get(t.finaliste_id)?.nom ?? null : null,
          meilleurs: premiers,
        };
      }),
    };
  });
}

export function htmlPalmares(palmares) {
  if (palmares.length === 0) {
    return `<section class="carte"><h2>Palmarès</h2><p class="vide">Aucun tournoi terminé pour l’instant : le palmarès se remplit au fil des clôtures.</p></section>`;
  }
  return `
    <p class="lien-archive"><a href="#/saison">‹ Saison</a></p>
    ${palmares.map((s) => `
    <section class="carte carte-palmares">
      <h2 class="titre-annee">Saison ${echapper(s.annee)}</h2>
      ${s.champions.length ? `<p class="champion-race"><span>Champion${s.champions.length > 1 ? 's' : ''} de la Race</span>
        ${s.champions.map((c) => `<b class="nom-pastille">${htmlPastille(c, 'pastille pastille-petite')}${echapper(c.prenom)}</b>`).join(' ')}
        <small>${echapper(s.points)} pts · <a href="#/race/${encodeURIComponent(s.annee)}">détail ›</a></small></p>` : ''}
      <ul class="liste-palmares">${s.tournois.map((t) => `
        <li><a href="#/tournoi/${encodeURIComponent(t.id)}">
          <span class="trophee-nom">${htmlTrophee(t.categorie, t.nom)}<span><b>${echapper(t.nom)}</b><small>${echapper(CATEGORIES[t.categorie] ?? t.categorie)}${t.date_debut ? ` · ${echapper(formaterPeriode(t.date_debut, t.date_fin))}` : ''}</small></span></span>
          <span class="palmares-detail">
            ${t.vainqueur ? `<span>🎾 ${echapper(t.vainqueur)}${t.finaliste ? `<small> bat ${echapper(t.finaliste)}</small>` : ''}</span>` : ''}
            ${t.meilleurs.length ? `<span class="meilleur-pronos">${t.meilleurs.map((m) => `${htmlPastille(m, 'pastille pastille-petite')}${echapper(m.prenom)}`).join(' ')}<small>${echapper(t.meilleurs[0].score)} pts</small></span>` : '<small>Pas de pronostics archivés</small>'}
          </span></a></li>`).join('')}
      </ul>
    </section>`).join('')}`;
}
