// Page « Palmarès » du joueur connecté (onglet du même nom). Vues pures à partir du résultat de monPalmares().
import { echapper } from './outils.js';
import { htmlTrophee, htmlIconeRecompense } from './trophees.js';
import { htmlPastille, htmlCourbesConfiance } from './vues.js';

const COULEURS_SAISONS = ['#2F6CC2', '#C2562F', '#2FA05A', '#8E44AD', '#D4A017', '#17A2B8'];
const NBSP = '&nbsp;';
const taux = (x) => `${echapper(x.ok)}/${echapper(x.sur)} (${echapper(x.pourcentage)}${NBSP}%)`;

/** Un trophée en grand format, avec son nom court et son année dessous. */
function htmlTropheeGrand(t) {
  const court = t.categorie === 'champion_saison' ? 'Champion' : t.categorie === 'vice_champion_saison' ? 'Vice-champion' : t.nom;
  return `<figure class="trophee-grand">${htmlTrophee(t.categorie, t.nom, t, 64)}<figcaption><b>${echapper(court)}</b><small>${echapper(t.annee)}</small></figcaption></figure>`;
}

function htmlArmoire(armoire) {
  const ligne = (titre, liste, vide) => `
      <div class="rangee-armoire">
        <h4>${echapper(titre)}</h4>
        <div class="etagere">${liste.length ? liste.map(htmlTropheeGrand).join('') : `<p class="small">${echapper(vide)}</p>`}</div>
      </div>`;
  return `
    <section class="carte carte-armoire">
      <h3><span class="icone-section" aria-hidden="true">🏆</span>Armoire à trophées</h3>
      ${ligne('Championnat de saison', armoire.saison, 'Pas encore de récompense du championnat de saison.')}
      ${ligne('Grand Chelem', armoire.grand_slam, 'Pas encore de Grand Chelem remporté.')}
      ${ligne('Masters 1000', armoire.masters_1000, 'Pas encore de Masters 1000 remporté.')}
      ${ligne('ATP Finals', armoire.atp_finals, 'Pas encore d’ATP Finals remportées.')}
      <div class="rangee-armoire">
        <h4>Autres récompenses</h4>
        <div class="etagere">${armoire.autres.length ? armoire.autres.map((a) => `<figure class="trophee-grand">${htmlIconeRecompense(a.cle, 64, a.tournoi ? `${a.tournoi} ${a.annee}` : a.annee)}<figcaption><b>${echapper(a.court)}</b><small>${echapper(a.tournoi ? `${a.tournoi} ${a.annee}` : a.annee)}</small></figcaption></figure>`).join('') : '<p class="small">Pas encore d’autre récompense.</p>'}</div>
      </div>
    </section>`;
}

function htmlRecompensesSaison(rs) {
  if (!rs.lignes.length) return '';
  const entetes = rs.colonnes.map((c) => `<th scope="col">${echapper(c.court)}</th>`).join('');
  const point = '<td class="case-jouee" aria-label="Pas décerné"><span aria-hidden="true">·</span></td>';
  const lignes = rs.lignes.map((l) => {
    const champ = !l.termine ? '<td class="vide-case"></td>'
      : l.laurier ? `<td class="case-gagnee">${htmlTrophee(l.laurier.categorie, l.laurier.nom, { annee: l.annee }, 44)}</td>` : point;
    const autres = l.cases.map((c, i) => (c === null ? '<td class="vide-case"></td>'
      : c.gagne ? `<td class="case-gagnee">${htmlIconeRecompense(rs.colonnes[i].cle, 40, c.tournois?.length ? `${c.tournois.join(', ')} ${l.annee}` : l.annee)}${c.nombre > 1 ? `<small class="multiple">×${echapper(c.nombre)}</small>` : ''}</td>`
        : l.termine ? point : '<td class="vide-case"></td>')).join('');
    return `\n        <tr><th scope="row">${echapper(l.annee)}</th>${champ}${autres}</tr>`;
  }).join('');
  return `
    <section class="carte carte-parcours carte-recompenses-saison">
      <h3><span class="icone-section" aria-hidden="true">🏅</span>Récompenses de saison</h3>
      <p class="small">Une ligne par saison. Les récompenses ne sont décernées qu’une fois la saison terminée ; un point : récompense obtenue par un autre parieur. Le full strike, lui, est attribué dès la fin du tournoi.</p>
      <div class="tableau-defilant"><table class="parcours">
        <thead><tr><th></th><th scope="col">Championnat de saison</th>${entetes}</tr></thead>
        <tbody>${lignes}</tbody>
      </table></div>
    </section>`;
}

function htmlParcours(parcours) {
  if (!parcours.lignes.length) return '';
  const entetes = parcours.colonnes.map((c) => `<th scope="col">${echapper(c.nom)}</th>`).join('');
  const lignes = parcours.lignes.map((l) => `
        <tr><th scope="row">${echapper(l.annee)}</th>${l.cases.map((c) => (c === null ? '<td class="vide-case"></td>'
    : c.gagne ? `<td class="case-gagnee">${htmlTrophee(c.trophee.categorie, c.trophee.nom, c.trophee, 44)}</td>`
      : '<td class="case-jouee" aria-label="Tournoi disputé"><span aria-hidden="true">·</span></td>')).join('')}</tr>`).join('');
  return `
    <section class="carte carte-parcours">
      <h3><span class="icone-section" aria-hidden="true">🗺️</span>Parcours dans les tournois</h3>
      <p class="small">Une ligne par saison. Le trophée marque les tournois où tu as terminé premier des pronostics ; un point : tournoi disputé sans victoire.</p>
      <div class="tableau-defilant"><table class="parcours">
        <thead><tr><th></th>${entetes}</tr></thead>
        <tbody>${lignes}</tbody>
      </table></div>
    </section>`;
}

/** Une section avec une colonne par saison. */
function htmlParSaison({ titre, icone, intro, saisons, cle, texte, vide }) {
  if (!saisons.length) return '';
  const colonnes = saisons.map((s) => `
      <li class="colonne-saison">
        <b class="nom-parieur">${echapper(s.annee)}</b>
        ${s[cle].length ? `<ol class="top5">${s[cle].map((j) => `<li>${texte(j)}</li>`).join('')}</ol>` : `<p class="small">${echapper(vide)}</p>`}
      </li>`).join('');
  return `
    <section class="carte carte-stats">
      <h3><span class="icone-section" aria-hidden="true">${icone}</span>${echapper(titre)}</h3>
      <p class="small">${echapper(intro)}</p>
      <ul class="liste-saisons">${colonnes}</ul>
    </section>`;
}

function htmlStatistiques(st) {
  if (!st.parSaison.length) return '';
  const bloc = (titre, cle, vide) => `
      <div class="bloc-stat">
        <h4>${echapper(titre)}</h4>
        <ul class="stat-saisons">${st.parSaison.map((s) => `<li><small>${echapper(s.annee)}</small>${s[cle] ? `<b>${echapper(s[cle].pourcentage)}${NBSP}%</b><small>${echapper(s[cle].ok)}/${echapper(s[cle].sur)}</small>` : `<span class="small">${echapper(vide)}</span>`}</li>`).join('')}</ul>
      </div>`;
  const rec = (titre, contenu, explication) => `<li class="record"><b>${echapper(titre)}</b><span>${contenu}</span><small class="explication">${echapper(explication)}</small></li>`;
  const lien = (x) => `<a class="nom-tournoi" href="#/tournoi/${encodeURIComponent(x.id)}">${echapper(x.nom)} ${echapper(x.annee)}</a>`;
  const meilleurs = (liste) => (liste.length ? liste.map((x) => `${lien(x)} · <b>${echapper(x.score)}</b> points`).join('<br>') : '<em>pas encore de tournoi terminé</em>');
  return `
    <section class="carte carte-stats carte-mes-stats">
      <h3><span class="icone-section" aria-hidden="true">📊</span>Mes statistiques</h3>
      ${bloc('Pari sur le vainqueur du match', 'vainqueurMatch', '—')}
      ${bloc('Pari sur les sets', 'sets', '—')}
      ${bloc('Pari sur le vainqueur du tournoi', 'vainqueurTournoi', '—')}
      ${bloc('Pari sur les finalistes', 'finalistes', '—')}
      <ul class="liste-records">
        ${rec('Mon meilleur strike', st.meilleurStrike.length ? st.meilleurStrike.map((x) => `${lien({ id: x.tournoi.id, nom: x.tournoi.nom, annee: x.tournoi.annee })} · ${taux(x)} bons vainqueurs`).join('<br>') : '<em>pas encore de tournoi terminé</em>', 'Tournoi où tu as trouvé le plus de bons vainqueurs, toutes saisons confondues (ex æquo : tous affichés).')}
        ${rec('Mon meilleur tournoi du Grand Chelem', meilleurs(st.meilleurGrandChelem), 'Tournoi du Grand Chelem où tu as marqué le plus de points (avant bonification de 1re et 2e places).')}
        ${rec('Mon meilleur Master 1000', meilleurs(st.meilleurMasters), 'Masters 1000 où tu as marqué le plus de points (avant bonification de 1re et 2e places).')}
        ${rec('Mon record saison', st.recordSaison.length ? st.recordSaison.map((x) => `<b>${echapper(x.score)}</b> points (${echapper(x.annee)})`).join('<br>') : '<em>pas encore de saison</em>', 'Plus gros total de points obtenu sur une saison, avant bonification de 1re et 2e places.')}
      </ul>
    </section>`;
}

function htmlProfilDesParis(profil) {
  if (!profil.length) return '';
  const series = profil.map((l, i) => ({ prenom: String(l.annee), couleur: COULEURS_SAISONS[i % COULEURS_SAISONS.length], repartition: l.repartition, sansPastille: true }));
  return `
    <section class="carte carte-stats carte-confiances">
      <h3><span class="icone-section" aria-hidden="true">🎯</span>Profil des paris</h3>
      <p class="small">Part de tes paris de match à chaque niveau de confiance, par saison (en dessous : nombre de paris).</p>
      <div class="tableau-defilant"><table class="detail-points table-confiances">
        <thead><tr><th></th>${[6, 7, 8, 9, 10].map((c) => `<th scope="col">${c}</th>`).join('')}</tr></thead>
        <tbody>${profil.map((l, i) => `<tr><th scope="row" class="col-nom"><i class="pt-legende" style="background:${COULEURS_SAISONS[i % COULEURS_SAISONS.length]}"></i><span>${echapper(l.annee)}</span></th>${l.repartition.map((r) => `<td><b>${echapper(r.pourcentage)}${NBSP}%</b><small>${echapper(r.n)}</small></td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>
      ${htmlCourbesConfiance(series)}
    </section>`;
}

function htmlJustePrix(jp) {
  if (jp.lignes.every((l) => l.total.sur === 0)) return '';
  const entetes = jp.colonnes.map((c) => `<th scope="col" class="col-joueur">${htmlPastille(c, 'pastille pastille-petite')}<span>${echapper(c.prenom)}</span></th>`).join('');
  const caseHtml = (c, classe = '') => `<td class="${classe}">${c.pourcentage === null ? '<span class="small">—</span>' : `<b>${echapper(c.pourcentage)}${NBSP}%</b><small>${echapper(c.ok)}/${echapper(c.sur)}</small>`}</td>`;
  return `
    <section class="carte carte-stats carte-juste-prix">
      <h3><span class="icone-section" aria-hidden="true">⚖️</span>Le juste prix</h3>
      <p class="small">Pour chaque niveau de confiance : part des paris où le joueur choisi a gagné son match (en dessous : bons paris / paris), toutes saisons confondues.</p>
      <div class="tableau-defilant"><table class="detail-points table-confiances table-prix">
        <thead><tr><th></th>${entetes}<th scope="col">Total</th></tr></thead>
        <tbody>${jp.lignes.map((l) => `<tr><th scope="row" class="col-nom">${echapper(l.confiance)}</th>${l.cases.map((c) => caseHtml(c)).join('')}${caseHtml(l.total, 'total')}</tr>`).join('')}</tbody>
      </table></div>
    </section>`;
}

/**
 * @param {ReturnType<import('./mon-palmares.js').monPalmares>} d
 * @param {{prenom?:string}} [o]
 */
export function htmlMonPalmares(d, { prenom = '' } = {}) {
  if (!d.annees.length) {
    return `<section class="carte"><h2>Palmarès</h2><p class="vide">Aucun tournoi terminé pour l’instant : ton palmarès se remplit au fil des clôtures.</p></section>`;
  }
  return `
    <section class="hero hero-race">
      <h2 class="hero-titre">Palmarès</h2>
      <p class="hero-details">${prenom ? `Tout ce qui te concerne, ${echapper(prenom)}` : 'Tout ce qui te concerne'}, toutes saisons confondues.</p>
    </section>
    ${htmlArmoire(d.armoire)}
    ${htmlParcours(d.parcours)}
    ${htmlRecompensesSaison(d.recompensesSaison)}
    ${htmlParSaison({
    titre: 'Mes vaches à lait', icone: '🐄', saisons: d.saisons, cle: 'vaches', vide: 'Aucun joueur n’a encore rapporté de points.',
    intro: 'Les cinq joueurs de tennis qui t’ont rapporté le plus de points, par saison (entre parenthèses).',
    texte: (j) => `<b>${echapper(j.nom)}</b> <span class="valeur">(${echapper(j.points)})</span>`,
  })}
    ${htmlParSaison({
    titre: 'Mes chouchous', icone: '❤️', saisons: d.saisons, cle: 'chouchous', vide: 'Pas encore de joueur vu au moins 5 fois.',
    intro: 'Parmi les joueurs vus au moins 5 fois dans la saison : ceux sur la victoire desquels tu as le plus souvent misé (paris sur sa victoire / matchs où tu pouvais parier sur lui).',
    texte: (j) => `<b>${echapper(j.nom)}</b> <span class="valeur">${echapper(j.rapport)} (${echapper(j.pourcentage)}${NBSP}%)</span>`,
  })}
    ${htmlParSaison({
    titre: 'Mes amours impossibles', icone: '💔', saisons: d.saisons, cle: 'amours', vide: 'Aucun joueur n’a encore reçu trois paris de ta part.',
    intro: 'Parmi les joueurs sur lesquels tu as misé au moins trois fois dans la saison : ceux qui t’ont le moins souvent récompensé (victoires du joueur / paris sur lui).',
    texte: (j) => `<b>${echapper(j.nom)}</b> <span class="valeur">${echapper(j.rapport)} (${echapper(j.pourcentage)}${NBSP}%)</span>`,
  })}
    ${htmlStatistiques(d.statistiques)}
    ${htmlProfilDesParis(d.profilDesParis)}
    ${htmlJustePrix(d.justePrix)}`;
}
