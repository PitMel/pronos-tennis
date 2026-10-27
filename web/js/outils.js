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
