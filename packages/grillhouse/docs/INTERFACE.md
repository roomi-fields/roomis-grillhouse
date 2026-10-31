# Le noyau de Grillhouse — interface

Le noyau demande à un module de langage ce que ce document écrit, et rien d'autre.

Le noyau porte les tickets, le circuit, les rôles et leur relecture, le tableau, l'enveloppe, les
crochets et la mise à jour. Un module de langage, sous `scripts/langages/<nom>/`, porte ce qui
dépend du langage du projet : ses outils de test, de typage et de structure, et leurs tests sous
`tests/unit/langages/<nom>/`. Comme Pants, qui active les backends que sa configuration nomme, le
noyau charge le module que le projet déclare et n'importe aucun autre de ses fichiers ; comme un
greffon de Nx n'importe que `@nx/devkit`, le module n'importe du noyau que ses entrées publiées.
La garde des frontières tient les deux sens. Ainsi le reste du noyau ignore le langage du projet.

Les types de la jointure sont `scripts/jointure.d.ts` ; l'entrée publiée
`@roomi-fields/grillhouse/jointure` les porte.

## Le langage d'un projet

Un projet déclare son langage dans son `package.json`, sous `grillhouse.langages` :
`["typescript"]` ou `["cargo"]`. Le nom vient de la liste fermée des langages du cadre (`LANGAGES` de
`scripts/langages.mjs`) ; un nom hors de la liste est refusé, nommé, avec la liste.

La déclaration est la seule lecture : un projet sans déclaration, ou un dossier sans
`package.json`, est refusé, nommé, avec la commande qui l'écrit. `init` et `maj` écrivent la
déclaration d'après ce que les modules trouvent dans le dépôt (`langagesTrouves(racine)`), comme
chaque greffon de Nx infère ses projets de ses propres fichiers (`createNodes`) ; une déclaration
présente reste. Là où aucun module ne trouve son langage, `maj` refuse le projet, nommé, sans rien
écrire : le cadre n'invente aucune déclaration. Un seul langage est servi par projet : une
déclaration de plusieurs est refusée, chacun nommé.

`langageDe(racine)` rend le module qui sert le projet de `racine`, chargé une fois par processus.

## Les demandes

Le module de langage exporte par défaut un objet `Langage`. Chaque membre répond à une demande du
noyau, et chaque réponse décrit sans agir, sauf `verifier` d'un fichier engendré, qui juge.

- `nom` : le nom du langage, celui de la liste du cadre.
- `trouve` : si le dépôt tient du code du langage, que `maj` déclare alors ; `typescript`, un
  `tsconfig.json` à la racine ou dans un paquet du cadre ; `cargo`, un `Cargo.toml` à la racine.
- `signe` : ce que `trouve` cherche, en mots, que le refus de `maj` nomme quand aucun langage n'est
  trouvé.
- `outils` : les outils qu'un projet du langage installe, dépendances facultatives du paquet ;
  `maj` n'ajoute que ceux du langage déclaré, aux versions du gabarit.
- `binaires` : les binaires qu'un projet du langage installe sur la machine, chacun à sa version
  exacte ; `maj` installe chacun de ceux qui manquent ou sont à une autre version, par les
  commandes de `miseAJour.installation`. `typescript`, aucun ; `cargo`, nextest et cargo-deny
  (`scripts/langages/cargo/binaires.json`).
- `ignorer` : les dossiers qu'écrivent les outils du langage dans un projet, par leur nom ; les
  fichiers sources que lisent les migrations les laissent de côté, et `maj` les écrit dans le
  `.gitignore` du projet. `typescript`, `.turbo` ; `cargo`, `target`.
- `miseAJour` : la part du langage dans `maj`, comme chaque greffon de Nx apporte son générateur
  `init`. `gabarit`, le dossier du gabarit d'un projet du langage, dont le `package.json` donne les
  scripts du cadre et les versions des outils (`templates/projet`, `templates/cargo`) ;
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
<nom>@<version>`.
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
  `~/.rustup/` lus.
- `droits` : les règles de Claude Code qui refusent à un rôle qui écrit l'outil de test lancé
  directement ; `typescript`, Vitest et Turborepo ; `cargo`, `cargo test` et `cargo nextest`.
- `composants` : les composants du projet, chacun `{ dossier, nom, paquet }`, le dossier absolu ;
  `cargo`, les membres de l'espace de travail que décrit `cargo metadata --no-deps --offline`.
  L'enveloppe et le lanceur y lisent le plan : un plan qui nomme un composant (un paquet, un
  crate) ouvre ce composant seul en écriture.
- `composantDe` : le composant qui tient un fichier, ou null pour un fichier hors de tout
  composant ; toujours l'un de ceux que `composants` rend.
- `matieres` : les composants de la matière de test partagée, que l'enveloppe monte en écriture
  pour le testwriter.
- `joueDesTests` : si un composant joue des tests, que le lanceur du langage y trouve à jouer ;
  `typescript`, un script `test:unit` dans son `package.json` ; `cargo`, un dossier `tests/`. Le circuit en tire les paquets du
  plan qui portent des tests, comme Bazel lit les cibles de test d'un paquet à leur genre.
- `lecteurs` : les fournisseurs et les lecteurs, par le code, des éléments qu'un ticket nomme : son
  interface, ses imports, ses tests, ses types ; ce que lit chaque composant (`lit`) et ce que
  lisent ses tests (`parLesTests` : leurs imports ; `cargo`, ses dépendances de développement),
  d'où `--etendre` tire l'ordre du plan. Le relevé des composants touchés
  (`composants-affectes`) y ajoute les chemins lus et l'architecture.
- `touches` : les composants touchés depuis un commit, leurs dépendants, transitivement, et les
  fichiers hors de tout composant (`{ touches, dependants, horsGraphe }`), comme le
  `--filter=...[<commit>]` de Turborepo ; `cargo`, un fichier de l'espace de travail lui-même
  (`Cargo.toml`, `Cargo.lock` à la racine) touche tous les crates.
- `elementsDuLot` : les éléments qu'un lot ajoute, change ou supprime entre deux commits, chacun à
  sa place, les fichiers qu'il change, et les sources dont le module ne lit aucun élément ; le
  circuit les donne au relecteur.
- `commandes` : les commandes qui testent (`tester`), vérifient (`verifier`) et typent (`typer`),
  et chaque autre commande du module, garde, générateur ou préparation, par son nom ; chacune
  `{ script, args }`, le script absolu, jamais lancée. `grillhouse tests` et `grillhouse verifier`
  lancent `tester` et `verifier` ; chaque autre, sauf `typer`, est une sous-commande de son nom
  (`grillhouse frontieres`), comme un backend de Pants apporte ses buts. Chaque garde du module est
  une commande de son nom, celui de son script, que la ligne d'une garde rouge nomme (`grillhouse
clippy`). Le noyau en lance trois
  quand le module les décrit, et passe l'étape sinon :
  - `preparer`, que l'intégration et la file jouent avant la vérification (`cargo`, `cargo fetch
--locked`, qui télécharge les dépendances) ;
  - `construire --echec <fichier> <plan>`, que le lanceur joue dans la copie préparée, pour que la
    séance trouve construit ce qu'elle lit (`typescript`, la construction par Turborepo) : une
    construction en échec écrit dans `<fichier>` sa première ligne, puis sa sortie, et rend 0 ;
    tout autre échec rend un autre code et arrête le lancement ;
  - `tests-de-nuit`, que la nuit joue après la passe complète (`typescript`, les tests de nuit et
    les bancs de temps, par Vitest), 75 pour « à repasser ».
- La vérification écrit ses tâches rouges dans le fichier que nomme `GRILLHOUSE_ROUGES`, une par
  ligne, `<tâche>`, puis une tabulation et la commande qui la rejoue seule quand le langage en a
  une (`typescript`, `npx turbo run <tâche> --filter=<paquet>`) ; la nuit en tire sa commande
  `git bisect run`.
- `verdict` : ce qu'un lancement a laissé dans son dossier de résultats (`GRILLHOUSE_RESULTATS`) :
  `{ rapports, taches }`, chaque fichier de test avec ses tests, chaque tâche avec son code, 0 vert,
  1 rouge, 75 « à repasser », et `tests` vrai pour la tâche qui joue les tests de son composant.
- `estUnTest` : ce que le testwriter écrit dans un fichier, `{ joue, test, matiere }` (un test que
  le lanceur joue, un fichier de test ou d'un dossier de tests, un fichier de la matière de test
  partagée), ou null pour un fichier qu'il n'écrit pas. Les verrous des rôles, l'intégration et le
  circuit le lisent.
- `manifestes` : ce que le testwriter écrit des manifestes, comme l'auteur d'un test de Bazel
  déclare les dépendances de sa cible. `verrous`, les fichiers de verrouillage des versions depuis
  la racine (cargo : `Cargo.lock` ; typescript : `package-lock.json`), que l'enveloppe ouvre au
  seul testwriter ; `horsDesTests(chemin, racine, avant, apres)`, les parties du manifeste d'un
  composant qu'un changement touche hors de la partie de ses tests (cargo : `[dev-dependencies]`
  et `[target.<cible>.dev-dependencies]` d'un Cargo.toml ; typescript : `devDependencies` d'un
  package.json), et, pour cargo, d'un fichier de code de `src/` d'un crate hors de son module de
  test (la déclaration `#[cfg(test)] mod tests;` ajoutée ou retirée, un module de test en ligne
  retiré), chacune nommée, ou null pour un fichier que le module ne juge pas.
  Le verrou du testwriter accepte une écriture dont la liste est vide, et refuse les autres en
  nommant le chemin et chaque partie ; le noyau ne connaît aucun nom de section.
- `fichiersEngendres` : les fichiers que le module engendre, chacun avec sa commande, ses fichiers,
  ceux qu'il lit, les noms de ses constats et sa vérification (`verifier`), qui rend ses écarts.
  Le circuit les régénère et les juge (étape 4.2).
- `gardes` : les gardes de structure du module, chacune `[script, ...args]`, dans l'ordre où elles
  jouent ; `grillhouse gardes-du-cadre` les joue.
- `migrations` : les migrations d'un projet du langage, celles qui rejouent une garde du module et
  celles de ses outils (`typescript`, la configuration de base de Vitest), que `grillhouse maj`
  joue avec celles du noyau, comme `nx migrate` réunit celles de chaque greffon.

## Les services du noyau

L'entrée `@roomi-fields/grillhouse/jointure` donne au module de langage les services du noyau
qu'il emploie, et `scripts/jointure.d.ts` les type : le plan d'une enveloppe, l'avancement d'une
passe et sa mesure, la base d'une passe (son dossier temporaire, nommé dans `TMPDIR`, `TMP` et
`TEMP` ; la ligne de sa garde, qui nomme ce que les tests y laissent ; son retrait à
l'interruption), la pression de la machine et son verrou, le dernier vert,
les arbitrages d'un ticket, les fichiers sources d'un projet. Un module n'importe rien d'autre du noyau que ses entrées publiées
(`./jointure`, `./paquets`, `./dette`, `./resultats`, `./conformite`).

## La conformité

`@roomi-fields/grillhouse/conformite` tient chaque module de langage à ces demandes, comme le
RuleTester d'ESLint tient une règle à ses cas. `cas(langage, exemples)` rend un cas par demande :
sur son entrée valide, un module sain ne donne aucune faute ; sur son entrée défectueuse, il donne
exactement les fautes attendues. `echecs(langage, exemples)` rend les cas qu'un module manque. Les
entrées sont celles de chaque module (`scripts/langages/<nom>/exemples.mjs`).

Un cas tient chaque demande sauf `nom`, `verdict` lu à part, `migrations`, que le test de
chaque migration tient, `signe`, `outils`, `binaires`, `ignorer` et `miseAJour`, que les tests de la mise à
jour tiennent, `sorties`, que les tests
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

## Consommateurs

Les paquets de Grillhouse qui importent le cadre par son nom ; un projet le lit par ses entrées
publiées.

- `grillhouse-essais` : *
