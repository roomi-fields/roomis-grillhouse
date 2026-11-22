# Le noyau de Grillhouse — interface

Le noyau demande à un module de langage ce que ce document écrit, et rien d'autre.

**Langage** : typescript

Le noyau porte les tickets, le circuit, les rôles et leur relecture, le tableau, l'enveloppe, les
crochets et la mise à jour. Un module de langage, sous `scripts/langages/<nom>/`, porte ce qui
dépend du langage du projet : ses outils de test, de typage et de structure, et leurs tests sous
`tests/unit/langages/<nom>/`. Comme Pants, qui active les backends que sa configuration nomme, le
noyau charge le module que le projet déclare et n'importe aucun autre de ses fichiers ; comme un
greffon de Nx n'importe que `@nx/devkit`, le module n'importe du noyau que ses entrées publiées.
La garde des frontières tient les deux sens. Ainsi le reste du noyau ignore le langage du projet.

Les types de la jointure sont `scripts/jointure.d.ts` ; l'entrée publiée
`@roomi-fields/grillhouse/jointure` les porte.

## Les langages d'un projet

Un projet déclare le langage de chaque paquet à la conception, dans la colonne « Langage » du
tableau des composants de son `docs/ARCHITECTURE.md`, comme le fichier BUILD de Bazel nomme la règle
de chaque cible ; l'`INTERFACE.md` de chaque paquet le reprend (`**Langage** : <nom>`). Un tableau
des composants est un tableau du document dont l'en-tête porte cette colonne, et chacun compte
(chez BPScript, le tableau des étages, puis la section « Les paquets » pour ceux qu'il ne nomme
pas) ; une ligne dont la cellule « Langage » est vide nomme une partie qui n'est pas un paquet du
projet (un crate d'un autre dépôt). Les langages du projet sont l'ensemble de la colonne, dans
l'ordre du document ;
chaque nom vient de la liste fermée des langages du cadre (`LANGAGES` de `scripts/langages.mjs`),
et un nom hors de la liste est refusé, nommé, avec la liste.

La colonne est la seule lecture (`langagesDeclares(racine)`, `scripts/tableau-des-composants.mjs`) :
un projet qui n'en déclare aucun est refusé, nommé, avec la colonne à écrire. Rien ne se devine aux
fichiers du dépôt. `maj` reporte dans la colonne la déclaration d'une version antérieure du cadre
(la migration de 0.27.0), avant tout autre geste. La garde des langages des paquets
(`grillhouse langages-des-paquets`, la première des gardes du cadre) cherche les paquets avec le
module de chaque langage du cadre, pas des seuls langages déclarés, et lit chaque manifeste pour
refuser un écart, sans rien en déduire ; elle refuse, chacun nommé avec son paquet : un paquet d'un
module (son manifeste, `manifeste`) qu'aucune ligne ne nomme ; un paquet qu'une ligne déclare d'un
langage dont le module ne l'y trouve pas, nommé avec le manifeste qu'il porte, ou sans le manifeste
de son langage ; une interface dont la ligne `**Langage**` nomme un autre langage. Une ligne nomme
un paquet par l'un de ses noms en code (son dossier, son nom de paquet, son chemin depuis la
racine, `.` pour la racine), dans la première colonne de son tableau où un paquet est nommé.
`npx grillhouse maj` reporte l'ancienne déclaration du `package.json` : il ajoute la colonne au
tableau qui nomme un paquet, et range dans une section « Les paquets » (`Paquet | Langage`) ceux
qu'aucun tableau ne nomme.

Un projet a plusieurs langages, un paquet un seul, comme Bazel et Nx jouent une même liste de
cibles, un outil par langage. `langagesDe(racine)` rend les modules déclarés, dans l'ordre de la
déclaration, chacun chargé une fois par processus ; `langageDe(racine)` rend leur composition
(`scripts/composition-des-langages.mjs`), le module lui-même quand le projet n'en déclare qu'un.
`langageDeLaCopie(copie)` rend la même composition pour ce qui doit continuer dans une copie que
l'outil de son langage ne charge plus (le contrôle d'écriture d'une séance, son enveloppe, un acte
du circuit) : ses lectures de l'arbre, `composants`, `matieres`, `estUnTest` et
`manifestes.horsDesTests`, se rejouent dans l'arbre principal du dépôt quand elles lèvent dans la
copie, les chemins portés d'un arbre à l'autre ; sans arbre principal, ou quand il lève aussi,
l'erreur de la copie est rendue. `langageDe` reste strict, pour les gardes, les constructions et
le rouge de lecture.
La composition répond aux demandes ci-dessous, `manifeste`, `tailleDUneCopie`, `nomDuManifeste`, `liensDuManifeste`, `sortieDuPaquet`, `construireLesPaquets`, `miseAJour` et `squelette` à part, que la
garde des langages, `maj` et `grillhouse paquet` demandent à chaque module :

- les composants sont ceux de chaque module ; un dossier que deux modules revendiquent est refusé,
  nommé avec les deux langages ;
- un fichier va au module du composant qui le tient, le plus profond ; un fichier hors de tout
  composant, au premier module dont la réponse n'est pas nulle (`estUnTest`, `horsDuJour`,
  `manifestes.horsDesTests`) ;
- les lecteurs et les éléments d'un lot sont ceux de chaque module sur ses
  composants, réunis : un nom sans fournisseur l'est dans chaque module ; le verdict d'une passe, celui de chaque module, lu dans le même dossier
  de résultats ;
- chaque commande d'un module est la commande composée de son nom
  (`scripts/commandes-composees.mjs`) : chaque module qui la décrit la joue avec son outil, l'un
  après l'autre ; pour `tester`, `tests-du-paquet`, `construire` et `typer`, chaque chemin va au
  module de son composant, et un module sans chemin ne joue pas ; le code est 0 quand chaque
  module est vert, 75 quand les seuls rouges sont « à repasser », sinon le premier autre ; la
  commande composée ne garde aucun vert et n'en confie aucun à différer à un module : le dernier
  vert se garde par la seule passe de la vérification, une fois, quand toutes les tâches de tous les
  langages du graphe sont vertes ;
- les gardes, les fichiers engendrés, les migrations et la matière de test partagée sont ceux de
  chaque module, sauf l'index des interfaces, que chaque module engendre : il en reste un seul,
  celui du noyau (`scripts/index-interfaces.mjs`), assemblé des entrées de chaque module
  (`entreesDeLIndex`) dans l'ordre de leurs chemins, celle de la racine une fois, sous une seule
  commande (`index-interfaces`) et une seule garde ; les verrous, les sorties, les droits, les
  outils, les binaires et les dossiers à ignorer, leur union ;
- `npm run verifier -- --gardes` joue dans chaque module les gardes : celles du cadre, puis
  celles du projet, sans ses tests ; puis la mise en forme et le lint de chaque paquet (ses tâches
  `<paquet>#format:check` et `<paquet>#lint`) et ceux de la racine (`//#format:check` et
  `//#lint`, pour les fichiers que nul paquet ne porte), jouées quand le script existe.
- `npm run verifier -- --sans-tests` joue chaque tâche de la passe sauf les tests : les gardes, le
  typage de chaque paquet, la mise en forme et le lint, sans mesure contre le dernier vert ;
  `npm run verifier -- --tranche i/n` (ou `--tranche=i/n`) joue les seules tâches de tests, avec
  les constructions dont elles dépendent, chaque paquet de Vitest jouant la i-ième des n parts de
  ses fichiers de tests (le découpage de Vitest, `--shard`) ; les n tranches et la passe sans tests
  font ensemble la passe complète, chaque tâche une fois. Une tranche se mesure comme la passe
  (contre le dernier vert ou sa `--base` ; complète avec `--tout`), se porte dans
  `GRILLHOUSE_TESTS`, donc dans le hash des tests (deux tranches ne se relisent jamais l'une du
  cache de l'autre), se joue pour de vrai et écrit sous `.vitest-reports/` son rapport blob de
  Vitest (`blobs/<paquet>-<i>-<n>.json`) et les fichiers de sa part
  (`fichiers/<paquet>-<i>-<n>.json` : ceux de la passe et les siens). Une tranche qui n'a pas la
  forme `i/n` (1 ≤ i ≤ n), ou donnée avec `--gardes` ou `--sans-tests`, est refusée avant tout
  travail, code 1, la forme nommée. Ni une tranche ni la passe sans tests ne garde son arbre comme
  dernier vert. Un paquet d'un autre langage que TypeScript joue tous ses tests dans chaque
  tranche.

## Les demandes

Le module de langage exporte par défaut un objet `Langage`. Chaque membre répond à une demande du
noyau, et chaque réponse décrit sans agir, sauf `verifier` d'un fichier engendré, qui juge.

- `nom` : le nom du langage, celui de la liste du cadre.
- `manifeste` : le manifeste d'un paquet du langage, dans son dossier (`typescript`, un
  `package.json` ; `cargo`, un `Cargo.toml` ; `python`, un `pyproject.toml` ; `c`, un `CMakeLists.txt`
  dont un `project(<nom>` nomme le paquet), que la garde des langages demande à un paquet que
  l'architecture déclare de ce langage ; un dossier qui porte deux manifestes de deux langages
  (un `Cargo.toml` et un `CMakeLists.txt` à `project(`) est refusé, les deux nommés, et le nom de
  `project()` d'un paquet `c` est celui que sa ligne du tableau déclare.
- `tailleDUneCopie` : la taille attendue d'une copie d'un projet du langage, en octets, avant que
  l'une de ses copies soit mesurée (`typescript`, `python` et `c`, 1 Go ; `cargo`, 8 Go), que le disque
  des copies demande au départ d'un circuit, la marge de 4 Go en plus (`scripts/disque-des-copies.mjs`).
- `nomDuManifeste` : le nom que le texte d'un manifeste du langage donne à son paquet (le `name` du
  `package.json`, du `[package]` d'un `Cargo.toml`, du `[project]` d'un `pyproject.toml`, le premier argument du `project(` d'un `CMakeLists.txt`) ; nul sans
  nom. Le noyau y lit le nom du `package.json` qu'`npx grillhouse paquet` écrit à côté d'un manifeste
  qui n'est pas un `package.json`.
- `liensDuManifeste` : les dépendances internes que le manifeste du paquet à `chemin` lie par un
  `path` ou une entrée d'espace de travail, par les noms des paquets (`nomA` donne le nom du paquet
  dont le manifeste est dans un dossier ; sans lui, la clé), avec `table` (où le manifeste les lie) et
  `outil` (l'outil qui construit par elles) ; aucune pour un langage dont le manifeste est le
  `package.json`. La garde des dépendances internes les compare à celles du `package.json`.
- `sortieDuPaquet` : le chemin absolu de la sortie qu'un paquet construit, que les tests d'un autre
  paquet lancent (`grillhouse.donnees`, à côté de `grillhouse.outils`) ; pour un crate, un binaire de
  `cargo metadata` dans son dossier des cibles, sous `release` ou `debug` selon l'option `release`
  (le script `build` du fournisseur porte `--release`). Un paquet sans cette sortie est refusé,
  nommé ; `typescript`, `python` et `c` refusent : « sortie non prise en charge pour <langage> ».
- `construireLesPaquets` : construit les paquets nommés (par leur nom au `package.json`) avant les
  tests d'un paquet qui les déclare en données ; le module du langage dont le manifeste est le
  `package.json` le fait par le graphe des paquets (rien dans l'exécution du graphe, qui les a
  construits), `cargo`, `python` et `c` refusent : « construction non prise en charge pour <langage> ».
- `outils` : les outils qu'un projet du langage installe, dépendances facultatives du paquet ;
  `maj` n'ajoute que ceux des langages déclarés, chacun à la version de son gabarit.
- `binaires` : les binaires qu'un projet du langage installe sur la machine, chacun à sa version
  exacte ; `maj` installe chacun de ceux qui manquent ou sont à une autre version, par les
  commandes de `miseAJour.installation`. `npx grillhouse binaires` joue la même installation seule,
  sans écrire aucun fichier du projet, comme `rustup` pose une chaîne d'outils : ce que la CI d'un
  projet joue après `npm ci` (le gabarit `templates/projet/.github/workflows/`) ; 0 tout installé
  ou à jour, 1 un échec, sa ligne nommant la commande à taper, 2 un argument ou un langage refusé. `typescript`, aucun ; `cargo`, nextest, cargo-deny et
  sccache (`scripts/langages/cargo/binaires.json`) ; `python`, uv
  (`scripts/langages/python/binaires.json`) ; `c`, uv (à la version du module python, une seule source), clang-format 21.1.8 et clang-tidy 21.1.6
  (`scripts/langages/c/binaires.json`), installés par `uv tool install <nom>==<version>` ; CMake est celui du poste.
- `executables` : les programmes de la chaîne d'outils du langage que l'installateur de Temporal
  exige dans son PATH, dont le dossier entre dans celui des unités des travailleurs, un absent
  refusé par son nom. `typescript`, aucun (Node est un outil du compte) ; `cargo`, `cargo` ;
  `python`, `python3` ; `c`, `cmake` et `ctest`, exigés du poste et nommés quand l'un manque. Un champ en lecture seule : la composition de plusieurs langages ne le porte pas.
- `ignorer` : les dossiers qu'écrivent les outils du langage dans un projet, par leur nom ; les
  fichiers sources que lisent les migrations les laissent de côté, `maj` les écrit dans le
  `.gitignore` du projet, et le retrait des copies finies les retire d'une copie gardée dont le
  ticket est fermé. `typescript`, `.turbo` ; `cargo`, `target` ; `python`, `.venv`,
  `.pytest_cache` et `__pycache__` ; `c`, `.build-cmake`.
- `miseAJour` : la part du langage dans `maj`, comme chaque greffon de Nx apporte son générateur
  `init`. `gabarit`, le dossier du gabarit d'un projet du langage, dont le `package.json` donne les
  scripts du cadre et les versions des outils (`templates/projet`, `templates/cargo`,
  `templates/python`, `templates/c`) ;
  `appliquer`, qui met le projet à la forme du langage, son `package.json` racine, que le noyau
  écrit après, et ses autres fichiers, et rend sa part du bilan, les lignes du rapport, ce qu'il
  laisse au projet (`aFaire`, chaque ligne avec son geste, que `maj` écrit sur la sortie d'erreur
  avant tout outil du langage, son code 1, sans jouer la vérification ; `cargo`, un Cargo.lock que
  git ne suit pas), s'il faut `npm install` avant la vérification et la ligne qui dit pourquoi un projet n'a pas de script
  `verifier` ; `generateurs`, les générateurs que `maj` lance ensuite, chacun avec le fichier qu'il
  écrit ; `installation`, null sans binaires, sinon la commande qui liste les binaires installés
  (`{ <nom>: <version> }` en JSON) et celle qui en installe un, que le noyau lance par Node.
  `typescript` : les scripts de test, le paquet du cadre déclaré, le typage, le `turbo.json`, ses
  générateurs ; `cargo` : les fichiers du gabarit qui manquent au projet (`deny.toml`,
  `.config/nextest.toml`, `rust-toolchain.toml`), ses scripts de test, l'index des interfaces, et
  ses binaires par `cargo install --list` puis `cargo binstall --no-confirm --locked
<nom>@<version>` ; `python` : ses scripts de test, l'index des interfaces, et uv par `uv --version`
  puis l'installeur d'Astral à sa version, les profils du shell laissés tels quels
  (UV_NO_MODIFY_PATH) ; `c` : ses scripts de test, l'index des interfaces, aucun binaire.
- `squelette` : le squelette d'un paquet neuf du langage, sans comportement ni test, que
  `grillhouse paquet <chemin>` écrit (`scripts/paquet.mjs`), comme `cargo new --lib` ou
  `nx g @nx/js:lib` : `fichiers`, chaque fichier du paquet et son texte (son manifeste, la configuration de
  ses tests et de son typage, un fichier de code, son dossier de tests), que le noyau écrit là où il
  manque ; `espace`, le manifeste de l'espace de travail avec l'entrée du paquet, null quand il la
  porte déjà ; `verrouiller`, les commandes qui accordent le verrou des versions au paquet neuf,
  chacune avec son dossier, jouées dans leur ordre. Le noyau lui passe `existants`, les fichiers
  que le dossier porte déjà (hors `docs/`, des entrées cachées et des dossiers que les sources du projet écartent :
  `node_modules`, `dist`, ce qu'écrivent les outils de ses langages, `ignorer`) : le module
  les reprend tels quels, comme `cargo init` reprend le code en place, ou refuse, par son nom, ce
  qu'il ne sait pas reprendre, ce qui manque nommé. `typescript` : sous `packages/<nom>` seul, son `package.json` (`test:unit`, TypeScript,
  Vitest et les types de Node que la racine ne déclare pas), son `tsconfig.json`, son
  `vitest.config.ts`, qui passe tant que le paquet n'a aucun test (`passWithNoTests`), `src/index.ts`,
  `tests/`, l'entrée de `workspaces`, `npm install` ; `cargo` : son `Cargo.toml`, qui hérite des
  champs de `[workspace.package]` et de `[workspace.lints]`, `src/lib.rs`, `tests/`, le membre de
  `[workspace]`, `cargo update --workspace` ; `python` : son `pyproject.toml` (son groupe `test`,
  pytest et sa configuration), `src/<module>/__init__.py`, `tests/`, le membre d'un espace de uv
  à la racine quand il y en a un, `uv lock` ; `c` : son `CMakeLists.txt` (C99 strict, extensions
  coupées, `-Wall -Wextra -Wpedantic -Werror`, une bibliothèque statique, `add_subdirectory(tests)`),
  `src/<nom>.h` et `src/<nom>.c` sans comportement, `tests/CMakeLists.txt` qui prend tout
  `tests/test_*.c` (un exécutable et un test CTest chacun), `.clang-format` (base LLVM, colonne 100) et `.clang-tidy`
  (`-*,bugprone-*,cert-*,clang-analyzer-*,misc-*`, avertissements en erreurs), l'entrée de `workspaces`, aucun verrou ;
  un dossier qui porte déjà un `CMakeLists.txt` est refusé. Sur du code en place : `typescript` reprend `src/` et
  `tests/` et refuse un fichier de code hors d'eux ; `cargo` reprend une bibliothèque (`src/lib.rs`,
  `src/`, `tests/`) et refuse un binaire (`src/main.rs`, `src/bin/`), un fichier hors de `src/` et
  `tests/`, du code sous `src/` sans `src/lib.rs` ; `python` collecte les tests là où ils sont
  (ses `testpaths`, leurs dossiers et `tests`), n'écrit pas `src/<module>/` à côté du code, garde
  `pythonpath = ["src"]` pour du code sous `src/` et le retire pour du code à plat, reprend chaque `requirements.txt` par `uv add -r` au lieu de `uv lock`, et refuse un
  manifeste qu'il ne lit pas (`setup.py`, `setup.cfg`, `Pipfile`). Un chemin où le module ne
  tient aucun paquet est refusé, nommé.
- `sorties` : où écrit un lancement des outils du langage, que l'enveloppe ouvre à la séance.
  `ecrites` s'ouvrent en écriture, créées avant la séance, un dossier quand le chemin finit par
  `/`, sinon un fichier vide : un chemin depuis la racine de la copie, `~/…` depuis la maison,
  `//…` depuis l'arbre principal, un magasin que toutes les copies partagent. `propres` deviennent
  un dossier vide propre à la séance, dans chaque paquet de la copie que le plan ne nomme pas, à
  la racine quand le plan ne l'écrit pas, et dans la matière de test sauf pour le testwriter, qui
  l'écrit ; le lanceur crée ceux qui manquent avant de monter (`preparerLesSorties`), comme Bazel
  écrit les journaux d'un test hors de ses sources. `lues`, `~/…` ou `//…`, se montent en lecture seule avant ce qui s'écrit en
  elles, quand elles existent. `typescript` : `//.turbo/cache/` écrit, `.turbo` et
  `.cache-outils` propres (le cache de Vite vit sous `.cache-outils/vite`, `cacheDir` des bases de jour et de nuit ; `node_modules/.vite` n'est plus une sortie propre, `node_modules` d'une copie étant un lien) ; `cargo` : `target/`, et dans `~/.cargo` son registre, ses
  dépendances git, ses avis de sécurité et les fichiers de ses verrous et du cache de ses paquets
  écrits ; `~/.cargo/` (son `env`, que les shells sourcent, sa configuration, ses binaires) et
  `~/.rustup/` lus ; `python` : `.venv/` et `.pytest_cache/`, où ses commandes font écrire uv et pytest pour chaque
  paquet, et `~/.cache/grillhouse/uv/` écrits,
  `__pycache__` propre (le code-octet de Python, sous un seul arbre à la racine), uv lui-même, là où son
  installeur le pose (`~/.local/bin/uv`), et les Python de uv, `~/.local/share/uv/python/`, lus ;
  `c` : `.build-cmake/`, où ses commandes font configurer et compiler CMake chaque paquet, écrit.
- `droits` : les règles de Claude Code qui refusent à un rôle qui écrit l'outil de test lancé
  directement ; `typescript`, Vitest et Turborepo ; `cargo`, `cargo test` et `cargo nextest` ;
  `python`, pytest, seul, par Python ou par `uv run` ; `c`, `ctest`.
- `composants` : les composants du projet, chacun `{ dossier, nom, paquet }`, le dossier absolu ;
  `cargo`, les membres de l'espace de travail que décrit `cargo metadata --no-deps --offline` ;
  `python`, chaque dossier qui tient un `pyproject.toml` ; `c`, chaque dossier dont le
  `CMakeLists.txt` appelle `project(` (casse libre, commentaires `#` retirés), son nom celui de
  `project()` ; le `CMakeLists.txt` de `tests/`, sans `project(`, est la matière du paquet.
  Un dossier que git ignore (le clone local d'un autre dépôt) ne donne aucun composant aux
  modules qui cherchent sur le disque, `typescript`, `python` et `c` : son manifeste, lu par
  `git check-ignore` (`ignoresParGit` de l'entrée `paquets`), est laissé ; un manifeste que git
  suit reste trouvé, celui d'un sous-module compris, et un dossier sans git se lit au disque seul. `cargo` suit les membres que
  déclare le manifeste de l'espace de travail.
  L'enveloppe et le lanceur y lisent le plan : un plan qui nomme un composant (un paquet, un
  crate) ouvre ce composant seul en écriture.
- `composantDe` : le composant qui tient un fichier, ou null pour un fichier hors de tout
  composant ; toujours l'un de ceux que `composants` rend.
- `matieres` : les composants de la matière de test partagée, que l'enveloppe monte en écriture
  pour le testwriter.
- `joueDesTests` : si un composant joue des tests, que le lanceur du langage y trouve à jouer ;
  `typescript`, un script `test:unit` dans son `package.json` ; `cargo`, un dossier `tests/` ;
  `python`, un fichier de test du jour (`test_*.py`, `*_test.py`, hors `*_nuit_test.py`) ; `c`, un
  `tests/test_*.c`. Le circuit en tire les paquets du
  plan qui portent des tests, comme Bazel lit les cibles de test d'un paquet à leur genre.
- `empreintes` (`racine`, `noms`) : les hachages d'entrées des tâches de tests des composants
  `noms` (le nom de leur paquet) et de leurs dépendants, `{ <paquet>: <hachage> }`, tels que
  l'outil de tâches les planifie (le hachage d'une tâche couvre le contenu des fichiers qu'elle lit
  et de ce qu'elle attend, comme la clé de cache d'une tâche de Turborepo) ; null quand l'outil ne
  donne aucun plan. L'empreinte d'une étape du circuit les lit (`empreinte-d-etape.mjs`).
- `environnementDuPoste` (`env`) : l'environnement sous lequel les outils du langage jouent sur le
  poste : les variables du fichier du poste que le module nomme (`avecLeFichierDuPoste`), le
  serveur du cache distant de son outil de tâches, lu seul ; `env` tel quel sans le fichier, ou
  quand `env` nomme déjà l'une de ses variables (une CI). Les commandes du module jouent sous lui
  (`environnementDe` de `sous-commandes.mjs`) ; la composition l'applique module après module.
- `lecteurs` : les fournisseurs et les lecteurs, par le code, des éléments qu'un ticket nomme : son
  interface, ses imports, ses tests, ses types ; ce que lit chaque composant (`lit`) et ce que
  lisent ses tests (`parLesTests` : leurs imports ; `cargo`, ses dépendances de développement),
  d'où `--etendre` tire l'ordre du plan. Le relevé des composants touchés
  (`composants-affectes`) y ajoute les chemins lus et l'architecture.
- `elementsDuLot` : les éléments qu'un lot ajoute, change ou supprime entre deux commits, chacun à
  sa place, les fichiers qu'il change, et les sources dont le module ne lit aucun élément ; le
  circuit les donne au relecteur.
- `commandes` : les commandes qui testent (`tester`), vérifient (`verifier`) et typent (`typer`),
  et chaque autre commande du module, garde, générateur ou préparation, par son nom ; chacune
  `{ script, args }`, le script absolu, jamais lancée. `grillhouse tests` et `grillhouse verifier`
  lancent `tester` et `verifier` ; chaque autre, sauf `typer`, est une sous-commande de son nom
  (`grillhouse frontieres`, qui refuse aussi un import que le `package.json` du paquet importateur
  ne déclare pas, et dit les deux suites : déclarer l'usage, sinon une question d'architecture ;
  pour un composant du dépôt, aussi dans la section « Consommateurs » de l'interface du
  fournisseur), comme un backend de Pants apporte ses buts. Chaque garde du module est
  une commande de son nom, celui de son script, que la ligne d'une garde rouge nomme (`grillhouse
clippy`). Le noyau en lance deux
  quand le module les décrit, et passe l'étape sinon :
  - `construire <chemin>` et `typer <chemin>` (`cargo`, `cargo build -p` et `cargo check -p` du
    crate de ce dossier ; `python`, la construction et le typage du projet de ce dossier ; `c`,
    la configuration et la compilation de CMake du paquet de ce dossier, dans `.build-cmake/<paquet>`) : les
    commandes par paquet que les scripts `build` et `typecheck` du `package.json` d'un crate ou
    d'un projet Python appellent, comme la tâche d'un paquet dans Turborepo ; un chemin qui ne
    désigne pas un paquet du langage est refusé (2). `typer` sans chemin type l'espace entier.
    Tout langage entre dans le graphe de Turborepo par ce `package.json`, que `npx grillhouse
paquet` écrit (son `name` : celui du crate ou du projet) et inscrit aux `workspaces` ;
    `dependances-internes` refuse un `package.json` dont les dépendances internes diffèrent de
    `Cargo.toml` (`path = …`) ou de `pyproject.toml` (`[tool.uv.sources]`) ;
  - `construire --echec <fichier> <plan>`, que le lanceur joue dans la copie préparée, pour que la
    séance trouve construit ce qu'elle lit : une seule implémentation du noyau pour tous les
    langages (`construireDepuisLesArguments`), la construction par Turborepo du plan et de ses
    fournisseurs (`turbo run build --filter=<paquet>…`), la copie entière pour un plan dont un
    chemin n'est pas un paquet du graphe ; une construction en échec écrit dans `<fichier>` sa
    première ligne, puis sa sortie, et rend 0 ; tout autre échec rend un autre code et arrête le
    lancement ;
  - `construire --gardes`, que les contrôles du plan d'un circuit jouent avant ses gardes : la même
    implémentation du noyau, qui lit le plan à blanc des tâches de gardes dont la racine porte le
    script (`turbo run grillhouse:gardes gardes --dry=json`) et joue chacune de ses tâches sauf les
    gardes, les constructions qu'elles attendent, côte à côte dans la borne de la vérification
    (`--concurrency`, la moitié des cœurs de la part) ; rien sans script de gardes ni tâche
    attendue (0) ; son code est celui de l'outil de tâches, 1 pour un plan à blanc refusé ; une
    construction rouge d'un paquet du plan va au développeur, celle d'un paquet hors du plan, ou
    sans lieu, est laissée à la passe finale, et les gardes jouent sans elle ;
  - `tests-du-paquet <chemin>…` (`cargo`, `python`, `c` : CMake configure et compile, CTest joue
    chaque `tests/test_*.c`, un test CTest par fichier, dans `.build-cmake/<paquet>`, et son
    rapport JUnit est repris tel quel ; un fichier de test que CTest n'enregistre pas est rouge,
    « fichier de test non pris par CTest »), le corps de la tâche `test:unit` d'un paquet,
    que le script `test:unit` de son `package.json` appelle (`grillhouse tests-du-paquet
<dossier>`, que `npx grillhouse paquet` écrit) : nextest et les doctests d'un crate, ou
    pytest d'un projet Python, sans relancer Turborepo, donc sans la boucle que ferait `tester`.
    `tester` de ces langages lance `turbo run test:unit` sur les paquets du langage (les chemins
    nommés choisissent leurs paquets et passent à la tâche par `GRILLHOUSE_TESTS`, qui entre dans
    son hash ; `--force` y porte le moment du rejeu), et le cache des tâches choisit ce qui se
    rejoue ;
  - `tests-de-nuit`, que la nuit joue après la passe complète : les tests de nuit, puis les
    mesures de temps seules, qu'aucune autre commande ne joue sans les nommer (`typescript`, les
    tests de nuit puis les bancs de temps et les témoins de temps, un fichier à la fois, par
    Vitest ; `python`, les `*_nuit_test.py` par pytest ; `cargo`, les cibles `tests/*_nuit.rs`
    puis les bancs `tests/*_budget.rs` par nextest), 75 pour « à repasser ». Avec
    `--hors-du-poste` (`typescript`), la nuit d'une machine partagée (le workflow `nuit.yml`) : les
    tests de nuit seuls, sauf ceux qui portent l'étiquette `@poste` (une ligne `// @poste: <raison>`
    du commentaire de leur tête : la session de l'utilisateur, un secret, le `bd` réel, le trousseau,
    systemd), `@equipee` compris (une ligne `// @equipee: <raison>` : l'enveloppe, un serveur
    Temporal, les binaires du module cargo, que l'exécuteur de PC2 a), et aucune mesure de temps ;
    elle ne pose jamais de dernier vert. Avec `--sans-equipement` à côté de `--hors-du-poste` (un
    exécuteur hébergé par GitHub, le flux du gabarit de projet), elle laisse aussi les tests
    `@equipee`. Avec `--tranche i/n` (ou `--tranche=i/n`) à côté de `--hors-du-poste`, la i-ième
    des n parts de ces tests (le découpage de Vitest, comme une tranche de la vérification), ses
    rapports écrits sous `.vitest-reports/`, que `fusion-des-tranches` réunit. `--du-poste` joue
    les seuls tests `@poste` (la nuit locale de PC3), sur sa part ; `--mesures` joue les seules
    mesures de temps et de charge (l'étape de mesure de PC2, sur les cœurs de `grillhouse.mesure`),
    sans rien jouer et sans rougir quand il n'y en a aucune. `--du-poste`, `--mesures` et
    `--hors-du-poste` sont trois nuits à part. Une tranche qui n'a pas la forme `i/n`, une tranche
    ou `--sans-equipement` sans `--hors-du-poste`, deux de ces nuits à la fois et tout autre
    argument sont refusés avant tout travail, code 2.
  - `tests-du-poste` (`typescript`), une garde à deux règles : un test de nuit qui dépend du poste
    (le `bd` réel, sccache, systemd, le trousseau, la session, une séance de `claude`, vus par ses
    appels et sa matière de test) sans l'étiquette `@poste`, et un test de nuit qui exige un
    équipement de machine (l'enveloppe, un serveur Temporal, les binaires du module cargo) sans
    l'étiquette `@equipee`, sont refusés par leur nom, leurs marques nommées ; la dette du projet
    les inscrit (migrations 0.33.0 et 0.49.0).
  - `fusion-des-tranches` (`typescript` ; une sous-commande de tout projet), que la CI joue
    après les tranches d'une passe : chaque paquet doit tenir ses n tranches, les mêmes fichiers
    de la passe dans chacune, et chaque
    fichier de la passe joué par une tranche exactement, chaque faute nommée ; puis Vitest réunit
    leurs rapports blob en un seul (`vitest run --merge-reports .vitest-reports/blobs`). 0 quand
    les tranches tiennent et que le rapport réuni est vert, ou qu'aucune tranche n'a de fichier de
    tests ; 1 sinon. Dans un projet dont aucun module ne la décrit (cargo seul, python seul, c
    seul), la commande composée la sert : aucun module ne joue, une ligne le dit, et le code est
    0 ; nextest découpe seul et n'écrit aucun rapport à réunir, pytest et CTest jouent dans la
    première tranche seule.
- La vérification écrit ses tâches rouges dans le fichier que nomme `GRILLHOUSE_ROUGES`, une par
  ligne, `<tâche>`, puis une tabulation et la commande qui la rejoue seule quand le langage en a
  une (`typescript`, `npx turbo run <tâche> --filter=<paquet>`) ; la nuit en tire sa commande
  `git bisect run`.
- Une vérification se nomme à sa part de la machine par deux variables que son appelant pose :
  `GRILLHOUSE_VERIFICATION_SORTE` (sa phase : « Intégration », « File » ou « Nuit » chez les
  appelants du cadre, une sorte libre est inscrite telle quelle) et `GRILLHOUSE_VERIFICATION_TICKET`
  (son ticket, absent quand elle n'en a pas). Absentes ou vides, la sorte vaut « Vérification » et
  le ticket null ; l'option explicite du circuit l'emporte. Elles ne servent qu'à la prise de la
  part (aux côtés de `GRILLHOUSE_PART_TENUE`, la marque de la prise) : la mesure que la passe
  lance ne les reçoit pas.
- Un projet règle les parts de ses passes dans la clé `grillhouse.part` de son `package.json`
  (`{ "coeurs": <entier ≥ 1>, "memoireGo": <nombre > 0> }`, chacun facultatif ; sans elle, la part
  par défaut : 3 cœurs (2 pour un direct, fixes), et la mémoire du
  plus grand pic mesuré plus un quart, jamais sous le tiers du budget), lue dans l'arbre principal : une clé
  fautive est refusée par son nom avant tout travail. La réserve de l'utilisateur se règle par
  poste (`GRILLHOUSE_RESERVE_COEURS`, 4, et `GRILLHOUSE_RESERVE_MEMOIRE_GO`, 4, dans
  `~/.config/grillhouse/machine.env` ou l'environnement, zéro admis).
- `verdict` : ce qu'un lancement a laissé dans son dossier de résultats (`GRILLHOUSE_RESULTATS`) :
  `{ rapports, taches }`, chaque fichier de test avec ses tests, chaque tâche avec son code, 0 vert,
  1 rouge, 75 « à repasser », et `tests` vrai pour la tâche qui joue les tests de son composant.
- `echecDeCompilation` : vrai quand le journal d'une tâche porte un échec de compilation du langage,
  pour que le circuit lise une cible de test qui ne compile pas comme une construction échouée
  (« construction de <crate> »), quelle que soit la tâche qui le porte — la tâche de construction,
  ou la tâche de test sans rapport. Chaque module y répond ; un langage sans étape de compilation
  (TypeScript, Python ici) répond toujours faux.
- `moduleAbsent` : le chemin absolu du module qu'un échec de chargement d'un fichier de test nomme
  comme absent, ou rien : la preuve du rouge lit un test qui importe un module que le ticket crée
  comme un rouge, et non comme un fichier cassé. Chaque module y répond ; un langage dont le
  compilateur porte ce cas (`echecDeCompilation` : Rust, C) répond toujours rien.
- `estUnTest` : ce que le testwriter écrit dans un fichier, `{ joue, test, matiere }` (un test que
  le lanceur joue, un fichier de test ou d'un dossier de tests, un fichier de la matière de test
  partagée), ou null pour un fichier qu'il n'écrit pas. Les verrous des rôles, l'intégration et le
  circuit le lisent.
- `horsDuJour` (`chemin`, `racine`) : vrai quand le fichier de test est de ceux que seule la nuit
  joue (test de nuit, banc ou témoin de temps), selon les définitions du module ; faux pour tout
  autre fichier, absent compris. La preuve du rouge met ces fichiers de côté et les nomme.
- `resumesDuLancement`, `garderLesResumes`, `lireLesResumes` (facultatifs, `typescript` seul, qui pilote
  Turborepo) : le résumé de passe que Turborepo écrit sous `--summarize`. `resumesDuLancement` nomme
  ceux d'une racine avant un lancement ; `garderLesResumes` range ceux qu'un lancement a écrits dans
  le dossier de résultats, ou les retire sans lui ; `lireLesResumes` rend chaque tâche du dossier
  (identifiant, paquet, script, code, statut de cache, journal). Le noyau les sert aux modules
  `cargo` et `python` : `lancerLesTaches` demande le résumé et le range quand un dossier de résultats
  est nommé, et `tachesDuVerdict` joint les tâches du résumé à celles qu'un module a écrites (une
  tâche relue du cache paraît avec le code 0, sans rapport).
- `manifestes` : ce que le testwriter écrit des manifestes, comme l'auteur d'un test de Bazel
  déclare les dépendances de sa cible. `verrous`, les fichiers de verrouillage des versions depuis
  la racine (cargo : `Cargo.lock` ; typescript : `package-lock.json` ; python : `uv.lock`, celui
  de chaque paquet aussi), que l'enveloppe ouvre au
  seul testwriter ; `horsDesTests(chemin, racine, avant, apres)`, les parties du manifeste d'un
  composant qu'un changement touche hors de la partie de ses tests (cargo : `[dev-dependencies]`
  et `[target.<cible>.dev-dependencies]` d'un Cargo.toml ; typescript : `devDependencies` d'un
  package.json ; python : le groupe `test` de `[dependency-groups]` d'un pyproject.toml), et, pour
  cargo, d'un fichier de code de `src/` d'un crate hors de son module de
  test (la déclaration `#[cfg(test)] mod tests;` ajoutée ou retirée, un module de test en ligne
  retiré), chacune nommée, ou null pour un fichier que le module ne juge pas.
  Le verrou du testwriter accepte une écriture dont la liste est vide, et refuse les autres en
  nommant le chemin et chaque partie ; le noyau ne connaît aucun nom de section.
- `fichiersEngendres` : les fichiers que le module engendre, chacun avec sa commande, ses fichiers,
  ceux qu'il lit, les noms de ses constats et sa vérification (`verifier`), qui rend ses écarts.
  Le circuit les régénère et les juge (étape 4.2). Les fichiers engendrés qu'un projet déclare
  (`grillhouse.engendres` de son `package.json`) se lisent à côté, dans la même forme, sans
  vérification ni constat ; l'intégration les régénère au lieu de les fusionner.
- `grillhouse.matieres` (clé du `package.json` racine d'un projet) : une liste de dossiers du dépôt,
  hors de tout paquet, que le testwriter écrit comme de la matière de test (`estUnTest` de la
  jointure des langages leur rend `{ joue: false, test: false, matiere: true }` après les
  modules) ; lue dans l'arbre principal, refusée par son nom si elle est fautive ; sans elle, rien
  ne change.
- `gardes` : les gardes de structure du module, chacune `[script, ...args]`, dans l'ordre où elles
  jouent ; `grillhouse gardes-du-cadre` les joue.
- `entreesDeLIndex` : les entrées de l'index des interfaces, une par interface des composants du
  module et pour celle de la racine, `{ rel, lignes }`, `lignes` telles que l'index les écrit ; le
  noyau les assemble en un seul index pour un projet de plusieurs langages.
- `migrations` : les migrations d'un projet du langage, celles qui rejouent une garde du module et
  celles de ses outils (`typescript`, la configuration de base de Vitest), que `grillhouse maj`
  joue avec celles du noyau, comme `nx migrate` réunit celles de chaque greffon.

## Les services du noyau

L'entrée `@roomi-fields/grillhouse/jointure` donne au module de langage les services du noyau
qu'il emploie, et `scripts/jointure.d.ts` les type : le plan d'une enveloppe, l'avancement d'une
passe et sa mesure, la base d'une passe (son dossier temporaire, nommé dans `TMPDIR`, `TMP` et
`TEMP` ; la ligne de sa garde, qui nomme ce que les tests y laissent ; son retrait à
l'interruption), la pression de la machine et les parts de ses passes, les parts de la machine
(`surUnePart(passe, { env?, racine?, mesure?, dire? })` : la passe jouée sur sa part (`mesure` : une mesure de temps, jouée sur des cœurs dédiés), la marque de
la part dans l'environnement de ses enfants, son code de sortie, ou celui de l'attente qui
s'arrête, 75 à sa borne, 1 pour une clé ou une réserve fautive ; `avecLaPasse(mesure, { lourde, … })` :
une passe jouée sur sa part, tenue par le système dans un groupe de contrôle à elle, sa
consommation gardée au registre du projet quand elle est lourde (`consommation-des-passes.mjs`,
`grillhouse consommation [--json]` : par sorte de passe, le nombre de passes, la médiane et le
maximum des cœurs occupés et du pic de mémoire) ; aucune part dans l'enveloppe d'un agent, que
couvre la place de sa séance), les travailleurs des tests d'une tâche
(`travailleursDeLaSeance(env)` : le nombre que donne `GRILLHOUSE_TRAVAILLEURS`, que posent une
séance (max(1, cœurs ÷ places)) et une passe (les cœurs de sa part), et que le module passe à son outil — `maxWorkers`, `-j`, `-n` — ou `null` sans la
variable, l'outil gardant son défaut ; une valeur fautive est refusée par son nom), le dernier vert, le
registre des résultats (`registre-des-resultats.mjs` : `garderLeRegistre(etat, rapports)`, les
tests verts de chaque fichier d'une passe, que la passe complète écrit quand `GRILLHOUSE_RESULTATS`
nomme son dossier de résultats ; `lireLeRegistre(racine)`, le registre de la branche quand son
commit est un ancêtre de HEAD, celui de main sinon, `null` hors de ces cas ;
`vertsDuRegistre(registre, fichier)`, les noms des tests verts d'un fichier, un ensemble vide pour
un fichier absent ; `consignerLesRegressions(etat, rouges, registre, quand)`, un vert devenu rouge,
avec son dernier commit vert et son premier HEAD rouge, sous `regressions/<branche>.json`, sans
doublon), l'état du dépôt et la place de ses fichiers par branche (`etat-du-depot.mjs` :
`etatDuDepot(racine)`, `{ racine, commit, arbre, branche, main }` ou `{ raison }` ;
`fichierSous(racine, sous, branche)`, le fichier `<git common dir>/grillhouse/<sous>/<branche>.json`
que le dernier vert et le registre partagent), les arbitrages d'un ticket, le préfixe des tickets (`CONFIG_BEADS`, le fichier commité de Beads,
`.beads/config.yaml` ; `prefixe(racine)`, la clé `issue-prefix` lue là, jamais par `bd`, et une
erreur qui nomme le fichier ou la clé manquants ; `ecrireLePrefixe(racine, valeur)`, son seul
écrivain, que la préparation d'un projet neuf et la mise à jour de tout projet (`mettreAJour`) appellent :
la clé vide remplacée, la clé absente ajoutée, la ligne écrite rendue, `null` pour une clé qui a sa
valeur ; `prefixeDuStore(racine, bd)`, la valeur que le store de Beads donne, la chaîne vide sans
valeur, en échec ou pour un espace réservé), les fichiers sources d'un projet, les variables d'un fichier du poste (`avecLeFichierDuPoste(env, { fichier, ajouts })` : celles de
`$XDG_CONFIG_HOME/grillhouse/<fichier>`, `~/.config/grillhouse/<fichier>` sans lui, puis
`ajouts`, `env` tel quel quand il nomme déjà l'une d'elles ou sans le fichier), la recherche d'une commande dans le PATH (`trouverDansLePath(nom, env?)` : le chemin du premier exécutable de ce nom, ou `null`, comme `command -v`), les paquets d'un langage sans
`package.json` à lui (`paquetsSansPackageJson(racine)` : les crates et les projets Python que le
tableau des composants de `docs/ARCHITECTURE.md` déclare, chacun `{ langage, chemin, nom }`, `nom`
celui du manifeste ; le `tester` du module typescript en exclut les tâches `test:unit`, que le
`tester` de leur propre module joue, mais sa passe de vérification les joue toutes, avec le
dernier vert qu'elle pose seule), les fournisseurs de `grillhouse.donnees` d'un paquet (`fournisseursDuPaquet(racine, chemin)` : leurs noms, une erreur qui nomme chaque faute de la clé), les tâches du graphe des paquets (`lancerLesTaches` : les
tâches de Turborepo de paquets nommés, les chemins nommés dans la variable `GRILLHOUSE_TESTS` ; `empreintesDesTaches`, le hachage d'entrées des tâches de tests des paquets nommés et de leurs dépendants, que l'outil de tâches calcule, pour l'empreinte d'une étape ; `nomDuPaquet` ;
`testsCibles` ; `cheminsDeLaTache` ; `construireDepuisLesArguments`, le lanceur de la copie d'un
agent, le même pour tout langage, que le module appelle en lui donnant l'outil des tâches, et
`constructionDuGraphe`, qui dit si les arguments d'un `construire` le demandent (`--echec`,
`--gardes`) ;
`SCRIPT_DES_TESTS` et `TESTS_CIBLES`, le nom du script des tests et celui de la variable des
chemins, uniques pour tout langage, typescript compris ; `GRAPHE_JOUE`, que la commande composée
pose aux modules qui jouent à côté du module de `package.json`, dont la passe joue déjà toutes les
tâches du graphe ; `PASSE_ROUGE`, que la commande composée pose à un module qui joue après un
module rouge (un code 75 d'un module hors du graphe compte comme rouge) : la passe de la
vérification ne pose alors aucun vert ; sous `verifier`, le module de `package.json` joue en
dernier, quel que soit l'ordre des langages du tableau des composants, si bien qu'un contrôle
hors du graphe rouge, `cargo deny check` par exemple, l'empêche de poser le dernier vert ; `TRACE`, `tracesDuPlan`), et la lecture unique
(`luUneFois(cle, lire)` : ce qu'un module lit à grand coût, les métadonnées de cargo, ses
composants, se lit une fois tant que le noyau tient une portée de lecture unique, un geste qui
pose beaucoup de questions sur un arbre immobile ; à chaque appel hors
d'elle). Pour le dossier temporaire et les
caches de compilation : `dansLeTemporaire(chemin, env)`, si un chemin est sous le dossier
temporaire (`TMPDIR`, celui du système, `/tmp`) ; `cacheDeCompilation(outil, env)`, le cache d'un
outil sous `${XDG_CACHE_HOME:-~/.cache}/grillhouse/<outil>`, jamais sous le dossier temporaire ;
`cacheDeLaRacine(outil, racine, env, { creer })`, le cache d'une construction enracinée sous le
dossier temporaire, balayé quand sa racine n'est plus, vue du même espace de processus, ou depuis l'hôte
après 7 jours sans usage, son seul
chemin quand `creer` est faux ;
`attendreDeLaPlace(options)`, l'attente de 4 Go libres dans le dossier temporaire, puis sur le
disque de la copie (`racine`), avant une passe, qui nomme ce qui occupe chacun (sur le
disque de la copie, les copies du dépôt, leur ticket et leur `target/`) et rend 75 à sa borne. Un module n'importe rien d'autre du noyau que ses entrées publiées
(`./jointure`, `./paquets`, `./dette`, `./resultats`, `./conformite`).

## La conformité

`@roomi-fields/grillhouse/conformite` tient chaque module de langage à ces demandes, comme le
RuleTester d'ESLint tient une règle à ses cas. `cas(langage, exemples)` rend un cas par demande :
sur son entrée valide, un module sain ne donne aucune faute ; sur son entrée défectueuse, il donne
exactement les fautes attendues. `echecs(langage, exemples)` rend les cas qu'un module manque. Les
entrées sont celles de chaque module (`scripts/langages/<nom>/exemples.mjs`).

Un cas tient chaque demande sauf `nom`, `verdict` lu à part, `migrations`, que le test de
chaque migration tient, `manifeste`, que les tests de la garde des langages tiennent, `outils`,
`binaires`, `ignorer` et `miseAJour`, que les tests de la mise à jour tiennent, `sorties`, que les tests
de l'enveloppe tiennent, et `droits`, que le test des droits tient. L'entrée défectueuse des
fichiers engendrés met chacun d'eux en retard.
Le test du noyau joue la suite sur le module typescript et sur seize modules défectueux, un défaut
chacun ; chacun manque son seul cas. Ainsi la suite attrape un vrai défaut. Le module cargo la
passe contre un faux cargo en tête du PATH, et contre le vrai à la nuit.

## Les entrées du module typescript

Un projet en TypeScript lit le module typescript par ces entrées publiées, chacune typée :
`./consommateurs` ; `./vitest-config`, la configuration de base de Vitest ;
`./vitest-config/mesure`, `mesurerAuRepos` ; `./vitest-config/duree`, le rapporteur de durée, que
Vitest charge par son nom (`--reporter=@roomi-fields/grillhouse/vitest-config/duree`, ou
`reporters` dans une configuration) ; `./tsdoc-base.json`, la base TSDoc.

## Le service Temporal du compte

Le paquet publie, hors des entrées de `exports`, la sous-commande `grillhouse temporal` et le travailleur de Temporal construit (`dist/temporal/travailleur.js`), que les unités du compte lancent (`docs/ARCHITECTURE.md`, « Le service Temporal du compte porte les déroulés du cadre »).

- `grillhouse temporal installer [--archive <fichier>] [--maison <dossier>] [--unites <dossier>] [--racine <dossier>] [--systemctl <programme>]` : 0 posé ou à jour, l'unité du serveur différée sous un circuit en vol (le rapport nomme les circuits, à rejouer quand ils sont arrêtés) ; la sortie finit sur `; file : <état>` et le rapport porte `file` : `repartie (<ancienne> → <nouvelle>)` (la file en vol au repos repart neuve aussitôt), `repart après l'entrée de <ticket> (<ancienne> → <nouvelle>)` (occupée, elle finit l'entrée en cours, puis repart avec celles qui attendent) ou `aucune` (aucune file en vol, déjà de la version installée, ou serveur injoignable ; aucune file n'est démarrée), et les champs `versionDeLaFile` (« inconnue » pour une vue sans version) et `versionInstallee` ; chaque passage, à jour compris, relance toute file dont la version diffère de celle installée (celle du paquet d'où vient le travailleur du projet), en redémarrant d'abord l'unité du travailleur si ce passage ne l'a pas fait ; 1 une archive refusée (les sommes attendue et lue sur la sortie d'erreur), un outil du compte introuvable (node, npm, claude, bd ou gh, par son nom), une version publiée nommée par `grillhouse.outil` sans travailleur, ou systemd en échec, les unités écrites et appliquées au passage suivant ; 2 un appel mal formé.
- `grillhouse temporal installer --programme-seul [--archive <fichier>] [--maison <dossier>]` : le programme seul, son chemin sur la sortie standard ; 0 posé ou déjà là ; 1 une archive refusée ; 2 un appel mal formé (`--unites`, `--racine` ou `--systemctl` avec lui).
- `grillhouse temporal perime [--maison <dossier>] [--racine <dossier>]` : lecture seule (aucun `systemctl`, aucun téléchargement, aucune écriture) ; écrit `perime` sur la sortie standard quand le travailleur appliqué diffère de ce qu'`installer` écrirait, rien sinon ; 0. L'ouverture de séance l'appelle : la montée de version se dit sous « Manque », avec `npx grillhouse temporal installer`.
- `grillhouse temporal etat [mêmes options, sans --archive]` : l'état de chaque service sur la sortie standard ; 0 installé, 1 non installé ; 2 un appel mal formé.
- Les noms que les tickets suivants lisent : les unités `grillhouse-temporal.service`, `grillhouse-travailleur-<projet>.service`, `grillhouse-travailleur-machine.service` ; les files de tâches `grillhouse-projet-<projet>` et `grillhouse-machine` ; les attributs de recherche `GrillhouseTicket` et `GrillhouseEtape` (Keyword) ; la variable `TEMPORAL` de l'environnement des unités des travailleurs et de la nuit, le chemin du programme posé ; `TEMPORAL_ADDRESS` et `TEMPORAL_NAMESPACE`, l'adresse et l'espace de noms du serveur.
- Les réponses du superviseur à un arrêt du testwriter (grillhouse-3uv.115) ou de la preuve du rouge (grillhouse-3uv.120) : `--mecanique [<commande>] --contexte <raison>` bascule le ticket sans refaire le plan (avec commande, sorte mécanique, reprise à 1.1 ; sans, champ `comportement` « inchangé », reprise au développeur ; le champ a trois valeurs, `changé`, `tests-adaptés` et `inchangé`, que lit `sorteDuPlan`) ; refusé (code 2) hors d'un arrêt `besoin` ou `hors-portee` du testwriter et de l'arrêt `preuve` de la preuve du rouge, sans `--contexte`, ou sur une sorte déjà mécanique. Les motifs de fiche : `aucun-comportement` (testwriter), `comportement-change` (relecteur, lot du circuit court : reprise à 2 Tests, sorte changée).
- Les composants que le plan écarte du relevé (grillhouse-3uv.128) : les contrôles de 3.1 jouent leurs tests (`npm test -- <paquet>`) après les paquets du plan, et le rouge d'un écarté, aux contrôles ou à la passe finale, étend le plan à son paquet sans arrêt (le fait `etendreAuxEcartes`, le champ `ecartesRouges` du relevé des contrôles) et va au développeur ; un rouge hors du plan et des écartés arrête toujours le circuit. Quand chaque lieu rouge d'un paquet hors du plan (écarté ou hors du titre) est un fichier de test, le relevé le nomme dans `testsLecteurs` et le circuit étend le plan à ses tests seuls (le fait `etendreAuxTests`, la liste `testsEtendus` des fiches, `GRILLHOUSE_TESTS_ETENDUS` pour le seul testwriter) ; le code du paquet reste hors du plan (grillhouse-3uv.190).
- Le déroulé d'un ticket (grillhouse-4nr.6) : son type `circuitDuTicket`, son identifiant `circuit:<racine>:<ticket>`, sur la file du travailleur du projet ; son entrée `{ racine, ticket, repasserMs?, repassesMax?, ci?, limiteDHistoire?, superviseur?, reprise? }` (10 min, 6 et 10 000 événements par défaut ; `superviseur`, la séance du superviseur qui a mis le ticket en file ou répondu à son arrêt, `CLAUDE_CODE_SESSION_ID` de la commande, que chaque acte reçoit et que la montée d’un arrêt garde, au-delà desquels le déroulé repart à neuf, son mémo passé au run suivant ; `reprise`, la réponse du superviseur sur laquelle un déroulé neuf rouvre un circuit arrêté sur son mot, que les fonctions de réponse du client démarrent elles-mêmes quand le déroulé est fini ou que le serveur ne le garde plus, avec les bornes de l'entrée qu'il suit, sur la file de son travailleur ou, pour un déroulé purgé, celle que nomme leur dernier argument `{ file? }`, `grillhouse-projet-<nom>` par défaut ; les réponses que refuse le circuit (`--reprendre` sur un état absent ou intégré, `--etendre` sur un état intégré), le refus d'un validateur (son échec de type `RefusDuValidateur`), un déroulé fini sans son issue et une réponse devancée par une autre lèvent `ReponseRefusee` ; un état illisible lève `EtatIllisible`, une panne du dépôt), sa fin `{ code: 0, raison: 'integre' | 'arrete', etat? }` (`etat`, l'état que le circuit a écrit en dernier, `EtatEcrit` : à l'intégration, sa fin ; à un arrêt sur le mot du superviseur, l'état que sa réponse rouvre) ; un déroulé fini sans son issue (terminé de force, en échec) se rouvre par `reprendre`, depuis l'état que son dernier mémo garde entier (`ecrit`), ou par `depuis`, et refuse `etendre` ; les mises à jour `reprendre` (le contexte du superviseur, ou null, puis sa séance), `depuis` (`{ role: 'testwriter' | 'preuve' | 'developpeur' | 'controles' | 'passe-finale', contexte?, superviseur? }`, l'étape que le nom désigne et les suivantes, sans rien relire) `etendre` (`{ paquets, contexte?, superviseur? }`) et `mecanique` (`{ commande?, contexte, superviseur? }`, la bascule d’un ticket arrêté sur le testwriter (`besoin`, `hors-portee`) ou sur la preuve du rouge (`preuve`) : avec `commande`, sorte mécanique et reprise à 1.1 ; sans, sorte « comportement inchangé » et reprise au développeur ; le plan garde ses paquets et ses critères, la sorte seule change), chacune portant la séance du superviseur qui répond, que reçoivent dès lors les actes du run et la montée de l’arrêt suivant, refusées hors d'une attente et sur une question qui a déjà sa réponse, qui rendent ce que leur tour a tranché (« repris », « depuis <étape> », « étendu à … », ou l'arrêt qu'un `arreter` du même tour impose), le signal `arreter` (le motif, ou null), reçu partout : pendant une étape il l'annule, pendant l'écriture d'un arrêt il arrête le circuit une fois l'arrêt écrit ; un acte qui échoue est l'arrêt « inattendu », sa réponse attendue ; une séance que la limite d'usage arrête est l'arrêt « limite-d-usage » (code 26), qui ne monte aucune question : le déroulé se reporte à l'heure de reprise (une heure plus tard sans heure lisible), garde son report dans le mémo, rend sa place de circuit et reprend l'étape, sans borne ; une écriture hors du plan dans un fichier que la description du ticket nomme étend le plan sans arrêt ; la requête `etatDuCircuit` (`{ etape, tentative, attente, question, repasses, ecrit }`, `ecrit` l'état que le circuit a écrit en dernier, entier, `EtatEcrit`, null avant le premier) ; le mémo `{ ticket, etape, question, numero, ecrit, etat }` (`numero`, le rang de sa question dans le run ; `ecrit`, le dernier état écrit, entier, `EtatEcrit` ; `etat`, le résumé du dernier état écrit, `ResumeDeLEtat` : `{ etape, tentative, finale, code, raison, rapport, questionnement, boucles, mene }`, le rapport réduit à sa première ligne) et l'attribut `GrillhouseEtape` (l'étape, `question`, `a-repasser`, `attend-une-place`, `integre` ou `arrete`) ; arrêté sur une question, le circuit rend sa place de circuit, sa copie mesurée une fois, et repris, il redemande sa place avant de rouvrir, à l'étape `attend-une-place` (ses activités `ActivitesDeLaPause` : `mesurerLaCopieDuTicket`, `reprendreUnePlace`) ; son client `src/temporal/circuit/client.ts` (`demarrerLeCircuit`, `reprendreLeCircuit`, `arreterLeCircuit`, `reprendreDepuis`, `etendreLeCircuit`, `basculerEnMecanique` (`(client, racine, ticket, commande, contexte, ou?)`, la mise à jour `mecanique`), `lireLeCircuit`, `finDuCircuit` ; `lireLesCircuits(client, racine, { integres? })`, les circuits du dépôt en un appel au serveur, sans travailleur, sous la forme `CircuitLu` : `{ ticket, etape, tentative, finale, code, arret, raison, question, qui, questionnement, boucles, mene, vivant, interrompu, sansIssue, reponse, run, numero, integre, fin, report }`, `report` le report que le circuit garde dans son mémo tant qu'il attend la fin de la limite d'usage de `claude -p` (`{ raison: 'limite-d-usage', reprise }`, `reprise` l'heure de reprise en ms ; null sinon ; le tableau le montre, « limite d'usage » et l'heure ; le circuit rend sa place, comme pour un report à une heure), le dernier run de chaque ticket, un circuit intégré laissé hors sauf sous `integres` (l'attente du superviseur, que son intégration réveille), `fin` l'heure de fin de son déroulé en ms, null tant qu'il tourne, `vivant` un déroulé qui tourne sans question, `interrompu` un déroulé terminé, en échec, expiré ou annulé sans question, `sansIssue` un déroulé fini sans son issue (terminé, en échec, expiré ou annulé, `SANS_ISSUE`, `ARRETS_DE_LA_BASCULE` (les arrêts que `--mecanique` répond, par étape : `besoin` et `hors-portee` du testwriter, `preuve` de la preuve du rouge) et `reponseMecanique` (`{ etat, sorte, commande, contexte }` : le refus `{ refus }`, ou la sorte neuve et l’étape de reprise, 1.1 avec une commande, le développeur sans) de `scripts/reponses-du-circuit.mjs`), dont le panneau nomme la reprise, `reponse` les réponses que le client accepte pour lui (la règle `lesReponses` de `scripts/reponses-du-circuit.mjs` : fini sans son issue, `--reprendre` avec un état écrit ou `--depuis` ; en cours, toutes ; arrêté sur le mot du superviseur, toutes sauf `--arreter`), que l’ouverture et l’attente proposent ; le panneau et le superviseur le lisent par `scripts/circuits-du-serveur.mjs`, `circuitsDuServeur(racine, { integres? })`, avec l'avancement de la passe en cours de chaque circuit qui tourne, lu dans `<copie>.travail`, et la page de son déroulé au tableau web du serveur (`lien`, `lienDuTableauWeb` de `src/temporal/client.ts`), 5 s au plus ; un serveur qui ne répond pas lève `ServeurMuet`, son adresse nommée, une autre faute est levée telle qu'elle est, et un client non construit lève `ClientNonConstruit`, qui nomme la commande qui le construit). Ses activités jouent les actes du circuit par `scripts/faits-du-circuit.mjs` (`ouvrir`, jusqu'au plan, qui rend le plan à écrire, `plan`, un pas du plan, l'activité `jouerUnPasDuPlan`, `preparer`, `fait`, `effets`, `arret`, `fin`, `arreter`, `effet`, l'entrée en JSON sur l'entrée standard avec la clé de l'activité `cle`, sa tentative `essai` et `derniere`, vrai à la dernière que sa politique permet, `vie <json>` et `resultat <json>` sur la sortie, ou `erreur <json>` : `{ message, pile, reessayable }`, `reessayable` pour un effet non écrit avant sa dernière tentative, que Temporal rejoue, toute autre erreur un échec qu'il ne rejoue pas), ou par le programme que nomme `GRILLHOUSE_ACTE_DU_CIRCUIT` sur une machine d'essai ; chaque acte sauf `effet` rend avec son issue les effets qu'il a émis (`effets`, le type `Effet` : `{ genre, … }`, `scripts/effets.mjs`), que le déroulé joue chacun dans une activité à lui, `jouerUnEffet` (`{ racine, ticket, effet }`), d'identifiant `effet:<rang>:<sorte>`, sous la clé `cleDeLActivite` de `src/temporal/acte.ts` (le déroulé, le run, l'identifiant d'activité) ; un effet qui ne s'écrit pas a la suite que lui donne `ecrireLEffet` : dit sur la sortie d'erreur, ou l'échec de son activité ; un `arreter` laisse les effets d'un acte s'écrire jusqu'au dernier. `scripts/circuit.mjs` exporte pour lui l'ouverture d'un run (`ouvrir`, `ouvrirJusquAuPlan`, `finirLOuverture`), les pas du plan (`unPasDuPlan`, `planAuDebut` ; `pasDuPlan`, `questionsPosees`, `ouvertesDuPlan` de `scripts/transitions.mjs`), le début et la fin d'une étape (`commencerLEtape`, `finirLEtape`) et l'écriture d'un arrêt (`publierLArret`), que son moteur appelle aussi. La commande `npx grillhouse circuit` (`src/temporal/circuit/commande.ts`) en est le client : elle refuse à la porte un ticket que le circuit ne pourrait pas mener (`ticketAuLancement` de `scripts/depart-du-ticket.mjs`, `DepartRefuse`), et `arreterLeCircuit` refuse un lot intégré (« le lot de <ticket> est intégré ») ou un ticket sans circuit qui tourne (`ReponseRefusee`). Son option `--recommencer` (`npx grillhouse circuit <ticket> --recommencer`, lue par `lireLAppel` de `src/temporal/circuit/appel.ts`) repart à neuf d'un circuit arrêté sur le mot du superviseur : `recommencerLeCircuit` du client refuse un circuit qui tourne (`ReponseRefusee`, rien n'est retiré), puis `retirerLaCopieDuTicket` de `scripts/recommencer.mjs` retire la copie du ticket (avec le travail qu'elle porte), sa branche, ses fiches, son journal et son dossier de travail, et la ligne rendue nomme la copie retirée ; le ticket repart ensuite en file, du testwriter dans une copie fraîche, son ticket, son plan, ses commentaires et son étiquette `circuit` intacts. Elle va seule : avec `--reprendre`, `--depuis`, `--etendre` ou `--arreter`, usage, code 2 ; le lancement frais sans elle, après `--arreter`, reste refusé, son message la nommant parmi les moyens de rouvrir.
- La file des tickets d'un projet (grillhouse-4nr.9) : le déroulé `ticketsDuProjet`, son identifiant `tickets:<racine>`, sur la file du travailleur du projet ; son entrée `{ racine, reveilMs?, circuit? }` (60 s par défaut ; `circuit`, ce que reçoit chaque circuit outre son ticket) ; le signal `seanceDuSuperviseur` (la séance, ou null), que `npx grillhouse circuit <ticket>` envoie avec le ticket (`demarrerLesTickets`, son dernier argument), qui réveille la file et va à chaque circuit qu’elle démarre ensuite ; la requête `etatDesTickets` (`{ vivants, faute }`, `faute` ce qui ne lance rien, par son nom : le réglage, un `package.json` qui ne se lit pas, une Beads qui échoue) ; le réglage `grillhouse.circuits` du `package.json` (un entier ≥ 1, 1 quand il manque, `reglageDesCircuits` de `scripts/circuits-cles.mjs`) ; ses activités `ticketsAPartir` (un ticket dont le lot est sur main n'en fait pas partie, `lotEstSurMain` de `scripts/file-des-tickets.mjs`), `circuitsVivants`, `fermesHorsCircuit` (les vivants dont le ticket est fermé hors circuit, que la file arrête), `circuitsEnPause` (les circuits qui tournent arrêtés sur une question, ou repris et en attente de leur place, d'après leur mémo : ils ne tiennent aucune place de la machine), `circuitsDeLaLimite` (`{ racine }` : `{ tenant, superviseur, lus }`, les circuits qui tiennent la limite `grillhouse.circuits` du projet, ceux d'entre eux qui attendent le superviseur, et les circuits dont le mémo a été lu ; un circuit repris en attente de sa place, ou arrêté sur une question sans destinataire ou au superviseur, la tient ; un circuit reporté, en attente d'un autre projet ou arrêté sur une question au responsable la rend ; la file la lit sous `patched('limite-garde-le-superviseur')`), `placesDeLaMachine` (`{ racine, vivants, candidats }` : `{ accordes, faute }`, les candidats qui tiennent une place de circuit de la machine, les vivants étant les circuits actifs ; la raison du disque des copies, `disqueDesCopies` de `scripts/disque-des-copies.mjs`, jointe à la demande) ; son client `src/temporal/tickets/client.ts` (`demarrerLesTickets`, `lireLaFileDesTickets`). `scripts/file-des-tickets.mjs` exporte pour lui `circuitsDeLaLimite` (`(circuits, tous, { externes })` : `{ tenant, superviseur }`, triés, la règle de la limite des circuits d'un projet, que lisent la file et le tableau), `aSonArchitecture` (la règle « le ticket a sa section « ## Architecture » », que lisent aussi la file et le panneau), `ticketsAPartir`, la règle de la file (un ticket sans sa section « ## Architecture » ne part pas, ni un ticket dont une dépendance `external:<projet>:<capacité>` n'est pas livrée par un ticket fermé `provides:<capacité>` du projet fournisseur), `enFileSansArchitecture`, que lisent le panneau et l’ouverture de la séance du superviseur, `enFileSurMain` (`(tous, { enCours, externes, surMain })` : les tickets de la file que rien d'autre ne tient et dont le lot est sur main, triés, que `ticketsAPartir` écarte sous la même lecture `surMain` ; le panneau, par une alerte, et l’ouverture de la séance du superviseur les nomment, « En file, lot déjà sur main : <tickets> »), `lotEstSurMain` (`(racine)` : la lecture `surMain` d'un ticket par son identifiant, sur la règle `lotSurMain` de `scripts/integration/integrer.mjs`, fausse quand le préfixe des tickets ne se lit pas), `attentesExternes` (pour chaque ticket de la file, ce qu'il attend d'un autre projet : `{ ticket, attend, faute }`, `faute` nommant un projet que `external_projects` ne résout pas), `attendDeLAutreProjet` (la même attente pour un ticket, que lit le tableau : `{ attend, faute }` par capacité non livrée), `lireLesExternes` (les tickets de chaque projet fournisseur dont dépendent les tickets donnés, par son nom) et `lireLesTickets` (qui lève, sa raison nommée, quand Beads échoue), ses types dans `file-des-tickets.d.mts`. La clé `grillhouse.groupe` du `package.json` (une liste de chemins de projets) se lit par `scripts/groupe-cles.mjs`, types dans `groupe-cles.d.mts` : `lireGroupe(pkg, racine)` rend `{ groupe: { id, projets: [{ nom, chemin }] } | null, fautes: [{ cle, valeur }] }` (un chemin absent, un doublon ou une clé mal formée sont refusés par leur nom ; `id` est le même pour tous les projets qui déclarent les mêmes chemins) et `projetsExternes(groupe, racine)` rend le `external_projects` de Beads du projet : les autres projets du groupe, par nom, à leur chemin absolu, que `grillhouse maj` écrit. `npx grillhouse circuit <ticket>` y met un ticket et la démarre quand elle ne tourne pas (`demarrerLesTickets`).
- Le journal des états (grillhouse-4nr.20, `docs/ARCHITECTURE.md` § Le journal des états) : la sous-commande `grillhouse journal [--depuis <ISO>] [--jusqu-a <ISO>] [--ticket <id>]` rend la chronologie du projet (les lignes `{ ts, genre, ticket, etape, boucle, place, raison }`, plus `reservation` (`{ coeurs, memoireGo, qui }`) sur une place `prise` ou `rendue` par une passe et `autre` sur une attente de la file attribuée à un autre circuit ou projet, dans l'ordre de leur horodatage, bornes comprises en ISO 8601 avec le décalage local) et, après chaque lancement ou fin de circuit, les tickets en travail contre le plafond `grillhouse.circuits` ; 0 (sans journal ou sans ligne dans la plage, elle le dit), 2 une option inconnue ou une date illisible. Le journal est un segment JSONL par date locale sous le dossier git commun (`grillhouse-journal/`), borné à 14 jours et 50 Mo par le nettoyage ; `scripts/journal-des-etats.mjs` exporte `ecrireLaTrace`, `lireLeJournal`, `nettoyerLeJournal`, `ensemblesEnTravail`, `traceDeLaFile`, `traceDesPlaces`, `reservationsOuvertes` (les réservations ouvertes à un instant, relues du seul journal), `heureLocale`, `dossierDuJournal` (types dans `journal-des-etats.d.mts`), et l'effet `trace` du circuit (`scripts/effets.mjs`) l'écrit sans jamais l'arrêter ; l'activité `tracerLaFile` de la file des tickets écrit son lancement et sa fin.
- La fermeture de la machine par le superviseur (grillhouse-3uv.147) : les sous-commandes `grillhouse machine fermer [--attendre]` (rend la main aussitôt, disant par projet et par ticket ce qui tourne encore, séances et passes, « la machine est vide » quand rien ne joue, depuis quand dure une fermeture ; `--attendre` ne rend la main qu'à la machine vide ; 0, 1 un serveur qui ne répond pas, 2 un appel mal formé) et `grillhouse machine rouvrir` ; dans le déroulé des places, les mises à jour `fermerLaMachine` (`fermee` ou `deja-fermee`) et `rouvrirLaMachine` (`rouverte` ou `deja-ouverte`), la réservation, la seule de la machine (`auteur` `superviseur`, sans battement, jamais périmée), `lesPlaces` qui porte `fermeture` (`{ auteur, depuis, phase }`, `phase` `attend` ou `vide`) ; les règles `phaseDeLaReservation` et `RAISON_FERMEE` de `scripts/regles-des-places.mjs`, `decisionDeFermeture`, `decisionDeReouverture`, `direCeQuiTourne` et `direLaFermeture` de `scripts/fermeture-de-la-machine.mjs` ; le client (`fermerLaMachine`, `rouvrirLaMachine`).
- La file d'un projet, sa passe finale et la CI de main (grillhouse-4nr.8, grillhouse-3uv.121) : le déroulé `fileDuProjet`, son identifiant `file:<racine>`, sur la file du travailleur du projet, que le déroulé d'un ticket démarre quand aucun ne tourne (`entrerDansLaFile`) ; son entrée `{ racine, ci? }` ; le signal `entrer` (`{ ticket, branche, deroule }`, une entrée déjà en file n'est pas ajoutée deux fois), le signal `issueDeLaFile` qu'il envoie au déroulé du ticket (`{ etat: 'ferme' | 'en-file' | 'rouvert' | 'echec', raison, conflit? }`, `conflit` vrai pour une branche rouverte parce qu'elle ne se replace pas sur main, dont la question nomme alors `--depuis developpeur`, `echec` un acte de la file qui a échoué, ou une fermeture du ticket que Beads refuse une fois le lot sur main, l'arrêt « inattendu » du ticket), le signal `relancer` (la file au repos repart neuve aussitôt par Continue-As-New avec `attente` ; occupée, elle finit l'entrée en cours, en signale l'issue, puis repart avec celles qui attendent sans en traiter aucune ; le signal posé, aucune entrée en attente ne démarre dans le run en cours), la requête `etatDeLaFile` (`{ enCours, attente, version? }`, `version` celle de l'outil sous laquelle la file a démarré, lue par l'activité `lireLaVersionDeLOutil` : une file lancée avant le champ répond sans lui, lue « inconnue », ce que `temporal installer` relance) ; son client `src/temporal/file/client.ts` (`lireLaFile`). Pour chaque entrée : la branche devient la candidate, le lot posé sur la pointe de main, locale, jamais poussée (`preparerLaBranche` → `{ candidat }`, `{ entre }` pour un lot déjà sur main, ou l'issue) ; la passe finale la juge (`jugerLeCandidat`, `{ racine, ticket, branche, commit }` → `{ juge: true }`, vert ou arbre déjà jugé, ou l'issue : rouge `rouvert`, à repasser `en-file`, le ticket prévenu ; la sortie entière d'une passe non verte s'ajoute au journal du ticket, `.claude/worktrees/<ticket>.log`, que le commentaire nomme, et le commentaire d'un rouge nomme les rouges que `rougesDUnePasse` de `scripts/activites.mjs` lit dans les résultats de la passe, la fin de la sortie à défaut, grillhouse-3uv.176) ; main avance en avance rapide sur la candidate (`avancerMain` → `{ entre }`, `{ bouge }` quand main a bougé, la branche replacée et sa passe rejouée, cinq jugements au plus, ou l'issue) ; l'entrée se ferme (`fermerLEntree` → `{ poussee, raison?, livraison?, fermeture? }`, `fermeture` la faute d'un `bd close` qui échoue, sur laquelle `issueDeLEntree` rend l'issue `echec`). La file ne lit aucune CI de branche et ne pousse aucune branche de ticket. Elle lit la CI de main sans jamais l'attendre (`surveillerLaCiDeMain`, `{ racine, apresEntree? }` → `{ etat: 'verte' | 'rouge' | 'non-lue' }`, à son départ, après chaque entrée (`apresEntree: true`) et chaque quart d'heure d'attente) : elle déclenche d'abord la CI de main quand la pointe de main diffère du commit du dernier passage de `ci.yml`, qu'aucun passage n'est en cours ni en attente et que le dernier passage ou déclenchement a une heure ou plus (`declencherLaCiDeMain` de `scripts/ci-de-main.mjs`, `gh workflow run`, l'instant, l'entrée en attente et la faute gardés dans `.claude/worktrees/ci-de-main-declenchee.json`), un déclenchement refusé laissant la faute que lisent l'alerte du superviseur (genre `declenchement`) et le tableau ; un passage rouge ouvre le ticket de défaut sous `a-valider` (`ouvrirLeDefautDeMain` de `scripts/ci-de-main.mjs`). Ses activités jouent les actes `situer`, `brancher`, `juger`, `surveiller-la-ci-de-main`, `avancer`, `fermer` et `effet-de-la-file` de `scripts/faits-du-circuit.mjs` (`brancher`, `avancer` et `fermer` rendent leurs commentaires en effets, `effets`, que le déroulé écrit chacun par l'activité `jouerUnEffetDeLaFile`, `{ racine, effet }`, d'identifiant `<lieu>:effet:<rang>:<sorte>`), sur les gestes que `scripts/integration/file.mjs` exporte (`situerLeLot`, `{ statut, raison }` du ticket, `preparerLaBranche`, `avancerMain`, `direLIssue`, `fermerLEntree`, `retirerLeTravail`, `outilsDeLaFile`). Il est le seul registre de la file d'intégration : `npx grillhouse file` n'existe plus, et l'intégration n'inscrit aucune entrée, elle pose l'étiquette `en-file`, que la file retire. La file n'a qu'un chemin : le déroulé retire le marqueur `passe-finale-de-main` par `deprecatePatch`, et une histoire enregistrée qui le porte rejoue sans erreur de déterminisme (grillhouse-3uv.131). Ainsi un rouge de la CI de main, vu après l'entrée, réveille le superviseur, que le greffon de sa séance pousse dans la file des messages, comme une question de circuit.
- Le déroulé de la machine, qui tient ses places (grillhouse-4nr.7) : son type `placesDeLaMachine`, son identifiant `grillhouse-places-de-la-machine`, sur la file `grillhouse-machine` ; la mise à jour `prendre` (`{ id, pid, depart, ticket?, rang? }`, l'identifiant tiré par l'appelant : elle inscrit la demande et rend `{ id, rang }` aussitôt ; un rang donné avance le rang tiré), la requête `laDemande` (l'identifiant : `donnee`, `attend` avec sa raison, ou `inconnue` une fois retirée ou son processus disparu), les signaux `rendre` (l'identifiant : rend la place ou retire la demande) et `rattacher` (`{ id, pid, depart }`), la requête `lesPlaces` (`{ plafond, faute, prises, attentes }`, les attentes dans l'ordre d'arrivée ; `plafond`, le dernier lu sur le poste, que l'activité `plafondDeLaMachine` relit à chaque jugement, `faute` la valeur fautive de cette lecture par son nom, le plafond d'avant gardé, null sans elle ; son entrée ne porte plus de plafond), la mise à jour `tirerUnRang` (le prochain rang d'arrivée, qu'un circuit tire à son lancement), la mise à jour `reserverDesCircuits` (`{ racine, vivants?, candidats?, disque?, reprise? }` : les tickets de la demande qui tiennent une place de circuit, `disque` la raison qui retient les candidats sans place disque, `reprise` (`{ ticket, rang }`) la redemande d'un circuit repris après sa question, avec son rang d'arrivée, `groupe` l'identité du groupe déclaré du projet (absente hors groupe), `priorites` (`{ <ticket>: { priorite, creation } }`, par candidat) ; accordées dans l'ordre d'arrivée de tous les projets, sauf que les circuits non accordés d'un même groupe se redistribuent leurs rangs par priorité (P0 à P4), ancienneté, puis rang, sous le plafond, la règle `reserverDesCircuits` de `scripts/regles-des-places.mjs` ; `lesPlaces` les rend sous `circuits`) ; la nuit ne réserve pas la machine (grillhouse-3uv.170) : sa passe prend la part de son projet, sans mise à jour ni jeton ; son client `src/temporal/places/client.ts` (`demarrerLesPlaces`, `reserverDesCircuits`, qui rend tous les candidats quand aucun déroulé de la machine ne tourne, `prendreUnePlaceParTemporal`, qui inscrit la demande puis la lit jusqu'à la place donnée et la retire sur son signal d'abandon, `rendreLaPlace`, `rattacherLaPlace`, `lireLesPlaces`, `tirerUnRangParTemporal`). `scripts/places-de-la-machine.mjs` le lit et le prend par `scripts/places-du-serveur.mjs` (`rang`, `prendre <demande>`, `rendre <id>`, `rattacher <id> <pid> <depart>`, `lire`), et la jointure publie `avecLaPasse` aux modules de langage : la part, tenue par le système.
- Les nuits du poste (grillhouse-4nr.13) : la sous-commande `grillhouse nuit` (seule, la passe de nuit du projet du dossier courant, `scripts/nuit.sh`, son code de sortie ; `grillhouse nuit <projet>`, la nuit de l'arbre principal de ce projet demandée au déroulé des nuits, 0 demandée, 2 un projet écarté par sa raison, 1 un serveur qui ne répond pas ; `grillhouse nuit --planifier [--heure <0-23>]`, la planification créée ou mise à jour, à l'heure donnée, sinon à celle qu'elle a déjà, 1 h pour une neuve ; `-h`, `--help`, l'usage, 0 ; un appel mal formé, 2) ; la planification `grillhouse-nuits` (chaque jour à son heure, dans le fuseau du poste, chevauchement SKIP, rattrapage 24 h) qui démarre le déroulé `nuitPlanifiee` (`grillhouse-nuit-planifiee`, suffixé par le serveur) sur la file `grillhouse-machine` ; le déroulé `nuitsDeLaMachine`, son identifiant `grillhouse-nuits-de-la-machine`, sur la même file, son entrée `{ limiteDHistoire?, etat? }`, le signal `demander` (`{ projet }` une nuit demandée à la main, `{ planifiee: true }` les nuits planifiées), la requête `etatDesNuits` (`{ enCours, depuis, attente, jouees, sautes, ecartes }`, `depuis` le début de la nuit en cours, en ms, null sans elle), son résultat la même vue ; ses activités `choisirLesNuits`, `noterLeSaut`, `sauterLaNuit` (`{ racine, raison }` : le saut d'une nuit sous la fermeture du superviseur, noté au journal de la nuit du projet et au registre de la machine), `jouerLaNuit` (`{ racine }` : le code de sortie de la passe, qui prend la part de son projet, sorte « nuit »), `demanderLesNuitsPlanifiees` ; le déroulé ne réserve rien : les nuits jouent l'une après l'autre sur la part du projet ; son client `src/temporal/nuits/client.ts` (`demanderDesNuits`, `lireLesNuits`, `optionsDeLaPlanification`, `planifierLesNuits`, `heureDeLaPlanification`, `HEURE_PAR_DEFAUT`). Le marqueur de la dernière nuit verte est `<git common dir>/nuit/dernier-vert`, que la nuit verte écrit (`scripts/nuit.sh`) ; une nuit sautée laisse au registre une ligne de rôle `nuit` (`ligneDeNuit` de `scripts/registre.mjs`, `{ verdict: 'sautee', raison, sommet, reference }` sous `nuit`, une clé par projet, sommet et jour).

## La création d'un ticket

`grillhouse ticket <mère> <sujet> <composants> <corps> [étiquette]` (`scripts/ticket.mjs`) crée un
ticket sous sa mère, le titre « <numéro> — <sujet> — <composants> » (le numéro est l'id sans le
préfixe entier du projet, lu dans `.beads/config.yaml`) et écrit son id, seul, sur la sortie
standard. Un corps `@<fichier>` se lit dans ce fichier ; l'étiquette vaut `a-valider` quand elle est
absente ou vide ; `decouverte` crée le ticket fermé (« découverte consignée »). Le circuit consigne
ses découvertes par cette commande (`scripts/effets.mjs`).

- Ses codes : 0, le ticket créé ou retrouvé, son id sur la sortie ; 1, rien sur la sortie et la
  raison en une ligne sur la sortie d'erreur (le préfixe illisible, ou l'appel de Beads qui échoue,
  nommé : « bd create : … ») ; 2, moins de quatre arguments, l'usage sur la sortie d'erreur.
- Rejouée, elle ne crée pas un second ticket (« create if not exists », l'`Idempotency-Key` des
  API de paiement) : sa clé est la mère et le titre entier, sujet et composants. Elle lit d'abord
  les enfants de la mère ; un enfant qui porte ce titre est le ticket : elle ne crée rien, dit
  « <id> existe déjà sous <mère> avec ce titre, aucun ticket créé » sur la sortie d'erreur et rend
  son id, code 0.
- Un enfant fermé ne compte que pour une découverte, créée fermée. Sous toute autre étiquette un
  ticket fermé de même titre n'empêche rien : un défaut qui revient reçoit un ticket neuf.
- Un enfant qui porte le sujet nu et le corps de la demande est une création arrêtée avant son
  titre : elle la finit (le titre, puis la clôture d'une découverte qu'elle a étiquetée). Un sujet nu
  sous un autre corps est le ticket d'un autre, laissé tel quel.
- Une lecture des enfants qui échoue, ou qui ne rend aucune liste, ne crée rien (code 1).
- Une création à la fois par projet : la lecture et la création sont une seule étape sous le verrou
  `.beads/grillhouse-ticket.lock` de l'arbre principal, dont les copies partagent le magasin. Une
  création lancée pendant qu'une autre tourne l'attend, puis retrouve son ticket. Le verrou se juge
  à son âge (5 min, réécrit après chaque appel de Beads) : celui d'une commande tuée est repris
  passé cet âge. Une commande que son appelant coupe (SIGTERM, SIGINT) lâche le verrou avant de
  finir, tuée par ce signal (143 ou 130 vu d'un shell) : la création suivante n'attend pas.
- Quand elle dure, elle dit ce qu'elle attend sur la sortie d'erreur, passé 5 s puis toutes les
  10 s : l'appel de Beads en cours (Beads sert un processus à la fois) ou la fin d'une autre
  création.
- Ses limites : deux découvertes de même sujet et de mêmes composants sous un même ticket sont une
  seule ; une commande tuée dont l'appel de Beads survit peut encore créer son ticket après que la
  suivante a créé le sien.

## Consommateurs

Les paquets de Grillhouse qui importent le cadre par son nom ; un projet le lit par ses entrées
publiées.

- `grillhouse-essais` : *
- `grillhouse-matiere` : *
