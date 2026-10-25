# ETAT.md — Pronos Tennis

Dernière mise à jour : 25 octobre 2026, nuit (session 3 : synchronisation en service ; interface joueur, jalons 3.1 et 3.2 faits).

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
| 2.1 — Synchronisation, côté base (migration 0004) | **Fait, installé et vérifié sur le vrai projet** : 21 tests, 21 failles volontaires détectées ; `supabase/verification-synchronisation.sql` : 27 vérifications OK. Tournois du Masters de Paris et des ATP Finals 2026 et leurs identifiants d'API saisis (`supabase/calendrier-2026.sql`). |
| 2.2 — Synchronisation, programme Node (`src/sync/`) | **Écrit et testé en simulation** (51 tests, 17 failles volontaires détectées). **Jamais encore branché sur la vraie API** : le bac à sable de Claude n'y a pas accès ; le premier appel réel se fait chez GitHub (mode diagnostic, étape 2.3). |
| 2.3 — Workflow GitHub Actions + secrets + diagnostic | **Fait le 25 oct. 2026** : workflow `.github/workflows/synchro.yml` (cron 30 min seulement si la variable de dépôt `SYNCHRO_ACTIVE` vaut `true`) ; 3 secrets saisis ; diagnostic réussi ; **simulation réussie** (régime quotidien, 4 appels prévus et faits, 0 créé, 0 mis à jour, 0 anomalie, 0 erreur ; usage du jour 8, restant 92) ; **`SYNCHRO_ACTIVE` passée à `true` par Pierre** : le cron tourne désormais pour de vrai. Correctif : la limite du jour est maintenant lue dans `limits.per_day` (elle ressortait à `null`, sans effet sur le budget). |
| 2.4 — Clôture automatique d'un tournoi (migration 0005, `src/sync/cloture.js`) | **Fait, installé et vérifié sur le vrai projet** (`supabase/verification-cloture.sql` : 20 vérifications OK, tout annulé). 12 tests SQL + 5 tests du calcul (valeurs calculées à la main) + 4 tests de bout en bout ; 27 failles volontaires introduites, toutes détectées (sauf 2 redondances voulues). |
| 3.1 — Interface : squelette, hébergement, connexion | **Écrit, testé, poussé le 25 oct. 2026** (262 tests). `web/` (JavaScript natif, modules ES, supabase-js par CDN) : page de connexion prénom + mot de passe (adresse technique `prenom@pronos.invalid`), session mémorisée, accueil provisoire, déconnexion. Publication par `.github/workflows/pages.yml` (copie `web/` + `src/moteur/` dans `_site/`). Publié sur GitHub Pages et **connexion testée par Pierre le 25 oct. : tout fonctionne**. Ajustement : « Tennis » du titre de connexion en vert du bandeau. |
| 3.2 — Interface : tournois et page tournoi en lecture | **Écrit, testé, poussé le 25 oct. 2026** (275 tests). Liste des tournois par année (`#/`), page tournoi (`#/tournoi/ID`) : matchs groupés par tour (ATP Finals : poules, demi-finales, finale), seul le tour en cours est déplié, tours futurs grisés (« Affiches à venir »), heures de Paris, badges (en cours, paris verrouillés, paris révélés, neutralisé), score et vainqueur seulement si `resultat_visible`, vainqueur et finaliste d'un tournoi clos. Lecture seule : aucun pari ni bilan de tour pour l'instant. Structure : `web/js/outils.js` (dates, échappement), `tournois.js` (tours, scores, années), `vues.js` (HTML), `donnees.js` (lecture Supabase), `app.js` (session, routage). **À tester par Pierre** après publication (les 2 tournois de la base n'ont pas de matchs avant le 2 nov. : la page doit afficher « Affiches à venir »). |
| 3.3 à 3.6 — Interface : paris et terrain « Filet » (avec « qui a parié » et bilan de tour), pari tournoi, classements et Race, règles | À faire. |

Décisions du 25 oct. 2026 (Pierre) : **JavaScript natif** (point ouvert n° 12 tranché) ; **pas de tournoi de démonstration fictif** : Pierre testera avec les vrais matchs du Masters de Paris (à partir du 2 nov.).
| 4 à 6 | À faire (cahier des charges, section 15). |

Total : 275 tests, tous verts (`npm install` puis `npm test`, environ 1 minute).

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

## Étape 2 — synchronisation de l'API (2.1 et 2.2 faits)

**Principe** : toute la logique d'écriture est en SQL (fonctions réservées au rôle « service », testables) ; Node ne fait que parler à l'API, mettre en forme et appeler ces fonctions.
- `supabase/migrations/0004_synchronisation.sql` : `sync_etat()` (état lu par la tâche), `sync_appliquer(charge)` (crée/met à jour joueurs et matchs, jamais de recul, respecte `modifie_manuellement`, renvoie `{crees, maj, ignores, anomalies}`), `sync_enregistrer_appel(...)` (journal `sync_log`, qui sert de compteur de quota), `sync_joueur`, `sync_tournoi_pour_api`, `sync_maj_etat_tournoi`. Aucune n'est appelable depuis le navigateur, même par l'administrateur.
- `src/sync/normaliser.js` (API → charge utile ; filtres ATP, messieurs, simple, hors qualifications, tournois suivis, tours R16/QF/SF/F/RR ; on branche sur `outcome` : completed, retired → abandon, walkover → forfait, default → abandon + anomalie, abandoned/unresolved → aucun résultat + anomalie, cancelled → anomalie), `client-api.js` (nouvelles tentatives à pause croissante 2 s / 6 s / 15 s, 429 « jour » = arrêt, lecture tolérante de `/usage`), `planificateur.js` (fenêtre 7 h–1 h heure de Paris, budget = 100 − utilisé − réserve 10, affiches relues toutes les 3 h en tournoi et une fois par jour sinon, lecture du direct si un match est en cours ou commence dans moins de 30 min, détail d'un match disparu du direct), `synchro.js` (orchestration), `base.js` (Supabase par REST), `cli.js` (`node src/sync/cli.js`, options `--simulation` = n'écrit rien, `--diagnostic` = quelques appels à l'API pour en découvrir la forme réelle).
- Secrets lus **uniquement** dans les variables d'environnement `LIVETENNIS_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` ; tout affichage est filtré pour ne jamais les contenir.
- Faits sur l'API (documentation) : `/matches` accepte `tournament_id`, `status`, `limit` (≤ 200) ; `/usage` est gratuit (champs non documentés, lus de façon tolérante) ; les identifiants de tournoi de l'API sont stables d'une année à l'autre ; `winner` n'existe que pour un match terminé.
- **Diagnostic réel du 25 oct. 2026 (premier contact avec la vraie API, via GitHub Actions)** :
  - `/usage` : `today: {calls, errors, remaining_day}`, `limits: {per_day: 100, per_minute: 30}`, `tier: free` ; **il ne compte pas dans le quota**. Le détail d'un match (`/matches/{id}`) **coûte 1 appel**, comme chaque liste. Le programme lit cette forme (testée).
  - Un match : `id` numérique, `tournament_id` en texte, `players.p1/p2` (`id`, `name`, `country` en minuscules « ita », `ranking`), `round_code` (« F »…), `is_qualifying`, `score.sets` = `[sets p1, sets p2]` et **`score.games` = un couple `[jeux p1, jeux p2]` par set** (ex. `[[1,6],[6,6]]`). Mon hypothèse précédente (un tableau par joueur) était fausse : corrigée et testée.
  - Les 4 identifiants Paris (1725, 1726) et ATP Finals (2794, 2795) répondent mais **ne renvoient aucun match « à venir » le 25 oct.** (tableau pas encore publié ?). À revérifier le 26 oct. avec le mode diagnostic (il fait maintenant aussi un appel sans filtre de statut pour découvrir d'autres statuts éventuels).
  - Toujours inconnus : codes de tour réels en Grand Chelem (R16 ?) et pour les poules des ATP Finals (RR ?).

## Étape 2.4 — clôture automatique (fait)

- **Règle (Pierre, 25 oct. 2026)** : un tournoi est clôturé quand (1) sa finale est terminée avec un vainqueur, (2) pour chaque groupe (réel / test) qui a parié dans ce tournoi, tous les matchs ont reçu un pari de chaque joueur du groupe ou ont été neutralisés (= « paris révélés »). **Un groupe sans aucun pari est ignoré** (le groupe réel ne parie pas avant janvier 2027). Un joueur exclu du tournoi n'est pas attendu. Finale forfait/neutralisée sans vainqueur : pas de clôture automatique (l'administrateur la force).
- **Fonctionnement** : à chaque passage de la tâche (même hors fenêtre horaire ou quota épuisé, car aucun appel API n'est nécessaire), `sync_cloture_candidats` → `sync_donnees_cloture` → calcul par le moteur JS (`calculerCloture`, points des matchs, pari tournoi, bonus 1er/2e, rangs) → `sync_cloturer_tournoi` (revérifie les conditions, exige exactement un résultat par joueur, archive dans `tournament_results`, fixe vainqueur et finaliste, révèle et fige les paris tournoi, passe en `clos`, en une transaction). Une clôture en échec fait échouer la tâche (code 1) et sera retentée.
- **Réouverture** : si l'administrateur (connecté) fait passer un tournoi de `clos` à un autre état, `cloture_auto_desactivee` passe à vrai et la tâche ne le reclôture plus ; il le reclôturera lui-même (écran administrateur, étape 4 : recalcul avec le moteur dans le navigateur, écriture dans `tournament_results`). L'écran administrateur devra aussi pouvoir forcer une clôture.
- À prévoir plus tard : si un joueur n'a pas de pari tournoi, il marque 0 pour cette partie (comportement du moteur) ; pas de notification de clôture (point ouvert n° 11).

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

## Idées pour plus tard (demandées par Pierre le 25 oct. 2026)

**Hors cahier des charges, à étudier seulement une fois tout le reste accompli** (priorité : application fonctionnelle en ligne). Rien ne se code sans son accord : citation à l'ouverture de la page ; images des tournois ; dates des tournois (affichage ; la saisie admin des dates est déjà prévue au cahier) ; photos des joueurs de tennis ; confrontations directes (H2H) ; notification à l'ouverture d'un tournoi (voir point ouvert n° 10 : e-mail/push, gratuit uniquement) ; couleurs de la page selon le tournoi ; armoire des trophées (à rapprocher des trophées du palmarès, section 12.2).

## Points ouverts

- Section 14 du cahier des charges : n° 2 (codes de tours : R16 = 4ᵉ tour du Grand Chelem ? poules des ATP Finals ?), n° 3 et 4 (quota API et compteur d'usage), n° 5 (abandons dans l'API), n° 8 (photos), n° 9 à 11 (robustesse, notifications), n° 12 (JavaScript natif pour le moteur ; interface à confirmer en début d'étape 3).
- n° 1 résolu : `reference/api/masters_1000.json` montre que les 9 Masters existent si on fusionne les filtres `category = masters_1000` et `tier = atp_1000` ; chacun a deux identifiants ; le Canada apparaît sous Toronto et Montréal (d'où `tournament_api_ids`).
- **Extension d'e-mail technique** : `@pronos.invalid` n'a pas été vérifiée avec Supabase. Si l'écran « Add user » la refuse, utiliser une autre adresse (par ex. `andre@example.com`) à l'identique dans l'écran et dans `comptes.sql`.
- Les tests de sécurité sont une simulation : à confirmer sur le vrai projet (voir ci-dessous).

## Prochaine étape précise

**A. Pierre : désactiver les inscriptions libres** (Supabase > Authentication > Sign In / Providers, ou « Providers » > Email : désactiver « Allow new users to sign up »). Sans cela, quelqu'un qui connaîtrait l'adresse du projet et la clé publique pourrait créer un compte vide et lire les données de référence (prénoms, tournois). À confirmer par Pierre. Le conseiller Supabase signale aussi « Leaked password protection » (fonction payante probable : sans objet).

**B. Synchronisation en service (étape 2 terminée côté code)** — le cron tourne. Reste à observer avec de vraies données, à partir du **2 nov. 2026** (début du Masters de Paris ; dates saisies dans la base : 2–8 nov., fin supposée) : lancer le mode diagnostic ce jour-là, vérifier quel identifiant (1725 ou 1726) porte le tableau final et les codes de tour réels (R16 en Grand Chelem ? poules des ATP Finals ?), puis consulter le journal du premier passage « normal » qui voit des matchs (anomalies éventuelles). Corriger `normaliser.js` si les codes de tour diffèrent.

**B bis. Étape 3 (interface joueur)** — 3.1 fait. **Pierre** : GitHub > dépôt > Settings > Pages > Build and deployment > Source : « GitHub Actions » ; puis onglet Actions > « Publication du site » > Run workflow (ou attendre le prochain push) ; ouvrir l'adresse affichée (`https://pitmel.github.io/pronos-tennis/`) et se connecter avec un faux compte (André, Paul ou Jacques) puis avec Pierre. Pour voir l'application sur son PC avant publication : terminal VS Code, `npm install` puis `npm run web`, ouvrir http://localhost:8080. **3.2 fait. Ensuite 3.3** : saisie des paris et terrain « Filet » (qui a parié, gain/perte possible visibles à la saisie et après, nombre de sets en Grand Chelem), puis 3.4 pari tournoi, 3.5 classements et Race, 3.6 règles. Le moteur de points est déjà utilisable dans le navigateur (`/moteur/index.js` une fois le site assemblé).

**C. Plus tard** : étape 3 (interface joueur, maquette « Filet »), étape 4 (interface administrateur séparée : neutraliser, forcer la clôture, modifier paris et résultats), puis étapes 5 et 6 du cahier des charges (section 15).
