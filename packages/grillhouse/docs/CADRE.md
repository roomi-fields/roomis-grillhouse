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

- **R1.** Au module de langage, rien d'autre que ses demandes : il ne lit ni le circuit ni les
  tickets.
- **R2.** Aux projets, les entrées publiées du noyau : `./jointure`, `./conformite`, `./paquets`,
  `./dette`, `./resultats`.

## Ce qu'il refuse

- **R3.** Le noyau n'importe aucun fichier d'un module de langage hors de la jointure : le relevé
  des composants, le dernier vert, les verrous et les gardes du cadre passent par elle.
- **R4.** Le code du noyau ne nomme aucun outil d'un langage (turbo, vitest, knip,
  dependency-cruiser, tsc) ; chaque reste nommé l'est avec le ticket qui le retire
  (`tests/unit/jointure.spec.ts`).
- **R5.** Un langage hors de la liste du cadre, ou plusieurs langages déclarés ensemble, sont
  refusés, nommés.
