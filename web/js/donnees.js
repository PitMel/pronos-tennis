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
      return lire(supabase.from('tournament_results').select('tournament_id, joueur_id, points_matchs, points_pari_tournoi, bonus_classement, score_final, rang'));
    },

    /** Paris que la base me laisse lire : les miens, et ceux des autres une fois révélés (règles RLS). */
    parisDesMatchs(ids) {
      if (ids.length === 0) return Promise.resolve([]);
      return lire(supabase.from('bets')
        .select('match_id, joueur_id, choix, confiance, sets, corrige_par_admin, corrige_le').in('match_id', ids));
    },

    /** Qui a parié sur ce match (sans voir quoi), pour mon groupe. */
    quiAParie(matchId) {
      return lire(supabase.rpc('qui_a_parie', { p_match: matchId }));
    },

    /**
     * Enregistre mon pari : insertion d'un premier pari, mise à jour d'un pari existant.
     * (Pas d'« upsert » : la base n'autorise la mise à jour que de choix, confiance et sets.)
     * @returns {'cree'|'remplace'}
     */
    async enregistrerPari({ matchId, moi, pari, existe }) {
      const valeurs = { choix: pari.choix, confiance: pari.confiance, sets: pari.sets ?? null };
      const mettreAJour = async () => {
        const { data, error } = await supabase.from('bets').update(valeurs).eq('match_id', matchId).eq('joueur_id', moi).select('id');
        if (error) throw error;
        if (!data || data.length === 0) throw Object.assign(new Error('Pari fermé'), { code: 'PARI_FERME' });
        return 'remplace';
      };
      if (existe) return mettreAJour();
      const { error } = await supabase.from('bets').insert({ match_id: matchId, ...valeurs });
      if (!error) return 'cree';
      if (error.code === '23505') return mettreAJour(); // déjà un pari (posé depuis un autre appareil) : on le remplace
      throw error;
    },

    /** Paris tournoi que la base me laisse lire : le mien, et ceux des autres une fois révélés. */
    parisTournoi(tournoiId) {
      return lire(supabase.from('tournament_bets')
        .select('tournament_id, joueur_id, vainqueur_id, finaliste_id, corrige_par_admin, corrige_le').eq('tournament_id', tournoiId));
    },

    /** Qui a parié sur le tournoi (sans voir quoi), pour mon groupe. */
    quiAParieTournoi(tournoiId) {
      return lire(supabase.rpc('qui_a_parie_tournoi', { p_tournoi: tournoiId }));
    },

    /** Enregistre mon pari tournoi (insertion, ou mise à jour s'il existe déjà). Mêmes règles que pour un pari de match. */
    async enregistrerPariTournoi({ tournoiId, moi, vainqueurId, finalisteId, existe }) {
      const valeurs = { vainqueur_id: vainqueurId, finaliste_id: finalisteId };
      const mettreAJour = async () => {
        const { data, error } = await supabase.from('tournament_bets').update(valeurs).eq('tournament_id', tournoiId).eq('joueur_id', moi).select('id');
        if (error) throw error;
        if (!data || data.length === 0) throw Object.assign(new Error('Pari fermé'), { code: 'PARI_FERME' });
        return 'remplace';
      };
      if (existe) return mettreAJour();
      const { error } = await supabase.from('tournament_bets').insert({ tournament_id: tournoiId, ...valeurs });
      if (!error) return 'cree';
      if (error.code === '23505') return mettreAJour();
      throw error;
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
