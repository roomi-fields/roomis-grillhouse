---
name: initialiser
description: Initialiser un projet bâti sur le framework Roomi's Grillhouse — préparer le dépôt, mener le grill d'initialisation, puis écrire la charte, l'architecture, le cadre, les interfaces et le lexique, et ouvrir les premiers tickets. À charger au premier lancement d'un projet neuf ou d'un projet existant qui adopte le framework, quand l'ouverture de séance signale « Projet à initialiser », ou quand le responsable demande d'initialiser ou de redéfinir ces éléments.
---

# Initialiser un projet

Le framework fournit les outils et les compétences ; l'initialisation leur donne leur objet. Elle
produit les éléments clés que les compétences `superviseur` et `developper` lisent à chaque séance :

| élément | ce qu'il fixe |
|---|---|
| `CLAUDE.md` | la charte : le projet, le responsable, ce qui décide, le flux, les commandes |
| `docs/ARCHITECTURE.md` | comment le projet est construit, et pourquoi |
| `docs/CADRE.md` | le rôle de chaque composant, sa frontière, ce qu'il refuse (R1…) |
| `docs/INTERFACE.md` | ce qui traverse chaque frontière, et le garde qui le tient |
| `CONTEXT.md` | le lexique du domaine |

Dans un dépôt à plusieurs paquets, le cadre, l'interface et l'architecture de chaque paquet vivent
sous `packages/<x>/docs/`, et `docs/ARCHITECTURE.md` décrit l'ensemble.

## 1. Préparer le dépôt

`bash scripts/setup.sh <préfixe>` s'il manque les tickets ou les dépendances : sans invite, idempotent.
Le préfixe des tickets vient du nom du projet ; il se confirme au premier tour du grill.

## 2. Relever l'existant

Les faits se cherchent, ils ne se demandent pas. Un sous-agent (Explore) relève, avant le premier
tour : le code présent et ses points d'entrée, les documents présents, `package.json`, le dépôt
distant, les dépendants connus. Un projet existant décrit sa construction réelle : le grill ne
porte alors que sur ce que le code ne tranche pas.

## 3. Le grill d'initialisation

Charge `mattpocock-skills:grilling` et suis-le : des tours numérotés, chaque question avec ta
recommandation, la frontière de l'arbre des décisions à chaque tour. Les branches de l'arbre :

1. **Le projet** — ce qu'il est et fait en deux phrases, son public, ce qu'il ne fait pas (ce que
   fait un autre système à sa place).
2. **Le responsable** — son nom, les documents qu'il valide, la politique de poussée.
3. **Ce qui décide** — la source d'autorité (une spécification, une cible, un produit de
   référence), puis le cadre, puis le code.
4. **La forme** — bibliothèque ou service (un service garde `deployment/`, le démon et `.env` ;
   une bibliothèque les retire), TypeScript ou JavaScript, un seul paquet ou plusieurs.
5. **Les composants** — leur découpage ; pour chacun, les huit rubriques du cadre : rôle, reçoit,
   rend, connaît, ne connaît pas, refuse, invariants, coût.
6. **Les interfaces** — pour chaque frontière : ce qui la traverse, qui offre, qui consomme, qui
   juge quelle faute, et le garde qui la tiendra.
7. **L'architecture** — les trois ou quatre choix qui commandent le reste, chacun avec sa raison ;
   les données centrales ; où le code tourne.
8. **Le lexique** — les mots du domaine dont la définition change du code
   (`mattpocock-skills:domain-modeling`).
9. **Le premier chantier** — ce qui se construit d'abord, et ce qui attend.

Le grill est fini quand la frontière est vide et que le responsable confirme la compréhension
partagée. Rien ne s'écrit avant.

## 4. Écrire

- Les documents lus par un humain s'écrivent avec la compétence `rediger` (référence
  « Les documents d'un composant ») ; la charte avec `mattpocock-skills:writing-for-agents`.
- La charte remplace chaque champ `<…>` du modèle ; aucun ne reste.
- `package.json` (nom, description, auteur, dépôt), `README.md`, `LICENSE` et `CREDITS.md` prennent
  l'identité du projet.
- Ce que la forme écarte se retire dans le même commit (les parties de service d'une bibliothèque,
  le code d'exemple du modèle).
- Chaque document se relit au responsable avant son commit : ce sont les documents qu'il valide.

## 5. Ouvrir le travail

- Une épopée pour le premier chantier ; ses tickets sous l'étiquette `a-valider`, chacun avec les
  règles et les documents qu'il touche.
- `superviseur/SUIVI.md` : le premier tour, les questions restées ouvertes.
- Un commit `docs: initialiser le projet` qui ne contient que ces éléments.

À la fin, l'ouverture de séance ne signale plus rien : la séance suivante charge `superviseur`.
