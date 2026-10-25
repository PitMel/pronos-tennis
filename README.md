# Pronos Tennis

Plateforme gratuite de pronostics entre amis sur le simple messieurs ATP (14 tournois par an).

- **Règles et architecture** : [`CAHIER_DES_CHARGES.md`](CAHIER_DES_CHARGES.md) (fait foi).
- **Où en est le projet, et quoi faire ensuite** : [`ETAT.md`](ETAT.md).

## Structure

| Dossier | Contenu |
|---|---|
| `src/moteur/` | Moteur de points : module pur (Node et navigateur), calculs exacts en fractions |
| `tests/` | Tests du moteur (exemples de la section 13 du cahier des charges et toutes les règles des sections 4 à 8) |
| `supabase/migrations/` | Schéma de la base, règles de sécurité et révélation des paris (SQL, à exécuter dans Supabase) |
| `supabase/migrations/0002_correction_admin.sql` | Correction par l'administrateur : paris réécrits ou saisis à la place d'un joueur, mention « corrigé », journal |
| `supabase/migrations/0003_admin_corrige_son_pari.sql` | L'administrateur peut aussi corriger son propre pari (avec mention et journal) |
| `supabase/migrations/0004_synchronisation.sql` | Fonctions de synchronisation de l'API (réservées à la tâche automatique) |
| `supabase/migrations/0005_cloture_automatique.sql` | Clôture automatique d'un tournoi (conditions, données pour le moteur, archivage) |
| `src/sync/` | Programme de synchronisation (`node src/sync/cli.js`, options `--simulation` et `--diagnostic`) |
| `supabase/comptes.sql` | Création des profils (administrateur et faux comptes) après création des utilisateurs dans Supabase |
| `supabase/verification-securite.sql` | Vérification de sécurité à lancer sur la VRAIE base (comptes fictifs, tentatives d'accès interdit, tout est annulé à la fin) |
| `tests/securite/` | Tests de sécurité : rejouent la migration dans une base PostgreSQL embarquée et tentent des accès interdits |
| `reference/` | Éléments de référence (maquette « Filet », catalogue des Masters 1000 de l'API) |

## Lancer les tests

Il faut [Node.js](https://nodejs.org) (version 20 ou plus). Dans le dossier du projet :

```
npm install
npm test
```

`npm install` (une seule fois) télécharge la base de test embarquée. `npm test` affiche une longue liste de tests ; le résultat est dans les dernières lignes : `tests 165`, `pass 165`, `fail 0` attendus (selon la version de Node, ces lignes sont précédées de `ℹ` ou de `#`). Pour n'afficher que ces lignes (PowerShell) : `npm test 2>&1 | Select-Object -Last 12`.

## Sécurité

Ce dépôt est public. Aucune clé ni aucun mot de passe ne doit y figurer : les secrets se saisissent uniquement dans les réglages de GitHub (Actions) et de Supabase.
