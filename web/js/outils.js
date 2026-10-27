// Petits outils communs (purs, sans accès au navigateur : testables sous Node).

/** Échappe le texte venant de la base avant de l'insérer dans la page. */
export function echapper(texte) {
  return String(texte ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const FUSEAU = 'Europe/Paris';

/** « lun. 2 nov. · 14h30 » (heure de Paris) ; chaîne vide si la date est inconnue. */
export function formaterHeureParis(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d).map((x) => [x.type, x.value]),
  );
  return `${p.weekday} ${p.day} ${p.month} · ${p.hour}h${p.minute}`;
}

function dateUtc(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd ?? ''));
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)) : null;
}

function morceaux(d) {
  const f = (opts) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', ...opts }).format(d);
  return { jour: f({ day: 'numeric' }), mois: f({ month: 'long' }), annee: f({ year: 'numeric' }) };
}

/** Période d'un tournoi : « 2 au 8 novembre 2026 », « 30 octobre au 5 novembre 2026 » ; « Dates à venir » si inconnues. */
export function formaterPeriode(debut, fin) {
  const d = dateUtc(debut);
  const f = dateUtc(fin);
  if (!d && !f) return 'Dates à venir';
  if (d && !f) { const a = morceaux(d); return `À partir du ${a.jour} ${a.mois} ${a.annee}`; }
  if (!d && f) { const b = morceaux(f); return `Jusqu’au ${b.jour} ${b.mois} ${b.annee}`; }
  const a = morceaux(d);
  const b = morceaux(f);
  if (a.annee !== b.annee) return `${a.jour} ${a.mois} ${a.annee} au ${b.jour} ${b.mois} ${b.annee}`;
  if (a.mois !== b.mois) return `${a.jour} ${a.mois} au ${b.jour} ${b.mois} ${b.annee}`;
  if (a.jour !== b.jour) return `${a.jour} au ${b.jour} ${b.mois} ${b.annee}`;
  return `${a.jour} ${a.mois} ${a.annee}`;
}

/** Année civile en cours à Paris (« Saison 2026 »). */
export function anneeCourante(maintenant = new Date()) {
  return Number(new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, year: 'numeric' }).format(maintenant));
}

/** Date du jour à Paris, au format AAAA-MM-JJ (comparable aux dates de tournoi de la base). */
export function dateDuJour(maintenant = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit' }).format(maintenant);
}

/** « il y a 5 min », « il y a 3 h 20 », « il y a 2 j » ; vide si la date est inconnue. */
export function depuisDuree(iso, maintenant = new Date()) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const minutes = Math.max(0, Math.round((maintenant.getTime() - t) / 60000));
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 24) return `il y a ${heures} h${minutes % 60 ? ` ${String(minutes % 60).padStart(2, '0')}` : ''}`;
  return `il y a ${Math.floor(heures / 24)} j`;
}

/** Heure de Paris d'un instant ISO → valeur d'un champ « datetime-local » (« 2026-11-02T14:30 ») ; vide si inconnue. */
export function heureParisVersChamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Valeur d'un champ « datetime-local » (heure de Paris) → instant ISO UTC ; null si vide ou invalide. */
export function champVersHeureParis(texte) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(texte ?? '').trim());
  if (!m) return null;
  const [a, mo, j, h, mi] = m.slice(1).map(Number);
  const voulu = Date.UTC(a, mo - 1, j, h, mi);
  // on cherche l'instant UTC dont l'heure de Paris est celle demandée (deux passes pour franchir un changement d'heure)
  let instant = voulu;
  for (let i = 0; i < 2; i += 1) {
    const lu = heureParisVersChamp(new Date(instant).toISOString());
    const l = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(lu);
    if (!l) return null;
    const [la, lmo, lj, lh, lmi] = l.slice(1).map(Number);
    instant += voulu - Date.UTC(la, lmo - 1, lj, lh, lmi);
  }
  const final = new Date(instant);
  return heureParisVersChamp(final.toISOString()) === `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` ? final.toISOString() : null;
}
