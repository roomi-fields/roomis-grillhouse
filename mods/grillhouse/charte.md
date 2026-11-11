# La charte commune de Roomi's Grillhouse

Les règles que tout agent applique, identiques dans chaque projet qui installe le cadre. La charte
du projet (`CLAUDE.md`) l'importe depuis le paquet installé et porte ce qui lui est propre : son
nom, son responsable, ce qui décide chez lui, ses critères d'arbitrage, ses commandes. Le détail
d'un rôle vit dans sa compétence, celui d'un outil dans l'architecture du paquet
(`node_modules/@roomi-fields/grillhouse/docs/ARCHITECTURE.md`). Ce fichier ne se modifie pas
dans un projet : un écart se propose à Grillhouse. Ainsi les projets suivent un seul cadre, et
chaque séance ne charge que ce qu'elle applique.

## Ce qui décide

Une décision vit dans le document qu'elle règle. Ainsi on la trouve là où on la cherche.

Une règle s'écrit selon le métacadre (`METACADRE.md`, à côté de cette charte, §2).

## Comment on arbitre

Une décision ou une question se tranche par les questions de la charte du projet (« Comment on
arbitre »), dans leur ordre : la première qui s'applique l'emporte, et le choix la nomme ; deux
réponses de même rang vont au responsable. Ainsi chaque choix construit un produit mature et
professionnel.

## Le flux d'une tâche

1. `bd ready`, `bd update <id> --claim`, lis le ticket et le cadre de chaque composant touché.
2. Un défaut remonté est d'abord une question d'architecture : le ticket s'ouvre sur sa section
   « Architecture » (le modèle mûr nommé, l'adresse dans l'architecture, le mécanisme commun), et
   le correctif va dans ce mécanisme. Ainsi tout correctif passe par l'architecture.
3. Une décision reste à prendre : `mattpocock-skills:grilling` avant d'écrire, ses questions dans
   le ticket. Ainsi la décision est prise et écrite avant le code.
4. Le plan va dans le ticket : dans le circuit, l'explorateur l'écrit (ses critères, les paquets à
   toucher, ses questions ouvertes), le questionneur le lit une fois, l'explorateur répond une
   fois, et ce qui reste ouvert monte au superviseur. Un travail qui change un comportement est un
   seul ticket : les tests d'abord (agent `testwriter`), puis le code qui les rend verts (agent
   `developpeur`). Ainsi le code se mesure à des tests qu'il n'a pas écrits. Un critère répond à
   un besoin réel de l'usage actuel. Ainsi le ticket garde la taille du besoin.
5. Le ticket se ferme sur ses tests ciblés, le verdict du `relecteur` sur le lot et le commit du
   circuit, seul à commiter, entré sur main par la file. Ainsi ce qui est déclaré fini l'est
   vraiment.
6. Chaque agent laisse sa passation en commentaire au ticket (`bd comments add`), avec ce qui
   n'est pas fait et pourquoi ; une séance que le circuit mène finit sur sa fiche, la sortie
   structurée de son rôle, sur laquelle le circuit décide. Ainsi la passation sert l'humain, et
   la fiche le circuit.

Un ticket parcourt les étapes de son circuit (`etapes.mjs`, la seule liste), chacune tenue par un
rôle, agent du cadre, sous ses droits : 1 Plan, l'explorateur puis le questionneur, et
1.1 Geste mécanique, l'explorateur, pour un ticket que son plan dit mécanique ; 2 Tests, une
séance du testwriter, et 2.1 Preuve du rouge ; 3 Code, une séance du développeur, et
3.1 Contrôles ; 4 Passe finale et relecture : la passe finale, la régénération des références,
puis le relecteur, qui rend une ligne de conformité par élément que le lot ajoute, change ou
supprime ; 5 Intégration, et 5.3 Tri des découvertes, l'explorateur, sur le lot entré sur main.
Ainsi chaque agent travaille dans son cadre,
et le numéro d'une étape dit où en est chaque ticket.

**Le circuit fait les gestes, une vraie question monte** : le circuit fait lui-même les gestes
mécaniques que la liste des étapes écrit (rejouer, régénérer, juger un lot sans rien à livrer) ;
tout autre arrêt monte au superviseur avec sa pièce, et il monte au responsable ce qui lui
revient. Ainsi aucune séance ne juge ce qu'une règle tranche.

**Un agent qui a la réponse l'applique** : une décision qu'il sait trancher et qu'il recommande
(un nom, une signature, un paquet à retirer de son plan), il la prend et l'écrit dans sa fiche,
sans s'arrêter ; seule monte une question qui revient au responsable (le langage, l'architecture,
un écart à la référence) ou dont il n'a pas la réponse, et elle nomme lequel. Ainsi le circuit
n'attend que les vraies décisions.

**Tous les agents jugent sur le plan** : une décision du responsable entre dans la description du
ticket, comme une RFC amendée ; les commentaires restent l'historique. Ainsi chaque agent lit la
même décision.

**Un fait repris se relit à sa pièce** (fichier:ligne depuis la racine de la copie,
« $ commande » et sa sortie, ou « ticket, critère N » et « ticket, § <section> » pour ce que dit
le ticket) avant qu'un agent s'appuie dessus, et un fait transmis porte la
sienne. Ainsi une ligne mal lue s'arrête au premier qui la relit.

**Un ticket de réalisation nomme ses composants** dans son titre (« numéro — sujet — composant,
composant ») et sa section « Architecture », le fournisseur d'abord ; il fait une seule livraison,
en un seul commit, et se crée sous sa mère (`docs/agents/issue-tracker.md`). Un objectif dont le
découpage n'est pas connu commence par une exploration, sans code. Ainsi l'avancement se lit
ticket par ticket.

**Le rouge prouve le travail du ticket** : un test qui échoue avant le code prouve qu'avant le
travail le comportement manque, et qu'après il est là ; c'est son seul sens. Seul un test qui
porte le travail du ticket rougit donc d'abord ; les autres sont verts avant le code, sans
justification à donner. Chaque sorte de test prouve une chose :

| Sorte | Ce qu'elle prouve | Rouge avant le code |
|---|---|---|
| Test du comportement développé | Le ticket fait ce que dit son critère | Oui : c'est la preuve du travail |
| Test d'un défaut corrigé | Le défaut est reproduit, puis corrigé | Oui : il montre le défaut |
| Test d'un comportement existant | Le lot ne casse rien | Non : vert attendu |
| Test d'interface | Un paquet tient ce qu'il publie | Oui s'il porte le travail du ticket, sinon non |
| Banc de temps, témoin de temps | Un temps reste sous sa borne | Non : mesuré la nuit |
| Test de nuit | Le produit entier, monté dans un projet d'essai | Oui s'il porte le travail du ticket, joué la nuit |

Ainsi la preuve du rouge mesure le travail, et aucun test ne rougit pour la forme.

**La taille d'un test suit la pyramide** (la pyramide des tests de Google, les tailles de
Bazel) : un test petit vérifie son module par son interface, sans processus ; un test moyen
assemble quelques modules sur la machine, avec des processus locaux ; un test grand monte un
projet d'essai et y lance le produit ou le cadre entier : il est un test de nuit (`*.nuit.test.*`,
`*_nuit_test.py`, un module de `tests/it_nuit/` en Rust), jamais joué au fil du travail. Chaque test prend la plus petite taille qui prouve son critère, dans
Grillhouse comme dans chaque projet. La garde des tailles (`grillhouse tailles-des-tests`) refuse
un grand test de jour, et la dette inscrite des grands tests existants ne fait que baisser. Un
test de jour valide le code en l'important : lancer la commande grillhouse (son binaire, un
script du cadre) est réservé aux tests de bout-en-bout, sous un dossier `e2e/`, et la même garde
refuse les autres. Ainsi le jour reste court, et la preuve longue tourne la nuit.

**Un test porte le nom du comportement qu'il prouve**, jamais le numéro de son ticket, qui va au
message du commit (Software Engineering at Google, chap. 12 : un test par comportement). Ainsi un
test vit autant que son comportement, pas que son ticket.

**Une mesure de temps joue la nuit** (les tests `manual` de Bazel, les bancs de rustc-perf hors de
la CI de chaque commit) : le jour sert l'activité, et sa machine est toujours chargée. Un test qui
mesure un temps (un banc de temps, un témoin de temps) est hors du jour dans chaque langage, comme
un test de nuit ; la nuit le joue seul, au repos, et un échec sous charge y est « à repasser »
(75). Le jour n'attend aucun repos : un délai de test est un garde-fou, pas une mesure ; dépassé,
il est rouge, et un délai trop juste s'élargit, très au-dessus de la durée normale du test. Ainsi
le jour avance, et une mesure se prend au repos.

**Un projet a plusieurs langages, un paquet un seul** : chaque paquet relève du langage de son
outil, et `npm test`, la vérification et le circuit jouent chaque paquet avec cet outil. Ainsi
chaque paquet se construit et se teste d'une seule façon.

**Le langage d'un paquet se décide à la conception** : la colonne « Langage » du tableau des
composants de `docs/ARCHITECTURE.md` le nomme, l'`INTERFACE.md` du paquet le reprend, et le cadre
le lit là, sans le deviner aux fichiers ; la garde `grillhouse langages-des-paquets` refuse un
paquet que l'architecture ne déclare pas, dont le manifeste suit un autre langage, ou qui n'a pas
le manifeste du sien. Ainsi
l'architecture fixe le langage, et le code le suit.

**Un test vit dans un fichier à lui**, jamais dans un fichier de code, reconnu au nom ou au
dossier qu'attend l'outil de son langage : près de son module pour un test unitaire (en Rust, un
`tests.rs` ou un dossier `tests/` sous `src/`, comme le veut le contrôle tidy de rustc), dans le
dossier de tests du paquet pour un test par l'interface (en Rust, un module de `tests/it/` du
crate). Les sortes de tests, qui les écrit, qui les lit et qui les joue sont les mêmes dans chaque
langage ; seule l'adresse d'un fichier de test suit l'outil. Ainsi chaque test a un fichier à lui,
que le testwriter écrit.

**Un crate Rust a un seul exécutable de tests d'intégration par moment** (la suite de tests de
Cargo, `tests/testsuite/main.rs`) : chaque fichier de tests est un module que déclare
`tests/it/main.rs` le jour, `tests/it_nuit/main.rs` la nuit, `tests/it_budget/main.rs` pour les
bancs ; une garde du module cargo refuse un exécutable de plus. Ainsi cargo lie
les dépendances une fois par moment, et une copie garde la place de son disque.

**Un ticket ouvert naît du mot du responsable**, ou d'un défaut qu'un projet du cadre rencontre.
Une découverte d'agent se consigne dans un ticket fermé, sous le ticket qui l'a trouvée, étiqueté
`decouverte`. En fin de ticket, le tri des découvertes lui donne son verdict, avec sa pièce :
`traitee`, `doublon` ou `sans-suite` la laissent fermée ; `a-porter` (un défaut de l'usage
actuel) ou `non-confirmee` (sans preuve rejouée) la rouvrent sous `a-valider`, pour le
responsable. Ainsi chaque découverte est lue, et le backlog reste le plan du responsable.

**Un ticket de données suit le chemin de données du projet** : un ticket qui n'ajoute que des
données (des fichiers qu'un schéma valide, une fiche à un catalogue) ne passe pas par le circuit
de code ; il passe par la validation du projet et sa CI, comme une formule de Homebrew ou un
type de DefinitelyTyped. Ainsi le circuit garde les tests et le code pour ce qui en a.

**Un geste sans comportement neuf sort du circuit de code** (montée du cadre, documents seuls,
renommage ou déplacement, montée de dépendance, configuration seule, correction de style, seuil
relevé), comme les grands changements de Google (Rosie, ClangMR), Renovate, `nx migrate`,
`eslint --fix` : il passe par sa commande ou son outil, puis la vérification et la relecture du
relecteur, sans testwriter ni développeur. L'explorateur juge au plan que le ticket est mécanique,
et l'écrit avec sa raison et sa commande ; un doute va au circuit. Le texte qui accompagne un
changement de comportement reste dans son lot. Une configuration dont une garde mesure l'effet
reste au circuit. Sous un plan qui dit « comportement inchangé », la suite existante fait la
preuve : elle accepte chaque vert, et le développeur écrit le code (une réorganisation a du code),
puis les contrôles et la relecture. Hors de ce cas, une preuve qui ne trouve aucun rouge passe aux
contrôles et à la relecture sans séance du développeur. Ainsi chaque séance du circuit a un lot à
écrire.

**Un paquet naît hors du circuit, en quatre temps** (un squelette n'a ni comportement ni test),
comme les générateurs de Nx et `cargo new --lib` : 1, le grill, le superviseur et le responsable
(son rôle, sa frontière, ses refus, son interface, son langage) ; 2, l'écriture, le superviseur
avec la compétence `redacteur`, relue par le responsable : sa ligne du tableau des composants de
`docs/ARCHITECTURE.md`, avec son langage, et ses documents (`<chemin>/docs/CADRE.md`,
`INTERFACE.md`) ; 3, la création, sans agent : `npx grillhouse paquet <chemin>` lit la ligne et
bâtit ce que son langage demande, les outils de ce langage compris pour son premier paquet ; 4, le
code, un ticket ordinaire du circuit sur un paquet qui existe. Les temps 2 et 3 entrent dans un
même commit, après une vérification verte. Ainsi main ne voit jamais un paquet déclaré sans
dossier.

## Ce qui tient le dépôt droit

- **Une matière, une adresse** : ce qu'un document décrit déjà s'y verse. Ainsi l'architecture
  écrite reste une, et le code suit une seule version.
- **Un changement de comportement corrige ses textes** dans le même commit. Ainsi les documents
  restent vrais.
- **Une décision de structure passe par le grill** (compétence `grill`) : découpage, paquets,
  modules, interfaces, frontières. Ainsi l'architecture décide de la structure, et le code la suit.
- **Un geste transverse, un seul ticket** : un même changement sur plusieurs composants se décide
  une fois, en gabarit dans la section « Architecture », et se mène dans une seule copie. Ainsi le
  geste reste le même partout.
- **Les composants suivent un modèle commun** : chacun étend les configurations de base du cadre ;
  un écart passe seulement inscrit, avec sa raison, dans la liste que le superviseur valide.
  Ainsi le cadre ne maintient aucune spécificité par composant.
- **Une dette connue s'inscrit et se gèle** (`grillhouse-dette.json`) : une garde refuse tout
  constat neuf, et le compte ne remonte jamais. Une garde à dette neuve du cadre arrive avec sa
  migration, qui inscrit la dette existante des projets (la garde des migrations des gardes refuse
  celle qui n'en a pas). Ainsi la dette ne fait que baisser, et un projet monte sans geste à la main.
- **Un flux de la CI déclare les paquets qu'il exerce, le relecteur le lit** (`grillhouse.flux` du
  `package.json` racine) : une garde refuse un flux sans entrée ou un paquet inconnu, et la
  consigne du relecteur nomme chaque flux que le lot touche. Ainsi un flux qui ne suit pas un
  changement est lu avant le commit.
- **Un fichier engendré se construit** plutôt que de se commiter (au démarrage, au déploiement),
  comme les index de Homebrew ou de caniuse. Un fichier qu'un lecteur ne peut pas construire
  (une page lue sur GitHub, une somme de contrôle publiée) reste commité : le projet le déclare
  avec sa commande (`grillhouse.engendres` de son `package.json`), et l'intégration le régénère
  sur le lot appliqué au lieu de le fusionner. Ainsi deux tickets qui touchent ses sources
  entrent tous deux.
- **Un remplacement supprime le remplacé** dans le même commit, avec ses consommateurs et ses
  gardes. Ainsi le produit garde une seule façon de faire chaque chose.
- **Un commentaire dit ce que la chose est**, au présent. Ainsi il reste vrai tant que le code ne
  change pas.

## Outils

- ⛔ **Des commandes sans invite** : tout fichier temporaire dans le scratchpad de session, ou
  dans le dossier temporaire du ticket ;
  `env -C <dossier>` ou `git -C` à la place de `cd`, et le greffon refuse une commande qui
  commence par `cd` ; une suppression passe par un script node du
  scratchpad (`rmSync` de `node:fs`) sur un chemin nommé et lu ; un signal vise seulement un
  processus que la séance a lancé. Une commande dont on doute s'écrit dans le compte rendu, sans
  se lancer. Ainsi la séance avance seule.
- **Les tests se lancent par `npm test`** : `npm test -- <chemins>` pour un lancement ciblé,
  chaque chemin écrit depuis la racine du dépôt ; `npm run test:forcer -- <chemins>` pour rejouer
  pour de vrai un test soupçonné instable. `npm run verifier` joue les gardes, le typage de chaque
  paquet et les tests ; `npm run verifier -- --gardes`, les gardes seules. Aucun agent ne lance
  l'outil de test directement. Ainsi chaque test tourne avec ce dont il dépend, et une seule fois
  tant que rien ne change.
- **Les tests ne laissent rien dans le dossier temporaire** : un test crée ses fichiers et
  dossiers temporaires par l'outil de son langage, qui les retire à la fin, test rouge compris ;
  aucun chemin ne se bâtit à la main sous le dossier temporaire. Chaque passe de tests joue sous un
  dossier temporaire à elle, retiré à sa fin, même rouge ou interrompue, et échoue en nommant ce
  qu'un test y laisse ; le module de chaque langage nomme son outil et porte cette garde. Ainsi le
  dossier temporaire, souvent un disque en mémoire que partagent les séances du poste, ne sature
  jamais.
- **Un fichier temporaire meurt avec son propriétaire** : une passe ou une séance hors ticket (la
  nuit, une vérification) écrit sous un dossier temporaire à elle, retiré à sa fin, même
  interrompue, et balayé par la suivante quand son processus est tué ; un agent écrit sous celui
  de son ticket, que donne `npx grillhouse temporaire <ticket>`, qui vit le temps de son ticket,
  d'une séance et d'une reprise à l'autre, gel compris, et part quand le ticket se ferme. Ce qu'un
  agent doit avoir pour
  reprendre vit dans la copie du ticket ou sa passation, jamais dans le seul dossier temporaire,
  qui ne porte que ce qui se refait. Le dossier temporaire ne tient ni copie du dépôt, ni
  `node_modules`, ni cache : un cache de compilation va sous `~/.cache/grillhouse/`. Une passe
  lourde qui trouve moins de 4 Go libres, sous le dossier temporaire ou sur le disque de sa copie,
  attend la place et dit ce qui l'occupe, le ticket nommé. Ainsi le poste ne sature jamais ses
  disques.
- **Main reste vert** : la file n'avance main que sur l'arbre que la CI de la branche du ticket
  (`agent/<ticket>`) a jugé vert, comme bors et Zuul. Un test connu rouge se met en quarantaine
  dans le test lui-même (`it.skip` ou `it.fails`), avec le ticket qui le corrige. Ainsi chaque
  rouge a son ticket.
- **L'index d'abord** : toute recherche commence par `rtfm_search` (mode `hybrid`) pour le quoi, et
  par `codegraph explore` (ou l'outil `codegraph_explore`) pour l'appel ; le shell lit un fichier
  déjà nommé. Ainsi une affirmation sur le code repose sur ce que le code contient.
- **Tout se lit, le plan s'écrit** : dans son enveloppe, un agent lit tout le dépôt, index compris,
  et n'écrit que les paquets que le plan de son ticket nomme. Une écriture hors du plan l'arrête,
  et le superviseur étend le plan ou refuse. Ainsi l'agent lit ce dont il a besoin, et les gardes
  tiennent l'architecture.
- Tickets : Beads (`bd`), sous le préfixe du projet, voir `docs/agents/issue-tracker.md`.
- Le greffon `mattpocock-skills` s'appelle avec son préfixe ; un document pour un agent s'écrit
  avec `mattpocock-skills:writing-for-agents`.
- Réponses en français ; le code et les noms d'API restent en anglais.
