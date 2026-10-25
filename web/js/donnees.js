// Accès aux données (lecture seule pour ce jalon). La sécurité est dans la base : un joueur ne reçoit
// que ce que les règles RLS et la vue matches_visibles lui permettent de lire.

export function creerDonnees(supabase) {
  async function lire(requete) {
    const { data, error } = await requete;
    if (error) throw error;
    return data;
  }

  return {
    tournois() {
      return lire(supabase.from('tournaments')
        .select('id, annee, nom, ville, surface, indoor, categorie, date_debut, date_fin, etat, vainqueur_id, finaliste_id'));
    },

    async tournoi(id) {
      const lignes = await lire(supabase.from('tournaments')
        .select('id, annee, nom, ville, surface, indoor, categorie, date_debut, date_fin, etat, vainqueur_id, finaliste_id')
        .eq('id', id));
      return lignes[0] ?? null;
    },

    matchs(tournoiId) {
      return lire(supabase.from('matches_visibles')
        .select('id, tournament_id, tour, heure_prevue, p1_id, p2_id, statut, debut_detecte, neutralise, paris_reveles, verrouille, resultat_visible, vainqueur, sets_joues, score, fin_match')
        .eq('tournament_id', tournoiId));
    },

    /** Les parieurs du groupe (réel ou test) de la personne connectée, actifs seulement. */
    profilsGroupe(isTest) {
      return lire(supabase.from('profiles').select('id, prenom, couleur').eq('is_test', isTest).eq('actif', true).order('prenom'));
    },

    /** Archives de clôture (scores finaux figés), pour la Race. */
    resultats() {
      return lire(supabase.from('tournament_results').select('tournament_id, joueur_id, score_final'));
    },

    /** Joueurs de tennis demandés, sous forme de Map id → joueur. */
    async joueurs(ids) {
      const uniques = [...new Set(ids.filter((i) => i !== null && i !== undefined))];
      if (uniques.length === 0) return new Map();
      const lignes = await lire(supabase.from('players').select('id, nom, pays, classement').in('id', uniques));
      return new Map(lignes.map((j) => [j.id, j]));
    },
  };
}
