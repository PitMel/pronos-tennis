// Tâche H2H : pour chaque paire de joueurs d'une affiche qui n'a pas encore de face-à-face, le calcule à partir des fichiers de résultats ATP
// de TennisMyLife et l'enregistre dans la base. N'ouvre aucune connexion elle-même : `base` et `telecharger` sont fournis (faux dans les tests).
//
//  * années terminées : téléchargées une fois pour toutes puis conservées dans le dossier de travail (cache de GitHub Actions) ;
//    jusqu'à 2025 depuis le dépôt GitHub (fichiers complets), à partir de 2026 depuis le site, une fois l'année terminée ;
//  * année courante : retéléchargée au début de chaque tournoi (dès qu'une affiche d'un tournoi qu'on n'a pas encore vu apparaît) ;
//  * licence : les fichiers bruts ne sont jamais publiés ni commités ; seul le résultat calculé est enregistré.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { lireCsv, construireIndex, trouverIdAtp, calculerH2H } from './h2h.js';

export const PREMIERE_ANNEE = 1968;
export const DERNIERE_ANNEE_GITHUB = 2025; // le dépôt GitHub n'est plus alimenté après janvier 2026
export const URL_GITHUB = (annee) => `https://raw.githubusercontent.com/Tennismylife/TML-Database/master/${annee}.csv`;
export const URL_SITE = (annee) => `https://stats.tennismylife.org/data/${annee}.csv`;
export const SOURCE = 'TennisMyLife (stats.tennismylife.org)';

async function lireMeta(dossier) {
  try { return JSON.parse(await readFile(join(dossier, 'meta.json'), 'utf8')); } catch { return { annees: {}, courant: null }; }
}

/**
 * @param {object} o
 * @param {object} o.base             h2hACalculer(), h2hEnregistrer(payload)
 * @param {(url:string)=>Promise<string>} o.telecharger  texte du CSV (lève une erreur en cas d'échec)
 * @param {string} o.dossier          dossier de travail (conservé d'un passage à l'autre)
 * @param {Date} [o.maintenant]
 * @param {boolean} [o.simulation]    calcule sans rien enregistrer
 * @param {boolean} [o.seulementBesoin] ne fait que dire s'il y a du travail
 */
export async function executerH2H({ base, telecharger, dossier, maintenant = new Date(), simulation = false, seulementBesoin = false, premiereAnnee = PREMIERE_ANNEE, journal = () => {} }) {
  const resume = { paires: 0, enregistrees: 0, indisponibles: 0, telecharges: 0, erreurs: [], modifie: false, besoin: false };
  const aCalculer = (await base.h2hACalculer()) ?? [];
  resume.paires = aCalculer.length;
  resume.besoin = aCalculer.length > 0;
  if (seulementBesoin || aCalculer.length === 0) return resume;

  const anneeCourante = Number(maintenant.toISOString().slice(0, 4));
  await mkdir(join(dossier, 'annees'), { recursive: true });
  const meta = await lireMeta(dossier);
  meta.annees ??= {};
  const fichier = (annee) => join(dossier, 'annees', `${annee}.csv`);
  const enregistrerFichier = async (annee, texte, source) => {
    await writeFile(fichier(annee), texte, 'utf8');
    meta.annees[annee] = { telecharge_le: maintenant.toISOString(), source };
    resume.telecharges += 1;
    resume.modifie = true;
  };

  // 1. Années terminées : une seule fois (une année à partir de 2026 doit avoir été téléchargée APRÈS sa fin pour être complète).
  const manquants = [];
  for (let annee = premiereAnnee; annee < anneeCourante; annee += 1) {
    const depuis = meta.annees[annee]?.telecharge_le;
    const complet = depuis && (annee <= DERNIERE_ANNEE_GITHUB || Number(depuis.slice(0, 4)) > annee);
    if (complet) continue;
    try {
      await enregistrerFichier(annee, await telecharger(annee <= DERNIERE_ANNEE_GITHUB ? URL_GITHUB(annee) : URL_SITE(annee)), annee <= DERNIERE_ANNEE_GITHUB ? 'github' : 'site');
    } catch (e) {
      resume.erreurs.push(`année ${annee} : ${e.message}`);
      if (!meta.annees[annee]) { manquants.push(annee); journal(`année ${annee} indisponible : ${e.message}`); } // un trou dans l'historique fausserait les bilans
    }
  }
  if (manquants.length > 0) {
    await writeFile(join(dossier, 'meta.json'), JSON.stringify(meta), 'utf8');
    resume.erreurs.push('historique incomplet : rien n\'est enregistré pour ce passage');
    return resume;
  }

  // 2. Année courante : retéléchargée dès qu'un tournoi nouveau (pas encore vu) a une affiche.
  const tournois = [...new Set(aCalculer.flatMap((p) => p.tournois ?? []))].map(String);
  const vus = new Set(meta.courant?.annee === anneeCourante ? meta.courant.tournois : []);
  const nouveaux = tournois.filter((t) => !vus.has(t));
  if (nouveaux.length > 0 || !meta.annees[anneeCourante] || meta.courant?.annee !== anneeCourante) {
    try {
      await enregistrerFichier(anneeCourante, await telecharger(URL_SITE(anneeCourante)), 'site');
      meta.courant = { annee: anneeCourante, tournois: [...new Set([...vus, ...tournois])], telecharge_le: maintenant.toISOString() };
    } catch (e) {
      resume.erreurs.push(`année ${anneeCourante} (courante) : ${e.message}`);
      journal(`année courante non téléchargée : ${e.message}`);
      if (!meta.annees[anneeCourante]) {
        await writeFile(join(dossier, 'meta.json'), JSON.stringify(meta), 'utf8');
        resume.erreurs.push('aucun fichier de l\'année courante : rien n\'est enregistré pour ce passage');
        return resume;
      }
    }
  }
  await writeFile(join(dossier, 'meta.json'), JSON.stringify(meta), 'utf8');

  // 3. Calcul
  const lignes = [];
  for (let annee = premiereAnnee; annee <= anneeCourante; annee += 1) {
    try { lignes.push(...lireCsv(await readFile(fichier(annee), 'utf8'))); } catch { /* année sans fichier (ex. année courante sans téléchargement) */ }
  }
  const index = construireIndex(lignes);
  const joueurs = new Map();
  const paires = [];
  const resoudre = (idBase, nom, joueurBase) => {
    if (idBase) return { id: idBase };
    const r = trouverIdAtp(nom, index);
    if (r.id) joueurs.set(joueurBase, { id: joueurBase, atp_id: r.id });
    return r;
  };
  for (const p of aCalculer) {
    const a = resoudre(p.atp_a, p.nom_a, p.joueur_a);
    const b = resoudre(p.atp_b, p.nom_b, p.joueur_b);
    if (!a.id || !b.id) {
      const quel = !a.id ? p.nom_a : p.nom_b;
      paires.push({ joueur_a: p.joueur_a, joueur_b: p.joueur_b, statut: 'indisponible', raison: `joueur non reconnu dans les fichiers ATP : ${quel}` });
      resume.indisponibles += 1;
      continue;
    }
    const h = calculerH2H(a.id, b.id, index);
    paires.push({ joueur_a: p.joueur_a, joueur_b: p.joueur_b, statut: 'ok', victoires_a: h.a, victoires_b: h.b, par_surface: h.parSurface, rencontres: h.rencontres, raison: SOURCE });
  }
  journal(`${paires.length} paire(s) calculée(s), dont ${resume.indisponibles} indisponible(s)`);
  if (simulation) { resume.resultat = paires; return resume; }
  const r = await base.h2hEnregistrer({ joueurs: [...joueurs.values()], paires });
  resume.enregistrees = r?.paires ?? paires.length;
  return resume;
}
