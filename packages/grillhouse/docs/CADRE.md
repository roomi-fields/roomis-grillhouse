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
- **R2.4.** Aux tickets, un conflit de l'avance d'une copie sur main va au rôle qui écrit ses
  fichiers, sans monter au superviseur : l'avance applique le lot fichier par fichier (un fichier
  en conflit garde ses marques, un fichier que git refuse sans marques reste seul dans
  `grillhouse-travail.patch`, les autres s'appliquent), puis le circuit relance, par le geste
  `conflit-de-l-avance`, le testwriter pour un test ou la matière de test partagée (`estUnTest`
  du module du langage), le développeur pour le code, le testwriter d'abord ; la séance du rôle
  relancé revient à la passe, qui revoit la copie et relance l'autre rôle tant qu'un de ses
  fichiers garde ses marques (cherchées aussi dans les fichiers du conflit que l'index ne dit plus
  en conflit), si bien qu'aucune construction ne joue sur un fichier marqué. Le lanceur accepte
  la relance d'un rôle sur une copie aux conflits non résolus ou au lot gardé quand il écrit un de
  ces fichiers, et le refuse sinon ; un conflit que la seconde séance du rôle ne lève pas monte
  (arrêt « lancement »), chaque fichier nommé.
- **R2.5.** À la CI, la vérification en morceaux qui, réunis, font la passe complète, comme Vitest
  découpe une passe (`--shard`, puis `--merge-reports`) : `npm run verifier -- --sans-tests` joue
  chaque tâche sauf les tests (gardes, typage, mise en forme, lint) ; `npm run verifier --
  --tranche i/n` joue les seuls tests de la tranche i sur n, avec les constructions dont ils
  dépendent, chaque paquet de Vitest jouant la i-ième part de ses fichiers de tests ; `grillhouse
  fusion-des-tranches` réunit leurs rapports et refuse un fichier de la passe qu'aucune tranche ne
  joue ou que deux jouent. Une tranche mal écrite est refusée avant tout travail ; ni une tranche
  ni la passe sans tests ne garde de dernier vert.

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
  `node -e` échappent à la lecture. Les cas existants sont inscrits à la dette ; la migration
  0.33.0 les inscrit dans un projet.
