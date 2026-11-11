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
La composition répond aux demandes ci-dessous, `manifeste`, `nomDuManifeste`, `liensDuManifeste`, `sortieDuPaquet`, `construireLesPaquets`, `miseAJour` et `squelette` à part, que la
garde des langages, `maj` et `grillhouse paquet` demandent à chaque module :

- les composants sont ceux de chaque module ; un dossier que deux modules revendiquent est refusé,
  nommé avec les deux langages ;
- un fichier va au module du composant qui le tient, le plus profond ; un fichier hors de tout
  composant, au premier module dont la réponse n'est pas nulle (`estUnTest`, `horsDuJour`, `soeurDAvant`, `arbreDAvant`,
  `testsDeHead`, `manifestes.horsDesTests`) ;
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
  `package.json` ; `cargo`, un `Cargo.toml` ; `python`, un `pyproject.toml`), que la garde des langages demande à un paquet que
  l'architecture déclare de ce langage.
- `nomDuManifeste` : le nom que le texte d'un manifeste du langage donne à son paquet (le `name` du
  `package.json`, du `[package]` d'un `Cargo.toml`, du `[project]` d'un `pyproject.toml`) ; nul sans
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
  nommé ; `typescript` et `python` refusent : « sortie non prise en charge pour <langage> ».
- `construireLesPaquets` : construit les paquets nommés (par leur nom au `package.json`) avant les
  tests d'un paquet qui les déclare en données ; le module du langage dont le manifeste est le
  `package.json` le fait par le graphe des paquets (rien dans l'exécution du graphe, qui les a
  construits), `cargo` et `python` refusent : « construction non prise en charge pour <langage> ».
- `outils` : les outils qu'un projet du langage installe, dépendances facultatives du paquet ;
  `maj` n'ajoute que ceux des langages déclarés, chacun à la version de son gabarit.
- `binaires` : les binaires qu'un projet du langage installe sur la machine, chacun à sa version
  exacte ; `maj` installe chacun de ceux qui manquent ou sont à une autre version, par les
  commandes de `miseAJour.installation`. `typescript`, aucun ; `cargo`, nextest, cargo-deny et
  sccache (`scripts/langages/cargo/binaires.json`) ; `python`, uv
  (`scripts/langages/python/binaires.json`).
- `executables` : les programmes de la chaîne d'outils du langage que l'installateur de Temporal
  exige dans son PATH, dont le dossier entre dans celui des unités des travailleurs, un absent
  refusé par son nom. `typescript`, aucun (Node est un outil du compte) ; `cargo`, `cargo` ;
  `python`, `python3`. Un champ en lecture seule : la composition de plusieurs langages ne le porte pas.
- `ignorer` : les dossiers qu'écrivent les outils du langage dans un projet, par leur nom ; les
  fichiers sources que lisent les migrations les laissent de côté, `maj` les écrit dans le
  `.gitignore` du projet, et le retrait des copies finies les retire d'une copie gardée dont le
  ticket est fermé. `typescript`, `.turbo` ; `cargo`, `target` ; `python`, `.venv`,
  `.pytest_cache` et `__pycache__`.
- `miseAJour` : la part du langage dans `maj`, comme chaque greffon de Nx apporte son générateur
  `init`. `gabarit`, le dossier du gabarit d'un projet du langage, dont le `package.json` donne les
  scripts du cadre et les versions des outils (`templates/projet`, `templates/cargo`,
  `templates/python`) ;
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
  (UV_NO_MODIFY_PATH).
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
  à la racine quand il y en a un, `uv lock`. Sur du code en place : `typescript` reprend `src/` et
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
  un dossier vide propre à la séance, à la racine de la copie et dans chaque composant de la
  matière de test, là où la séance ne les écrit pas, comme Bazel écrit les journaux d'un test hors
  de ses sources. `lues`, `~/…` ou `//…`, se montent en lecture seule avant ce qui s'écrit en
  elles, quand elles existent. `typescript` : `//.turbo/cache/` écrit, `.turbo` et
  `node_modules/.vite` propres ; `cargo` : `target/`, et dans `~/.cargo` son registre, ses
  dépendances git, ses avis de sécurité et les fichiers de ses verrous et du cache de ses paquets
  écrits ; `~/.cargo/` (son `env`, que les shells sourcent, sa configuration, ses binaires) et
  `~/.rustup/` lus ; `python` : `.venv/` et `.pytest_cache/`, où ses commandes font écrire uv et pytest pour chaque
  paquet, et `~/.cache/grillhouse/uv/` écrits,
  `__pycache__` propre (le code-octet de Python, sous un seul arbre à la racine), les Python de uv,
  `~/.local/share/uv/python/`, lus.
- `droits` : les règles de Claude Code qui refusent à un rôle qui écrit l'outil de test lancé
  directement ; `typescript`, Vitest et Turborepo ; `cargo`, `cargo test` et `cargo nextest` ;
  `python`, pytest, seul, par Python ou par `uv run`.
- `composants` : les composants du projet, chacun `{ dossier, nom, paquet }`, le dossier absolu ;
  `cargo`, les membres de l'espace de travail que décrit `cargo metadata --no-deps --offline` ;
  `python`, chaque dossier qui tient un `pyproject.toml`.
  L'enveloppe et le lanceur y lisent le plan : un plan qui nomme un composant (un paquet, un
  crate) ouvre ce composant seul en écriture.
- `composantDe` : le composant qui tient un fichier, ou null pour un fichier hors de tout
  composant ; toujours l'un de ceux que `composants` rend.
- `matieres` : les composants de la matière de test partagée, que l'enveloppe monte en écriture
  pour le testwriter.
- `joueDesTests` : si un composant joue des tests, que le lanceur du langage y trouve à jouer ;
  `typescript`, un script `test:unit` dans son `package.json` ; `cargo`, un dossier `tests/` ;
  `python`, un fichier de test du jour (`test_*.py`, `*_test.py`, hors `*_nuit_test.py`). Le circuit en tire les paquets du
  plan qui portent des tests, comme Bazel lit les cibles de test d'un paquet à leur genre.
- `empreintes` (`racine`, `noms`) : les hachages d'entrées des tâches de tests des composants
  `noms` (le nom de leur paquet) et de leurs dépendants, `{ <paquet>: <hachage> }`, tels que
  l'outil de tâches les planifie (le hachage d'une tâche couvre le contenu des fichiers qu'elle lit
  et de ce qu'elle attend, comme la clé de cache d'une tâche de Turborepo) ; null quand l'outil ne
  donne aucun plan. L'empreinte d'une étape du circuit les lit (`empreinte-d-etape.mjs`).
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
    crate de ce dossier ; `python`, la construction et le typage du projet de ce dossier) : les
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
  - `tests-du-paquet <chemin>…` (`cargo`, `python`), le corps de la tâche `test:unit` d'un paquet,
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
    du commentaire de leur tête), et aucune mesure de temps ; elle ne pose jamais de dernier vert.
    Avec `--tranche i/n` (ou `--tranche=i/n`) à côté de `--hors-du-poste`, la i-ième des n parts
    de ces tests (le découpage de Vitest, comme une tranche de la vérification), ses rapports écrits
    sous `.vitest-reports/`, que `fusion-des-tranches` réunit. Une tranche qui n'a pas la forme
    `i/n`, une tranche sans `--hors-du-poste` et tout autre argument sont refusés avant tout
    travail, code 2.
  - `tests-du-poste` (`typescript`), une garde : un test de nuit qui dépend du poste (l'enveloppe,
    le `bd` réel, un serveur Temporal, sccache, systemd, le trousseau, la session, une séance de
    `claude`, vus par ses appels et sa matière de test) sans l'étiquette `@poste` est refusé par
    son nom, ses marques nommées ; la dette du projet les inscrit (migration 0.33.0).
  - `fusion-des-tranches` (`typescript`), que la CI joue après les tranches d'une passe : chaque
    paquet doit tenir ses n tranches, les mêmes fichiers de la passe dans chacune, et chaque
    fichier de la passe joué par une tranche exactement, chaque faute nommée ; puis Vitest réunit
    leurs rapports blob en un seul (`vitest run --merge-reports .vitest-reports/blobs`). 0 quand
    les tranches tiennent et que le rapport réuni est vert, ou qu'aucune tranche n'a de fichier de
    tests ; 1 sinon.
- La vérification écrit ses tâches rouges dans le fichier que nomme `GRILLHOUSE_ROUGES`, une par
  ligne, `<tâche>`, puis une tabulation et la commande qui la rejoue seule quand le langage en a
  une (`typescript`, `npx turbo run <tâche> --filter=<paquet>`) ; la nuit en tire sa commande
  `git bisect run`.
- Une vérification se nomme au verrou de la machine par deux variables que son appelant pose :
  `GRILLHOUSE_VERIFICATION_SORTE` (sa phase : « Intégration », « File » ou « Nuit » chez les
  appelants du cadre, une sorte libre est inscrite telle quelle) et `GRILLHOUSE_VERIFICATION_TICKET`
  (son ticket, absent quand elle n'en a pas). Absentes ou vides, la sorte vaut « Vérification » et
  le ticket null ; l'option explicite du circuit l'emporte. Elles ne servent qu'à la prise du
  verrou (aux côtés de `GRILLHOUSE_MESURE_TENUE`, la marque de la prise) : la mesure que le
  détenteur lance ne les reçoit pas.
- `verdict` : ce qu'un lancement a laissé dans son dossier de résultats (`GRILLHOUSE_RESULTATS`) :
  `{ rapports, taches }`, chaque fichier de test avec ses tests, chaque tâche avec son code, 0 vert,
  1 rouge, 75 « à repasser », et `tests` vrai pour la tâche qui joue les tests de son composant.
- `estUnTest` : ce que le testwriter écrit dans un fichier, `{ joue, test, matiere }` (un test que
  le lanceur joue, un fichier de test ou d'un dossier de tests, un fichier de la matière de test
  partagée), ou null pour un fichier qu'il n'écrit pas. Les verrous des rôles, l'intégration et le
  circuit le lisent.
- `horsDuJour` (`chemin`, `racine`) : vrai quand le fichier de test est de ceux que seule la nuit
  joue (test de nuit, banc ou témoin de temps), selon les définitions du module ; faux pour tout
  autre fichier, absent compris. La preuve du rouge met ces fichiers de côté et les nomme.
- `soeurDAvant` (facultatif, `typescript` seul) : le nom de la sœur d'un fichier de test, à côté de
  lui, où la preuve du rouge écrit sa version de HEAD : un test que l'outil du langage joue dans le
  même lancement, ses tests nommés comme ceux du fichier, de la même classe que lui, jour, nuit ou
  banc, pour qu'elle se joue comme lui (`<nom>.circuit-avant.test.<ext>`,
  `<nom>.circuit-avant.nuit.test.<ext>`, `<nom>.circuit-avant.budget.test.<ext>`), ou null pour un
  fichier que l'outil ne joue pas.
- `arbreDAvant` (`chemin`, `racine`) : vrai quand la version de HEAD d'un fichier de test se joue dans un
  arbre à elle (`cargo` : une cible `tests/<nom>.rs` ; `python` : un fichier que pytest joue), la
  copie où ce seul fichier est remplacé par sa version de HEAD, sous son propre nom, jamais un
  fichier de plus dans la copie ; faux pour un fichier que l'outil joue à côté de lui (`typescript`),
  ne sait pas jouer ainsi (`cargo` : une cible `tests/<dossier>/main.rs`, un test unitaire de
  `src/`) ou ne joue pas.
- `envDArbre` (`chemin`, `racine`) : l'environnement sous lequel l'arbre d'un fichier se joue (`cargo` :
  le dossier cible des compilations de la copie, que l'arbre partage — `target/` de la copie quand
  elle est hors du dossier temporaire — et la copie elle-même, `GRILLHOUSE_COPIE_DE_L_ARBRE`, dont
  git suit le `Cargo.lock` que l'arbre, sans `.git`, porte) ; vide pour `typescript` et `python`.
- `testsDeHead` (`chemin`, `racine`, `lire`) : pour un fichier de test dont la preuve ne joue pas l'arbre,
  les noms des tests de sa version de HEAD, lus sans les jouer, tels que le verdict les nomme ; la
  preuve du rouge tient chacun pour un vert que HEAD tient déjà, puisque main reste vert. `lire`
  rend le texte de HEAD d'un fichier depuis la racine. `cargo` : un test unitaire de `src/`, ses
  tests marqués `#[test]` ou `#[<chemin>::test]` dans leurs modules en ligne, sous le chemin de
  module que nextest rapporte (`server::tests::groupe::nom`) ; une cible `tests/<dossier>/main.rs`,
  avec ses modules hors ligne (`mod aide;`) ; une cible `tests/<nom>.rs`, dont la preuve joue
  l'arbre sauf quand lui seul casse la construction de son paquet (la version de HEAD ne compile
  plus contre le `tests/common` du lot) : ses noms sans la cible, ses modules hors ligne lus,
  `common::<fn>`. Null pour tout autre fichier, ou un fichier que HEAD ne tient pas ;
  `typescript` et `python`, toujours null.
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
l'interruption), la pression de la machine et son verrou, les places de la machine
(`surUnePlace(passe, { env?, dire? })` : la passe jouée sur une place, la marque de la place dans
l'environnement de ses enfants, son code de sortie, ou celui de l'attente qui s'arrête, 75 à sa
borne, 1 pour un serveur qui ne répond pas ; `avecLaMachineEtUnePlace` : une passe lourde, la place
puis le verrou ; aucune place dans la CI ni dans l'enveloppe d'un agent, que couvre la place de sa
séance), les travailleurs d'une séance
(`travailleursDeLaSeance(env)` : le nombre que donne `GRILLHOUSE_TRAVAILLEURS`, max(1, cœurs ÷
places), que le module passe à son outil — `maxWorkers`, `-j`, `-n` — ou `null` pour une passe
lourde, qui garde tous les cœurs ; une valeur fautive est refusée par son nom), le dernier vert,
les arbitrages d'un ticket, le préfixe des tickets (`CONFIG_BEADS`, le fichier commité de Beads,
`.beads/config.yaml` ; `prefixe(racine)`, la clé `issue-prefix` lue là, jamais par `bd`, et une
erreur qui nomme le fichier ou la clé manquants ; `ecrireLePrefixe(racine, valeur)`, son seul
écrivain, que la préparation d'un projet neuf et la migration de `grillhouse maj` appellent : la
clé vide remplacée, la clé absente ajoutée, la ligne écrite rendue, `null` pour une clé qui a sa
valeur), les fichiers sources d'un projet, la recherche d'une commande dans le PATH (`trouverDansLePath(nom, env?)` : le chemin du premier exécutable de ce nom, ou `null`, comme `command -v`), les paquets d'un langage sans
`package.json` à lui (`paquetsSansPackageJson(racine)` : les crates et les projets Python que le
tableau des composants de `docs/ARCHITECTURE.md` déclare, chacun `{ langage, chemin, nom }`, `nom`
celui du manifeste ; le `tester` du module typescript en exclut les tâches `test:unit`, que le
`tester` de leur propre module joue, mais sa passe de vérification les joue toutes, avec le
dernier vert qu'elle pose seule), les tâches du graphe des paquets (`lancerLesTaches` : les
tâches de Turborepo de paquets nommés, les chemins nommés dans la variable `GRILLHOUSE_TESTS` ; `empreintesDesTaches`, le hachage d'entrées des tâches de tests des paquets nommés et de leurs dépendants, que l'outil de tâches calcule, pour l'empreinte d'une étape ; `nomDuPaquet` ;
`testsCibles` ; `cheminsDeLaTache` ; `construireDepuisLesArguments`, le lanceur de la copie d'un
agent, le même pour tout langage, que le module appelle en lui donnant l'outil des tâches ;
`SCRIPT_DES_TESTS` et `TESTS_CIBLES`, le nom du script des tests et celui de la variable des
chemins, uniques pour tout langage, typescript compris ; `GRAPHE_JOUE`, que la commande composée
pose aux modules qui jouent à côté du module de `package.json`, dont la passe joue déjà toutes les
tâches du graphe ; `PASSE_ROUGE`, que la commande composée pose à un module qui joue après un
module rouge : la passe de la vérification ne pose alors aucun vert ; `TRACE`, `tracesDuPlan`), et la lecture unique
(`luUneFois(cle, lire)` : ce qu'un module lit à grand coût, les métadonnées de cargo, ses
composants, se lit une fois tant que le noyau tient une portée de lecture unique, un geste qui
pose beaucoup de questions sur un arbre immobile, le balayage des sœurs ; à chaque appel hors
d'elle). Pour le dossier temporaire et les
caches de compilation : `dansLeTemporaire(chemin, env)`, si un chemin est sous le dossier
temporaire (`TMPDIR`, celui du système, `/tmp`) ; `cacheDeCompilation(outil, env)`, le cache d'un
outil sous `${XDG_CACHE_HOME:-~/.cache}/grillhouse/<outil>`, jamais sous le dossier temporaire ;
`cacheDeLaRacine(outil, racine, env, { creer })`, le cache d'une construction enracinée sous le
dossier temporaire, balayé quand sa racine n'est plus, vue du même espace de processus, ou depuis l'hôte
après 7 jours sans usage, son seul
chemin quand `creer` est faux ;
`attendreDeLaPlace(options)`, l'attente de 4 Go libres dans le dossier temporaire, puis sur le
disque de la copie (`racine`), avant une passe lourde, qui nomme ce qui occupe chacun (sur le
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

- `grillhouse temporal installer [--archive <fichier>] [--maison <dossier>] [--unites <dossier>] [--racine <dossier>] [--systemctl <programme>]` : 0 posé ou à jour ; 1 une archive refusée (les sommes attendue et lue sur la sortie d'erreur), un outil du compte introuvable (node, npm, claude, bd ou gh, par son nom), une version publiée nommée par `grillhouse.outil` sans travailleur, ou systemd en échec, les unités écrites et appliquées au passage suivant ; 2 un appel mal formé.
- `grillhouse temporal installer --programme-seul [--archive <fichier>] [--maison <dossier>]` : le programme seul, son chemin sur la sortie standard ; 0 posé ou déjà là ; 1 une archive refusée ; 2 un appel mal formé (`--unites`, `--racine` ou `--systemctl` avec lui).
- `grillhouse temporal etat [mêmes options, sans --archive]` : l'état de chaque service sur la sortie standard ; 0 installé, 1 non installé ; 2 un appel mal formé.
- Les noms que les tickets suivants lisent : les unités `grillhouse-temporal.service`, `grillhouse-travailleur-<projet>.service`, `grillhouse-travailleur-machine.service` ; les files de tâches `grillhouse-projet-<projet>` et `grillhouse-machine` ; les attributs de recherche `GrillhouseTicket` et `GrillhouseEtape` (Keyword) ; la variable `TEMPORAL` de l'environnement des unités des travailleurs et de la nuit, le chemin du programme posé ; `TEMPORAL_ADDRESS` et `TEMPORAL_NAMESPACE`, l'adresse et l'espace de noms du serveur.
- Le déroulé d'un ticket (grillhouse-4nr.6) : son type `circuitDuTicket`, son identifiant `circuit:<racine>:<ticket>`, sur la file du travailleur du projet ; son entrée `{ racine, ticket, repasserMs?, repassesMax?, ci?, limiteDHistoire?, superviseur?, reprise? }` (10 min, 6 et 10 000 événements par défaut ; `superviseur`, la séance du superviseur qui a mis le ticket en file ou répondu à son arrêt, `CLAUDE_CODE_SESSION_ID` de la commande, que chaque acte reçoit et que la montée d’un arrêt garde, au-delà desquels le déroulé repart à neuf, son mémo passé au run suivant ; `reprise`, la réponse du superviseur sur laquelle un déroulé neuf rouvre un circuit arrêté sur son mot, que les fonctions de réponse du client démarrent elles-mêmes quand le déroulé est fini ou que le serveur ne le garde plus, avec les bornes de l'entrée qu'il suit, sur la file de son travailleur ou, pour un déroulé purgé, celle que nomme leur dernier argument `{ file? }`, `grillhouse-projet-<nom>` par défaut ; les réponses que refuse le circuit (`--reprendre` sur un état absent ou intégré, `--etendre` sur un état intégré), le refus d'un validateur (son échec de type `RefusDuValidateur`), un déroulé fini sans son issue et une réponse devancée par une autre lèvent `ReponseRefusee` ; un état illisible lève `EtatIllisible`, une panne du dépôt), sa fin `{ code: 0, raison: 'integre' | 'arrete', etat? }` (`etat`, l'état que le circuit a écrit en dernier, `EtatEcrit` : à l'intégration, sa fin ; à un arrêt sur le mot du superviseur, l'état que sa réponse rouvre) ; un déroulé fini sans son issue (terminé de force, en échec) se rouvre par `reprendre`, depuis l'état que son dernier mémo garde entier (`ecrit`), ou par `depuis`, et refuse `etendre` ; les mises à jour `reprendre` (le contexte du superviseur, ou null, puis sa séance), `depuis` (`{ role: 'testwriter' | 'preuve' | 'developpeur' | 'controles' | 'passe-finale', contexte?, superviseur? }`, l'étape que le nom désigne et les suivantes, sans rien relire) et `etendre` (`{ paquets, contexte?, superviseur? }`), chacune portant la séance du superviseur qui répond, que reçoivent dès lors les actes du run et la montée de l’arrêt suivant, refusées hors d'une attente et sur une question qui a déjà sa réponse, qui rendent ce que leur tour a tranché (« repris », « depuis <étape> », « étendu à … », ou l'arrêt qu'un `arreter` du même tour impose), le signal `arreter` (le motif, ou null), reçu partout : pendant une étape il l'annule, pendant l'écriture d'un arrêt il arrête le circuit une fois l'arrêt écrit ; un acte qui échoue est l'arrêt « inattendu », sa réponse attendue ; la requête `etatDuCircuit` (`{ etape, tentative, attente, question, repasses, ecrit }`, `ecrit` l'état que le circuit a écrit en dernier, entier, `EtatEcrit`, null avant le premier) ; le mémo `{ ticket, etape, question, numero, ecrit, etat }` (`numero`, le rang de sa question dans le run ; `ecrit`, le dernier état écrit, entier, `EtatEcrit` ; `etat`, le résumé du dernier état écrit, `ResumeDeLEtat` : `{ etape, tentative, finale, code, raison, rapport, questionnement, boucles, mene }`, le rapport réduit à sa première ligne) et l'attribut `GrillhouseEtape` (l'étape, `question`, `a-repasser`, `integre` ou `arrete`) ; son client `src/temporal/circuit/client.ts` (`demarrerLeCircuit`, `reprendreLeCircuit`, `arreterLeCircuit`, `reprendreDepuis`, `etendreLeCircuit`, `lireLeCircuit`, `finDuCircuit` ; `lireLesCircuits(client, racine)`, les circuits du dépôt en un appel au serveur, sans travailleur, sous la forme `CircuitLu` : `{ ticket, etape, tentative, finale, code, arret, raison, question, qui, questionnement, boucles, mene, vivant, interrompu, sansIssue, reponse, run, numero }`, le dernier run de chaque ticket, un circuit intégré laissé hors, `vivant` un déroulé qui tourne sans question, `interrompu` un déroulé terminé, en échec, expiré ou annulé sans question, `sansIssue` un déroulé fini sans son issue (terminé, en échec, expiré ou annulé, `SANS_ISSUE` de `scripts/reponses-du-circuit.mjs`), dont le panneau nomme la reprise, `reponse` les réponses que le client accepte pour lui (la règle `lesReponses` de `scripts/reponses-du-circuit.mjs` : fini sans son issue, `--reprendre` avec un état écrit ou `--depuis` ; en cours, toutes ; arrêté sur le mot du superviseur, toutes sauf `--arreter`), que l’ouverture et l’attente proposent ; le panneau et le superviseur le lisent par `scripts/circuits-du-serveur.mjs`, `circuitsDuServeur(racine)`, avec l'avancement de la passe en cours de chaque circuit qui tourne, lu dans `<copie>.travail`, et la page de son déroulé au tableau web du serveur (`lien`, `lienDuTableauWeb` de `src/temporal/client.ts`), 5 s au plus ; un serveur qui ne répond pas lève `ServeurMuet`, son adresse nommée, une autre faute est levée telle qu'elle est, et un client non construit lève `ClientNonConstruit`, qui nomme la commande qui le construit). Ses activités jouent les actes du circuit par `scripts/faits-du-circuit.mjs` (`ouvrir`, jusqu'au plan, qui rend le plan à écrire, `plan`, un pas du plan, l'activité `jouerUnPasDuPlan`, `preparer`, `fait`, `effets`, `arret`, `fin`, `arreter`, `effet`, l'entrée en JSON sur l'entrée standard avec la clé de l'activité `cle`, sa tentative `essai` et `derniere`, vrai à la dernière que sa politique permet, `vie <json>` et `resultat <json>` sur la sortie, ou `erreur <json>` : `{ message, pile, reessayable }`, `reessayable` pour un effet non écrit avant sa dernière tentative, que Temporal rejoue, toute autre erreur un échec qu'il ne rejoue pas), ou par le programme que nomme `GRILLHOUSE_ACTE_DU_CIRCUIT` sur une machine d'essai ; chaque acte sauf `effet` rend avec son issue les effets qu'il a émis (`effets`, le type `Effet` : `{ genre, … }`, `scripts/effets.mjs`), que le déroulé joue chacun dans une activité à lui, `jouerUnEffet` (`{ racine, ticket, effet }`), d'identifiant `effet:<rang>:<sorte>`, sous la clé `cleDeLActivite` de `src/temporal/acte.ts` (le déroulé, le run, l'identifiant d'activité) ; un effet qui ne s'écrit pas a la suite que lui donne `ecrireLEffet` : dit sur la sortie d'erreur, ou l'échec de son activité ; un `arreter` laisse les effets d'un acte s'écrire jusqu'au dernier. `scripts/circuit.mjs` exporte pour lui l'ouverture d'un run (`ouvrir`, `ouvrirJusquAuPlan`, `finirLOuverture`), les pas du plan (`unPasDuPlan`, `planAuDebut` ; `pasDuPlan`, `questionsPosees`, `ouvertesDuPlan` de `scripts/transitions.mjs`), le début et la fin d'une étape (`commencerLEtape`, `finirLEtape`) et l'écriture d'un arrêt (`publierLArret`), que son moteur appelle aussi. La commande `npx grillhouse circuit` (`src/temporal/circuit/commande.ts`) en est le client : elle refuse à la porte un ticket que le circuit ne pourrait pas mener (`ticketAuLancement` de `scripts/depart-du-ticket.mjs`, `DepartRefuse`), et `arreterLeCircuit` refuse un lot intégré (« le lot de <ticket> est intégré ») ou un ticket sans circuit qui tourne (`ReponseRefusee`).
- La file des tickets d'un projet (grillhouse-4nr.9) : le déroulé `ticketsDuProjet`, son identifiant `tickets:<racine>`, sur la file du travailleur du projet ; son entrée `{ racine, reveilMs?, circuit? }` (60 s par défaut ; `circuit`, ce que reçoit chaque circuit outre son ticket) ; le signal `seanceDuSuperviseur` (la séance, ou null), que `npx grillhouse circuit <ticket>` envoie avec le ticket (`demarrerLesTickets`, son dernier argument), qui réveille la file et va à chaque circuit qu’elle démarre ensuite ; la requête `etatDesTickets` (`{ vivants, faute }`, `faute` ce qui ne lance rien, par son nom : le réglage, un `package.json` qui ne se lit pas, une Beads qui échoue) ; le réglage `grillhouse.circuits` du `package.json` (un entier ≥ 1, 1 quand il manque, `reglageDesCircuits` de `scripts/circuits-cles.mjs`) ; ses activités `ticketsAPartir`, `circuitsVivants` et `circuitsNonIntegres` (les circuits que le serveur tient sans les avoir intégrés, `lireLesCircuits`, un appel : chacun tient son ticket) ; son client `src/temporal/tickets/client.ts` (`demarrerLesTickets`, `lireLaFileDesTickets`). `scripts/file-des-tickets.mjs` exporte pour lui `ticketsAPartir`, la règle de la file, et `lireLesTickets` (qui lève, sa raison nommée, quand Beads échoue), ses types dans `file-des-tickets.d.mts`. `npx grillhouse circuit <ticket>` y met un ticket et la démarre quand elle ne tourne pas (`demarrerLesTickets`).
- Le journal des états (grillhouse-4nr.20, `docs/ARCHITECTURE.md` § Le journal des états) : la sous-commande `grillhouse journal [--depuis <ISO>] [--jusqu-a <ISO>] [--ticket <id>]` rend la chronologie du projet (les lignes `{ ts, genre, ticket, etape, boucle, place, raison }` dans l'ordre de leur horodatage, bornes comprises en ISO 8601 avec le décalage local) et, après chaque lancement ou fin de circuit, les tickets en travail contre le plafond `grillhouse.circuits` ; 0 (sans journal ou sans ligne dans la plage, elle le dit), 2 une option inconnue ou une date illisible. Le journal est un segment JSONL par date locale sous le dossier git commun (`grillhouse-journal/`), borné à 14 jours et 50 Mo par le nettoyage ; `scripts/journal-des-etats.mjs` exporte `ecrireLaTrace`, `lireLeJournal`, `nettoyerLeJournal`, `ensemblesEnTravail`, `traceDeLaFile`, `traceDesPlaces`, `heureLocale`, `dossierDuJournal` (types dans `journal-des-etats.d.mts`), et l'effet `trace` du circuit (`scripts/effets.mjs`) l'écrit sans jamais l'arrêter ; l'activité `tracerLaFile` de la file des tickets écrit son lancement et sa fin.
- La file d'un projet et la CI de la branche d'un ticket (grillhouse-4nr.8) : le déroulé `fileDuProjet`, son identifiant `file:<racine>`, sur la file du travailleur du projet, que le déroulé d'un ticket démarre quand aucun ne tourne (`entrerDansLaFile`) ; son entrée `{ racine, ci? }` ; le signal `entrer` (`{ ticket, branche, deroule }`, une entrée déjà en file n'est pas ajoutée deux fois), le signal `issueDeLaFile` qu'il envoie au déroulé du ticket (`{ etat: 'ferme' | 'en-file' | 'rouvert' | 'echec', raison }`, `echec` un acte de la file qui a échoué, l'arrêt « inattendu » du ticket, une lecture de la CI qui échoue concluant la CI non lue), la requête `etatDeLaFile` (`{ enCours, attente }`) ; le déroulé enfant `ciDuCommit` (`{ racine, ticket, sha, branche, ci? }` → `{ verdict: 'verte' | 'rouge' | 'sans-ci' | 'non-lue', passage, raison }`) ; les délais `ci` (`{ rechercheMs?, attenteMs?, pasMs? }`, 2 min, 30 min et 10 s par défaut), que l'entrée du déroulé d'un ticket porte aussi ; son client `src/temporal/file/client.ts` (`lireLaFile`). Pour chaque entrée : la branche devient la candidate et se pousse sur origin (`preparerLaBranche` → `{ candidat }`, `{ entre }` pour un lot déjà sur main, ou l'issue), sa CI se lit sur la branche (`ciDuCommit`), se conclut (`conclureLaCI` → `{ avancer }` vert, ou l'issue : rouge `rouvert`, sans flux sur la branche ou non lue `en-file`, pas de vert, pas d'entrée), puis main avance en avance rapide sur la candidate (`avancerMain` → `{ entre }`, `{ bouge }` quand main a bougé, la branche replacée et jugée de nouveau, cinq jugements au plus, ou l'issue), et l'entrée se ferme (`fermerLEntree`) ; une entrée demande `patched(CI_DE_LA_BRANCHE)` (`'ci-de-la-branche'`, le « patching » de Temporal), si bien qu'un run enregistré avant ce changement rejoue ses entrées sur le code d'avant (`lireEtConclureLaCI`, que le fait `file` du circuit garde de même). Ses activités jouent les actes `situer`, `brancher`, `ci`, `conclure`, `avancer`, `fermer` et `effet-de-la-file` de `scripts/faits-du-circuit.mjs` (`brancher`, `conclure`, `avancer` et `fermer` rendent leurs commentaires en effets, `effets`, que le déroulé écrit chacun par l'activité `jouerUnEffetDeLaFile`, `{ racine, effet }`, d'identifiant `<lieu>:effet:<rang>:<sorte>`), sur les gestes que `scripts/integration/file.mjs` exporte (`situerLeLot`, `{ statut, raison }` du ticket, `preparerLaBranche`, `avancerMain`, `direLIssue`, `fermerLEntree`, `lireUneFoisLaCI`, `conclureLaCI`, `retirerLeTravail`, `outilsDeLaFile`). Il est le seul registre de la file d'intégration : `npx grillhouse file` n'existe plus, et l'intégration n'inscrit aucune entrée, elle pose l'étiquette `en-file`, que la file retire.
- Le déroulé de la machine, qui tient ses places (grillhouse-4nr.7) : son type `placesDeLaMachine`, son identifiant `grillhouse-places-de-la-machine`, sur la file `grillhouse-machine` ; la mise à jour `prendre` (`{ id, pid, depart, ticket?, rang? }`, l'identifiant tiré par l'appelant : elle inscrit la demande et rend `{ id, rang }` aussitôt ; un rang donné avance le rang tiré), la requête `laDemande` (l'identifiant : `donnee`, `attend` avec sa raison, ou `inconnue` une fois retirée ou son processus disparu), les signaux `rendre` (l'identifiant : rend la place ou retire la demande) et `rattacher` (`{ id, pid, depart }`), la requête `lesPlaces` (`{ plafond, prises, attentes }`, les attentes dans l'ordre d'arrivée), la mise à jour `tirerUnRang` (le prochain rang d'arrivée, qu'un circuit tire à son lancement) ; son client `src/temporal/places/client.ts` (`demarrerLesPlaces`, `prendreUnePlaceParTemporal`, qui inscrit la demande puis la lit jusqu'à la place donnée et la retire sur son signal d'abandon, `rendreLaPlace`, `rattacherLaPlace`, `lireLesPlaces`, `tirerUnRangParTemporal`). `scripts/places-de-la-machine.mjs` le lit et le prend par `scripts/places-du-serveur.mjs` (`rang`, `prendre <demande>`, `rendre <id>`, `rattacher <id> <pid> <depart>`, `lire`), et la jointure publie `avecLaMachineEtUnePlace` aux modules de langage : la place, puis le verrou.
- Les nuits du poste (grillhouse-4nr.13) : la sous-commande `grillhouse nuit` (seule, la passe de nuit du projet du dossier courant, `scripts/nuit.sh`, son code de sortie ; `grillhouse nuit <projet>`, la nuit de l'arbre principal de ce projet demandée au déroulé des nuits, 0 demandée, 2 un projet écarté par sa raison, 1 un serveur qui ne répond pas ; `grillhouse nuit --planifier [--heure <0-23>]`, la planification créée ou mise à jour, à l'heure donnée, sinon à celle qu'elle a déjà, 1 h pour une neuve ; `-h`, `--help`, l'usage, 0 ; un appel mal formé, 2) ; la planification `grillhouse-nuits` (chaque jour à son heure, dans le fuseau du poste, chevauchement SKIP, rattrapage 24 h) qui démarre le déroulé `nuitPlanifiee` (`grillhouse-nuit-planifiee`, suffixé par le serveur) sur la file `grillhouse-machine` ; le déroulé `nuitsDeLaMachine`, son identifiant `grillhouse-nuits-de-la-machine`, sur la même file, son entrée `{ limiteDHistoire?, etat? }`, le signal `demander` (`{ projet }` une nuit demandée à la main, `{ planifiee: true }` les nuits planifiées), la requête `etatDesNuits` (`{ enCours, attente, jouees, sautes, ecartes }`), son résultat la même vue ; ses activités `choisirLesNuits`, `noterLeSaut`, `jouerLaNuit` (le code de sortie de la passe), `demanderLesNuitsPlanifiees` ; son client `src/temporal/nuits/client.ts` (`demanderDesNuits`, `lireLesNuits`, `optionsDeLaPlanification`, `planifierLesNuits`, `heureDeLaPlanification`, `HEURE_PAR_DEFAUT`). Le marqueur de la dernière nuit verte est `<git common dir>/nuit/dernier-vert`, que la nuit verte écrit (`scripts/nuit.sh`) ; une nuit sautée laisse au registre une ligne de rôle `nuit` (`ligneDeNuit` de `scripts/registre.mjs`, `{ verdict: 'sautee', raison, sommet, reference }` sous `nuit`, une clé par projet, sommet et jour).

## Consommateurs

Les paquets de Grillhouse qui importent le cadre par son nom ; un projet le lit par ses entrées
publiées.

- `grillhouse-essais` : *
- `grillhouse-matiere` : *
