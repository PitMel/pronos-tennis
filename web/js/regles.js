// Page « Règles » (cahier des charges, sections 4 à 8, en langage simple). Tous les barèmes sont calculés par le moteur
// de points : la page ne peut donc pas dire autre chose que ce que l'appli applique. Fonction pure : données → HTML.
import { echapper } from './outils.js';

const CONFIANCES = [6, 7, 8, 9, 10];

function tableau(entetes, lignes, classe = '') {
  const th = entetes.map((e) => `<th scope="col">${echapper(e)}</th>`).join('');
  const tr = lignes.map((l) => `<tr>${l.map((c, i) => (i === 0 ? `<th scope="row">${echapper(c)}</th>` : `<td>${echapper(c)}</td>`)).join('')}</tr>`).join('');
  return `<div class="tableau-defilant"><table class="table-regles ${classe}"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

/** @param {{moteur: object}} o  moteur : module du moteur de points (/moteur/index.js) */
export function htmlPageRegles({ moteur }) {
  const fmt = (v) => moteur.formaterPoints(v);
  const gp = (c, categorie, tour) => moteur.gainsPossibles(c, categorie, tour);
  const duo = (g) => `${fmt(g.gagne)} / ${fmt(g.perdu)}`;
  const mult = (categorie, tour) => fmt(moteur.multiplicateurTour(categorie, tour));

  const baremeBase = tableau(['Confiance', 'Si ton joueur gagne', 'S’il perd'],
    CONFIANCES.map((c) => { const g = gp(c, 'masters_1000', 'R16'); return [String(c), `+${fmt(g.gagne)}`, g.perdu.comparer(moteur.ZERO) < 0 ? fmt(g.perdu) : `+${fmt(g.perdu)}`]; }));

  const tours = [['R16', 'Huitièmes'], ['QF', 'Quarts'], ['SF', 'Demies et finale']];
  const baremeTours = tableau(['Confiance', ...tours.map(([t, l]) => `${l} ×${mult('masters_1000', t)}`)],
    CONFIANCES.map((c) => [String(c), ...tours.map(([t]) => duo(gp(c, 'masters_1000', t)))]), 'compact');

  const pari = (cat) => fmt(moteur.POINTS_PARI_TOURNOI[cat]);
  const bonus = (cat) => moteur.BONUS_CLASSEMENT[cat].map(fmt);
  const tablePari = tableau(['', 'Grand Chelem', 'Masters 1000 et ATP Finals'], [
    ['Chaque joueur choisi qui atteint la finale', `+${pari('grand_slam')}`, `+${pari('masters_1000')}`],
    ['Le vainqueur choisi gagne le tournoi', `+${pari('grand_slam')}`, `+${pari('masters_1000')}`],
    ['Maximum', fmt(moteur.POINTS_PARI_TOURNOI.grand_slam.fois(3)), fmt(moteur.POINTS_PARI_TOURNOI.masters_1000.fois(3))],
  ]);
  const tableBonus = tableau(['', '1er', '2e'], [
    ['Masters 1000', `+${bonus('masters_1000')[0]}`, `+${bonus('masters_1000')[1]}`],
    ['Grand Chelem', `+${bonus('grand_slam')[0]}`, `+${bonus('grand_slam')[1]}`],
    ['ATP Finals', `+${bonus('atp_finals')[0]}`, `+${bonus('atp_finals')[1]}`],
  ]);
  const bonusSets = fmt(moteur.BONUS_SETS_BON_VAINQUEUR);
  const bonusCinq = fmt(moteur.BONUS_SETS_CINQ_SETS_MAUVAIS_VAINQUEUR);
  const exemple = gp(8, 'masters_1000', 'QF');

  return `
    <section class="hero hero-regles">
      <a class="retour retour-clair" href="#/saison">← Saison</a>
      <h2 class="hero-titre">Règles</h2>
      <p class="hero-details">Comment on parie, comment on compte les points, et ce qui reste caché jusqu’au bon moment.</p>
    </section>

    <section class="carte carte-regles">
      <h3>1. Un pari de match</h3>
      <p>Tu choisis <b>un joueur</b> et une <b>confiance de 6 à 10</b>. En Grand Chelem, tu annonces aussi le <b>nombre de sets</b> du match (3, 4 ou 5).</p>
      <p>Matchs concernés : huitièmes, quarts, demi-finales et finale. En Grand Chelem, les « huitièmes » sont le 4ᵉ tour. Aux ATP Finals : poules (Round Robin), demi-finales et finale.</p>
      <p>Plus tu es confiant, plus tu gagnes si tu as raison, et plus tu perds si tu te trompes :</p>
      ${baremeBase}
      <p class="small">Gagné = ta confiance. Les valeurs sont multipliées selon le tour (voir 2). À 6 et 7 tu gagnes encore des points en cas d’erreur ; à partir de 8, tu en perds.</p>
    </section>

    <section class="carte carte-regles">
      <h3>2. Multiplicateurs de tour</h3>
      <p>Les points du match (bonus de sets compris) sont multipliés : <b>×${echapper(mult('masters_1000', 'R16'))}</b> en huitièmes, <b>×${echapper(mult('masters_1000', 'QF'))}</b> en quarts, <b>×${echapper(mult('masters_1000', 'SF'))}</b> en demi-finales et en finale. Aux ATP Finals : ×${echapper(mult('atp_finals', 'RR'))} en poules, ×${echapper(mult('atp_finals', 'SF'))} ensuite. Le multiplicateur ne s’applique ni au pari tournoi, ni aux bonus de classement.</p>
      <p>Barème complet (gagné / perdu) :</p>
      ${baremeTours}
      <p class="small">Exemple : confiance 8 en quart de finale, ton joueur gagne : ${echapper(fmt(exemple.gagne))} points ; il perd : ${echapper(fmt(exemple.perdu))}.</p>
    </section>

    <section class="carte carte-regles">
      <h3>3. Bonus de sets (Grand Chelem seulement)</h3>
      <ul>
        <li><b>+${echapper(bonusSets)}</b> si tu trouves le vainqueur <b>et</b> le nombre de sets.</li>
        <li><b>+${echapper(bonusCinq)}</b> si tu annonçais 5 sets, que le vainqueur est faux, mais que le match va bien en 5 sets.</li>
        <li>Pas d’autre bonus de sets, et aucun en Masters 1000 ni aux ATP Finals.</li>
      </ul>
      <p class="small">Le bonus s’ajoute avant le multiplicateur de tour.</p>
    </section>

    <section class="carte carte-regles">
      <h3>4. Abandon, forfait, match neutralisé</h3>
      <ul>
        <li><b>Abandon en cours de match :</b> les points sont <b>divisés par 2</b> (après le multiplicateur). En Grand Chelem, pas de bonus de sets. Le vainqueur est celui qui reste en course.</li>
        <li><b>Forfait avant le match :</b> 0 point pour tout le monde.</li>
        <li><b>Match neutralisé</b> par l’administrateur : 0 point pour tout le monde, et les paris déjà posés sont révélés.</li>
      </ul>
    </section>

    <section class="carte carte-regles">
      <h3>5. Qui voit quoi, et jusqu’à quand on peut parier</h3>
      <ul>
        <li>Tu peux <b>modifier</b> ton pari jusqu’au premier de ces deux moments : le match <b>commence</b>, ou <b>tout le monde a parié</b>. Il n’y a pas d’heure limite fixe.</li>
        <li>Les paris des autres sont <b>cachés</b> tant que tout le monde n’a pas parié. Ensuite ils sont <b>révélés et figés</b>.</li>
        <li>Le <b>résultat et le score</b> n’apparaissent que quand tout le monde a parié <b>et</b> que le match est terminé.</li>
        <li>Tu vois toujours <b>qui a parié</b> et si le match est verrouillé.</li>
        <li>« Tout le monde » = les joueurs actifs de ton groupe.</li>
      </ul>
    </section>

    <section class="carte carte-regles">
      <h3>6. Le pari tournoi</h3>
      <p>Tu choisis <b>un vainqueur</b> et <b>un finaliste</b> (deux joueurs différents, encore en lice). Le pari ouvre quand toutes les affiches des huitièmes sont connues (aux ATP Finals : quand les 4 premiers matchs de poule sont connus). Même logique de visibilité que pour un match : modifiable jusqu’à ce que tout le monde ait parié, puis révélé et figé. Les joueurs éliminés sont barrés.</p>
      <p>Points <b>versés à la fin du tournoi</b>, sans multiplicateur :</p>
      ${tablePari}
      <p class="small">Si tes deux joueurs jouent la finale mais dans le mauvais ordre (vainqueur et finaliste inversés), tu gardes les points de présence en finale et tu perds le bonus du vainqueur.</p>
    </section>

    <section class="carte carte-regles">
      <h3>7. Classement du tournoi et bonus</h3>
      <p>Le score d’un tournoi est la somme des points de ses matchs et du pari tournoi. Il s’affiche en trois temps : <b>matchs</b>, puis <b>+ pari tournoi</b>, puis <b>+ bonus de classement = score final</b>.</p>
      <p>À la clôture, les deux premiers du tournoi touchent un bonus :</p>
      ${tableBonus}
      <p><b>Égalités :</b></p>
      <ul>
        <li>Deux joueurs à égalité pour une place : le bonus de la place est partagé (divisé par 2).</li>
        <li>Deux ex aequo à la 1ʳᵉ place : personne ne touche le bonus de la 2ᵉ place.</li>
        <li>Plus de deux ex aequo : le bonus de la place est partagé entre eux tous, et il n’y a pas de bonus pour la place suivante.</li>
        <li>Égalité à la 2ᵉ place (le 1ᵉʳ étant seul) : le bonus de la 2ᵉ place est partagé entre les ex aequo.</li>
      </ul>
      <p class="small">Un tournoi se clôt automatiquement quand sa finale est terminée et comptée ; les scores finaux sont alors figés. L’administrateur peut forcer, corriger ou rouvrir une clôture.</p>
    </section>

    <section class="carte carte-regles">
      <h3>8. La Race</h3>
      <p>La <b>Race</b> de l’année est la somme des <b>scores finaux</b> (bonus compris) des tournois <b>terminés</b> de l’année. Elle ne bouge jamais en cours de tournoi, seulement à la clôture. Chaque année est une compétition indépendante, avec son vainqueur ; les années précédentes restent consultables.</p>
      <p class="small">Les points sont calculés avec des valeurs exactes ; l’affichage montre au plus deux décimales (13,5 ; −0,75 ; 12,75).</p>
    </section>`;
}
