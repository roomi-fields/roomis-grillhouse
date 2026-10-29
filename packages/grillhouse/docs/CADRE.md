# Le noyau de Grillhouse — cadre

Le noyau mène le travail des tickets, quel que soit le langage du projet.

Le paquet `@roomi-fields/grillhouse` porte le noyau et un module par langage, sous
`scripts/langages/` (`docs/ARCHITECTURE.md`, « La cible : un noyau et un module par langage »).
Ce cadre est celui du noyau ; l'interface qu'il demande aux modules est `docs/INTERFACE.md`.

## Son rôle

Le noyau tient les tickets et leur circuit, les rôles et leurs droits, leur relecture, le tableau,
l'enveloppe des agents, les crochets, l'intégration, la nuit et la mise à jour. Ce qui dépend du
langage du projet, il le demande au module de ce langage, par la jointure
(`scripts/langages.mjs`).

## Reçoit

- Du projet : sa déclaration de langage (`grillhouse.langages` de son `package.json`), ses
  tickets, sa charte.
- Du module de langage : ses réponses aux demandes de `docs/INTERFACE.md`.

## Rend

- **R1.** Au module de langage, ses demandes et les services du noyau que l'entrée `./jointure`
  lui donne (`docs/INTERFACE.md`, « Les services du noyau ») : il ne lit ni le circuit ni les
  tickets.
- **R2.** Aux projets, les entrées publiées du noyau : `./jointure`, `./conformite`, `./paquets`,
  `./dette`, `./resultats`. Les entrées `./consommateurs`, `./vitest-config`,
  `./vitest-config/mesure` et `./tsdoc-base.json` gardent leur adresse et mènent au module
  typescript.

## Ce qu'il refuse

- **R3.** Le noyau n'importe aucun fichier d'un module de langage hors de la jointure
  (`scripts/langages.mjs`), et un module de langage n'importe du noyau que ses entrées publiées :
  la garde des frontières refuse l'un et l'autre (`.dependency-cruiser.projet.cjs` du dépôt du
  cadre). Les scripts du shell qui lancent encore un fichier d'un module par son chemin sont
  inscrits avec le ticket qui les retire (`tests/unit/jointure.spec.ts`).
- **R4.** Le code du noyau ne nomme aucun outil d'un langage (turbo, vitest, knip,
  dependency-cruiser, tsc) ; chaque reste nommé l'est avec le ticket qui le retire
  (`tests/unit/jointure.spec.ts`).
- **R5.** Un langage hors de la liste du cadre, ou plusieurs langages déclarés ensemble, sont
  refusés, nommés.
- **R6.** Le paquet ne dépend d'aucun outil d'un langage : chacun est un pair facultatif
  (`peerDependencies`, `peerDependenciesMeta` facultatif), comme Vite déclare les préprocesseurs
  qu'il importe quand un projet les a. Un projet n'installe que ceux de son langage, et
  `grillhouse maj` les lui ajoute.
