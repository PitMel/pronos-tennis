// Face-à-face (H2H) calculé à partir des fichiers de résultats ATP de TennisMyLife (CSV, un par année).
// Fonctions pures : lecture du CSV, rapprochement d'un nom de joueur avec un identifiant ATP, bilan et liste des rencontres.
// Les fichiers bruts ne sont jamais publiés (licence) : seul le résultat calculé est enregistré.

/** Lit un CSV (guillemets et virgules dans les champs gérés) et renvoie un tableau d'objets. */
export function lireCsv(texte) {
  const lignes = [];
  let champ = ''; let ligne = []; let entre = false;
  for (let i = 0; i < texte.length; i += 1) {
    const c = texte[i];
    if (entre) {
      if (c === '"') { if (texte[i + 1] === '"') { champ += '"'; i += 1; } else entre = false; } else champ += c;
    } else if (c === '"') entre = true;
    else if (c === ',') { ligne.push(champ); champ = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texte[i + 1] === '\n') i += 1;
      ligne.push(champ); champ = '';
      if (ligne.length > 1 || ligne[0] !== '') lignes.push(ligne);
      ligne = [];
    } else champ += c;
  }
  if (champ !== '' || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  if (lignes.length === 0) return [];
  const [entetes, ...corps] = lignes;
  return corps.map((l) => Object.fromEntries(entetes.map((e, i) => [e, l[i] ?? ''])));
}

/** Nom sans accents ni ponctuation, en minuscules, mots séparés par un espace : « Rafael Jódar » → « rafael jodar ». */
export function normaliserNom(nom) {
  return String(nom ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Classement ATP d'un joueur au moment du match (colonnes winner_rank / loser_rank des fichiers) : entier positif, sinon null (non classé, vide, « NA »). */
export function rangAtp(x) {
  const n = Number.parseInt(String(x ?? '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const SURFACES = { hard: 'Dur', clay: 'Terre battue', grass: 'Gazon', carpet: 'Moquette' };
const TOURS = { F: 'Finale', SF: 'Demi-finale', QF: 'Quart de finale', R16: 'Huitième de finale', R32: 'Seizième de finale', R64: '1/32e de finale', R128: '1/64e de finale', RR: 'Poule', BR: 'Match pour la 3e place', ER: 'Tour préliminaire', Q1: 'Qualifications', Q2: 'Qualifications', Q3: 'Qualifications' };

/**
 * Construit l'index à partir des lignes des CSV (tous les fichiers fournis).
 * - matchs : un enregistrement compact par match disputé (les forfaits sans match joué, « W/O », sont écartés), rangés par paire de joueurs ;
 * - noms : nom normalisé → identifiants ATP (avec leur nombre de matchs et la dernière année vue, pour départager).
 */
export function construireIndex(lignes) {
  const parPaire = new Map();
  const noms = new Map(); // nom normalisé → Map(id → { nom, n, derniere })
  const vu = (id, nom, annee) => {
    const cle = normaliserNom(nom);
    if (!cle || !id) return;
    if (!noms.has(cle)) noms.set(cle, new Map());
    const m = noms.get(cle);
    const e = m.get(id) ?? { id, nom, n: 0, derniere: 0 };
    e.n += 1; e.derniere = Math.max(e.derniere, annee); e.nom = nom;
    m.set(id, e);
  };
  for (const l of lignes) {
    const annee = Number(String(l.tourney_date).slice(0, 4)) || 0;
    vu(l.winner_id, l.winner_name, annee);
    vu(l.loser_id, l.loser_name, annee);
    if (!l.winner_id || !l.loser_id || /w\/o/i.test(l.score ?? '')) continue;
    const cle = [l.winner_id, l.loser_id].sort().join('|');
    if (!parPaire.has(cle)) parPaire.set(cle, []);
    parPaire.get(cle).push({ date: l.tourney_date, tournoi: l.tourney_name, surface: l.surface, tour: l.round, score: l.score, gagnant: l.winner_id,
      rang_gagnant: rangAtp(l.winner_rank), rang_perdant: rangAtp(l.loser_rank) });
  }
  return { parPaire, noms };
}

/**
 * Identifiant ATP d'un joueur d'après son nom, ou null s'il est introuvable ou ambigu.
 * 1) nom identique (accents et casse ignorés) ; 2) tous les mots du nom le plus court se retrouvent dans l'autre
 * (« Tomas Etcheverry » / « Tomas Martin Etcheverry ») avec le même premier mot et le même dernier mot.
 * En cas de plusieurs candidats, on garde le plus actif depuis 2015 s'il est seul dans ce cas, sinon null.
 */
export function trouverIdAtp(nom, index) {
  const cle = normaliserNom(nom);
  if (!cle) return { id: null, raison: 'nom vide' };
  const choisir = (candidats) => {
    if (candidats.length === 1) return candidats[0];
    const actifs = candidats.filter((c) => c.derniere >= 2015);
    return actifs.length === 1 ? actifs[0] : null;
  };
  const exact = index.noms.get(cle);
  if (exact) {
    const c = choisir([...exact.values()]);
    return c ? { id: c.id, nom: c.nom, raison: 'nom identique' } : { id: null, raison: 'nom identique mais plusieurs joueurs' };
  }
  const mots = cle.split(' ');
  const candidats = [];
  for (const [autre, ids] of index.noms) {
    const m = autre.split(' ');
    if (m[0] !== mots[0] || m[m.length - 1] !== mots[mots.length - 1]) continue;
    const [court, long] = m.length <= mots.length ? [m, mots] : [mots, m];
    if (court.every((x) => long.includes(x))) candidats.push(...ids.values());
  }
  if (candidats.length === 0) return { id: null, raison: 'introuvable' };
  const c = choisir(candidats);
  return c ? { id: c.id, nom: c.nom, raison: 'nom proche' } : { id: null, raison: 'plusieurs candidats' };
}

/**
 * Bilan et rencontres entre deux joueurs (identifiants ATP). `a` et `b` : dans l'ordre demandé.
 * @returns {{a:number, b:number, parSurface:Array<{surface:string,a:number,b:number}>, rencontres:Array}}
 */
export function calculerH2H(idA, idB, index) {
  const liste = index.parPaire.get([idA, idB].sort().join('|')) ?? [];
  const rencontres = liste.map((m) => ({
    annee: Number(String(m.date).slice(0, 4)) || null, date: m.date, tournoi: m.tournoi,
    surface: SURFACES[String(m.surface).toLowerCase()] ?? (m.surface || null),
    tour: TOURS[m.tour] ?? m.tour, score: m.score || null, vainqueur: m.gagnant === idA ? 'a' : 'b',
    // classement ATP de l'époque (null si inconnu) ; la clé est toujours écrite : c'est elle qui dit « ligne à jour » (migration 0016)
    classement_vainqueur: m.rang_gagnant ?? null, classement_vaincu: m.rang_perdant ?? null,
  })).sort((x, y) => String(y.date).localeCompare(String(x.date)));
  const bilan = { a: 0, b: 0 };
  const surf = new Map();
  for (const r of rencontres) {
    bilan[r.vainqueur] += 1;
    if (!r.surface) continue;
    const s = surf.get(r.surface) ?? { surface: r.surface, a: 0, b: 0 };
    s[r.vainqueur] += 1;
    surf.set(r.surface, s);
  }
  return { a: bilan.a, b: bilan.b, parSurface: [...surf.values()].sort((x, y) => y.a + y.b - x.a - x.b), rencontres };
}
