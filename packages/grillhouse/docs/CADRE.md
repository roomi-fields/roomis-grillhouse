# Le noyau de Grillhouse — cadre

Le noyau mène le travail des tickets, quel que soit le langage du projet.

Le paquet `@roomi-fields/grillhouse` porte le noyau et un module par langage, sous `scripts/langages/` (le document des tests et des langages, §2.2, §3.3). Ce cadre est celui du noyau ; l'interface qu'il demande aux modules est `docs/INTERFACE.md`.

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

- **R2.1.** Tout langage entre dans le graphe de Turborepo par un `package.json` : celui d'un crate ou d'un projet Python, écrit par `npx grillhouse paquet` (ou par `grillhouse maj` pour un projet existant), inscrit aux `workspaces`, dont les scripts appellent les commandes par paquet du module (`construire <chemin>`, `typer <chemin>`, `tester <chemin>`) ; la garde `dependances-internes` tient ses dépendances internes d'accord avec le manifeste du langage (le document des tests et des langages, §2.1, §3.4).
- **R2.2.** Un paquet déclare dans `grillhouse.donnees` (`{ "<VARIABLE>": "<paquet>#<sortie>" }`), à
  côté de `grillhouse.outils`, la sortie d'un autre paquet que ses tests lancent, et inscrit le
  fournisseur en `devDependencies` : la construction l'attend, même hors du plan, et la variable
  porte le chemin absolu de la sortie (pour un crate, un binaire de `cargo metadata`). Une
  déclaration fautive est refusée par son nom avant tout travail.
- **R2.3.** Aux tickets, la reprise à l'étape qui porte le rouge : un rouge de contrôles ou de passe finale s'attribue, par la sortie de l'étape rouge (le paquet et le fichier nommés), à l'un des rôles qui écrivent le lot, un rouge que nulle règle n'attribue monte au superviseur, jamais deviné, et les réponses `--depuis <étape>` et `--recommencer` rejouent ou reprennent à neuf (le document du circuit, §5.4, §5.5).
- **R2.4.** Aux tickets, un conflit de l'avance d'une copie sur main va au rôle qui écrit ses fichiers, une séance par rôle, sans monter au superviseur ; un conflit qui reste arrête le circuit (arrêt `lancement`) (le document du circuit, §5.5).
- **R2.5.** À la CI, la vérification en morceaux qui, réunis, font la passe complète : `npm run verifier -- --sans-tests`, `npm run verifier -- --tranche i/n` et `grillhouse fusion-des-tranches`, qui existe dans tout projet (le document des tests et des langages, §3.1, §5.1 ; le document de l'entrée sur main, §5.2).
- **R2.6.** La nuit d'un projet joue sa passe sans retenir la machine aux autres projets, et ses mesures de temps et ses tests qui exigent de la charge sur des cœurs dédiés (`grillhouse.mesure`) (le document de l'entrée sur main, §5.3 ; le document de la machine, §5.2).

## Ce qu'il refuse

- **R3.** Le noyau n'importe aucun fichier d'un module de langage hors de la jointure (`scripts/langages.mjs`), et un module de langage n'importe du noyau que ses entrées publiées : la garde des frontières refuse l'un et l'autre (`.dependency-cruiser.projet.cjs` du dépôt du cadre). Un fichier du noyau qui nomme un fichier d'un module, un script du shell compris, est refusé par `tests/unit/jointure.spec.ts`, hors des restes que ce test inscrit, chacun avec le ticket qui le retire.
- **R4.** Le code du noyau ne nomme aucun outil d'un langage (vitest, knip, dependency-cruiser, tsc, cargo, pytest, uv) ; Turborepo, qui joue le graphe de tous les langages, est l'outil du noyau. `tests/unit/jointure.spec.ts` le tient, hors des restes qu'il inscrit, chacun avec le ticket qui le retire (le document des tests et des langages, §2.1, §3.5).
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
  à la dette, qui ne remonte jamais.
- **R8.** Un import que le `package.json` du paquet importateur ne déclare pas est refusé par la
  garde des frontières (`pas-d-import-non-declare`, la règle `no-non-package-json` de
  dependency-cruiser : un paquet n'importe que ce qu'il déclare, comme npm et pnpm en mode
  strict), types seuls compris ; un module de Node, un import déclaré et un pair déclaré passent.
  Le refus nomme le fichier, le paquet importé, puis deux suites : déclarer l'usage dans le
  `package.json` du paquet importateur s'il est valide pour l'architecture, sinon ouvrir une
  question d'architecture (au superviseur). Pour un composant du dépôt, la première
  suite déclare aussi l'usage dans la section « Consommateurs » de l'INTERFACE.md du fournisseur
  (que le contrôle des consommateurs exige). Le refus ne corrige rien ; il s'inscrit à la dette
  comme tout constat de frontières.
- **R9.** Un test de jour valide le code en l'important. La garde des tailles refuse
  (`binaire-de-jour`) un test de jour qui lance la commande grillhouse : un appel de processus
  qui nomme `grillhouse`, son lien `node_modules/.bin/grillhouse`, `bin/grillhouse.mjs`, ou un
  fichier de `bin/` ou `scripts/` du paquet du cadre (un script est le code de sa
  sous-commande), en littéral ou par une constante qui le nomme. Lancer la commande est réservé
  aux tests de bout-en-bout : sous un dossier `e2e/` (comme le `e2e/` de Playwright et
  d'Angular), ou dans le paquet `grillhouse-essais` (comme un projet `<app>-e2e` de Nx). Un
  chemin bâti à l'exécution, un lanceur passé par une fonction auxiliaire et le code d'un
  `node -e` échappent à la lecture. Les cas existants sont inscrits à la dette.
