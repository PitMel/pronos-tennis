# Cahier des charges — Pronos Tennis

Plateforme de pronostics entre amis sur le simple messieurs ATP.
Version 1.0 — rédigée le 23 octobre 2026. Document de référence, mémoire du projet et point de reprise pour toute nouvelle conversation.

> **Comment lire ce document.** Les sections 1 à 3 posent le cadre. Les sections 4 à 9 sont les règles (elles font foi). Les sections 10 à 13 décrivent la technique. La section 14 liste ce qui reste ouvert. La section 15 est la feuille de route. Ce qui est marqué **[Décidé]** a été validé par Pierre. Ce qui est marqué **[Proposé]** est une recommandation technique à confirmer pendant la construction. Ce qui est marqué **[Ouvert]** doit être vérifié ou tranché.

---

## 1. Contexte et contraintes

### 1.1 Le projet
- Compétition de pronostics entre **3 à 4 amis** sur les matchs officiels de **simple messieurs ATP**. Pas de simple dames, pas de double, pas de double mixte, pas de juniors, pas de qualifications.
- Responsable du projet et administrateur : **Pierre** (francophone, Windows 11, Python 3.13 + pip + VS Code installés, quelques bases de code mais rouillé : il faut le guider pas à pas, en lui disant exactement quoi cliquer ou taper).
- Langue de l'application : **français**. Virgule décimale (`1,5`), vrai signe moins (`−`), espaces insécables avant l'unité si besoin.

### 1.2 Contraintes non négociables
1. **Tout est gratuit**, à construire comme à utiliser. Aucune option payante, jamais (pas d'API payante, pas d'abonnement développeur Apple, pas de scraper à l'usage). Le plan B payant a été écarté définitivement.
2. **Une seule plateforme ergonomique** (pas de Google Sheets).
3. **Ordinateur et téléphone**. Un lien suffit. Installable sur l'écran d'accueil (PWA) pour un usage proche d'une appli, sans passer par les stores.
4. **Les pronostics des autres restent réellement cachés** tant que tout le monde n'a pas parié. Cette règle est appliquée **côté serveur** (sécurité de la base), pas seulement masquée à l'écran.
5. **Aucun secret dans le code ni dans le chat.** La clé Live Tennis API et toute clé « service » vivent uniquement dans des secrets (GitHub Actions / Supabase). Le dépôt GitHub est public (nécessaire pour l'hébergement gratuit) : tout ce qui y est écrit est visible de tous.
6. **Récupération automatique** des affiches, résultats et scores : c'est le point essentiel. Une **correction manuelle** depuis l'admin doit toujours être possible, car la source n'est pas officielle.
7. **Méthode de travail** : Pierre utilise un compte Claude gratuit, relance le travail environ toutes les 5 heures (quand son crédit se renouvelle) et accepte une construction longue. Donc : petites étapes, chacune se terminant dans un état qui fonctionne et qui est enregistré (commit), et un journal d'avancement à jour dans le dépôt (voir section 16).

### 1.3 Calendrier
- Pierre veut **tester seul jusqu'à fin 2026** avec plusieurs faux comptes pour simuler des pronostics, puis lancer l'usage réel pour **janvier 2027**.
- La saison 2026 et les données de test sont conservées pour le moment.
- **[Opportunité]** Il reste des tournois suivis en fin d'année 2026 (Masters 1000 de Paris fin octobre/début novembre, ATP Finals de Turin en novembre : dates à vérifier). Si l'application est assez avancée, ils serviront de test en conditions réelles, y compris pour vérifier les codes de tours de l'API.

---

## 2. Tournois suivis (14 par an)

| Catégorie | Tournois |
|---|---|
| Grand Chelem (4) | Open d'Australie, Roland-Garros, Wimbledon, US Open |
| Masters 1000 (9) | Indian Wells, Miami, Monte-Carlo, Madrid, Rome, Canada (Toronto/Montréal), Cincinnati, Shanghai, Paris-Bercy |
| ATP Finals (1) | Masters de fin de saison, Turin (« Nitto ATP Finals ») |

- Matchs pronostiquables : **huitièmes de finale (R16), quarts (QF), demi-finales (SF), finale (F)**. En Grand Chelem, le « R16 » est le 4ᵉ tour. Aucun tour antérieur n'est suivi.
- **ATP Finals** : phase de poules (round robin), puis demi-finales et finale.
- Un match devient visible dans l'appli dès que son affiche est connue.
- **Calendrier annuel géré en admin** : chaque tournoi de l'année est une fiche pré-remplie (nom, ville, surface, catégorie). **Pierre saisit les dates.** Il peut aussi corriger ville, surface et catégorie.

---

## 3. Vue d'ensemble de l'architecture [Décidé]

```
 Live Tennis API ──(GitHub Actions, tâche planifiée)──▶ Supabase (Postgres + sécurité par lignes + auth + stockage)
                                                              ▲
                                  Application web (PWA statique sur GitHub Pages) ──┘
```

- **Application** : site statique (PWA : manifeste + service worker) hébergé sur **GitHub Pages**, dépôt public. Aucun serveur à maintenir.
- **Base de données, comptes, sécurité, stockage des photos** : **Supabase** (offre gratuite), région Europe.
- **Mises à jour automatiques** : tâche planifiée **GitHub Actions** (cron) qui interroge la Live Tennis API et écrit dans Supabase avec une clé « service » stockée en secret.
- **Pas de build compliqué** [Proposé] : JavaScript natif (modules ES) + `supabase-js` chargé depuis un CDN, pour que Pierre puisse lire et modifier le code. Ce choix peut être revu en début d'étape 3 si un petit framework simplifie nettement le travail.

### Limites connues des offres gratuites (à garder en tête)
- Supabase gratuit **met un projet en pause après environ 7 jours sans activité**. La tâche de synchronisation qui écrit régulièrement en base compte comme de l'activité ; à vérifier, et prévoir un « battement de cœur » (une petite requête quotidienne) en hors-saison.
- GitHub Actions **désactive les tâches planifiées d'un dépôt sans activité pendant 60 jours** : prévoir un commit automatique ou un rappel.
- Les tâches planifiées GitHub peuvent être **retardées de 10 à 30 minutes**. Le régime « toutes les 30 minutes » est donc approximatif.
- Source unique non officielle : si la Live Tennis API disparaît ou change, il faut pouvoir tout saisir à la main (admin) et brancher une autre source plus tard.

---

## 4. Règles du pari de match

### 4.1 Contenu d'un pari [Décidé]
Un pari = **le joueur choisi** + **une confiance de 6 à 10** (entier) + **en Grand Chelem uniquement, le nombre de sets** du match (3, 4 ou 5) saisi par le joueur.

### 4.2 Barème de base
| Confiance | Si le joueur choisi gagne | Si il perd |
|---|---|---|
| 6 | +6 | +4 |
| 7 | +7 | +2 |
| 8 | +8 | −1 |
| 9 | +9 | −6 |
| 10 | +10 | −17 |

Gagné = la confiance elle-même. Perdu = valeur du tableau. **Ce barème doit être visible sur chaque pari**, et le gain/perte possible doit s'afficher à la fois pendant la saisie et après.

### 4.3 Bonus Grand Chelem (sets)
- **+1** si bon vainqueur **et** bon nombre de sets.
- **+0,5** si le pari annonçait 5 sets, le vainqueur est faux, mais le match est effectivement allé en 5 sets.
- Pas d'autre bonus de sets. Pas de bonus en Masters 1000 ni en ATP Finals.
- Le bonus s'ajoute aux points du match **avant** le multiplicateur de tour.

### 4.4 Multiplicateurs de tour [Décidé]
S'appliquent aux points du match, **bonus de sets compris**. Ils ne s'appliquent **ni** au pari tournoi **ni** aux bonus de classement.

| Tour | Multiplicateur |
|---|---|
| Huitièmes (R16) | ×1 |
| Quarts (QF) | ×1,5 |
| Demi-finales (SF) | ×2 |
| Finale (F) | ×2 |
| ATP Finals : poules | ×1 |
| ATP Finals : demi-finales et finale | ×2 |

Barèmes complets (confiance : gagné / perdu) :

| Confiance | ×1 | ×1,5 | ×2 |
|---|---|---|---|
| 6 | 6 / 4 | 9 / 6 | 12 / 8 |
| 7 | 7 / 2 | 10,5 / 3 | 14 / 4 |
| 8 | 8 / −1 | 12 / −1,5 | 16 / −2 |
| 9 | 9 / −6 | 13,5 / −9 | 18 / −12 |
| 10 | 10 / −17 | 15 / −25,5 | 20 / −34 |

### 4.5 Abandon, forfait, neutralisation [Décidé]
- **Abandon en cours de match** : les points du match sont **divisés par 2** (après multiplicateur). En Grand Chelem, **pas de bonus de sets**. Le vainqueur est celui qui reste en course.
- **Forfait avant le début du match** (walkover) : **0 point pour tout le monde**.
- Le statut (normal / abandon / forfait) est **pré-rempli d'après l'API** et **corrigeable depuis l'admin**.
- Bouton **« Neutraliser »** : le match compte 0 pour tous. Pierre l'utilise à la main, notamment si un joueur n'a pas parié avant le début du match (le cas « un joueur n'a pas parié » est considéré comme exceptionnel, pas de règle automatique).
- **[Proposé]** À la neutralisation, les paris déjà saisis sont révélés (sinon ils resteraient cachés pour toujours).

### 4.6 Arrondis
Les valeurs sont **exactes en interne** (nombres décimaux exacts, pas de flottants approximatifs). L'affichage montre **jusqu'à 2 décimales**, sans zéros inutiles (`13,5`, `−0,75`, `12,75`).

---

## 5. Visibilité et verrouillage [Décidé]

1. Un pari est **modifiable** jusqu'au premier de ces deux événements :
   - l'application a **détecté le début du match** (statut `live` dans l'API) ;
   - **tous les joueurs ont parié** sur ce match.
2. Pas de date limite fixe.
3. Les paris des autres sont **invisibles** tant que tous les joueurs actifs n'ont pas parié. Dès que tout le monde a parié : paris **révélés et figés**.
4. **Résultat et score** du match : affichés seulement quand **tous ont parié ET que le match est terminé**. À ce moment les points sont comptés et affichés.
5. Un joueur voit en permanence **qui a parié / qui n'a pas parié** et si le match est verrouillé.
6. **[Proposé]** « Tous les joueurs » = tous les comptes joueurs actifs et non-test (ou tous les comptes de test pendant la phase de test, sans mélange entre les deux groupes). Gestion d'un joueur absent à prévoir (voir section 14).

---

## 6. Pari tournoi (vainqueur + finaliste) [Décidé]

- **Ouverture** : quand toutes les affiches des huitièmes sont connues. **ATP Finals** : quand les 4 premiers matchs de poule sont connus.
- Le joueur choisit **un vainqueur** et **un finaliste**. Seuls les joueurs **encore en lice** sont sélectionnables.
- **Modifiable** jusqu'à ce que tout le monde ait parié ; ensuite **révélé et figé** (même logique que les paris de match).
- Espace séparé dans l'appli (« Pari tournoi »). Joueurs choisis **barrés** quand ils sont éliminés.
- **Points, versés à la fin du tournoi** (non multipliés) :

| | Grand Chelem | Masters 1000 et ATP Finals |
|---|---|---|
| Chaque joueur choisi qui atteint la finale | +8 | +4 |
| Vainqueur trouvé (le joueur choisi comme vainqueur gagne le tournoi) | +8 | +4 |

- Maximum : 24 (GC) / 12 (autres). Si le vainqueur et le finaliste sont **inversés** (les deux en finale mais l'ordre faux) : **pas de bonus vainqueur**, soit 16 (GC) / 8 (autres).

---

## 7. Classement du tournoi et bonus [Décidé]

**Score du tournoi** = somme des points de ses matchs + points du pari tournoi. Affiché d'abord « **avant bonus** ».

**Bonus de classement :**

| | 1ᵉʳ | 2ᵉ |
|---|---|---|
| Masters 1000 | +12 | +5 |
| Grand Chelem | +24 | +10 |
| ATP Finals | +10 | +4 |

**Égalités :**
- Deux joueurs à égalité pour une place : **le bonus de cette place est partagé** (divisé par 2 chacun).
- Deux ex aequo pour la 1ʳᵉ place : **personne** ne touche le bonus de la 2ᵉ place.
- Plus de deux ex aequo pour une place : le bonus de la place est **partagé entre eux tous** (divisé par leur nombre) et **il n'y a pas de bonus pour la place suivante**. [Interprétation retenue de la règle de Pierre ; à signaler si elle devait changer.]
- Égalité pour la 2ᵉ place (le 1ᵉʳ étant seul) : bonus de la 2ᵉ place divisé entre les ex aequo.

L'affichage montre : score avant bonus, qui reçoit quel bonus, **score final**.

**Clôture d'un tournoi** : **automatique** quand la finale est terminée et comptée (ou la dernière rencontre), avec possibilité pour l'admin de la **forcer, la corriger ou la rouvrir**. À la clôture, les scores finaux sont **figés** dans un enregistrement d'archive.

---

## 8. « Race » : classement annuel [Décidé]

- Nom partout dans l'appli : **« Race »** suivi de l'année (**Race 2027**).
- = somme des **scores finaux** (après bonus) des tournois **terminés** de l'année.
- **Ne bouge jamais en cours de tournoi** : il n'est incrémenté qu'à la clôture d'un tournoi.
- Chaque année est une compétition **indépendante**, avec son vainqueur. Les années précédentes sont **archivées et consultables** (on garde tout pour l'instant ; l'espace nécessaire est négligeable).

---

## 9. Comptes, photos, administration

### 9.1 Comptes [Décidé]
- Connexion par **nom + mot de passe court**, mémorisée sur l'appareil. [Proposé] Techniquement : comptes Supabase Auth avec une adresse e-mail technique fictive (`pierre@pronos.invalid`) et un mot de passe d'au moins 6 caractères (minimum Supabase, réglable) ; l'utilisateur ne voit que son prénom.
- Un compte **administrateur** séparé (ou un rôle admin sur le compte de Pierre).
- **Faux comptes de test** faciles d'accès : l'admin peut **jouer à la place** d'un faux compte (saisir ses paris, se connecter dessus). Les faux comptes sont marqués comme tels, exclus des vrais classements, et purgeables d'un coup avant le lancement de janvier 2027.

### 9.2 Photos de profil [Décidé]
- Photo **redimensionnée dans le navigateur** (≈ 200 px, quelques Ko), stockée dans Supabase Storage. Repli sans photo : pastille avec l'initiale, couleur propre à chaque joueur.
- Affichée dans le classement du tournoi et la Race. **Ne pas surcharger la colonne de paris** (à arbitrer visuellement).

### 9.3 Fonctions d'administration [Décidé]
- Neutraliser / verrouiller un match.
- Forcer un forfait ou un abandon ; corriger le statut d'un match.
- **Saisir ou corriger un résultat et un score** (y compris les scores de set par set).
- Ajouter ou supprimer un match à la main.
- Gérer les comptes (créer, désactiver, réinitialiser un mot de passe, marquer « test »).
- Gérer le calendrier : dates, ville, surface, catégorie, rattachement à l'identifiant du tournoi dans l'API.
- Clôturer, corriger ou rouvrir un tournoi.
- Jouer à la place d'un faux compte.
- Voir l'état de la synchronisation (dernier appel, quota restant, erreurs).

---

## 10. Source de données : Live Tennis API (constats vérifiés)

- Base : `https://api.livetennisapi.com/api/public/v1` ; en-tête `Authorization: Bearer <clé>`.
- **Quotas gratuits : 100 requêtes/jour, 30/minute.** Heure de remise à zéro inconnue (probablement 00:00 UTC) [Ouvert].
- Endpoints gratuits utiles :
  - `GET /tournaments` (`limit` max 200, `offset` ; les filtres `category`, `tier`, `search` marchent ; `name` et `q` sont ignorés). Catalogue : 10 380 tournois.
  - `GET /matches?status=live|upcoming&tour=atp&limit=100`.
  - `GET /matches/{id}` : gratuit, **même pour un match terminé**.
  - `GET /fixtures` (peut être incomplet ; contient `match_id`).
  - `GET /players`.
  - Un compteur d'usage (à lire pour ne jamais dépasser le quota) [Ouvert : relever l'URL exacte].
- **Payant, donc exclu** : `GET /matches?status=completed` renvoie 403 (offre à 9,99 $/mois, jamais souscrite).

### 10.1 Champs d'un match
`id`, `draw` (`singles`/`doubles`), `gender`, `is_doubles`, `is_qualifying`, `tour`, `tournament`, `tournament_id`, `round`, `round_code` (R16, QF, …), `scheduled_time` (UTC), `live_at`, `status` (`upcoming`/`live`/`completed`), `event_status` (« Finished », « Walk Over », …), `outcome` (`completed` ou null), `winner` (1 = p1, 2 = p2), `format` (BO3…), `surface`, `indoor`, `tier` (souvent vide sur les matchs), `players.p1/p2` (`id`, `name`, `ranking`, `ranking_points`, `country`…), `score` (`sets`, `games` = tableau des jeux par set, `tiebreaks`, `points`, `sources_count`, `corroborated`…).

### 10.2 Pièges constatés
- **Un match « Finished » peut avoir un score 0-0 et pas de vainqueur** (cas vu sur un double). Règle : ne considérer un match comme terminé que si `status = completed` **ET** `winner` renseigné.
- Un match **Walk Over** est resté `upcoming` sans score : il faut le traiter via l'admin (forfait) ou par détection d'`event_status`.
- Les listes peuvent **oublier des matchs terminés** : suivre les identifiants des matchs concernés et les interroger un par un via `/matches/{id}`.
- **Coupures réseau** (délais SSL, lecture, connexion fermée) fréquentes : tout appel doit être **réessayé avec pause croissante** (≥ 3 tentatives), et l'échec ne doit jamais casser la tâche.
- `tier` est souvent vide sur les matchs : **la catégorie d'un tournoi vient du catalogue des tournois**, pas du match.

### 10.3 Identifier les tournois suivis
- Filtre de base sur les matchs : `draw = singles`, `gender = men`, `tour = atp`, `is_doubles = false`, `is_qualifying = false`. Les Grands Chelems messieurs ont bien `tour = atp`, `gender = men`, `tier = grand_slam`, **mais** les juniors (« Boys … ») ont aussi `gender = men` : le filtre doit exclure les juniors (par nom de tournoi et par `tour`).
- Les ATP Finals apparaissent comme **« Finals - Turin »**, catégorie `tour_finals`, `tour = atp`, `gender = men` (identifiants 2794 et 2795 observés). Attention aux homonymes : « Turin » (Challenger) et « Next Gen Finals - Jeddah ».
- `category = masters_1000` renvoie 12 entrées (doublons) et `tier = atp_1000` en renvoie 17 : **les deux ne coïncident pas**. Donc : **liste de tournois suivis tenue par l'admin** (fiche calendrier liée à un ou plusieurs `tournament_id` de l'API), pas une détection automatique aveugle.
- Le test `test_masters_suite.py` (liste des Masters 1000) a été fourni à Pierre ; **son résultat n'a pas encore été communiqué** [Ouvert]. Résultat sauvegardé sur son poste dans `reponses_api/masters_1000.json`.
- **Codes de tours à vérifier avec des données réelles** : le 4ᵉ tour des Grands Chelems est-il bien `R16` ? Comment sont codés les matchs de poules des ATP Finals ? [Ouvert, à vérifier au premier tournoi réel, avec correction possible en admin].

### 10.4 Régime d'appels (validé par Pierre)
- **Toutes les 30 minutes de 7 h à 1 h (heure de Paris)** dès qu'au moins un match suivi est prévu et non terminé.
- **Sinon 1 appel par jour**, avec **passage immédiat au régime 30 minutes** dès qu'un match concerné (8ᵉ de finale d'un tournoi suivi) est détecté.
- Budget d'une journée de pointe estimé à environ **56 appels sur 100** (vérifications des affiches 4 à 12, 2 appels de détail par match terminé, 10 de réserve).
- L'appli/la tâche **lit le compteur d'usage et s'arrête avant la limite**.
- Les listes d'affiches ne sont lues que si nécessaire ; le détail `/matches/{id}` sert à confirmer début, fin, vainqueur et score.
- Le début d'un match est détecté par `status = live` (ou `live_at`) : c'est ce qui **verrouille** les paris.

---

## 11. Modèle de données [Proposé, à finaliser à l'étape 1]

Tables principales (noms indicatifs) :
- `profiles` : compte, prénom, couleur, photo, `is_admin`, `is_test`, `active`.
- `tournaments` : année, nom, ville, surface, catégorie (`grand_slam` / `masters_1000` / `atp_finals`), dates, identifiant(s) API, état (à venir / pari tournoi ouvert / en cours / clos).
- `players` : cache des joueurs (identifiant API, nom, pays, classement ATP).
- `matches` : identifiant API, tournoi, tour (`round_code`), heure prévue, joueurs p1/p2, statut, début détecté, vainqueur, nombre de sets joués, score détaillé (JSON), type de fin (normal / abandon / forfait), neutralisé, modifications manuelles.
- `bets` : match, joueur, choix (1 ou 2), confiance, nombre de sets parié (GC), horodatage.
- `tournament_bets` : tournoi, joueur, vainqueur choisi, finaliste choisi.
- `tournament_results` : instantané figé à la clôture (score avant bonus, bonus, score final, rang) — alimente la Race et les archives.
- `api_usage` / `sync_log` : appels effectués, quota, erreurs.

### Sécurité (Row Level Security) — exigences
- Un joueur **ne peut lire les paris des autres** (`bets`, `tournament_bets`) que lorsque la règle « tous ont parié » est satisfaite (fonction SQL « security definer » dédiée) — ou si le match est neutralisé.
- Un joueur ne peut **écrire que ses propres paris** et seulement tant que le match n'est ni verrouillé ni révélé.
- **Résultat et score** d'un match masqués (vue ou colonne protégée) tant que tous n'ont pas parié.
- Seul l'admin modifie résultats, statuts, calendrier, comptes ; l'admin peut écrire les paris des comptes `is_test`.
- La tâche de synchronisation écrit avec la clé « service » (secret GitHub), jamais exposée au navigateur. La clé « anon » de Supabase, elle, est publique par conception : la sécurité repose entièrement sur les règles RLS, qui doivent être **testées explicitement** (tentative de lecture des paris d'un autre avant révélation).

### Moteur de points [Proposé]
- **Un module unique, pur et testé** (JavaScript, exécutable sous Node et dans le navigateur), qui calcule : points d'un pari, points d'un match, score de tournoi avant bonus, bonus de classement avec égalités, points du pari tournoi, Race. Les points peuvent être **recalculés à la volée** à partir des données brutes (paris + résultat + statut + tour), ce qui garantit qu'une correction d'admin se répercute partout sans migration. Les instantanés de clôture figent l'historique.
- Tests automatiques à partir des exemples ci-dessous, lancés dans le dépôt.

---

## 12. Interface

### 12.1 Direction retenue [Décidé]
Proche de la **maquette 1 « Filet »** (image `maquette-1-filet-mobile.png`, livrée avec ce document) :
- Terrain de tennis **vu de dessus**, le **filet au milieu (50/50)**.
- À la place des balles : **une barre par joueur** qui part du filet et monte jusqu'à la hauteur correspondant à la confiance choisie (zone de 30 px par cran de confiance dans la maquette, de 6 à 10).
- **Une colonne par joueur, toujours dans le même ordre, le compte de la personne connectée tout à gauche.**
- Barres **vertes** si le bon joueur est choisi, **rouges** sinon, **points écrits dessus**. Chiffres en **rouge** quand le joueur est perdu, **même si le score est positif**. Le résumé (tableau récapitulatif) reste affiché **en dessous**.
- **Noms des joueurs à gauche du terrain**, de part et d'autre du filet. **Scores des sets au niveau du filet**, en vertical, façon télévision.
- **Condensé en hauteur** ; **2 matchs par ligne sur ordinateur**, **1 sur mobile**.
- Éléments appréciés à conserver : points gagnés/perdus visibles avant et après le pari ; classement ATP de chaque joueur ; heure théorique du match **en heure de Paris** ; lieu, surface et dates du tournoi ; état « qui a parié / pas parié / match verrouillé ».
- Palette et typographie de la maquette 1 : verts `#1F4D43` / `#2A5F53`, terrain `#2F6CC2`, balle/accents `#D8E64C`, police **Bricolage Grotesque**. Une maquette sert de référence visuelle, pas de cahier de style figé : on ajustera aux tests.

### 12.2 Pages
1. **Connexion** (nom + mot de passe, mémorisation).
2. **Accueil** : tournoi en cours (ou prochain), ce qu'il reste à parier, Race de l'année.
3. **Tournois de l'année** : liste avec dates, lieu, surface, scores de chaque joueur, **vainqueur avec trophée** (icônes **différentes** pour Masters 1000, Grand Chelem, ATP Finals), palmarès ; détail de chaque tournoi consultable ; années précédentes en archive.
4. **Page tournoi** : tous les matchs sur une seule page, **groupés par tour** (R16, QF, SF, F ; ATP Finals : poules, SF, F). **Toutes les sections repliées sauf le tour en cours** (= premier tour qui contient un match non terminé). Une section d'un **tour terminé** affiche un **bilan** (score cumulé de chaque joueur sur ce tour). Sections repliées : **pastille** « paris restant à faire ». **Tours futurs grisés** (« affiches à venir »).
5. **Pari tournoi** : espace séparé, joueurs éliminés barrés, état « qui a parié ».
6. **Classement** : classement du tournoi (avant bonus, bonus, final) et **Race**.
7. **Règles** : page consultable dans l'appli (reprendre les sections 4 à 8 en langage simple, barèmes inclus).
8. **Profil** (photo, mot de passe).
9. **Admin** (section 9.3).

### 12.3 Qualité attendue
Utilisable d'une main sur téléphone, lisible sur ordinateur, léger (pas de lenteur), messages d'erreur en français, états vides clairs.

---

## 13. Jeux de tests de référence pour le moteur de points

**Exemple A — Quart de finale (×1,5), Alcaraz – Fritz, Fritz gagne 7-6(4) 6-4.**
Paris : Pierre Alcaraz 8, Léa Alcaraz 7, Marc Alcaraz 9, Thomas Fritz 6.
Résultat attendu : Pierre **−1,5**, Léa **+3**, Marc **−9**, Thomas **+9**.

**Exemple B — Quart de finale, Djokovic – Medvedev (scénarios « si… »).**
Paris : Pierre Djokovic 7, Léa Medvedev 6, Marc Djokovic 8, Thomas Djokovic 9.
- Si Djokovic gagne : Pierre **+10,5**, Léa **+6**, Marc **+12**, Thomas **+13,5**.
- Si Medvedev gagne : Pierre **+3**, Léa **+9**, Marc **−1,5**, Thomas **−9**.

**Exemple C — Grand Chelem, quart de finale (×1,5).**
- Confiance 8, bon vainqueur, bon nombre de sets : (8 + 1) × 1,5 = **13,5**.
- Confiance 8, mauvais vainqueur, pari à 5 sets et le match va en 5 sets : (−1 + 0,5) × 1,5 = **−0,75**.
- Confiance 8, mauvais vainqueur, pari à 4 sets, 5 sets joués : −1 × 1,5 = **−1,5** (pas de bonus).

**Exemple D — Abandon.**
- Masters 1000, quart (×1,5), confiance 8 gagnée, abandon : 12 / 2 = **6**.
- Masters 1000, quart, confiance 10 perdue, abandon : −25,5 / 2 = **−12,75**.
- Grand Chelem, bon vainqueur + bon nombre de sets, abandon : **pas** de bonus de sets, points ÷ 2.
- Forfait avant le début : **0** pour tous.

**Exemple E — Pari tournoi.**
- Grand Chelem : vainqueur et finaliste exacts = 8 + 8 + 8 = **24**. Les deux en finale mais inversés = 8 + 8 = **16** (pas de bonus vainqueur).
- Grand Chelem : le vainqueur désigné gagne, le finaliste désigné est éliminé avant la finale = 8 + 8 = **16**. Seul le finaliste désigné atteint la finale (sans gagner), le vainqueur désigné est éliminé = **8**.
- Autres tournois : mêmes cas avec 4 au lieu de 8 (12 / 8 / 8 / 4).

**Exemple F — Classement et bonus (Masters 1000 : 12 et 5).**
- Scores avant bonus : Léa 47, Pierre 43,5, Thomas 42, Marc 30 → Léa +12, Pierre +5.
- Léa et Pierre à 47 : chacun +6, **personne** +5.
- Trois à égalité pour la 1ʳᵉ place : chacun +4 (12 ÷ 3), **aucun** bonus de 2ᵉ place.
- Léa 1ʳᵉ seule, Pierre et Thomas ex aequo 2ᵉs : chacun +2,5 (5 ÷ 2).

**Exemple G — Race.** Un tournoi en cours ne modifie jamais la Race ; à la clôture, le **score final après bonus** de chacun est ajouté.

Un jeu de tests complet (tous les cas des sections 4 à 8) sera écrit à l'étape 1 et **doit passer avant toute connexion à la base ou à l'interface**.

---

## 14. Points ouverts

| # | Sujet | Statut / proposition |
|---|---|---|
| 1 | Résultat du test `test_masters_suite.py` (liste des 9 Masters 1000 dans l'API) | Pierre doit communiquer le contenu de `reponses_api/masters_1000.json` ou la sortie du script |
| 2 | Codes de tours des Grands Chelems (R16 = 4ᵉ tour ?) et des poules des ATP Finals | À vérifier avec des données réelles ; correction possible en admin |
| 3 | Heure de remise à zéro du quota API | Mesurer avec le compteur d'usage ; supposé 00:00 UTC |
| 4 | URL exacte du compteur d'usage de l'API | À relever dans la documentation ou par test |
| 5 | Détection des abandons (hors forfait « Walk Over ») dans l'API | Inconnu ; l'admin corrige |
| 6 | Joueur qui ne participe pas à un tournoi / absent | Prévoir « exclure un joueur d'un match ou d'un tournoi » dans l'admin pour ne pas bloquer la révélation des paris |
| 7 | Révélation des paris après neutralisation | Proposé : oui, révélés |
| 8 | Photos : affichage dans la colonne de paris sans la surcharger | À arbitrer visuellement pendant l'étape 3 |
| 9 | Stabilité à long terme de la source gratuite unique | Prévoir saisie manuelle complète et architecture permettant de changer de source |
| 10 | Notifications (e-mail, push) | « Nice to have », hors périmètre initial |
| 11 | Pause du projet Supabase gratuit / désactivation de la tâche GitHub après inactivité | Prévoir un battement de cœur (section 3) |
| 12 | Choix JavaScript natif vs petit framework | À confirmer au début de l'étape 3 |

---

## 15. Feuille de route

Chaque étape se termine par un état qui fonctionne, testé, enregistré dans GitHub, avec `ETAT.md` mis à jour.

**Étape 0 — Prérequis (Pierre).** Dépôt GitHub public créé ; projet Supabase créé (région Europe) ; Python et VS Code installés ; Git installé sur le PC. Aucune clé n'est collée dans le chat : les secrets sont saisis par Pierre dans les réglages GitHub / Supabase.

**Étape 1 — Fondations (effort élevé).**
1. Moteur de points (module pur) + jeu de tests complet — **avant tout le reste**.
2. Schéma de base de données (SQL) : tables, règles RLS, fonctions de verrouillage/révélation.
3. Comptes (joueurs, faux comptes, admin) et tests de sécurité (impossibilité de lire les paris des autres avant révélation).

**Étape 2 — Synchronisation API (effort élevé).** Tâche GitHub Actions : appels avec nouvelles tentatives, garde-fou de quota, régime 7 h–1 h / quotidien, détection du début des matchs, suivi individuel des matchs concernés, traitement des anomalies (score 0-0 sans vainqueur, Walk Over). Test sur le Masters 1000 de Paris puis les ATP Finals s'ils sont atteignables.

**Étape 3 — Interface joueur.** Connexion, tournois de l'année, page tournoi (maquette « Filet »), saisie des paris, pari tournoi, classements, Race, règles.

**Étape 4 — Administration.** Toutes les fonctions de la section 9.3.

**Étape 5 — Finitions.** Photos, calendrier complet saisi par Pierre, archives et palmarès, installation sur l'écran d'accueil (PWA), robustesse (pause Supabase, désactivation Actions).

**Étape 6 — Phase de test et lancement.** Test avec faux comptes jusqu'à fin 2026, corrections, **purge des données de test**, création des vrais comptes, ouverture pour janvier 2027 (Open d'Australie).

Niveau d'effort recommandé : **élevé** pour les étapes 1 et 2 (schéma, sécurité, points, synchronisation), **moyen** pour les ajustements d'interface ensuite.

---

## 16. Méthode de travail pour la construction

1. **Lire ce cahier des charges en entier**, puis `ETAT.md` dans le dépôt s'il existe : c'est la mémoire du projet.
2. **Tenir `ETAT.md` à jour** à chaque étape : décisions prises, ce qui est fait, ce qui est testé, prochaine étape précise, points ouverts. Une nouvelle conversation doit pouvoir repartir de ce seul fichier + ce cahier des charges.
3. **Petites étapes**, chacune terminée par un commit qui fonctionne. Penser que le crédit gratuit peut s'épuiser à tout moment : ne jamais laisser le dépôt dans un état cassé.
4. **Guider Pierre pas à pas** : commandes exactes à taper ou à coller, où cliquer dans GitHub et Supabase, ce qu'il doit voir à l'écran. Windows 11, VS Code, PowerShell. Ne pas supposer de connaissance de Git.
5. **Secrets** : ne jamais demander ni accepter une clé dans le chat. Les scripts demandent la clé à la saisie sans l'enregistrer ; les secrets du dépôt se saisissent dans les réglages GitHub.
6. **Tester avant de brancher** : le moteur de points avec les exemples de la section 13 ; la sécurité avec de vraies tentatives d'accès interdit.
7. **Tout reste gratuit.** Si une solution impose un paiement, la signaler et proposer une alternative gratuite.
8. **Ne pas élargir le périmètre** sans accord (pas de nouvelles maquettes, pas de fonctions hors cahier des charges).
9. Ce qui concerne la règle de points ne se modifie **que sur instruction de Pierre**, et se répercute ici et dans `ETAT.md`.

### Outils déjà livrés à Pierre (scripts Python, bibliothèque standard, clé demandée à la saisie)
`test_live_tennis.py`, `test_resultats.py`, `test_tournois.py`, `test_filtres.py`, `test_masters.py`, `test_masters_suite.py`. Les réponses sont enregistrées dans un dossier `reponses_api` sur son poste.

### Éléments de référence livrés avec ce document
- `maquette-1-filet-mobile.png` : référence visuelle de la page de pari.
- `maquette_1_filet.py` et `donnees_maquette.py` : code qui a produit la maquette (HTML/CSS/SVG du terrain, formatage français des nombres, barèmes) — utile pour reprendre le style et les calculs d'affichage.
