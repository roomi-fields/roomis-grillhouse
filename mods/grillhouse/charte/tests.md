# La charte commune : le module des tests

Les règles de la charte commune sur le test qu'on écrit : son nom, son moment, son adresse.

**Un test porte le nom du comportement qu'il prouve**, jamais le numéro de son ticket, qui va au
message du commit (Software Engineering at Google, chap. 12 : un test par comportement). Ainsi un
test vit autant que son comportement, pas que son ticket.

**Une mesure de temps joue la nuit** (les tests `manual` de Bazel, les bancs de rustc-perf hors de
la CI de chaque commit) : le jour sert l'activité, et sa machine est toujours chargée. Un test qui
mesure un temps (un banc de temps, un témoin de temps) est hors du jour dans chaque langage, comme
un test de nuit ; la nuit le joue sur des cœurs dédiés que personne d'autre ne touche, et un
échec sous charge y est « à repasser » (75) (la nuit : le document de l'entrée sur main, §5.3 ;
les cœurs dédiés : le document de la machine, §5.2). Le jour n'attend aucun repos : un délai de
test est un garde-fou, pas une mesure ; dépassé, il est rouge, et un délai trop juste s'élargit,
très au-dessus de la durée normale du test. Ainsi le jour avance, et une mesure se prend au repos.

**Un test qui exige de la charge joue la nuit** (les tests de résistance de Chromium et de rustc,
hors de la passe de chaque changement) : un test qui a besoin d'une machine chargée produit sa
charge lui-même et est un test de nuit, joué sur des cœurs dédiés (`grillhouse.mesure`), comme
une mesure de temps. Pendant la nuit d'un projet, les autres projets continuent de travailler :
seuls une mesure de temps et un test qui exige de la charge prennent des cœurs que personne d'autre
ne touche (l'étiquette `exclusive` de Bazel, donnée aux seuls tests qui l'exigent, non à la
suite). Ainsi la charge d'un test reste la sienne, et le jour garde sa machine.

**Un test vit dans un fichier à lui**, jamais dans un fichier de code, reconnu au nom ou au
dossier qu'attend l'outil de son langage : près de son module pour un test unitaire (en Rust, un
`tests.rs` ou un dossier `tests/` sous `src/`, comme le veut le contrôle tidy de rustc), dans le
dossier de tests du paquet pour un test par l'interface (en Rust, un module de `tests/it/` du
crate ; en C, un fichier `tests/test_<nom>.c` du paquet, un exécutable et un test CTest). Les sortes de tests, qui les écrit, qui les lit et qui les joue sont les mêmes dans chaque
langage ; seule l'adresse d'un fichier de test suit l'outil. Ainsi chaque test a un fichier à lui,
que le testwriter écrit.

**Un crate Rust a un seul exécutable de tests d'intégration par moment** (la suite de tests de
Cargo, `tests/testsuite/main.rs`) : chaque fichier de tests est un module que déclare
`tests/it/main.rs` le jour, `tests/it_nuit/main.rs` la nuit, `tests/it_budget/main.rs` pour les
bancs ; une garde du module cargo refuse un exécutable de plus. Ainsi cargo lie
les dépendances une fois par moment, et une copie garde la place de son disque.
