# Le noyau de Grillhouse — cadre

Le noyau mène le travail des tickets, quel que soit le langage du projet.

Le paquet `@roomi-fields/grillhouse` porte le noyau et un module par langage, sous
`scripts/langages/` (`docs/ARCHITECTURE.md`, « La cible : un noyau et un module par langage »).
Ce cadre est celui du noyau ; l'interface qu'il demande aux modules est `docs/INTERFACE.md`.

## Son rôle

Le noyau tient les tickets et leur circuit, les rôles et leurs droits, leur relecture, le tableau,
l'enveloppe des agents, les crochets, l'intégration, la nuit et la mise à jour. Ce qui dépend du
langage d'un paquet, il le demande au module de ce langage, par la jointure
(`scripts/langages.mjs`), qui compose les modules qu'un projet déclare.

## Reçoit

- Du projet : le langage de chaque paquet (la colonne « Langage » du tableau des composants de
  son `docs/ARCHITECTURE.md`), ses tickets, sa charte.
- Du module de langage : ses réponses aux demandes de `docs/INTERFACE.md`.

## Rend

- **R1.** Au module de langage, ses demandes et les services du noyau que l'entrée `./jointure`
  lui donne (`docs/INTERFACE.md`, « Les services du noyau ») : il ne lit ni le circuit ni les
  tickets.
- **R2.** Aux projets, les entrées publiées du noyau : `./jointure`, `./conformite`, `./paquets`,
  `./dette`, `./resultats`. Les entrées `./consommateurs`, `./vitest-config`,
  `./vitest-config/mesure`, `./vitest-config/duree` et `./tsdoc-base.json` mènent au module
  typescript.

- **R2.1.** Tout langage entre dans le graphe de Turborepo par un `package.json` : celui d'un
  crate ou d'un projet Python, écrit par `npx grillhouse paquet` (ou la migration 0.31.0 pour un
  projet existant), inscrit aux `workspaces`, dont les scripts appellent les commandes par paquet
  du module (`construire <chemin>`, `typer <chemin>`, `tester <chemin>`) ; la garde
  `dependances-internes` tient ses dépendances internes d'accord avec le manifeste du langage.
- **R2.2.** Un paquet déclare dans `grillhouse.donnees` (`{ "<VARIABLE>": "<paquet>#<sortie>" }`), à
  côté de `grillhouse.outils`, la sortie d'un autre paquet que ses tests lancent, et inscrit le
  fournisseur en `devDependencies` : la construction l'attend, même hors du plan, et la variable
  porte le chemin absolu de la sortie (pour un crate, un binaire de `cargo metadata`). Une
  déclaration fautive est refusée par son nom avant tout travail.
- **R2.3.** Aux tickets, la reprise à l'étape qui porte le rouge et la relecture d'une étape
  inchangée (`scripts/reprise.mjs`). Un rouge de contrôles ou de passe finale s'attribue par la
  sortie de l'étape rouge (le paquet et le fichier nommés) : un fichier de code va au développeur,
  un test du lot qui échoue au développeur, un fichier de test du lot que refuse une garde ou le
  style au testwriter, un rouge sans fichier nommé monte au superviseur, jamais deviné. Un rouge de passe finale dû à un seul fichier de test rejoue ce fichier, puis les
  contrôles et la passe finale restreints à sa portée. Une étape (preuve, contrôles, passe
  finale) dont l'empreinte (le hachage de sa commande et du contenu de ce qu'elle lit, par le
  hachage d'entrées de Turborepo) est celle de son dernier vert ne se rejoue pas : son résultat
  se relit et le ticket le dit. `--depuis <étape>` rejoue cette étape et les suivantes sans rien
  relire. Le bilan compte à part le temps rejoué après un rouge et le temps relu.

## Ce qu'il refuse

- **R3.** Le noyau n'importe aucun fichier d'un module de langage hors de la jointure
  (`scripts/langages.mjs`), et un module de langage n'importe du noyau que ses entrées publiées :
  la garde des frontières refuse l'un et l'autre (`.dependency-cruiser.projet.cjs` du dépôt du
  cadre). Les scripts du shell qui lancent encore un fichier d'un module par son chemin sont
  inscrits avec le ticket qui les retire (`tests/unit/jointure.spec.ts`).
- **R4.** Le code du noyau ne nomme aucun outil d'un langage (turbo, vitest, knip,
  dependency-cruiser, tsc) ; chaque reste nommé l'est avec le ticket qui le retire
  (`tests/unit/jointure.spec.ts`).
- **R5.** Un projet a plusieurs langages, un paquet un seul : un langage hors de la liste du
  cadre, ou déclaré deux fois, est refusé, nommé ; un dossier que deux modules revendiquent est
  refusé, nommé avec les deux langages.
- **R6.** Le paquet ne dépend d'aucun outil d'un langage : chacun est un pair facultatif
  (`peerDependencies`, `peerDependenciesMeta` facultatif), comme Vite déclare les préprocesseurs
  qu'il importe quand un projet les a. Un projet n'installe que ceux de son langage, et
  `grillhouse maj` les lui ajoute.
- **R7.** La garde des tailles du module TypeScript classe grand, comme la taille large de Bazel,
  un test qui monte un dossier temporaire et y lance le produit : un dépôt d'essai (git), ou un
  outil lourd (turbo, vitest, knip, depcruise, api-extractor, la constante `OUTILS_LOURDS`)
  nommé en littéral dans un appel de processus à `cwd:`, `-C` ou `--prefix`. Un outil nommé par
  variable ou par script npm échappe à la lecture. Un grand test de jour est un constat inscrit
  à la dette, qui ne remonte jamais ; la migration 0.30.0 l'inscrit dans un projet.
