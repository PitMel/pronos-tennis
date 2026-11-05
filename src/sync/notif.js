// Notifications par e-mail (cahier des charges : ajout du 5 nov. 2026). Fonctions pures + envoi via l'API Brevo (gratuit).
// La clé Brevo vient d'une variable d'environnement (secret GitHub) ; elle n'est jamais écrite ni journalisée.
import { construireRace } from '../../web/js/classement.js';

const TOURS = { R16: 'huitièmes de finale', QF: 'quarts de finale', SF: 'demi-finales', F: 'finale', RR: 'matchs de poule' };
const echapper = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const heureParis = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const f = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return f.format(d).replace(' à ', ' ');
};

/** Texte d'un score de points : « 12 » ou « 1/2 » → forme française via le moteur si fourni. */
const pts = (moteur, texte) => {
  try { return moteur.formaterPoints(moteur.Fraction.de(texte), { signe: false }); } catch { return String(texte); }
};

/** Ligne de classement de la Race d'après les données de clôture ; [] si elle ne peut pas être calculée. */
export function racePourCourriel(moteur, evenement) {
  const d = evenement.race_donnees;
  if (!d) return [];
  try {
    const r = construireRace({ moteur, annee: evenement.tournoi.annee, tournois: d.tournois, resultats: d.resultats, profils: d.profils });
    return r.lignes.map((l) => ({ rang: l.rang, prenom: l.prenom, points: l.points }));
  } catch { return []; }
}

/** Courriel (sujet, texte, html) pour un événement et un destinataire. */
export function construireCourriel(ev, dest, { urlSite, moteur } = {}) {
  const nom = ev.tournoi.nom;
  const lien = urlSite ? `${urlSite.replace(/\/+$/, '')}/#/tournoi/${ev.tournoi.id}` : '';
  const bonjour = `Bonjour ${dest.prenom},`;
  let sujet; let lignes = []; let tableau = null;
  if (ev.type === 'tour_ouvert') {
    const tour = TOURS[ev.tour] ?? ev.tour;
    sujet = `${nom} : les ${tour} sont à parier`;
    lignes = [`Toutes les affiches des ${tour} du ${nom} sont connues : tu peux parier.`];
    tableau = ev.matchs.map((m) => `${m.p1} – ${m.p2}${m.heure ? ` (${heureParis(m.heure)})` : ''}`);
  } else if (ev.type === 'paris_visibles') {
    const tour = TOURS[ev.tour] ?? ev.tour;
    sujet = `${nom} : les paris des ${tour} sont visibles`;
    lignes = [`Tout le monde a parié sur tous les matchs des ${tour} du ${nom} : les paris sont désormais visibles.`];
  } else {
    const premier = ev.classement?.[0];
    sujet = `${nom} terminé${premier ? ` — ${premier.prenom} l’emporte` : ''}`;
    lignes = [`Le ${nom} est terminé.`];
    if (ev.vainqueur) lignes.push(`Vainqueur : ${ev.vainqueur}${ev.finaliste ? ` · finaliste : ${ev.finaliste}` : ''}.`);
    const clas = (ev.classement ?? []).map((c) => `${c.rang}. ${c.prenom} — ${moteur ? pts(moteur, c.score_final) : c.score_final}`);
    const race = moteur ? racePourCourriel(moteur, ev).map((c) => `${c.rang}. ${c.prenom} — ${c.points}`) : [];
    tableau = [...(clas.length ? ['Classement du tournoi :', ...clas] : []), ...(race.length ? ['', `Race ${ev.tournoi.annee} :`, ...race] : [])];
  }
  const pied = 'Tu peux choisir les notifications que tu reçois dans ta page Profil.';
  const texte = [bonjour, '', ...lignes, ...(tableau ? ['', ...tableau] : []), ...(lien ? ['', lien] : []), '', pied].join('\n');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;color:#1c2430">`
    + `<p>${echapper(bonjour)}</p>${lignes.map((l) => `<p>${echapper(l)}</p>`).join('')}`
    + (tableau ? `<p style="line-height:1.6">${tableau.map((l) => echapper(l)).join('<br>')}</p>` : '')
    + (lien ? `<p><a href="${echapper(lien)}">Ouvrir Pronos Tennis</a></p>` : '')
    + `<p style="color:#667085;font-size:12px">${echapper(pied)}</p></div>`;
  return { sujet: `Pronos Tennis — ${sujet}`, texte, html };
}

/** Envoi d'un courriel par l'API Brevo. Lève une erreur (sans la clé) si l'envoi échoue. */
export async function envoyerBrevo({ cle, expediteur, destinataire, sujet, texte, html, fetchImpl = globalThis.fetch }) {
  const r = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': cle, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ sender: expediteur, to: [{ email: destinataire.email, name: destinataire.prenom }], subject: sujet, htmlContent: html, textContent: texte }),
  });
  if (!r.ok) {
    const corps = (await r.text().catch(() => '')).replace(cle, '***').slice(0, 200);
    throw new Error(`Brevo : réponse ${r.status} ${corps}`);
  }
}

/**
 * Passe de notifications : demande à la base les événements, envoie, puis marque chaque envoi réussi.
 * Sans clé Brevo ou sans expéditeur : ne fait rien (rien n'est marqué, tout partira quand la clé sera là).
 */
export async function executerNotifications({ base, envoyer, moteur, urlSite, configure = true, journal = () => {}, limite = 40 }) {
  const bilan = { evenements: 0, envoyes: 0, echecs: 0, ignore: null };
  if (!configure) { bilan.ignore = 'Brevo non configuré (clé ou expéditeur absent)'; journal(bilan.ignore); return bilan; }
  const evenements = (await base.notifAFaire()) ?? [];
  bilan.evenements = evenements.length;
  for (const ev of evenements) {
    for (const dest of ev.destinataires ?? []) {
      if (bilan.envoyes + bilan.echecs >= limite) { journal('limite d’envois par passage atteinte : le reste partira au prochain passage'); return bilan; }
      try {
        const c = construireCourriel(ev, dest, { urlSite, moteur });
        await envoyer({ destinataire: dest, ...c });
        await base.notifMarquer(ev.cle, dest.joueur_id);
        bilan.envoyes += 1;
      } catch (e) {
        bilan.echecs += 1;
        journal(`échec d’envoi (${ev.cle}, ${dest.prenom}) : ${e.message}`);
      }
    }
  }
  journal(`notifications : ${bilan.evenements} événement(s), ${bilan.envoyes} envoyé(s), ${bilan.echecs} échec(s)`);
  return bilan;
}
