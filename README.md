# Pronos Tennis

Plateforme gratuite de pronostics entre amis sur le simple messieurs ATP (14 tournois par an).

- **Règles et architecture** : [`CAHIER_DES_CHARGES.md`](CAHIER_DES_CHARGES.md) (fait foi).
- **Où en est le projet, et quoi faire ensuite** : [`ETAT.md`](ETAT.md).

## Structure

| Dossier | Contenu |
|---|---|
| `src/moteur/` | Moteur de points : module pur (Node et navigateur), calculs exacts en fractions |
| `tests/` | Tests du moteur (exemples de la section 13 du cahier des charges et toutes les règles des sections 4 à 8) |
| `reference/` | Éléments de référence (maquette « Filet », catalogue des Masters 1000 de l'API) |

## Lancer les tests

Il faut [Node.js](https://nodejs.org) (version 20 ou plus). Dans le dossier du projet :

```
npm test
```

Résultat attendu : `# fail 0`.

## Sécurité

Ce dépôt est public. Aucune clé ni aucun mot de passe ne doit y figurer : les secrets se saisissent uniquement dans les réglages de GitHub (Actions) et de Supabase.
