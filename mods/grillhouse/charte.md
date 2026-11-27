# La charte commune de Roomi's Grillhouse

Les règles que tout agent applique, identiques dans chaque projet qui installe le cadre. La charte
du projet (`CLAUDE.md`) l'importe depuis le paquet installé et porte ce qui lui est propre : son
nom, son responsable, ce qui décide chez lui, ses critères d'arbitrage, ses commandes ; elle ne
décrit aucun réglage. Le détail d'un rôle vit dans sa compétence ; celui d'un mécanisme du cadre
dans son document, sous `node_modules/@roomi-fields/grillhouse/docs/architecture/` : le circuit
(`circuit.md`), l'entrée sur main, la CI et la nuit (`entree.md`), la machine et l'enveloppe
(`machine.md`), les tests et les langages (`tests.md`), l'installation et les réglages d'un
projet (`installation.md`), le greffon et le panneau (`greffon.md`). Une règle de cette charte
renvoie au paragraphe qui la décrit. Ce fichier ne se modifie pas dans un projet : un écart se
propose à Grillhouse. Ainsi les projets suivent un seul cadre, et chaque séance ne charge que ce
qu'elle applique.

## Ce qui décide

Une décision vit dans le document qu'elle règle. Ainsi on la trouve là où on la cherche.

Une règle s'écrit selon le métacadre (`METACADRE.md`, à côté de cette charte, §2).

Une chose du cadre porte un seul mot, celui de son lexique (`docs/lexique.md` du paquet) ; le
`CONTEXT.md` d'un projet porte les mots de son domaine, jamais un mot du cadre redéfini. Ainsi
chaque agent nomme chaque chose comme les autres.

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
3. Une décision reste à prendre : `grillhouse:grilling` avant d'écrire, ses questions dans
   le ticket. Ainsi la décision est prise et écrite avant le code.
4. Le plan va dans le ticket : dans le circuit, l'explorateur l'écrit (ses critères, les paquets à
   toucher, ses questions ouvertes), le questionneur le lit une fois, l'explorateur répond une
   fois, et ce qui reste ouvert monte au superviseur. Un travail qui change un comportement est un
   seul ticket : les tests d'abord (agent `testwriter`), puis le code qui les rend verts (agent
   `developpeur`). Ainsi le code se mesure à des tests qu'il n'a pas écrits. Un critère répond à
   un besoin réel de l'usage actuel. Ainsi le ticket garde la taille du besoin.
5. Le ticket se ferme sur ses tests ciblés, le verdict du `relecteur` sur le lot et le commit du
   circuit, seul à commiter, entré sur main par la file sur sa passe finale, la CI de main jouant
   ensuite par paquets. Ainsi ce qui est déclaré fini l'est
   vraiment.
6. Chaque agent laisse sa passation en commentaire au ticket (`bd comments add`), avec ce qui
   n'est pas fait et pourquoi ; une séance que le circuit mène finit sur sa fiche, la sortie
   structurée de son rôle, sur laquelle le circuit décide. Ainsi la passation sert l'humain, et
   la fiche le circuit.

Un ticket parcourt les étapes de son circuit, chacune tenue par un rôle, agent du cadre, sous ses
droits, ou par le circuit lui-même ; leur liste est une seule (`etapes.mjs`), et le document du
circuit la décrit (§5.1), avec ce que chaque rôle écrit (§3.3). Ainsi chaque agent travaille dans
son cadre, et le numéro d'une étape dit où en est chaque ticket.

**Le circuit fait les gestes, une vraie question monte** : le circuit fait lui-même les gestes
mécaniques que la liste des étapes écrit (le document du circuit, §5.5) ; tout autre arrêt monte
au superviseur avec sa pièce, et il monte au responsable ce qui lui revient (§5.4).
Ainsi aucune séance ne juge ce qu'une règle tranche.

**Le greffon pousse les questions des circuits à la séance du superviseur, et la réponse les
acquitte** : seule la séance qui tient le verrou du superviseur les reçoit, un message par
relevé, jamais pendant un de ses tours ; une question lue et restée sans réponse revient à
l'intervalle de rappel du projet. Les états d'une question, le groupe de projets et la réponse
portée au responsable sont au document du greffon (§5.1). Ainsi une question ne dépend d'aucune
attente que la séance relance.

**Un agent qui a la réponse l'applique** : une décision qu'il sait trancher et qu'il recommande
(un nom, une signature, un paquet à retirer de son plan), il la prend et l'écrit dans sa fiche,
sans s'arrêter ; seule monte une question qui revient au responsable (le langage, l'architecture,
un écart à la référence) ou dont il n'a pas la réponse, et elle nomme lequel. Ainsi le circuit
n'attend que les vraies décisions.

**Tous les agents jugent sur le plan** : une décision du responsable entre dans la description du
ticket, comme une RFC amendée ; les commentaires restent l'historique. Ainsi chaque agent lit la
même décision.

**Une tension avec l'architecture monte, elle ne se résout pas dans le ticket** : le créateur du
ticket, ou l'explorateur au plan, qui ne trouve aucun paragraphe, ou en trouve un que le travail
contredit, s'arrête et monte au superviseur. Le superviseur charge la compétence `architecte`,
instruit la décision (l'existant, les options, leurs compromis) et la porte au responsable, qui
tranche. Ainsi aucun ticket ne décide de l'architecture.

**Un document prescriptif change sur décision seule** : après la décision du responsable, un agent
architecte met le document en conformité, et le responsable relit son lot ; le relecteur rend tout
autre lot qui modifie un document prescriptif. Ainsi le document reste la décision, et non la trace
du code.

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

Ainsi la preuve du rouge mesure le travail, et aucun test ne rougit pour la forme. La preuve, ce
qu'elle joue et ce qu'elle refuse : le document des tests (§5.2).

**La taille d'un test suit la pyramide** (la pyramide des tests de Google, les tailles de
Bazel) : un test petit vérifie son module par son interface, sans processus ; un test moyen
assemble quelques modules sur la machine, avec des processus locaux ; un test grand monte un
projet d'essai et y lance le produit ou le cadre entier : il est un test de nuit (`*.nuit.test.*`,
`*_nuit_test.py`, un module de `tests/it_nuit/` en Rust), jamais joué au fil du travail. Chaque
test prend la plus petite taille qui prouve son critère, dans Grillhouse comme dans chaque projet.
La garde des tailles (`grillhouse tailles-des-tests`) refuse un grand test de jour, et la dette
inscrite des grands tests existants ne fait que baisser (les gardes : le document des tests, §3.4). Un
test de jour valide le code en l'important : lancer la commande grillhouse (son binaire, un
script du cadre) est réservé aux tests de bout-en-bout, sous un dossier `e2e/`, et la même garde
refuse les autres. Un test qui a besoin d'un autre paquet construit — le binaire ou la
bibliothèque d'un composant, dans quelque langage — le déclare en dépendance (ses `dependencies`,
comme la `data` d'une cible Bazel) : le graphe le construit avant ses tests et le cache le garde,
si bien qu'un lot qui ne touche pas ses sources le reprend sans le reconstruire. Un tel test reste
un test de jour ; seul un test qui monte le produit entier dans un projet d'essai est un test de
nuit. Un test qui lance le binaire d'un paquet sans déclarer qu'il en dépend plante le jour, faute
de l'avoir construit. Ainsi le jour reste court, le petit CPU ne reconstruit que ce qui a changé,
et la preuve longue tourne la nuit.

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
suite). De jour, personne ne fabrique de charge : un test soupçonné instable se rejoue par
`npm run test:forcer`, sans boucle ni processus lancés pour occuper la machine. Ainsi la charge
d'un test reste la sienne, et le jour garde sa machine.

**Un projet a plusieurs langages, un paquet un seul** : chaque paquet relève du langage de son
outil, et `npm test`, la vérification et le circuit jouent chaque paquet avec cet outil. Ainsi
chaque paquet se construit et se teste d'une seule façon.

**Le langage d'un paquet se décide à la conception** : la colonne « Langage » du tableau des
composants de `docs/ARCHITECTURE.md` le nomme, l'`INTERFACE.md` du paquet le reprend, et le cadre
le lit là, sans le deviner aux fichiers ; la garde `grillhouse langages-des-paquets` refuse un
paquet que l'architecture ne déclare pas, dont le manifeste suit un autre langage, ou qui n'a pas
le manifeste du sien (le document des tests, §5.6). Ainsi l'architecture fixe le langage, et le
code le suit.

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

**Un ticket prend le circuit court quand aucun test honnête ne peut rougir avant son lot**, le
produit se comportant pareil avant et après : la suite existante, qui reste verte, et la relecture
font la preuve, comme les grands changements de Google (Rosie, ClangMR), Renovate, `nx migrate`,
`eslint --fix`, sans test neuf. Un test honnête échoue avant le lot et passe après, sur un
comportement qu'un test, un autre paquet ou une interface publiée observe. Le doute va au circuit
complet. L'explorateur juge au plan que le ticket est mécanique, et l'écrit avec sa raison, ce
qu'il a cherché et sa commande. La liste qui suit donne des exemples du critère, non son
périmètre : montée du cadre, documents seuls, renommage ou déplacement, montée de dépendance,
configuration seule (sans garde qui en mesure l'effet), correction de style, seuil relevé,
commentaires de code seuls, suppression de code sans appelant vivant, fichiers engendrés
régénérés, textes de messages qu'aucun test ni aucun autre paquet ne lit, typage resserré sans
changement à l'exécution et dont aucun lecteur du relevé ne casse à la compilation.
Le circuit court a deux formes : le geste qu'une commande ou un outil joue passe par 1.1 (Geste
mécanique, l'explorateur joue la commande du plan), sans testwriter ni développeur ; le geste
écrit à la main (commentaires, code supprimé, texte d'un message, typage resserré) saute le
testwriter et la preuve du rouge, et une séance du développeur écrit, puis les contrôles et la
relecture. Reste au circuit complet ce qu'un utilisateur ou un autre paquet observe (une sortie,
un code de retour, une interface publiée) ; le texte qui accompagne un changement de comportement
reste dans son lot. Une configuration dont une garde mesure l'effet reste au circuit. Une
réorganisation qui a du code et dont les tests s'adaptent (« comportement tests-adaptés ») garde le
circuit complet, la suite existante faisant la preuve. La bascule marche dans les deux sens, sur le
même plan, ses paquets et ses critères gardés : un lot de tests dont aucun ne peut rougir passe au
circuit court, un lot du circuit court qui change un comportement repart au circuit complet ; ses
arrêts, les réponses du superviseur et leur compte parmi les `RENDU` sont au document du circuit
(§5.6, §5.4). Ainsi chaque séance du circuit a un lot à écrire.

**Un ticket prend l'une de trois voies** : le circuit complet pour un comportement qui change ;
le circuit court pour un geste sans comportement neuf, que l'explorateur juge au plan par son critère, et que la bascule rend dans les deux sens ; hors
du circuit, mené en direct par une commande du cadre (`npx grillhouse direct <ticket>`), pour un
défaut du circuit lui-même (le circuit ne se répare pas par lui-même), une correction triviale
repérée en analyse (une ligne fautive, un mauvais argument, sans exception), un ticket de données
ou le squelette d'un paquet ; il porte l'étiquette `direct`, que la file des
tickets ignore, même s'il porte aussi `circuit`. Un lot hors du circuit entre
sur main sur sa vérification complète verte. Un changement de comportement du produit va au
circuit, même pressé. Ainsi la voie d'un ticket se lit à la charte, et non au choix de la séance.

**Le superviseur n'écrit pas le code d'un direct** : la commande lance, dans une copie à elle, un
agent (le rôle `direct`, qui écrit tests et code ensemble, sous les droits que son rôle donne), puis
le relecteur sur son lot, et s'arrête : ni plan, ni preuve du rouge, ni contrôles, ni file. Un
défaut corrigé porte un test qui le reproduit, que la relecture exige. Le superviseur reprend la main
sur un lot relu : il relit, joue la vérification complète, commite, avance main et pousse ; un lot
`RENDU` repart à l'agent par la même commande, qui s'arrête à la troisième relecture rendue. Le
verrou du cadre refuse à toute séance hors enveloppe qui n'est pas un agent du cadre (le
superviseur, une séance lancée à la main, une séance qui perd sa variable d'enveloppe) le code et
les tests d'un paquet, et nomme la commande ; les documents, ceux d'un paquet comme ceux de la
racine, restent écrits par le superviseur. Ainsi celui qui relit n'est jamais celui qui a écrit.

**La file directe se tient comme la file des tickets** : un ticket direct attend ouvert, et l'en-tête
du panneau le compte (« ✎ N en direct ») ; le superviseur lance par la commande le seul qu'il mène,
rend ouvert celui qu'il quitte, et ferme celui dont le lot est sur main (« intégré : <commit> »),
même si une nuit doit encore le confirmer, après avoir déverrouillé sa copie
(`npx grillhouse direct <ticket> --deverrouiller`). Le panneau montre l'agent d'un direct en cours
sous le bloc « Direct », en tête des agents. Ainsi le panneau montre seulement ce qui tourne.

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
  migration, qui inscrit la dette existante des projets (le document des tests, §5.5). Ainsi la
  dette ne fait que baisser, et un projet monte sans geste à la main.
- **Un flux de la CI déclare les paquets qu'il exerce, le relecteur le lit** (`grillhouse.flux` du
  `package.json` racine) : une garde refuse un flux sans entrée ou un paquet inconnu, et la
  consigne du relecteur nomme chaque flux que le lot touche (le document des tests, §3.4). Ainsi un
  flux qui ne suit pas un changement est lu avant le commit.
- **Un fichier engendré se construit** plutôt que de se commiter (au démarrage, au déploiement),
  comme les index de Homebrew ou de caniuse. Un fichier qu'un lecteur ne peut pas construire
  (une page lue sur GitHub, une somme de contrôle publiée) reste commité : le projet le déclare
  avec sa commande (`grillhouse.engendres`), et l'entrée sur main le régénère sur le lot au lieu
  de le fusionner (le document de l'entrée sur main, §5.1). Ainsi deux tickets qui touchent ses
  sources entrent tous deux.
- **Un remplacement supprime le remplacé** dans le même commit, avec ses consommateurs et ses
  gardes. Ainsi le produit garde une seule façon de faire chaque chose.
- **Une règle retirée emporte ce qu'elle seule tenait** : retirer une règle supprime, dans le même
  commit, le mécanisme, les gardes et les données qui n'existaient que pour elle ; ce qui sert
  encore une autre règle reste, nommé. Ainsi un mécanisme ne survit pas à la règle qu'il servait.
- **Un mécanisme se re-dérive, il ne se rapièce pas** : corriger un mécanisme nommé (la preuve du
  rouge, la file, l'intégration) repart de sa référence mature et le reprend entier, au lieu de
  poser un correctif local de plus ; une deuxième retouche du même mécanisme signale qu'il a
  dérivé, et se re-dérive ou monte au responsable. Ainsi un mécanisme suit sa référence, et non la
  somme de ses rustines.
- **L'ancien chemin qu'une exécution en vol porte encore se retire à son tour** : quand le remplacé
  ne peut pas partir dans le même commit parce qu'une orchestration en vol en a besoin pour rejouer
  son histoire (le versionnage d'un flux Temporal, `patched`), le ticket qui pose le nouveau chemin
  crée aussitôt le ticket de suppression de l'ancien, joué une fois l'ancienne histoire drainée
  (`deprecatePatch`, puis le retrait). Ainsi un chemin de transition ne devient pas permanent.
- **Un commentaire dit ce que la chose est**, au présent. Ainsi il reste vrai tant que le code ne
  change pas.

## Outils

- ⛔ **Des commandes sans invite** : tout fichier temporaire dans le scratchpad de session, ou
  dans le dossier temporaire de la séance ;
  `env -C <dossier>` ou `git -C` à la place de `cd`, et le greffon refuse une commande qui
  commence par `cd` ; une suppression passe par un script node du
  scratchpad (`rmSync` de `node:fs`) sur un chemin nommé et lu ; un signal vise seulement un
  processus que la séance a lancé. Une commande dont on doute s'écrit dans le compte rendu, sans
  se lancer. Ainsi la séance avance seule.
- **Les tests se lancent par `npm test`** : `npm test -- <chemins>` pour un lancement ciblé,
  chaque chemin écrit depuis la racine du dépôt ; `npm run test:forcer -- <chemins>` pour rejouer
  pour de vrai un test soupçonné instable. `npm run verifier` joue les gardes, le typage de chaque
  paquet et les tests ; `npm run verifier -- --gardes`, les gardes, la mise en forme et le lint. Aucun
  agent ne lance l'outil de test directement. Ce que chaque commande joue : le document des tests
  (§5.1, §5.4). Ainsi chaque test tourne avec ce dont il dépend, et une seule fois tant que rien ne
  change.
- **Les tests ne laissent rien dans le dossier temporaire** : un test crée ses fichiers et
  dossiers temporaires par l'outil de son langage, qui les retire à la fin, test rouge compris ;
  aucun chemin ne se bâtit à la main sous le dossier temporaire. Une passe de tests échoue en
  nommant ce qu'un test y laisse (le document des tests, §4.2). Ainsi le dossier temporaire,
  souvent un disque en mémoire que partagent les séances du poste, ne sature jamais.
- **Un fichier temporaire meurt avec son propriétaire** : une passe ou une séance hors ticket (la
  nuit, une vérification) écrit sous un dossier temporaire à elle, retiré à sa fin, même
  interrompue, et balayé par la suivante quand son processus est tué ; un agent écrit sous celui
  de sa séance, que donne `npx grillhouse temporaire`, vide à son départ et retiré à sa fin, même
  interrompue, comme une passe ; ce qu'un agent doit avoir pour reprendre vit dans la copie du
  ticket ou sa passation, jamais dans le dossier temporaire, qui ne porte que ce qui se refait. Le
  dossier temporaire ne tient ni copie du dépôt, ni `node_modules`, ni cache : un cache de
  compilation va sous `~/.cache/grillhouse/`. Une passe qui ne trouve pas la place de disque
  qu'elle exige attend, et dit ce qui l'occupe (le document de la machine, §5.2). Ainsi le poste ne
  sature jamais ses disques.
- **Main reste vert** : la file n'avance main que sur l'arbre que la passe finale du circuit (ou,
  hors du circuit, la vérification du lot direct) a jugé vert, le lot posé sur la pointe de main ;
  elle n'attend aucune CI de branche. La CI du projet rejoue ensuite main entier, par paquets de
  lots, au plus une fois par heure (le modèle du TAP de Google), la file la déclenchant elle-même
  après l'entrée d'un lot, sans l'attendre. Un rouge de la CI de main ou de la nuit alerte le
  superviseur avec les lots entrés depuis le dernier vert, sans arrêter la file, et ouvre un ticket
  de défaut : un rouge de main est un défaut ouvert tant que ce ticket n'est pas fermé (le document
  de l'entrée sur main, §2, §5.2). Un test connu rouge se met en quarantaine dans le test lui-même,
  avec le ticket qui le corrige. Ainsi chaque rouge a son ticket.
- **L'index d'abord** : toute recherche commence par `rtfm_search` (mode `hybrid`) pour le quoi, et
  par `codegraph explore` (ou l'outil `codegraph_explore`) pour l'appel ; le shell lit un fichier
  déjà nommé. Ainsi une affirmation sur le code repose sur ce que le code contient.
- **Tout se lit, le plan s'écrit** : dans son enveloppe, un agent lit tout le dépôt, index compris,
  prend l'outil que son travail demande, et n'écrit que les paquets que le plan de son ticket
  nomme ; la règle de son rôle se juge sur son lot, à la fin de sa séance (le document de la
  machine, §5.5). Une écriture hors du plan échoue : l'agent dit dans sa fiche le paquet qui lui
  manque, et le superviseur étend le plan ou refuse. Dans trois cas, le circuit étend le plan
  lui-même, sans question, sa pièce écrite au ticket : un fichier que la description du ticket nomme, un
  composant écarté du plan qui rougit, et les seuls fichiers de test d'un paquet lecteur que le lot
  fait rougir (le document du circuit, §5.5). Ainsi l'agent lit ce dont il a besoin, et les gardes tiennent
  l'architecture.
- Tickets : Beads (`bd`), sous le préfixe du projet, voir `docs/agents/issue-tracker.md`.
- Une compétence du cadre s'appelle avec son préfixe `grillhouse:` ; un document pour un agent
  s'écrit avec `grillhouse:writing-for-agents`.
- Réponses en français ; le code et les noms d'API restent en anglais.
