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
      return lire(supabase.from('profiles').select('id, prenom, couleur, photo_url').eq('is_test', isTest).eq('actif', true).order('prenom'));
    },

    /** Tous les profils (lecture ouverte) : l'administration voit les deux groupes, actifs ou non. */
    profilsTous() {
      return lire(supabase.from('profiles').select('id, prenom, couleur, photo_url, is_test, actif, is_admin').order('prenom'));
    },

    /** Envoie la photo (JPEG déjà réduit) d'un compte et la rattache au profil. Renvoie l'adresse enregistrée. */
    async televerserPhoto(profilId, blob) {
      const chemin = `${profilId}.jpg`;
      const { error } = await supabase.storage.from('avatars').upload(chemin, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
      if (error) throw error;
      const { data } = supabase.storage.from('avatars').getPublicUrl(chemin);
      const url = `${data.publicUrl}?v=${Date.now()}`;
      await this.enregistrerCompte(profilId, { photo_url: url });
      return url;
    },

    /** Retire la photo d'un compte (le fichier est supprimé si le stockage le permet, l'adresse l'est dans tous les cas). */
    async retirerPhoto(profilId) {
      await this.enregistrerCompte(profilId, { photo_url: null });
      try { await supabase.storage.from('avatars').remove([`${profilId}.jpg`]); } catch { /* le profil n'affiche déjà plus la photo */ }
    },

    /** Administrateur : modifie les colonnes autorisées d'un profil (couleur, actif, groupe test). */
    async enregistrerCompte(id, valeurs) {
      const { data, error } = await supabase.from('profiles').update(valeurs).eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw Object.assign(new Error('Modification refusée'), { code: '42501' });
    },

    /** Administrateur : données de clôture d'un tournoi (même si les conditions automatiques ne sont pas remplies). */
    donneesCloture(tournoiId) {
      return lire(supabase.rpc('admin_donnees_cloture', { p_tournoi: tournoiId }));
    },

    /** Administrateur : clôture (même forcée) ou correction d'une clôture. Le calcul vient du moteur, la base le contrôle. */
    cloturerTournoi({ tournoiId, resultats, vainqueurId, finalisteId }) {
      return lire(supabase.rpc('admin_cloturer_tournoi', { p_tournoi: tournoiId, p_resultats: resultats, p_vainqueur: vainqueurId, p_finaliste: finalisteId }));
    },

    /** Administrateur : rouvre un tournoi clos (archive effacée). */
    rouvrirTournoi(tournoiId) {
      return lire(supabase.rpc('admin_rouvrir_tournoi', { p_tournoi: tournoiId }));
    },

    /** Administrateur : saisit ou remplace le pari d'un joueur sur un match (marqué « corrigé », inscrit au journal). Renvoie 'cree' ou 'remplace'. */
    corrigerPari({ matchId, joueurId, choix, confiance, sets = null, motif = null }) {
      return lire(supabase.rpc('admin_saisir_pari', { p_match: matchId, p_joueur: joueurId, p_choix: choix, p_confiance: confiance, p_sets: sets, p_motif: motif }));
    },

    /** Administrateur : idem pour le pari tournoi. */
    corrigerPariTournoi({ tournoiId, joueurId, vainqueurId, finalisteId, motif = null }) {
      return lire(supabase.rpc('admin_saisir_pari_tournoi', { p_tournoi: tournoiId, p_joueur: joueurId, p_vainqueur: vainqueurId, p_finaliste: finalisteId, p_motif: motif }));
    },

    /** Exclusions d'un tournoi (lecture ouverte, écriture administrateur). */
    exclusions(tournoiId) {
      return lire(supabase.from('exclusions').select('id, joueur_id, tournament_id, match_id').eq('tournament_id', tournoiId));
    },

    async ajouterExclusion({ joueurId, tournoiId, matchId = null }) {
      const { error } = await supabase.from('exclusions').insert({ joueur_id: joueurId, tournament_id: tournoiId, match_id: matchId });
      if (error) throw error;
    },

    async retirerExclusion(id) {
      const { data, error } = await supabase.from('exclusions').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw Object.assign(new Error('Suppression refusée'), { code: '42501' });
    },

    /** Journal des corrections (vue réservée à l'administrateur ; contenu masqué tant que les paris d'un vrai joueur ne sont pas révélés). */
    journalCorrections(limite = 200) {
      return lire(supabase.from('corrections_admin_visibles')
        .select('id, cree_le, joueur_id, kind, ref_id, motif, contenu_visible, avant, apres').order('id', { ascending: false }).limit(limite));
    },

    /** Journal de la synchronisation (lecture réservée à l'administrateur : la base renvoie rien aux autres). */
    journalSynchro(limite = 60) {
      return lire(supabase.from('sync_log')
        .select('id, date_appel, endpoint, http_status, ok, quota_restant, message, reset_a').order('id', { ascending: false }).limit(limite));
    },

    /** Identifiants de l'API rattachés à un tournoi (lecture ouverte, écriture administrateur). */
    async idsApi(tournoiId) {
      const lignes = await lire(supabase.from('tournament_api_ids').select('api_id').eq('tournament_id', tournoiId));
      return lignes.map((l) => l.api_id).sort();
    },

    /** Administrateur : crée ou modifie une fiche de tournoi. Renvoie son identifiant. */
    async enregistrerTournoi({ id = null, valeurs }) {
      if (id === null) {
        const { data, error } = await supabase.from('tournaments').insert(valeurs).select('id');
        if (error) throw error;
        return data?.[0]?.id ?? null;
      }
      const { data, error } = await supabase.from('tournaments').update(valeurs).eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw Object.assign(new Error('Modification refusée'), { code: '42501' });
      return id;
    },

    async ajouterIdApi(tournoiId, apiId) {
      const { error } = await supabase.from('tournament_api_ids').insert({ api_id: apiId, tournament_id: tournoiId });
      if (error) throw error;
    },

    async retirerIdApi(tournoiId, apiId) {
      const { data, error } = await supabase.from('tournament_api_ids').delete().eq('api_id', apiId).eq('tournament_id', tournoiId).select('api_id');
      if (error) throw error;
      if (!data || data.length === 0) throw Object.assign(new Error('Suppression refusée'), { code: '42501' });
    },

    /** Administrateur : tous les matchs d'un tournoi, table brute (résultats compris, même masqués aux joueurs). */
    matchsAdmin(tournoiId) {
      return lire(supabase.from('matches')
        .select('id, api_id, tournament_id, tour, heure_prevue, p1_id, p2_id, statut, vainqueur, sets_joues, score, fin_match, neutralise, modifie_manuellement')
        .eq('tournament_id', tournoiId));
    },

    async matchAdmin(id) {
      const lignes = await lire(supabase.from('matches')
        .select('id, api_id, tournament_id, tour, heure_prevue, p1_id, p2_id, statut, vainqueur, sets_joues, score, fin_match, neutralise, modifie_manuellement')
        .eq('id', id));
      return lignes[0] ?? null;
    },

    /** Tous les joueurs de tennis connus (pour ajouter un match à la main). */
    tousLesJoueurs() {
      return lire(supabase.from('players').select('id, nom, pays, classement').order('nom'));
    },

    /** Administrateur : crée (id nul) ou modifie un match. Renvoie son identifiant. */
    async enregistrerMatch({ id = null, valeurs }) {
      if (id === null) {
        const { data, error } = await supabase.from('matches').insert(valeurs).select('id');
        if (error) throw error;
        return data?.[0]?.id ?? null;
      }
      const { data, error } = await supabase.from('matches').update(valeurs).eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw Object.assign(new Error('Modification refusée'), { code: '42501' });
      return id;
    },

    async supprimerMatch(id) {
      const { data, error } = await supabase.from('matches').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw Object.assign(new Error('Suppression refusée'), { code: '42501' });
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
