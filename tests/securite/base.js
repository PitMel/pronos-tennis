// Base PostgreSQL embarquée (PGlite) pour tester la sécurité : on rejoue les VRAIES migrations,
// puis on joue des tentatives d'accès comme le ferait le navigateur (rôle « authenticated » + identité du jeton).
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const ICI = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = process.env.MIGRATIONS_DIR ?? join(ICI, '..', '..', 'supabase', 'migrations');

export const ID = {
  pierre: '00000000-0000-4000-8000-000000000001', // administrateur ET vrai joueur
  lea: '00000000-0000-4000-8000-000000000002',
  marc: '00000000-0000-4000-8000-000000000003',
  andre: '00000000-0000-4000-8000-000000000011', // faux comptes
  paul: '00000000-0000-4000-8000-000000000012',
  jacques: '00000000-0000-4000-8000-000000000013',
};
export const REELS = [ID.pierre, ID.lea, ID.marc];
export const TESTS = [ID.andre, ID.paul, ID.jacques];

// joueurs de tennis (ids 1 à 8) et tournois (1 = Masters 1000, 2 = Grand Chelem, 3 = ATP Finals)
export const TENNIS = { alcaraz: 1, fritz: 2, sinner: 3, zverev: 4, djokovic: 5, medvedev: 6, musetti: 7, deminaur: 8 };
export const TOURNOI = { masters: 1, chelem: 2, finals: 3 };

export async function creerBase() {
  const db = new PGlite();
  await db.exec(readFileSync(join(ICI, 'supabase-simule.sql'), 'utf8'));
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
  }
  const profils = [
    [ID.pierre, 'Pierre', true, false],
    [ID.lea, 'Léa', false, false],
    [ID.marc, 'Marc', false, false],
    [ID.andre, 'André', false, true],
    [ID.paul, 'Paul', false, true],
    [ID.jacques, 'Jacques', false, true],
  ];
  for (const [id, prenom, admin, test] of profils) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${prenom.toLowerCase()}@pronos.invalid`]);
    await db.query('insert into public.profiles (id, prenom, is_admin, is_test) values ($1, $2, $3, $4)', [id, prenom, admin, test]);
  }
  await db.exec(`
    insert into public.players (api_id, nom) values
      ('p1','Alcaraz'),('p2','Fritz'),('p3','Sinner'),('p4','Zverev'),
      ('p5','Djokovic'),('p6','Medvedev'),('p7','Musetti'),('p8','de Minaur');
    insert into public.tournaments (annee, nom, ville, surface, categorie, etat) values
      (2026, 'Rolex Paris Masters', 'Paris', 'dur', 'masters_1000', 'en_cours'),
      (2026, 'US Open', 'New York', 'dur', 'grand_slam', 'en_cours'),
      (2026, 'Nitto ATP Finals', 'Turin', 'dur', 'atp_finals', 'en_cours');
  `);
  return new Base(db);
}

class Base {
  constructor(db) {
    this.db = db;
  }

  /** Exécute en superutilisateur (préparation des données, comme la tâche de synchronisation ou l'éditeur SQL). */
  async admin(sql, params = []) {
    return this.db.query(sql, params);
  }

  /** Exécute comme le ferait le navigateur : rôle « authenticated » (ou « anon »), identité donnée. */
  async comme(uid, sql, params = [], role = 'authenticated') {
    await this.db.exec(`set role ${role}`);
    await this.db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
    try {
      return await this.db.query(sql, params);
    } finally {
      await this.db.exec('reset role');
      await this.db.query(`select set_config('request.jwt.claim.sub', '', false)`);
    }
  }

  async anonyme(sql, params = []) {
    return this.comme(null, sql, params, 'anon');
  }

  /** Crée un match (affiche connue, à venir) et renvoie son id. */
  async nouveauMatch({ tournoi = TOURNOI.masters, tour = 'QF', p1 = TENNIS.alcaraz, p2 = TENNIS.fritz } = {}) {
    const r = await this.db.query(
      'insert into public.matches (tournament_id, tour, p1_id, p2_id, heure_prevue) values ($1,$2,$3,$4, now() + interval \'3 hours\') returning id',
      [tournoi, tour, p1, p2],
    );
    return r.rows[0].id;
  }

  /** Pari comme joueur `uid`. Renvoie la promesse (peut être rejetée par la sécurité). */
  parier(uid, match, choix, confiance, sets = null) {
    return this.comme(
      uid,
      'insert into public.bets (match_id, joueur_id, choix, confiance, sets) values ($1, $2, $3, $4, $5)',
      [match, uid, choix, confiance, sets],
    );
  }

  /** Paris lisibles par `uid` pour un match : [{joueur, choix, confiance}] triés. */
  async voirParis(uid, match) {
    const r = await this.comme(uid, 'select joueur_id, choix, confiance from public.bets where match_id = $1 order by joueur_id', [match]);
    return r.rows;
  }

  async terminer(match, { vainqueur = 1, sets = 2, fin = 'normal' } = {}) {
    await this.db.query(
      "update public.matches set statut = 'termine', vainqueur = $2, sets_joues = $3, fin_match = $4 where id = $1",
      [match, vainqueur, sets, fin],
    );
  }

  async demarrer(match) {
    await this.db.query("update public.matches set statut = 'en_cours', debut_detecte = now() where id = $1", [match]);
  }
}

export const REFUSE = /row-level security|permission denied|violates|n'appartient|Seul l'administrateur|éliminé|Grand Chelem|n'existe pas|inconnu/i;
