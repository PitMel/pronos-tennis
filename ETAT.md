# ETAT.md — Pronos Tennis

Dernière mise à jour : 23 octobre 2026, fin de la session 1 (moteur de points terminé).

**Pour reprendre dans une nouvelle conversation** : lire `CAHIER_DES_CHARGES.md` (les règles font foi), puis ce fichier, puis passer à « Prochaine étape ».
Rappel des règles de travail de Pierre : tout reste gratuit ; jamais de clé ni de secret dans le chat ni dans le code (dépôt public) ; effort élevé pour les fondations, moyen ensuite pour l'interface ; petites étapes avec un commit chacune ; aucune règle de points modifiée sans son accord ; rien ajouté hors cahier des charges sans lui en parler ; en cas d'ambiguïté, lui poser la question ; dire en quelques lignes ce qui va être fait avant de coder ; le guider pas à pas (Windows 11, PowerShell, VS Code, commandes exactes, où cliquer dans GitHub et Supabase).

## Où on en est

| Étape | État |
|---|---|
| 0 — Prérequis | Dépôt GitHub public et projet Supabase (Europe) créés. Git et Node.js à installer sur le PC de Pierre (voir « Reste à faire par Pierre »). |
| **1.1 — Moteur de points + tests** | **Fait, 76 tests verts** (`npm test`). |
| 1.2 — Schéma Supabase, RLS, comptes | À faire (prochaine étape). |
| 1.3 — Tests de sécurité | À faire. |
| 2 à 6 | À faire (voir cahier des charges, section 15). |

## Fait et testé (étape 1.1)

- `src/moteur/` : module pur, sans dépendance, qui fonctionne sous Node et dans le navigateur (modules ES).
  - `fraction.js` : nombres rationnels exacts (BigInt). Aucun flottant : `1/3 + 1/3 + 1/3 = 1`. Refuse les nombres non entiers (`Fraction.de(1.5)` → erreur ; écrire `"1.5"`).
  - `format.js` : affichage français (`13,5`, `−0,75`, vrai signe moins U+2212, 2 décimales au plus, sans zéros inutiles, arrondi moitié éloignée de zéro). L'arrondi n'existe qu'à l'affichage.
  - `regles.js` : tous les barèmes du cahier des charges (barème de confiance, multiplicateurs, bonus de sets, pari tournoi, bonus de classement). **Seul endroit à modifier si Pierre change une règle** (puis cahier des charges, ETAT.md et tests).
  - `moteur.js` : `pointsPari`, `pointsMatch`, `gainsPossibles`, `pointsPariTournoi`, `bonusClassement`, `rangs`, `calculerTournoi`, `calculerRace`, `validerPari`, `validerPariTournoi`.
  - `index.js` : point d'entrée unique.
- `tests/` : 76 tests (arithmétique, affichage, tableau complet des barèmes ×1 / ×1,5 / ×2 pour les 3 catégories, exemples A à G de la section 13, bonus de sets, abandon, forfait, neutralisation, pari tournoi, bonus de classement avec toutes les égalités, score en trois étapes, Race, validations, corrections d'admin recalculées).
- **Test de mutation** : 12 règles abîmées volontairement une par une (barème, multiplicateur, bonus, abandon, forfait, égalités, inversion vainqueur/finaliste, Race, ordre bonus/pari tournoi) ; les 12 sont détectées par les tests.
- `CAHIER_DES_CHARGES.md`, `README.md`, `.gitignore` (exclut `.env`, clés, `reponses_api/`), `reference/` (fichiers de maquette « Filet » et `masters_1000.json`).

### Conventions du moteur (à respecter dans la suite)

- Joueur de tennis d'un match : `1` ou `2` (comme l'API). Pari de match : `{ choix, confiance, sets? }`. Match : `{ categorie, tour, vainqueur, setsJoues, finMatch: 'normal'|'abandon'|'forfait', neutralise }`.
- Catégories : `grand_slam`, `masters_1000`, `atp_finals`. Tours internes : `R16`, `QF`, `SF`, `F`, et `RR` pour les poules des ATP Finals. **La correspondance avec les codes de l'API se fera à l'étape 2** (point ouvert n° 2).
- Un match est « compté » s'il est neutralisé, forfait, ou terminé avec un vainqueur. Sinon `pointsMatch` renvoie `null`.
- Le calcul des points est **tolérant** (un nombre de sets manquant en Grand Chelem donne simplement pas de bonus) pour qu'une donnée douteuse ne bloque jamais un classement ; la **saisie** (`validerPari`) est stricte et devra être doublée par des contraintes SQL.
- `calculerTournoi` renvoie les trois étapes demandées par Pierre : `pointsMatchs` (avant bonus vainqueur/finaliste) → `apresPariTournoi` (après bonus vainqueur/finaliste) → `final` (après bonification 1er/2e), avec les rangs de chaque étape. Tant que le tournoi n'est pas clos, seule l'étape 1 est remplie. Le paramètre `joueurs` définit le groupe concerné (réels ou test, jamais mélangés).

## Décisions prises (en plus du cahier des charges)

Décidées par Pierre le 23 octobre 2026 :
- **Point ouvert n° 6** : joueur exclu d'un match ou d'un tournoi par l'admin ; il ne compte plus dans « tous ont parié ».
- **Point ouvert n° 7** : à la neutralisation d'un match, les paris déjà saisis sont révélés.
- **« Tous les joueurs »** = comptes actifs du même type : les comptes de test entre eux, les comptes réels entre eux.
- **Phase de test** : trois faux comptes **Pierre, Paul, Jacques**, joués depuis le compte administrateur de Pierre. Le compte réel de Pierre ne parie pas avant janvier 2027 (seul de son groupe, ses paris seraient révélés et verrouillés aussitôt).
- Le « nombre de sets » est le total de sets joués ; il est obligatoire en Grand Chelem (3, 4 ou 5) pour valider un pari.
- Dans le pari tournoi, le vainqueur et le finaliste sont deux joueurs différents.
- Pendant un tournoi, le classement ne compte que les points des matchs ; les points du pari tournoi s'ajoutent à la clôture, avant le calcul du bonus de classement.
- Affichage du score en **trois étapes** (tableau unique ou plusieurs tableaux, au choix de l'interface) : avant bonus vainqueur/finaliste ; après bonus vainqueur/finaliste ; après bonification (gagnant des paris du tournoi et 2ᵉ du classement).

Proposée par Claude, **à confirmer par Pierre** :
- **Égalités à 3 ou plus** : 5 ÷ 3 ou 10 ÷ 3 ne tombent pas juste. Le moteur garde la valeur exacte en fraction et n'arrondit qu'à l'affichage (1,67 ; 3,33). La somme des parts redonne toujours exactement le bonus.

## Points ouverts

- Section 14 du cahier des charges : n° 2 (codes de tours : R16 = 4ᵉ tour du Grand Chelem ? poules des ATP Finals ?), n° 3 et 4 (quota API et compteur d'usage), n° 5 (abandons dans l'API), n° 8 (photos), n° 9 à 11 (robustesse, notifications), n° 12 (JavaScript natif confirmé pour le moteur, à confirmer pour l'interface en début d'étape 3).
- n° 1 (liste des Masters 1000 dans l'API) : **résolu** par `reference/api/masters_1000.json`. Les 9 Masters existent si on fusionne les filtres `category = masters_1000` et `tier = atp_1000` ; chacun a deux identifiants (probablement deux éditions) ; le Canada apparaît sous Toronto et Montréal. La fiche calendrier devra pouvoir lier plusieurs identifiants. À confirmer par données réelles à l'étape 2.
- Le faux compte « Pierre » et le compte réel/administrateur de Pierre ont le même prénom : prévoir un nom d'affichage distinct pour les faux comptes (ex. « Pierre (test) » ou une pastille « test »). À trancher avec Pierre au début de l'étape 1.2.
- **L'application GitHub « Claude » n'est pas installée sur le dépôt** : Claude peut lire le dépôt mais ses envois (`git push`) sont refusés (403). Pierre doit l'installer : https://github.com/apps/claude/installations/select_target → choisir le compte PitMel → « Only select repositories » → `pronos-tennis` → Install. En attendant, Claude livre les commits dans un fichier (`git bundle`) et Pierre les récupère avec `git pull` (commandes données dans le chat).

## Prochaine étape précise : 1.2 — schéma Supabase et sécurité

Avant de coder, Claude annonce en quelques lignes le plan, puis :
1. Écrire les migrations SQL dans `supabase/migrations/` : tables du cahier des charges (section 11) `profiles`, `tournaments`, `players`, `matches`, `bets`, `tournament_bets`, `tournament_results`, `sync_log` ; plus une table d'exclusions (joueur exclu d'un match ou d'un tournoi) et le rattachement d'un tournoi à plusieurs identifiants d'API.
2. Contraintes SQL qui doublent `validerPari` / `validerPariTournoi` (confiance 6 à 10, choix 1 ou 2, sets 3 à 5 seulement en Grand Chelem, vainqueur ≠ finaliste).
3. Fonctions « security definer » : « tous les joueurs du groupe ont parié » (groupe = même `is_test`, joueurs actifs, hors exclus), verrouillage (début détecté ou tous ont parié), révélation (tous ont parié ou match neutralisé).
4. RLS : lecture des paris des autres seulement après révélation ; écriture de ses propres paris seulement tant que le match n'est ni verrouillé ni révélé ; l'admin écrit pour les comptes `is_test` ; seul l'admin modifie résultats, statuts, calendrier, comptes ; résultat et score masqués (vue ou colonne protégée) tant que tous n'ont pas parié et que le match n'est pas terminé.
5. Comptes : script de création de l'administrateur et des trois faux comptes (Pierre, Paul, Jacques) avec e-mails techniques `@pronos.invalid`, mots de passe saisis par Pierre sans passer par le chat.
6. Tests de sécurité [Proposé] : d'abord automatiques dans le dépôt avec une base PostgreSQL embarquée (PGlite, gratuite, sans compte) qui rejoue les migrations ; puis une vérification réelle sur le projet Supabase de Pierre avec les vraies tentatives d'accès interdit (clés lues dans des variables d'environnement, jamais dans le chat).

## Reste à faire par Pierre

- Installer Git et Node.js sur son PC, cloner le dépôt (voir les commandes données dans le chat à la session 1).
- Installer l'application GitHub « Claude » sur le dépôt (voir « Points ouverts »).
- Répondre à la question restante : égalités à 3 ou plus (voir « Décisions »), et au nom d'affichage des faux comptes.
- Rien à faire dans Supabase avant que Claude donne les instructions de l'étape 1.2.
