# ETAT.md — Pronos Tennis

Dernière mise à jour : 24 octobre 2026 (session 1 : moteur de points, schéma, sécurité et correction par l'administrateur, installés et vérifiés sur le vrai projet).

**Pour reprendre dans une nouvelle conversation** : lire `CAHIER_DES_CHARGES.md` (les règles font foi), puis ce fichier, puis « Prochaine étape ».
Règles de travail de Pierre : tout reste gratuit ; jamais de clé ni de secret dans le chat ni dans le code (dépôt public) ; effort élevé pour les fondations, moyen ensuite pour l'interface ; petites étapes avec un commit chacune ; aucune règle de points modifiée sans son accord ; rien ajouté hors cahier des charges sans lui en parler ; en cas d'ambiguïté, lui poser la question ; dire en quelques lignes ce qui va être fait avant de coder ; le guider pas à pas (Windows 11, PowerShell, VS Code, commandes exactes, où cliquer dans GitHub et Supabase).

## Où on en est

| Étape | État |
|---|---|
| 0 — Prérequis | Dépôt GitHub (public) et projet Supabase (Europe) créés. Git et Node.js installés sur le PC de Pierre, dépôt cloné et à jour. L'application GitHub « Claude » est installée : Claude peut pousser. |
| 1.1 — Moteur de points + tests | **Fait** : 76 tests. |
| 1.2 — Schéma Supabase, sécurité, comptes | **Fait et installé sur le vrai projet** : migration 0001 (11 tables, RLS) ; 4 comptes Auth créés par Pierre ; profils créés (`supabase/comptes.sql`) : **Pierre** administrateur (groupe réel), **André, Paul, Jacques** faux comptes (groupe test). |
| 1.3 — Tests de sécurité | **Fait** : 70 tests de simulation (+ 19 pour la correction) et `supabase/verification-securite.sql` joué sur le vrai projet : **89 vérifications OK, 0 échec**, tout annulé (aucune donnée résiduelle). À rejouer après chaque migration. |
| 1.4 — Correction par l'administrateur (migration 0002) | **Fait et installé sur le vrai projet** (0002 + 0003, voir section ci-dessous). 19 tests ; 25 failles volontaires introduites, 24 détectées, 1 redondance voulue. |
| 2 à 6 | À faire (cahier des charges, section 15). |

Total : 165 tests, tous verts (`npm install` puis `npm test`, environ 1 minute).

## Étape 1.1 — moteur de points (fait et testé)

- `src/moteur/` : module pur sans dépendance (Node et navigateur, modules ES).
  - `fraction.js` : nombres rationnels exacts (BigInt), aucun flottant. `Fraction.de(1.5)` est refusé ; écrire `"1.5"`.
  - `format.js` : affichage français (`13,5`, `−0,75`, vrai signe moins U+2212, 2 décimales au plus, sans zéros inutiles, arrondi moitié éloignée de zéro à l'affichage seulement).
  - `regles.js` : tous les barèmes. **Seul endroit à modifier si Pierre change une règle** (puis cahier des charges, ETAT.md et tests).
  - `moteur.js` : `pointsPari`, `pointsMatch`, `gainsPossibles`, `pointsPariTournoi`, `bonusClassement`, `rangs`, `calculerTournoi` (trois étapes), `calculerRace`, `validerPari`, `validerPariTournoi`.
- Conventions : joueur de tennis d'un match = `1` ou `2` ; catégories `grand_slam`, `masters_1000`, `atp_finals` ; tours internes `R16`, `QF`, `SF`, `F` et `RR` (poules ATP Finals) ; correspondance avec les codes de l'API à faire à l'étape 2 (point ouvert n° 2). Un match est « compté » s'il est neutralisé, forfait, ou terminé avec un vainqueur.
- Le calcul des points est **tolérant** (sets manquants en Grand Chelem = pas de bonus, pas de plantage) ; la saisie est **stricte** (`validerPari`, doublée par des contraintes SQL).
- `calculerTournoi` renvoie les trois étapes demandées par Pierre : `pointsMatchs` → `apresPariTournoi` → `final` (après bonus 1er/2e), avec les rangs de chaque étape ; seule l'étape 1 tant que le tournoi n'est pas clos. `joueurs` définit le groupe (réel ou test, jamais mélangés).
- Test de mutation : 12 règles de points abîmées une à une, 12 détectées.

## Étapes 1.2 et 1.3 — base de données et sécurité (testées en simulation)

**Fichiers** : `supabase/migrations/0001_schema.sql` (tables, contraintes, fonctions, déclencheurs, règles RLS, vue) ; `supabase/comptes.sql` (profils de l'administrateur et des faux comptes) ; `tests/securite/` (base.js, supabase-simule.sql, paris.test.js, resultats-droits.test.js, pari-tournoi.test.js).

**Comment les tests fonctionnent** : PGlite (PostgreSQL embarqué gratuit, `npm install`) rejoue la vraie migration avec un simulateur minimal de Supabase (rôles `anon`, `authenticated`, `service_role`, `auth.uid()`), puis joue des tentatives d'accès comme le ferait le navigateur. C'est une **simulation** : elle ne remplace pas la vérification sur le vrai projet.

**Tables** : `profiles` (is_admin, is_test, actif), `players`, `tournaments`, `tournament_api_ids` (plusieurs identifiants d'API par tournoi), `matches`, `bets`, `tournament_bets`, `exclusions`, `revelations`, `tournament_results` (points stockés en texte exact « 27/2 »), `sync_log`.

**Règles de sécurité retenues**
- **Groupes étanches** : « tous les joueurs » = comptes actifs du même type (réels entre eux, faux comptes entre eux), hors joueurs exclus du match ou du tournoi.
- **Paris cachés** : un joueur lit ses paris ; ceux des autres seulement une fois révélés (tout le groupe a parié, ou match neutralisé), et seulement dans son groupe. Un tournoi clos révèle aussi tous les paris tournoi.
- **Révélation mémorisée** (table `revelations`, écrite par déclencheurs) : une fois révélés, les paris restent révélés et figés, même si un compte est créé ou désactivé ensuite, ou si la neutralisation est annulée.
- **Modifiable** tant que : match à venir, début non détecté, non neutralisé, pas forfait, non révélé. Jamais de suppression de pari. Un joueur ne peut parier qu'en son nom.
- **Résultats masqués** : la table `matches` n'est lisible que par l'administrateur ; les joueurs lisent la vue `matches_visibles`, qui masque vainqueur, sets, score et type de fin tant que le match n'est pas terminé ET les paris révélés. Elle fournit aussi `paris_reveles`, `verrouille`, `resultat_visible`.
- **Qui a parié** : fonctions `qui_a_parie(match)` et `qui_a_parie_tournoi(tournoi)` (sans le contenu des paris, limitées au groupe de la personne connectée).
- **Administrateur** : écrit calendrier, matchs, joueurs, exclusions, résultats archivés ; joue les faux comptes (lit et écrit leurs paris) ; **ne lit jamais les paris non révélés des vrais joueurs**, ni les siens en tant qu'autre joueur. Un administrateur désactivé perd ses droits. Le rôle « service » (synchronisation) contourne la RLS.
- **Comptes** : créés par l'administrateur (Authentication > Users), jamais par l'application. Un joueur ne modifie que sa couleur et sa photo ; prénom, actif, groupe test et droits sont réservés à l'administrateur ; `is_admin` n'est modifiable que par SQL.
- **Contraintes** : confiance 6 à 10, choix 1 ou 2, sets obligatoires (3, 4, 5) en Grand Chelem et interdits ailleurs, un pari par joueur et par match, vainqueur ≠ finaliste, joueurs éliminés non sélectionnables au pari tournoi (une défaite en poule des ATP Finals n'élimine pas), tour valide pour la catégorie (`RR` seulement aux ATP Finals), points archivés au format exact.
- Fonctions internes (`groupe_complet_*`, `maj_revelations_*`, `joueur_elimine`) et table `revelations` : inaccessibles depuis le navigateur. Visiteur non connecté (`anon`) : aucun accès.

**Test de mutation de la sécurité** : 22 failles introduites volontairement, une à une (lecture des paris, groupes, révélation, verrouillage, résultats visibles, matches lisible, revelations ouverte, is_admin modifiable, profils non protégés, révélation non mémorisée, exclusions ignorées, pari au nom d'un autre, anon ouvert, suppression, fonctions internes ouvertes, sets, éliminés, etc.). Toutes détectées ; la seule survivante (« neutralisation ne révèle plus ») était une redondance voulue (deux voies) et est détectée quand on retire les deux.

## Migration 0002 — correction par l'administrateur (fait, installé et vérifié)

**Fichiers** : `supabase/migrations/0002_correction_admin.sql`, `supabase/migrations/0003_admin_corrige_son_pari.sql` (retire l'interdiction de corriger son propre pari), `tests/securite/correction-admin.test.js`.
- **Fonctions** (administrateur seulement, vérifié dans la fonction) : `admin_saisir_pari(match, joueur, choix, confiance, sets, motif)` et `admin_saisir_pari_tournoi(tournoi, joueur, vainqueur, finaliste, motif)`. Elles créent ou remplacent le pari d'un joueur **même après le match et la révélation**, et renvoient seulement `cree` ou `remplace` (jamais le contenu d'un pari : écriture « à l'aveugle »).
- **Mention** : colonnes `corrige_par_admin` et `corrige_le` sur `bets` et `tournament_bets`, visibles avec le pari. Droits d'écriture limités par colonne : ni un joueur ni l'administrateur (hors fonctions) ne peuvent les écrire.
- **Journal** : table `corrections_admin` (fermée), lue par l'administrateur seulement via la vue `corrections_admin_visibles` ; « avant » et « après » ne s'affichent que si le pari est révélé ou appartient à un faux compte.
- **Résultats** : tout changement de statut, vainqueur, sets, score, fin de match ou neutralisation par l'administrateur connecté pose `matches.modifie_manuellement` ; la synchronisation (sans identité) ne le pose pas.
- **Choix de conception (à signaler à Pierre)** : l'administrateur **peut corriger son propre pari** (décision de Pierre du 24 oct., migration 0003 ; la mention « corrigé par l'administrateur » reste visible de tous et le journal est tenu) ; pas de correction dans un tournoi clos (le rouvrir d'abord) ; une correction du pari tournoi peut désigner un joueur déjà éliminé (le joueur avait parié avant) — cette dérogation n'est active que dans la fonction et pour l'administrateur ; les confiance 6–10, choix 1/2 et sets en Grand Chelem restent contrôlés.
- **Deux vues** (page joueur identique pour tous / page administrateur séparée) : à construire à l'étape interface ; la sécurité réelle est déjà dans la base.

## Décisions prises (en plus du cahier des charges)

Par Pierre, 23 octobre 2026 :
- Point ouvert n° 6 : exclusion d'un joueur d'un match ou d'un tournoi par l'admin ; n° 7 : paris révélés à la neutralisation.
- « Tous » = comptes actifs du même type. Phase de test : trois faux comptes **André, Paul, Jacques**, joués depuis le compte administrateur **Pierre** (vrai compte, groupe réel). Pierre ne parie pas avec son compte réel avant janvier 2027 (seul de son groupe, ses paris seraient révélés et verrouillés aussitôt).
- Nombre de sets = total de sets joués, obligatoire en Grand Chelem ; vainqueur ≠ finaliste ; classement en cours de tournoi = points des matchs ; pari tournoi ajouté à la clôture avant bonus.
- Affichage du score en trois étapes (avant bonus vainqueur/finaliste, après, après bonification 1er/2e).
- Égalités à 3 ou plus : valeur exacte en fraction (5/3), arrondi à l'affichage seulement (1,67).

Par Pierre, 24 octobre 2026 : l'administrateur peut aussi corriger son propre pari ; l'administrateur peut réécrire un pari de vrai joueur ou en saisir un manquant, même après le match, avec mention « corrigé par l'administrateur » ; deux vues séparées ; clôture automatique « tournoi clos » (finale terminée et comptée ; l'administrateur peut forcer, corriger, rouvrir) acceptée.

Choix de conception faits par Claude (à signaler à Pierre s'ils le gênent) :
- L'administrateur lit la table brute `matches` (nécessaire pour corriger résultats et statuts) : en tant que joueur, il peut donc voir un résultat avant la révélation. Aucun pari n'est concerné.
- Un compte créé après la révélation d'un match ne peut plus parier sur ce match.
- Un match forfait est verrouillé ; ses paris ne sont révélés que si tout le groupe a parié ou si l'admin le neutralise.
- Un tournoi clos révèle tous les paris tournoi, même incomplets.
- Prénom unique par groupe (l'administrateur « Pierre » et un éventuel faux « Pierre » ne sont plus en conflit puisque le faux compte s'appelle André).

## Points ouverts

- Section 14 du cahier des charges : n° 2 (codes de tours : R16 = 4ᵉ tour du Grand Chelem ? poules des ATP Finals ?), n° 3 et 4 (quota API et compteur d'usage), n° 5 (abandons dans l'API), n° 8 (photos), n° 9 à 11 (robustesse, notifications), n° 12 (JavaScript natif pour le moteur ; interface à confirmer en début d'étape 3).
- n° 1 résolu : `reference/api/masters_1000.json` montre que les 9 Masters existent si on fusionne les filtres `category = masters_1000` et `tier = atp_1000` ; chacun a deux identifiants ; le Canada apparaît sous Toronto et Montréal (d'où `tournament_api_ids`).
- **Extension d'e-mail technique** : `@pronos.invalid` n'a pas été vérifiée avec Supabase. Si l'écran « Add user » la refuse, utiliser une autre adresse (par ex. `andre@example.com`) à l'identique dans l'écran et dans `comptes.sql`.
- Les tests de sécurité sont une simulation : à confirmer sur le vrai projet (voir ci-dessous).

## Prochaine étape précise

**A. Pierre : désactiver les inscriptions libres** (Supabase > Authentication > Sign In / Providers, ou « Providers » > Email : désactiver « Allow new users to sign up »). Sans cela, quelqu'un qui connaîtrait l'adresse du projet et la clé publique pourrait créer un compte vide et lire les données de référence (prénoms, tournois). À confirmer par Pierre. Le conseiller Supabase signale aussi « Leaked password protection » (fonction payante probable : sans objet).

**B. Étape 2 — synchronisation de l'API** (effort élevé) : tâche GitHub Actions, secrets saisis par Pierre dans les réglages du dépôt (Settings > Secrets and variables > Actions), nouvelles tentatives avec pause croissante, garde-fou de quota, régime 7 h–1 h, détection du début des matchs, anomalies (score 0-0 sans vainqueur, Walk Over), calcul de la clôture avec le moteur et archivage dans `tournament_results`.

**C. Plus tard** : étape 3 (interface joueur, maquette « Filet »), étape 4 (interface administrateur séparée : neutraliser, forcer la clôture, modifier paris et résultats), puis étapes 5 et 6 du cahier des charges (section 15).
