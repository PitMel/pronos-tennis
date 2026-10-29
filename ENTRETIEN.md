# Entretien et pannes — Pronos Tennis

Tout est gratuit, donc deux « mises en veille » automatiques existent. Elles sont couvertes par le workflow **Entretien**
(`.github/workflows/entretien.yml`), qui tourne **chaque jour, toute l'année**, sans réglage.

## Ce qui est automatique

| Risque | Ce que fait Entretien | Si ça échoue |
|---|---|---|
| Supabase met le projet en pause après ~7 jours sans activité | Appelle la base chaque jour (la doc Supabase : quelques requêtes par jour suffisent) ; Supabase prévient aussi par e-mail environ une semaine avant une pause | Exécution rouge dans l'onglet Actions (+ e-mail GitHub, normalement) |
| GitHub désactive les tâches planifiées après 60 jours sans activité | Si le dernier commit a plus de 30 jours, crée un commit daté (`.github/derniere-activite.txt`) | Idem |

Le workflow ne dépend pas de la variable `SYNCHRO_ACTIVE` (qui, elle, ne concerne que la synchronisation avec l'API).
Il utilise les secrets `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` déjà créés pour la synchronisation.

## Ce que voient les joueurs si le service ne répond pas

Une carte « Le service est indisponible » avec un bouton **Réessayer** (ou « Pas de connexion » si l'appareil est hors ligne).
Personne n'est déconnecté. Si l'écran reste sur « Chargement… » plus de 15 secondes, un message l'explique.
L'appli installée sur l'écran d'accueil s'ouvre quand même (écran de connexion), mais n'affiche aucune donnée sans le service.

## Que faire si…

**Le projet Supabase est en pause** (carte « service indisponible » qui dure, ou exécution Entretien rouge avec « HTTP 540/503 »)
1. Ouvrir le tableau de bord Supabase (supabase.com/dashboard), projet `pronos-tennis`.
2. Cliquer **Restore project** (bouton visible sur le projet en pause) et attendre quelques minutes.
3. Dans GitHub > Actions > Entretien > **Run workflow** pour vérifier que tout est revenu au vert.
Un projet gratuit en pause reste restaurable longtemps (la documentation de Supabase indique 90 jours à 1 an selon la page) ; ne pas attendre.

**Les tâches planifiées de GitHub sont désactivées** (bandeau jaune dans l'onglet Actions, ou alerte « aucun appel depuis plus de 48 heures » dans l'administration)
1. GitHub > Actions > cliquer le workflow concerné (« Synchronisation API » ou « Entretien ») dans la colonne de gauche.
2. Cliquer **Enable workflow**. C'est tout.
3. Pour la synchronisation, vérifier aussi Settings > Secrets and variables > Actions > Variables : `SYNCHRO_ACTIVE` doit valoir `true`.

**Un workflow est rouge** : ouvrir l'exécution, le message d'erreur en rouge dit quoi faire (secret absent, Supabase en pause…).

## Ce qui n'est PAS couvert

- Pas de sauvegarde automatique de la base (l'offre gratuite de Supabase n'en propose pas). Les données importantes sont
  les pronostics et les résultats de la saison en cours ; une exportation régulière peut être ajoutée si tu le souhaites.
- Une panne chez Supabase, GitHub ou la Live Tennis API elle-même : l'appli affiche le message ci-dessus, mais il faut attendre.
- Les quotas gratuits (stockage, requêtes) : très largement suffisants pour quelques amis.
