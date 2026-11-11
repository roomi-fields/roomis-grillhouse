# Les outils du cadre

Ce que font les outils du paquet `@roomi-fields/grillhouse`, que la charte commune résume pour
les agents. Chaque règle dit le comportement, et le modèle mûr qu’il suit.

**Les tests se lancent par `npm test`** (Turborepo : la construction, puis les tests) :
`npm test -- <chemins>` pour un lancement ciblé, chaque chemin écrit depuis la racine du dépôt
et joué dans son paquet avec ce dont ses tests dépendent (un autre jeu de chemins relit les
constructions du cache ; un changement de ce qu'ils importent les rejoue),
`npm run test:forcer -- <chemins>` pour rejouer pour de vrai un test soupçonné instable ; un
lancement qui ne joue aucun test échoue ; un test de nuit nommé est refusé, par son nom, et rien
ne se joue : la nuit seule le joue ; une mesure de temps (un banc de temps, un témoin de temps) se
joue quand son propre fichier est nommé, sous la mesure du temps (un dossier ou un paquet nommé
les laisse hors, comme le jour) ; aucun agent ne lance l'outil de test directement, ni Vitest ni Turborepo (les droits d'un
rôle qui écrit les refusent, `droits.mjs`). `npm run verifier` joue, après la
construction : les gardes du cadre,
celles du projet (son script racine `gardes`, un nom que le cadre réserve ; une garde juge les
fichiers de l'arbre de travail, que le cache de Turborepo compte, jamais l'index de git ; elle
écrit ses constats en SARIF, chacun avec son fichier et sa ligne, par `ecrireSarif`, que
publie l'entrée `@roomi-fields/grillhouse/resultats`, dans le dossier que nomme `GRILLHOUSE_RESULTATS`, et sans eux son rouge
ne revient à aucun composant), le typage de chaque paquet (son script `typecheck`, qui type ses
sources et ses tests, `tsc -p tsconfig.json --noEmit` du gabarit et de `npx grillhouse maj` ; la
tâche `typecheck` du turbo.json racine, que le générateur tient, attend, comme `test:unit`,
la construction du paquet, dont ses tests peuvent importer l'entrée construite, et celle de ses
dépendances, `build` et `^build`, comme `check-types` des exemples de create-turbo) et les
tests, côte à côte, avec la mise en forme et le lint du dépôt (les scripts `format:check` et `lint`
de chaque paquet, joués comme ses tâches `<paquet>#format:check` et `<paquet>#lint` du turbo.json,
que le générateur tient, et ceux de la racine, tâches `//#format:check` et `//#lint`, pour les seuls
fichiers que nul paquet ne porte ; un script absent n'est pas exigé, et leur cache ne relit que ce
qui a changé ; un rouge de style porte son paquet et revient à l'auteur du fichier) : tout ce que joue la CI, qui n'appelle que `npm run verifier` ; un rouge n'arrête
pas la passe, qui joue tout ce que ses tâches préalables permettent et nomme chaque rouge ;
`npm run verifier -- --gardes` joue les gardes, la mise en forme et le lint, ce que le relecteur
joue sur la copie du ticket (ESLint et Prettier n'ont pas de notion de lot : ils jugent le dépôt
entier). Une tâche dont
rien n'a bougé n'est pas rejouée : Turborepo relit sa sortie consignée dans son cache (« cache
hit, replaying logs »), et cette relecture vaut un lancement. Une passe se mesure contre le
dernier vert, l'arbre de la dernière passe verte de sa branche, celle de main pour une copie
qui n'en a pas encore, comme `vitest --changed` : un paquet que Turborepo rejoue joue les seuls tests que Vitest relie aux fichiers changés depuis,
et ceux qui lisent un fichier changé par son chemin (un script qu'ils lancent, une donnée qu'ils
lisent, les fichiers qu'un motif couvre, une commande de l'espace lancée par son lien ou sa
ligne de commande, avec ce que ce fichier importe et nomme à son tour, comme les `data` d'une
cible de Bazel, `vitest-config/lances.mjs`), et tous ses tests quand un changement sort du graphe de Vitest (un fichier supprimé, une
configuration, un fichier qu'aucun module n'importe, un fichier, changé ou supprimé, que lit
la construction d'un paquet dont il dépend, un chemin que ses tests déclarent lire,
`grillhouse.lit`) ; les passes d'un circuit (preuve, contrôles, passe finale), dans un projet
dont la CI se lance sur les branches de ticket, se mesurent contre la base de leur lot, le HEAD
de la copie, que main n'atteint que vert par cette CI (la variable `GRILLHOUSE_BASE_DU_LOT`,
`mesureDesPasses` de `scripts/activites.mjs`), et ciblées : les seuls tests que Vitest relie au
lot, comme `vitest --changed` ; un fichier qu'aucun module n'importe et un chemin de
`grillhouse.lit` ne rejouent ni le paquet entier ni les tests qui les lisent par leur chemin (le
`scripts/session-start.sh` de grillhouse-4nr.21 est lu par 276 des 282 fichiers de tests du
paquet, chaque test qui lance la commande lisant tous ses scripts) ; la passe complète va à la CI de la branche du ticket et à la nuit, comme la
pré-soumission de Google (TAP) ne joue que les tests qu'un changement atteint ; un projet dont la
CI n'écoute pas ces branches garde la mesure contre le dernier vert ; un seul graphe Turborepo sert tous les langages : un crate ou un projet
Python a un `package.json` à côté de son manifeste (modèle `multi-language.mdx` de Turborepo),
et le générateur du `turbo.json` écrit ses entrées de hash selon le langage que déclare
`docs/ARCHITECTURE.md` (un crate : son dossier, `Cargo.lock`, le `Cargo.toml` racine ; un projet
Python : son dossier, `uv.lock`, `pyproject.toml`), plus `grillhouse.lit`, et les variables de
`grillhouse.outils` dans `globalPassThroughEnv` ; les tests d'un crate et d'un projet Python sont
des tâches de ce graphe comme ceux d'un paquet TypeScript (grillhouse-44b.5) : `npm test` lance
`turbo run test:unit` sur les paquets du langage, le script `test:unit` du `package.json` d'un
paquet appelle la commande `tests-du-paquet` du module (nextest et les doctests, ou pytest), qui ne
relance jamais Turborepo, et le cache des tâches choisit ce qui se rejoue, sans sélection du cadre
par le dernier vert ; les chemins nommés passent à la tâche par la variable `GRILLHOUSE_TESTS` de
son `env`, qui entre dans son hash, et `--force` y porte le moment du rejeu ; aucun module de
langage ne pose le dernier vert : la passe de la vérification le pose seule, une fois, quand toutes
les tâches de tous les langages du graphe sont vertes ; la construction d'un voisin lit les entrées du `build` de son turbo.json,
lues comme Turborepo les lit (`$TURBO_DEFAULT$` : tous les fichiers du paquet, `docs/`
compris ; `$TURBO_EXTENDS$` : les entrées du `build` de la racine), et, quand elles n'en
nomment aucune, son code et sa configuration hors de son `docs/` ; jamais un test ; sans vert
connu, la passe est complète, et `npm run verifier -- --tout` la joue pour de vrai, comme la
nuit. Un fichier que le commit du vert ne suit pas vit dans le seul arbre qui l'a gardé :
absent d'une copie mesurée contre le vert de main, il n'est pas supprimé, comme Nx et
Turborepo mesurent contre un commit. Ainsi un test ne tourne qu'une fois tant que rien ne
change, et corriger un test ne rejoue que lui.

**Tout se lit, le plan s'écrit** : un agent de rôle travaille dans l'enveloppe de sa copie
(`packages/grillhouse/scripts/enveloppe/`, un bac à sable bubblewrap) ; il lit toute la copie,
index compris (`.codegraph`, `.rtfm`), et n'écrit que les composants que le plan de son ticket
nomme (les paquets du titre), la base des tickets et les sorties du module de son langage (le
cache de Turborepo ; le `target/` et les magasins de cargo, sa maison `~/.cargo` et `~/.rustup`
en lecture) ; `.git` reste en lecture seule, et la matière de test partagée s'écrit par le seul
testwriter. Le plan se juge sur les composants du module (un paquet TypeScript, un crate, un
paquet hors cadre) : un chemin du plan hors de tout composant écrit la racine, toute la copie. Le
circuit résout les composants du titre sur la même liste (`paquetsDuLangage`) : un crate racine
est le composant `.`, nommé par son crate (osc-bridge). `GRILLHOUSE_ENVELOPPE` porte la liste aux commandes du
cadre, qui construisent, jugent et écrivent ses seuls paquets. Une écriture hors du plan échoue
au montage, et le verrou de l'agent arrête sa séance en nommant le paquet ; le circuit s'arrête à
« hors-plan », une question pour le superviseur, qui étend le plan (`--etendre`) ou refuse. Comme la visibilité de Bazel et
les frontières de modules de Nx, la règle refuse et le code reste lisible ; comme
`bwrap --ro-bind / --bind`, le bac à sable n'ouvre en écriture que ce qu'il lie. Ainsi l'agent
lit ce dont il a besoin, et les gardes tiennent l'architecture (BP 320.9 : la lecture cloisonnée
causait l'essentiel des pertes).

**Une exception inattendue arrête le circuit par écrit** : comme un ordonnanceur ne meurt pas d'une
tâche (Zuul, Buildbot, GitLab CI écrivent l'erreur d'un job comme un résultat « erreur » avec son
journal), toute exception que le circuit ne prévoit pas (hors `Arret` et hors un appel mal formé)
finit sur l'arrêt `inattendu` (code 25) : l'état final porte `code` et `raison`, l'étape reste celle
où l'exception est tombée, l'arrêt est commenté au ticket, et la question au superviseur porte le
message, la pile, l'étape et la commande qui reprend (`npx grillhouse circuit <ticket> --reprendre`).
Il vaut avant la première séance, `--reprendre` compris, même quand le contexte ne se construit pas
(la lecture de la copie qui échoue). Le circuit ne se relance jamais seul : si la cause persiste,
`--reprendre` écrit de nouveau le même arrêt. La frontière tient à l'endroit : la lecture de la
copie que fait le circuit juste après la séance du testwriter ou du développeur (`rougeDeLecture`,
par l'appel commun du module de langage, `langageDe`, quel que soit le langage) est un rouge rendu
à cet agent avec la sortie de l'outil, qui consomme une tentative comme une construction rouge et,
les tentatives épuisées, monte à `controles` ; toute autre lecture qui échoue est `inattendu`.

**Les outils du projet se déclarent** : comme Bazel déclare ce qu'une action voit hors de son bac
à sable (`--sandbox_add_mount_pair`) et l'environnement qu'elle reçoit (`--action_env`), un projet
déclare ses outils hors du dépôt dans `grillhouse.outils` de son `package.json`
(`{ "<VARIABLE>": "<chemin>" }`, un chemin absolu ou sous `~`), lue en un seul endroit
(`packages/grillhouse/scripts/outils-cles.mjs`), toujours dans l'arbre principal, jamais dans une
copie : un agent ne s'ouvre pas un chemin pour sa séance suivante. L'enveloppe monte chaque chemin
en lecture seule, avant la copie et ses paquets en écriture, et passe chaque variable à la séance ;
les passes du circuit (environnementDeLaPasse : preuve, contrôles, passe finale, régénération des
références), `npm run verifier` et la nuit jouent avec les mêmes variables, prises de la clé, quel
que soit l'environnement de leur lanceur. Un outil ne défait jamais l'enveloppe : un chemin est
refusé, sa variable et son chemin nommés, quand il est `/`, la maison ou un chemin qui la contient,
un chemin qui contient un montage de l'enveloppe (l'arbre principal et ses copies, `/tmp` et les
dossiers temporaires, `~/.claude`, le bloc-notes, le cache npm, les dossiers de séance), ou un
chemin sous un dossier caché de premier niveau de la maison (`~/.ssh`, `~/.gnupg`, `~/.aws`,
`~/.config`…), où la machine garde ses identifiants, sauf `~/.local` et `~/.cache`, ou un
chemin sous le trousseau `~/.local/share/keyrings` ou qui le contient ; un lien se juge aussi
par sa cible, que l'enveloppe monte avec lui. Une clé fautive
(une valeur qui n'est pas une chaîne, un nom de variable invalide, un chemin refusé ou absent) est
refusée par son nom avant tout travail :
le circuit s'arrête à « lancement », l'enveloppe, `verifier` et la nuit refusent. Ainsi le
développeur joue les tests qu'il doit rendre verts avec l'outil que voient les contrôles (SyntHub,
SH-cgi.8 : son Python, donné par `SYNTHHUB_PYTHON`, n'existait pas dans l'enveloppe).

**Les données d'un paquet se déclarent** : comme les `data` de Bazel (`data = ["//crates/service:synthhub"]`),
un paquet déclare la sortie d'un autre paquet que ses tests lancent dans `grillhouse.donnees` de son
`package.json` (`{ "<VARIABLE>": "<paquet>#<sortie>" }`), à côté de `grillhouse.outils`, et inscrit
le fournisseur dans ses `devDependencies` : Turborepo construit le fournisseur avant les tests du
consommateur (`^build`, dont le hash suit les sources du fournisseur), même hors du plan ; un
`npm test -- <chemin dans le paquet>` le construit lui-même d'abord (`turbo run build`), puis
contrôle le binaire et passe la variable à tout chemin du paquet. La variable
porte le chemin absolu de la sortie construite, lue en un seul endroit
(`packages/grillhouse/scripts/donnees-cles.mjs`) : le module du langage du fournisseur le donne
(`sortieDuPaquet` ; pour un crate, un binaire de `cargo metadata` dans son dossier des cibles, sous
`release` quand le script `build` du fournisseur porte `--release`, `debug` sinon ; un autre langage est
refusé, « sortie non prise en charge pour <langage> »). Les passes du circuit, `npm run verifier`, la
file, l'intégration, l'enveloppe et la nuit la passent comme les outils ; le générateur du `turbo.json`
l'écrit dans `globalPassThroughEnv` (sans l'entrer dans un hash), et la garde des passages refuse
un `turbo.json` qui ne la nomme pas. Une clé fautive (valeur hors de la forme `<paquet>#<sortie>`,
paquet inconnu, fournisseur absent des `devDependencies`, sortie que le fournisseur ne produit pas)
est refusée par son nom avant tout travail ; un binaire absent après la construction fait échouer le
lancement des tests du consommateur, la variable et le chemin nommés. Ainsi les tests d'un paquet
d'un langage lancent ce que construit un paquet d'un autre (SyntHub, SH-ae6.5.14.6 : le service Rust,
hors du plan, n'était pas construit pour les tests Python).

**Un paquet naît hors du circuit, en quatre temps** : un squelette n'a ni comportement ni test,
et le circuit travaille un paquet qui existe (il refuse un titre qui nomme un paquet absent du
disque, `resoudreComposant` de `circuit.mjs`). Le grill tranche le paquet (1) ; le superviseur
écrit sa ligne du tableau des composants, son langage compris, et ses documents (2) ; `npx
grillhouse paquet <chemin>` (`scripts/paquet.mjs`) le bâtit, sans agent (3) ; son code part en
ticket ordinaire (4) ; 2 et 3 entrent dans un même commit, après une vérification verte. Comme
les générateurs de Nx (`nx g @nx/js:lib`, après `nx add` qui installe les outils d'un greffon),
`turbo gen workspace` et `cargo new --lib` ajouté aux membres de l'espace de travail, la commande
lit la ligne qui nomme le chemin (par son chemin, sinon par le nom du dossier, comme la garde des
langages) et refuse, par son nom, sans rien écrire : un chemin qu'aucune ligne ne nomme, une ligne
sans langage, un langage hors de la liste du cadre, un dossier qui porte déjà le manifeste de son
langage ; un dossier qui ne porte que `docs/` est accepté, comme `cargo init` prend un dossier sans
son Cargo.toml. Le squelette refuse de même un nom qui heurte celui du langage, le nom à donner
nommé : en Python, un module de la bibliothèque standard (`sys.stdlib_module_names`, de
l'interpréteur que fournit uv), en Rust, un nom que `cargo new` refuse (un mot-clé, `test`) ou
déconseille (un crate de la bibliothèque standard, `std`, `core`), cargo seul juge. Le nom d'un paquet Python est celui du dossier préfixé par le nom du projet quand la
racine en déclare un (le `[project].name` de son pyproject.toml, sinon le `name` de son
package.json, sa portée s'il en a une), comme le module typescript préfixe le sien par la portée de
la racine. Elle écrit chaque fichier absent du squelette du langage (`squelette` du module :
le manifeste, la configuration des tests et du typage, un fichier de code, le dossier de tests) et
des documents du gabarit d'un paquet (`templates/paquet/`), puis l'entrée de l'espace de travail
(les `workspaces` de npm, les `members` de cargo, l'espace de uv) ; elle ne commite rien. Puis,
comme `nx add`, les outils du langage : la part de la mise à jour de chaque langage déclaré
(`mettreAJour`), `npm install` quand elle le demande, les commandes du module qui accordent le
verrou des versions au paquet neuf, dans leur ordre, les binaires, et les générateurs, ceux du langage du paquet quels que
soient les fichiers du projet. Ainsi le premier paquet d'un langage arrive avec ses outils, et
main ne voit jamais un paquet déclaré sans dossier (OSC Bridge, SyntHub SH-13y.6 : un premier
paquet TypeScript dans un projet Rust, l'index des interfaces et la carte des frontières « pas à
jour », knip illisible, « Turborepo sort en null »).
Un dossier qui porte déjà du code est repris tel quel, comme `cargo init` reprend le code en place
et `uv add -r` les dépendances qu'un fichier déclare : le noyau passe au module les fichiers du
dossier, et le module garde chacun, déclare ce qui doit l'être, ou refuse, par son nom et sans
rien écrire, ce qu'il ne sait pas reprendre, ce qui manque nommé (`squelette`, `INTERFACE.md`). En
Python, ses tests se collectent là où ils sont et chaque `requirements.txt` entre dans ses
dépendances ; en Rust et en TypeScript, du code hors de la disposition du module est refusé au
lieu d'un squelette posé à côté. Ainsi un paquet né sur du code existant garde ses tests et ses
dépendances (OSC Bridge, SyntHub, 0.28.3 : `site/`, ses tests sous `pages/` jamais collectés,
`ModuleNotFoundError: markdown`).

**Le circuit fait les gestes, une vraie question monte** : comme une CI applique ses règles
(rejouer, régénérer, sauter une tâche sans objet) sans demander et n'appelle une personne que pour
ce qu'aucune règle ne tranche (l'approbation d'une revue), le circuit d'un ticket
(`packages/grillhouse/scripts/circuit.mjs`) fait lui-même, sans séance, les gestes que la liste des
étapes écrit (`GESTES` de `packages/grillhouse/scripts/etapes.mjs`) : une commande à 75 rejouée une
fois, la fin à 75, le renvoi au testwriter que la fiche du développeur nomme (sa raison, sa
passation et, comme une CI rend le journal de la vérification qui échoue, la sortie rouge des
derniers contrôles quand des contrôles ont tourné depuis la séance du testwriter, gardée dans
l'état du circuit pour une reprise ; seule la même sortie deux fois de suite arrête le circuit),
la régénération des
références, un développeur sans rien à livrer jugé par les contrôles, un ticket mécanique mené sans
testwriter ni développeur ; chaque geste s'écrit au ticket et au
journal avec sa règle. Tout autre arrêt finit le circuit sur une question au superviseur (`MONTEES`),
que l'état du circuit porte : le fait, sa pièce (`fichier:ligne`, ou la commande et sa sortie), la
question, et qui doit répondre, le superviseur ou le responsable ; le superviseur répond par une
commande du circuit (`--reprendre`, `--depuis`, `--etendre <paquet>`, `--arreter`). Ainsi aucune
séance ne juge un geste qu'une règle tranche (BP 320.9 : 67 séances d'arbitrage et de réponse
au plan, 14 montées qui étaient des gestes).

**Un critère non tenu n'est jamais fait** : comme un contrôle obligatoire d'une intégration
continue bloque la fusion d'un changement qui ne le passe pas, la fiche du développeur nomme
chaque critère qu'il ne tient pas faute d'un paquet hors du plan (`hors_plan` : son numéro, ce
paquet, sa pièce) ; une fiche FAIT qui en porte un arrête le circuit à 3 Code (`hors-portee`), la
question nommant chaque critère et son paquet, et le superviseur étend le plan (`--etendre
<paquet>`) ou amende le critère puis `--reprendre`. Ainsi un critère manquant monte avant les
passes finales (BP 320.17 : « critère 10 hors plan, non fait » dans trois passations, que le
circuit ne lit pas, tombé à la relecture après 25 min de passes finales).

**La régénération d'office** : comme les genrules de Bazel et `--update-snapshots`, un fichier
engendré se réécrit par sa commande, puis le circuit rejoue seulement ce qui en dépend. Une passe
finale dont un rouge est celui d'une référence, mêlé ou non à d'autres, régénère les références
qu'il nomme (4.2), puis rejoue la passe finale restreinte à ce que la régénération change ; les
autres rouges restent, chacun à son propriétaire. Des contrôles du plan où rougit une référence,
mêlée ou non à d'autres rouges, la régénèrent avant qu'aucun rouge n'aille au développeur, comme
Bazel construit une genrule avant les tests qui la lisent : mêlés à d'autres rouges, les contrôles
du plan rejouent sur l'arbre régénéré, qui juge un test lisant la référence (BP 320.6.5 : un test
qui lit le hachage que déclarent les `turbo.json`, rouge à côté de leur garde, envoyé à un
développeur qui n'avait rien à livrer, puis ne pouvait pas les écrire) ; seuls, la passe finale
due joue une fois, sur l'arbre régénéré. Aucune ne régénère de nouveau une référence régénérée
sur ce même arbre (BP 320.3.9 : le plafond des mots, rouge aux contrôles, laissé à une passe
finale qui rejouait les mêmes tests sur le même arbre, 6,1 min). Les références sont celles que le projet déclare
(`grillhouse.references`) et celles du cadre, dans chaque projet (`referencesDuCadre` de
`circuit.mjs`, les fichiers que le module du langage engendre, `fichiersEngendres`) : l'index des
interfaces, les `turbo.json` des paquets et les rapports d'API, chacun
réécrit par son générateur, et la dette des gardes. Une référence, du projet comme du cadre, se
régénère sans que le plan la nomme, comme une genrule, et le relecteur lit sa différence. Comme
make refait une cible avec celles qui dépendent de ses sorties, chaque référence déclare ce
qu'elle lit d'une autre (`lit`) : une commande qui écrit un fichier qu'une autre lit la fait
jouer après elle (l'index des interfaces après les rapports d'API, qui écrivent la part générée
des `docs/INTERFACE.md`). Un arrêt de la régénération (une commande en échec, un fichier
qu'aucune référence n'écrit) porte ses écarts dans sa question et au ticket (BP 320.3.2.1 : l'index
oublié après les rapports d'API, un plafond refusé faute d'être nommé au plan, la liste des écarts
retrouvée en trois commandes). Le circuit ne lit pas
le code de sortie d'un générateur du cadre, qui juge aussi les rouges qu'il laisse (`npm run api`
refuse à côté d'eux) : il juge la régénération sur ce qu'elle écrit, puis sur la passe restreinte
qui suit, et seule une vraie panne l'arrête (la commande introuvable, ou tuée par un signal). La dette s'abaisse depuis les notes de la passe finale (une note
`a-elaguer` du SARIF d'une garde, chaque clé inscrite au-dessus de ce qu'elle trouve), par
`dette.mjs --abaisser`, sans rejouer les gardes. Un plafond ne monte jamais : un lot qui le dépasse
reste rouge. Ainsi aucun fichier engendré n'attend une main (BP 320.9 : 292 min autour des
références, dont 163 d'attente).

Comme `--update-snapshots` et `rustc --bless`, la régénération ne réécrit que ses sorties : un
constat d'une garde d'une référence du projet sur un fichier du plan que ses fichiers ne couvrent
pas vise le code du lot, et va au développeur, aux contrôles du plan comme à la passe finale ; son
constat sans fichier, ou sur un fichier qu'elle couvre, reste à la régénération. Une commande du
projet qui refuse, seul écart d'une régénération que demande une passe finale porteuse de rouges du
plan, juge le lot : la copie rendue telle qu'avant elle, ces rouges vont au développeur avec la fin
de sa sortie, dans la limite de ses séances. Ainsi le développeur reçoit le refus de son code (BP
320.10 : un mot de librairie écrit dans 030-binder, absent des trois rapports « Tes rouges », puis
un arrêt `references` sur « le plafond ne monte pas »).

**Un fichier engendré se régénère à l'intégration** : comme une genrule de Bazel réécrit sa sortie
sur l'arbre fusionné, et `npm install` le `package-lock.json` après une fusion, l'intégration
n'applique pas du lot un fichier qu'une référence écrit en entier (`entiers` : l'index des
interfaces, les `turbo.json` des paquets) ; elle rejoue la référence qui l'écrit dans la copie
d'intégration, sur main à jour, après l'installation et avant la vérification, et ce qu'elle écrit
entre dans le commit. Le circuit lui passe les références du cadre (`--references`), tirées de
sa seule liste. Un projet déclare les fichiers engendrés qu'il garde commités (une page lue sur
GitHub, une somme de contrôle publiée) sous `grillhouse.engendres` de son `package.json`
(`{ "<nom>": { "commande": "<ligne du shell>", "fichiers": ["<motif>"], "lit": ["<motif>"] } }`),
lue à côté des fichiers engendrés du module du langage, dans la même forme, toujours dans l'arbre
principal (`packages/grillhouse/scripts/engendres.mjs`) ; une clé sans commande, sans fichiers ou
avec un motif hors du dépôt est refusée par son nom avant tout travail, comme `grillhouse.outils`.
L'intégration, la file qui replace une branche sur main et l'avance d'une copie sur main
(`travail-de-la-copie.mjs`, comme le report d'une branche renvoyée) ne fusionnent pas ces
fichiers : un lot qui touche l'un d'eux ou ce qu'il lit prend la version de main, puis la commande
rejoue hors de l'enveloppe, avec les outils du projet, sur le lot appliqué, et ce qu'elle écrit
entre dans le lot ; la passe finale (4.2) ne les régénère que si un rouge d'une passe tombe
dans leurs fichiers. L'intégration régénère aussi une référence du cadre dès que le lot touche ce
qu'elle lit : l'index des interfaces se refait quand un `INTERFACE.md` change. Un conflit sur tout autre fichier
refuse le lot ; une commande en échec, sa commande et sa sortie nommées, ou un fichier changé
qu'aucune référence rejouée n'écrit, aussi (OSC Bridge, 2026-10-31 : quatre conflits en un jour
sur les fichiers engendrés de synthhub et d'open-synth-descriptors, chaque copie avancée à la
main). Les rapports d'API, qui lisent la construction, et la
dette, qui lit les notes d'une passe, ne s'écrivent pas en entier : ils s'appliquent comme le reste
du lot. Ainsi deux tickets qui régénèrent le même index s'intègrent l'un après l'autre (BP 320.30 :
refusé deux fois sur le seul index des interfaces, régénéré sur main entre-temps, levé à la main).

Comme SARIF 2.1.0 et GitHub code scanning, seul un constat de niveau `error`, le niveau par défaut,
est un rouge : un avertissement (`warning`) ou une note (`note`) n'entre ni dans « Tes rouges » ni
dans le compte des rouges, aux contrôles du plan comme à la passe finale ; le rapport des contrôles
les liste à part, sous « Les avertissements », sans les donner au développeur. Une tâche de gardes
rouge sans aucun constat `error` garde sa ligne de tâche rouge et son journal. Ainsi un avertissement
reste visible sans arrêter un lot (BP 320.17 : 8 avertissements sur le code du plan donnés au
développeur comme rouges, un arrêt `sans-livraison` à 3 Code, quand le seul `error` visait le
plafond, à régénérer).

**L'explorateur écrit le plan, questionné une fois** : comme l'auteur d'une RFC l'écrit après
avoir relevé l'existant, qu'une revue la lit une fois, que l'auteur répond une fois et que ce qui
reste ouvert va à qui décide, l'étape 1 du circuit (1 Plan) lance l'explorateur hors de
l'enveloppe ; il relève les composants (`npx grillhouse composants-affectes <ticket>`) et finit sur
sa fiche : les critères, les paquets à toucher, les composants du relevé qu'il écarte avec leur
raison, ses questions ouvertes avec leur pièce et leur motif, pourquoi chacune monte (le langage,
l'architecture, un écart à la référence, ou « sans réponse ») : une question sans motif rend la
fiche non conforme, redemandée une fois à la même séance (BP 328 : une question que le ticket
tranchait arrêtait le plan). Le circuit rejoue le relevé sur le plan, sans
séance, comme il contrôle les paquets : un composant du relevé ni touché ni écarté rend la fiche
non conforme, comme la section des composants touchés d'un document de conception dit pour
chacun s'il change, ou pourquoi il reste. Le circuit
écrit le plan au ticket : les paquets finissent son titre, la seule liste que lit l'enveloppe de
chaque séance d'après. Le questionneur le lit une fois ; l'explorateur, sa séance
reprise, répond une fois, CHANGE ou GARDE par question, une ligne par question posée : une fiche
sans elle lui est redemandée une fois avec les numéros qui manquent, comme le relecteur donne une
ligne à chaque élément du lot ; ce qui reste ouvert monte au superviseur
(« questionnement »), sinon le circuit passe aux tests. Un plan passé ne se rejoue que si son
titre ou ses critères changent. Ainsi les questions utiles se posent avant
le plan, et le plan ne tourne pas en rond (BP 320.9 : 132 tours de questions, 29 critères dont 2
utiles).

**Le relecteur juge chaque élément qui change** : comme API Extractor fait relire son rapport
ligne par ligne et qu'une revue mûre exige un avis par fichier changé, le circuit donne au
relecteur la liste de chaque fonction, classe, type, interface, constante de tête et export que
le lot ajoute, change ou supprime (`scripts/langages/typescript/elements-du-lot.mjs`), avec son paquet, son
`fichier:ligne` et s'il est exporté : le service de langage de `references-par-les-types.mjs` lit
les déclarations et les exports, le texte de chaque déclaration avant et après le lot dit ce qui
change, le diff des rapports d'API (`docs/INTERFACE.api.md`) les exports qui changent. Sa fiche
rend une ligne par élément (`conformite`), conforme ou non, la règle citée (`document` CADRE,
INTERFACE ou ARCHITECTURE, et sa `reference`) ; un export neuf cite son entrée dans l'INTERFACE.
Le schéma de la fiche refuse une ligne sans document ni référence (`resultats.mjs`), et le
circuit une fiche à laquelle il manque un élément, ou dont une ligne nomme un élément hors de la
liste (`conformiteDuLot`) ; un « non » rend le lot à son destinataire. Un fichier que le service de
langage ne lit pas, la liste le nomme : le relecteur en relève lui-même les éléments, une ligne
chacun, `<fichier>#<nom>`, ou le fichier seul. Comme une revue GitHub ou Gerrit accepte un
commentaire sur toute ligne de tout fichier modifié, une ligne sur tout fichier que le lot
modifie, un document ou un texte compris, s'accepte de même, sans qu'un document modifié en
exige une ; une ligne sur un fichier que le lot ne modifie pas reste refusée (BP 320.17 : une
fiche du relecteur refusée pour ses lignes sur un INTERFACE.md, un CADRE.md et un plafond du
commit, une séance Opus reprise). En relecture bornée, comme une revue ne décoche « vu » que sur les fichiers
changés depuis, la consigne marque chaque élément : à rejuger quand la différence le touche,
repris sinon avec sa ligne d'avant, que la fiche porte encore. Ainsi rien de neuf n'entre sans
avoir été jugé contre l'architecture (Romain, 2026-10-23 : « il faut que le relecteur valide
vraiment la conformité à l'architecture de tout ce qu'il y a de nouveau/changé »).

**Un geste mécanique sort du circuit de code** : comme les grands changements de Google (Rosie,
ClangMR) laissent un outil faire le changement que la vérification et une relecture jugent, sans
test neuf, comme Renovate monte une dépendance et `nx migrate` un cadre, la fiche du plan porte la
sorte du ticket (`sorte` de `resultats.mjs`, lue par `sorteDuPlan`) : `mécanique`, un geste sans
comportement neuf, avec sa raison et sa commande ; `comportement`, avec sa raison, `inchangé`
quand le lot ne change aucun comportement que ses tests mesurent. Le circuit l'écrit dans la
description (« ## Sorte », après les critères) et au ticket avec le plan. Un ticket mécanique
saute 2 Tests, 2.1 et 3 Code (le geste `mecanique`) : à 1.1 Geste mécanique, une séance de
l'explorateur, dans l'enveloppe du plan (`lancer.sh --fiche geste`, le neuvième gabarit), joue la
commande dans la copie et finit sur son statut (le schéma `geste`) ; puis 3.1 Contrôles, la passe
finale, la relecture et la file. Tant qu'aucun testwriter ni développeur n'a travaillé le lot
depuis le plan et qu'aucun `--depuis` ne l'envoie à un agent (`cheminMecanique`), un geste qui ne
change aucun fichier du plan s'arrête à `sans-livraison`, un rouge des contrôles qu'aucune
régénération ne lève à `controles`, un `RENDU` à `relecture-arret` (`arretDuGesteMecanique`) : le
superviseur fait corriger le lot (`--depuis developpeur`), joue le geste corrigé dans la copie
puis `--reprendre`, qui ne rejoue pas un geste que la copie porte déjà, ou arrête. Une preuve sans
rouge, sans constat ouvert pour le développeur, passe aux contrôles sans lui (`apresLaPreuve`) ;
sous un plan « comportement inchangé », comme dans un grand changement de Google, la suite
existante fait la preuve : rien n'a à rougir et chaque vert du lot passe, seul un fichier du
lot qui ne se charge pas refuse la preuve (`preuveReussie`) ; la liste `portent_le_travail` du
testwriter se remplace à chaque fiche (`portentLeTravail`) : un champ absent garde la liste de la
fiche d'avant, une liste donnée la remplace, `[]` la vide ; un fichier que seule la nuit joue
(test de nuit, banc ou témoin de temps) est mis de côté avant la preuve
(`separerLesFichiersDuJour`), nommé dans la section « Mis de côté (joués par la nuit seule) » du
rapport, ni compté « ne se charge pas » ni exigé rouge : le rouge prouve le comportement que le
ticket développe, et un banc se joue la nuit (décision du responsable, 2026-11-03) ; un lot dont
les seuls fichiers de test sont hors du jour passe donc la preuve ; un test unitaire cargo sous
`src/` (`tests.rs`, `src/**/tests/`) que le lot touche est joué, rapporté sous son propre fichier,
sa version de HEAD comprise ; puis le développeur écrit le code
(une réorganisation a du code), même sans rouge, avant les contrôles et la relecture
(`apresLaPreuve`). Une sorte absente, hors de ses valeurs, sans sa raison, ou mécanique sans sa
commande, vaut `comportement` : le circuit entier. Ainsi un geste sans comportement neuf ne coûte
ni testwriter ni développeur (BP 320.16 : 38 outils déplacés par mv, 117 commentaires ; 320.40.1 :
une variable inutilisée, 4 séances ; si61.8 : un seuil 77 → 95, 2 séances « aucun code à livrer »).

**Le plan fixe les noms publiés** : comme l'approbation d'un propriétaire de code (CODEOWNERS)
porte sur ce qu'il a relu, la fiche du plan porte les noms qu'un composant publie à un autre et
que le lot ajoute aux lignes « Consommateurs » de l'INTERFACE du fournisseur (`noms_publies` de
`resultats.mjs` : le fournisseur, chaque consommateur, ses noms). Le circuit les écrit dans la
description (« ## Noms publiés », après la sorte), réécrite à chaque plan depuis la dernière fiche
(une liste vide l'efface ; une fiche sans le champ garde la section que la description porte,
celle qu'un superviseur a écrite à la main comprise), et la garde des consommateurs (`consommateurs-arbitres.mjs`), qui lit cette section, laisse entrer
ces lignes sans arbitrage ; un nom que le plan ne publie pas reste refusé. Ainsi le développeur
écrit les lignes que le plan fixe sans arrêt ni geste du superviseur (BP 320.14.2.10, 320.28,
320.6.5 : un critère seul nommait les noms, la garde refusait le lot, et le superviseur écrivait
la section à la main avant une nouvelle séance).

**Un circuit par ticket** : comme une demande de fusion (un auteur, une série de tests et de
code, une CI sur l'ensemble, une revue), le circuit lance un seul testwriter et un seul
développeur pour tout le ticket, chacun dans l'enveloppe de tous les paquets du plan, puis la
passe finale et le relecteur sur l'ensemble ; aucun composant n'est une unité du circuit. Les
étapes (`packages/grillhouse/scripts/etapes.mjs`) : 1 Plan (1.1 Geste mécanique) · 2 Tests · 2.1 Preuve du rouge ·
3 Code · 3.1 Contrôles · 4 Passe finale et relecture (4.1 Passe finale, 4.2 Régénération des
références, 4.3 Relecture) · 5 Intégration (5.1 Commit, 5.2 File, 5.3 Tri des découvertes). `--depuis <testwriter|preuve|developpeur|controles|passe-finale>` rejoue
cette étape et les suivantes, sans rien relire (aucune empreinte gardée). **La reprise à l'étape qui porte le rouge**
(`scripts/reprise.mjs`, 4nr.14) : comme « Re-run failed jobs » de GitHub Actions, un rouge de contrôles ou de passe finale
se reprend à son étape, sans `--depuis`. Le circuit attribue le rouge par la sortie de l'étape rouge (`attribuerLeRouge` :
le paquet et le fichier que chaque rouge nomme, contre les fichiers de test du lot que porte le testwriter et les autres
fichiers du plan que porte le développeur) : un fichier de code ou un test qui échoue va au développeur, un fichier de test que refuse une garde ou le style au testwriter (l'étape
la plus tôt, le développeur rejouant après), un rouge de tâche d'un paquet du plan sans fichier nommé (lint, mise
en forme, typage, construction) au développeur, comme un job rouge d'une CI revient à son auteur (décision du responsable
sur grillhouse-4nr.14.1) ; un autre rouge sans fichier nommé ou un fichier que personne ne porte monte au
superviseur, jamais deviné. Un rouge de passe finale dû à un seul fichier de test rejoue ce fichier (séance du testwriter
bornée à lui, preuve de lui seul), puis les contrôles et la passe finale restreints à sa portée (le paquet du fichier dans
le graphe de Turborepo, les tests que Vitest relie à lui), sans séance du développeur ni du testwriter pour le reste du lot.
**Une étape inchangée se relit** comme une tâche de Turborepo dont les entrées n'ont pas bougé (`scripts/empreinte-d-etape.mjs`, hachage de node) : l'empreinte d'une étape
(preuve, contrôles, passe finale) est le hachage de sa commande et du contenu de ce qu'elle lit (les paquets du plan et leurs
dépendants par le hachage d'entrées des tâches de tests de Turborepo, les fichiers du plan, la configuration de la racine) ;
le circuit la garde, avec la durée du vert, par étape finie verte dans son mémoire (`verts`, que le Continue-As-New et
une reprise conservent) ; une étape à l'empreinte de son dernier vert ne se rejoue pas, son résultat se relit et le ticket le
dit, une entrée changée, même dans un dépendant ou la configuration, la rejoue, et un rouge ne laisse pas son étape en
dernier vert. La preuve du rouge ne se relit que si ni ses tests ni le code qu'ils exercent n'ont changé. Le bilan compte
à part, par étape, la durée rejouée après un rouge et celle relue sans rejouer. `--etendre <paquet>` ajoute un paquet au plan, puis reprend
l'étape en cours, celle du testwriter après un arrêt sur un renvoi du développeur vers lui. Comme
une file de fusion (GitHub merge queue, bors, Zuul) renvoie le lot à son auteur avec le journal de
sa vérification, et ne le laisse repasser qu'avec un changement, `--depuis developpeur` après un
refus de l'intégration repart du développeur, le refus comme le rouge à lever ; une séance ainsi
lancée qui ne change aucun fichier du lot refusé ne va pas aux contrôles de la copie, qui ne
voient pas ce rouge : le circuit la relance une fois avec le refus, puis s'arrête en
`sans-livraison`. `--reprendre` rejoue l'intégration (ou la file) sur le même lot, comme bors
rejoue un lot : un refus peut venir de main (BP 320.16, 320.16.2) ; après une CI rouge de la
branche, main n'a pas bougé et `--reprendre` renvoie la branche à la file, qui juge le dernier
essai de sa CI, comme une file de fusion : un rejeu vert (`gh run rerun <id> --failed`) la fait
entrer, un rouge laisse le ticket ouvert sur le rouge nommé (OSC Bridge OB-20q.3) ; `--depuis
testwriter` refait le lot et oublie le refus (BP 320.37 : trois fois « FAIT » sans un fichier changé, les contrôles de la copie
verts, l'intégration rouge sur le même lot). Un constat bloquant du relecteur va droit à l'agent qu'il nomme et reste ouvert
d'une relance à l'autre, comme un fil de revue non résolu, jusqu'à ce que le relecteur le dise
levé. Comme Gerrit reporte les commentaires non résolus sur chaque jeu de correctifs, toute
relecture reçoit les constats encore ouverts, bornée ou entière (le rejeu du lot en conflit, une
relecture d'avant sans sa base : `relectureEntiere`), et juge chacun levé ou non levé dans
`suivi` ; le circuit refuse une fiche sans ligne pour l'un d'eux, ou un ACCEPTÉ qui en tient un
non levé (`suiviDesConstats`). Ainsi un ACCEPTÉ ne ferme que des constats vérifiés
(grillhouse-527.1.1). Comme une CI échoue vite sur une étape qu'elle ne peut pas jouer, un
`RENDU` dont un constat va au testwriter quand le plan le saute (aucun paquet du plan ne joue de
tests) arrête le circuit dès ce verdict, en `relecture-arret`, sans relancer ni le testwriter, ni
le développeur, ni les contrôles ; la question au superviseur nomme le constat et le plan :
déclarer les tests du paquet au cadre, ou trancher le constat (`arretDuTestwriterSaute` ; OSC
Bridge SH-13y.1 : trois `RENDU` « Agent : testwriter » sur un paquet dont les tests en Python
ne se jouent qu'en CI, le développeur relancé trois fois sur un lot inchangé, 30 min perdues).
Comme l'auteur répond dans chaque fil d'une revue GitHub ou Gerrit, la
fiche FAIT du développeur répond à chaque constat ouvert pour lui, par son titre, sans le
numéro « Constat N — » que la consigne lui donne, numéro que le circuit reconnaît aussi, comme
une revue rattache la réponse à son fil par son identifiant (`cleDuConstat`) (`reponses` :
`levé` avec sa pièce, ou `contesté` avec sa raison et sa pièce) ; le circuit refuse une fiche à
laquelle il en manque une (`reponsesAuxConstats`). Quand le superviseur relance avec son
contexte (`--contexte`, ou la question que `--etendre` y verse), comme une revue que son auteur
relance sur un changement qu'il cadre, la consigne porte ce contexte en tête, comme la tâche,
avant le ticket, le rapport et les constats ; les constats ouverts au lancement de la passe
(`enContexte`, `auLancement`) sont donnés en contexte, sans réponse exigée, et ceux qu'un
`RENDU` pose dans la passe restent la tâche, leur réponse exigée (`constatsDeLaSeance`,
BP 320.14.2.3 : le contexte après la règle des réponses, une séance qui ne travaille qu'un
constat ancien, sa fiche refusée, deux fois `sans-livraison`). Le circuit garde chaque réponse avec son constat, et la
relecture suivante la lit sous lui (BP 320.21 : la cause de son choix dans une passation que le
circuit ne lit pas, « la relecture n'a reçu aucune fiche du développeur », trois `RENDU`, puis
l'arrêt). Le bilan compte par étape et par rôle. Ainsi un type change avec ses
lecteurs en une seule séance, et un constat n'est jamais perdu (BP 320.9 : seize composants
joués l'un après l'autre, 118 min d'étapes vertes rejouées, un constat sur `exemplar` perdu six
fois).

**Une passe juge le lot sur la pointe de main** : comme la file de fusion de GitHub et bors
rejouent les contrôles sur la branche replacée sur la pointe de main, jamais sur sa base
d'origine, le circuit prépare sa copie sur main avant chaque passe qui juge le lot, 3.1 Contrôles
et 4.1 Passe finale, une reprise comprise (`avantLaPasse`, `SUR_LA_POINTE`). La préparation est
celle du lanceur, la seule (`travail-de-la-copie.mjs`, `preparer`, que `lancer.sh` appelle avant
chaque séance) : la garde des sous-modules, l'avance de la copie, la pose des sous-modules, leur
montage, et l'installation quand le fichier de verrouillage est plus récent qu'elle (BPScript :
le verrou changé 27 fois en deux semaines, et le sous-module vendor/bp3-engine). Une copie déjà
sur la pointe de main, ou en avance sur elle, n'avance pas ; une copie qui avance rejoue la passe due sur son nouvel
arbre, sans la restriction d'une régénération d'avant. L'avance applique le travail de la copie
fichier par fichier (un `git apply --3way` par fichier) : un fichier en conflit garde ses
marques, un fichier que git refuse sans marques (la suppression d'un fichier que main a changé)
reste seul dans le lot gardé, les autres s'appliquent. Les fichiers en conflit ou au lot vont,
comme Gerrit rend un conflit de rebase à l'auteur, au rôle qui les écrit (le geste
`conflit-de-l-avance` de `GESTES`, `estUnTest` du module du langage) : le testwriter pour un test
ou la matière de test partagée, le développeur pour le code, le testwriter d'abord. La séance du
rôle relancé revient à la passe, pas à l'étape qui suit son rôle : la passe revoit la copie (les
marques cherchées aussi dans les fichiers du conflit, l'index dût-il ne plus les dire en conflit)
et relance l'autre rôle tant qu'un de ses fichiers les garde, si bien qu'aucune construction ne
joue sur un fichier marqué ; le lanceur
accepte la séance du rôle qui écrit au moins un de ces fichiers (`preparer --role`). Une
préparation qui échoue autrement (un conflit que la seconde séance du rôle ne lève pas, une
branche partie de main, un sous-module ou une installation en échec) arrête le circuit en
`lancement`, avant la passe : sa question nomme la copie, chaque fichier en conflit et le geste
qui reprend (la copie remise en état à la main, puis `--reprendre`), le travail resté dans la
copie. Ainsi le circuit ne monte pas une question qu'un correctif déjà sur main a levée (OSC
Bridge SH-cgi.8.2 : la passe finale et sa reprise rouges sur deux rouges que main avait levés en
65a1f5b, la copie restée sur bc721aa).

**Chaque version du lot se prend contre la pointe de main de son temps** : comme Gerrit compare
deux jeux de modifications chacun contre sa base, le circuit garde chaque lot avec sa base, la
tête de la copie quand il le garde (`garderLeLot`, `lot: { commit, arbre, base }`). Après une
avance entre deux relectures, le lot relu se rejoue sur la nouvelle tête (`leLotSurLaBase`,
`git merge-tree --write-tree --merge-base=<base>`), et le lot d'aujourd'hui se garde sur ce rejeu
(`leLotGarde`) : la relecture bornée et les éléments à rejuger lisent la différence entre les
deux, ce que le lot a changé, jamais les commits de main. La passe finale ne lit pas cette
différence : elle joue toujours la bande du lot, de sa base à son sommet (`laPasseFinale`), et ses
dépendants, avec chaque paquet dont les tests déclarent lire un chemin que la bande change
(`grillhouse.lit`, `filtresDeLaBande`, comme le `data` de Bazel, que le graphe de Turborepo ne
voit pas), jamais la copie entière, que la nuit et l'intégration jouent. Un lot accepté que
l'avance laisse tel quel reste accepté (`leLotAccepte`), comme Gerrit garde les votes d'un
rebasage trivial : la passe finale joue sa bande, puis l'intégration, sans relecture de plus. Un
rejeu en conflit avec main ne borne rien : la relecture et les éléments à rejuger sont entiers, la
passe finale garde sa bande.
Un fichier engendré que l'avance réécrit peut écarter l'arbre du rejeu : le lot repasse alors
la relecture. Ainsi un mouvement de main sur lequel le lot se rejoue tel quel ne coûte ni
relecture ni constat (grillhouse-527 : la différence bornée portait les changements de main sur les
fichiers du lot, marqués à rejuger).

**Le tri des découvertes en fin de ticket** : comme Chromium et Mozilla donnent un verdict à
chaque rapport de défaut neuf avant de le ranger, une fois le lot entré sur main (5.2), le
circuit mène l'étape 5.3 : sans découverte consignée par les fiches du ticket, aucune séance ;
sinon une séance de l'explorateur hors de l'enveloppe, sur Sonnet, dans l'arbre principal, aux
droits de la lecture (`droits.mjs` : la lecture d'un commit de main, `git show` et `git log`,
dans l'arbre principal et par `git -C` ; la construction d'un paquet, `npm run build --
--filter=<paquet>...`, avant de juger une erreur de types de son export ; aucune passe, aucune
écriture), sa consigne du huitième gabarit, qui liste les commandes que ces droits permettent
(`commandesPermises`, tirée des droits du rôle, comme l'aide d'un outil liste ses commandes) et
leur forme : une par appel, sans `cd` ni enchaînement, une commande refusée relancée sous sa
forme simple (BP 320.39 : trois `non-confirmee` sur une boucle de `bd show` refusée). Sa fiche (`tri` de `resultats.mjs`) donne une ligne
par découverte, ni plus ni moins (`conformiteDuTri`), chacune avec son verdict : `traitee`,
`doublon`, `sans-suite`, `a-porter` ou `non-confirmee` ; la pièce d'un `traitee` ou d'un
`a-porter` est une commande rejouée sur main et sa sortie, ou fichier:ligne, sans quoi la fiche
est non conforme, redemandée une fois à la même séance. Le circuit écrit chaque verdict au ticket
de sa découverte et y pose son étiquette ; un `a-porter` ou un `non-confirmee` se rouvre sous
`a-valider`, dans la liste « à valider » du panneau. Un tri sans fiche conforme laisse les
découvertes telles quelles et le dit au ticket ; il ne défait pas l'intégration, et le bilan
compte sa séance et ses verdicts. Ainsi chaque découverte est lue une fois, et le responsable ne
lit que les défauts réels (BPScript : 161 découvertes fermées depuis le 2026-10-12, aucune lue
une à une ; sur 320.17, 9 découvertes, un seul défaut réel).

**Le bilan sépare les attentes** : comme le « lead time » de DORA sépare l'attente de revue du
temps de travail, le bilan répartit l'attente entre celle du superviseur, celle du responsable et
la nuit, la plage horaire que le projet déclare (`grillhouse.plageDeNuit` de son `package.json`,
23 h – 8 h par défaut). Comme ccusage mesure sur les transcriptions, chaque montée nomme la séance
du superviseur qui a lancé le circuit (`CLAUDE_CODE_SESSION_ID`), et une attente est celle du
responsable quand il écrit dans cette séance pendant l'attente (un message de la personne,
`origin.kind` « human ») ; le bilan ne lit aucun commentaire du ticket. Une séance du développeur
est une relance sans effet quand le circuit la marque inchangée (`inchange`) : elle ne change aucun
fichier du plan et va aux contrôles (une reprise d'un plan déjà livré, rien à livrer) ou renvoie
une deuxième fois au testwriter ; un arrêt seul, « sans-livraison » compris, ne la rend jamais
sans effet. Son texte donne le mur, le mur hors nuit d'attente
(une nuit de travail y reste) et le perdu hors attentes. Ainsi le temps perdu se lit sans la nuit
ni l'attente d'une réponse (BP 320.9 : 500 min de nuit mêlées à l'attente du responsable et à
celle du superviseur ; BP 320.8 : les 78 min de la réponse du responsable comptées au
superviseur ; BP 320.3.9 : une attente comptée au responsable sur un commentaire du superviseur,
et une séance dont le commit livre le code rangée sans effet).

**Le bilan compte chaque séance à son coût** : le registre écrit chaque rôle tel que Claude Code
nomme l'agent d'un greffon (`grillhouse:developpeur`), et le bilan le lit comme le panneau, d'une
seule façon (`roleDeLAgent` de `etapes.mjs`). Le registre garde le total qu'une séance écrit,
comme ccusage ; sans total, ou à total nul pour des jetons dépensés (un sous-agent n'en écrit
pas), il calcule le coût sur ses jetons, au tarif de son modèle (`TARIFS` de `registre.mjs`). Ainsi
le bilan compte toutes les séances, et un sous-agent du superviseur coûte ce qu'il a dépensé (BP 320.8 : « 0 séances ; 0,00 $ » pour 25
séances et 20,36 $, et 0 $ pour un questionneur du superviseur).

**Le bilan juge sur ce qui s'est passé, face à une base refaite** : comme ccusage découpe une
transcription, un tour commence à son message entrant ; les opérations de file et le message sans
modèle qu'une reprise écrit avant lui ne prolongent pas le tour d'avant (`horsDuTour` de
`tableau.mjs`). Le circuit garde avec l'issue de chaque contrôle ses rouges, et deux contrôles
mesurent la même chose quand leur issue et leurs rouges sont les mêmes : la passe qui suit une
régénération, ses rouges autres, compte. Comme un banc de temps refait sa base, le bilan se compare
au dernier autre ticket du projet, son bilan recalculé par la version courante depuis ses sources,
et à rien quand elles n'en donnent plus. Le journal d'un ticket date chaque en-tête, d'étape ou de
séance, à l'heure locale avec son décalage (ISO 8601). Ainsi la perte dite est celle mesurée (BP
320.3.2.1 : 34 % dits pour 8,5 % mesurés, « séances 0 → 10 » face au bilan gardé de 320.8).

**Un fait porte sa pièce** : comme une revue de code cite la ligne qu'elle juge, chaque constat,
question ou montée d'une fiche porte sa `piece`, un seul format (`lirePiece` de `resultats.mjs`) :
`fichier:ligne` ou `fichier:ligne-ligne` depuis la racine de la copie, ou `$ commande` et sa
sortie, à la ligne suivante ou après un « \n » écrit en deux caractères, ou, pour ce que dit le
ticket, `ticket, critère N` ou `ticket, § <section>`, comme une relecture de spécification cite sa
section (« RFC 9110 § 15.5 »). Le circuit cherche chaque pièce `fichier:ligne` dans la copie, le fichier présent et sa
ligne (ou la fin de l'intervalle) dedans, et chaque pièce du ticket dans sa description, le critère
numéroté dans sa section des critères ou la section par son titre (BP 320.17 : trois fiches du
questionneur sur quatre refusées pour une pièce sur le plan qu'il questionne) ; une pièce
introuvable refuse la fiche, redemandée une fois à la même séance, neuve ou reprise, comme tout
autre manque, comme un validateur de sortie structurée renvoie son erreur à la même conversation
(BP 320.3.9 : une question juste perdue dans une séance neuve). L'agent qui reprend le
fait relit sa pièce avant de s'appuyer dessus. Ainsi une ligne mal lue s'arrête au premier qui la
relit (BP 320.9 : une question née d'une ligne mal lue, `native.ts:234`, recopiée par cinq agents
jusqu'au responsable).

**Une passe écrit sous sa base** : chaque lancement de Vitest, `npm test`, `npm run verifier`,
un circuit, une intégration et une enveloppe ouvrent leur base dans le dossier temporaire, la
nomment dans `TMPDIR`, `TMP` et `TEMP` à ce qu'ils lancent (les dossiers d'essai des tests, celui
de Vitest, celui de Claude Code) et l'effacent à leur fin, verte, rouge ou interrompue (SIGINT,
SIGTERM, SIGHUP) ; la base d'une passe tuée, la suivante la balaie, comme Bazel donne à chaque
test son `TEST_TMPDIR` et nettoie ses bacs à sable
(`packages/grillhouse/scripts/mesure/base-de-passe.mjs`). Une passe de tests garde son dossier :
ce que ses tests y laissent la fait échouer, chaque nom écrit, comme la CI d'osc-bridge
(OB-ud1.3), les caches des outils qu'un test lance tolérés par leur nom ; le module de chaque langage nomme son outil et joue cette garde dans son lanceur de
tests (typescript : la base de chaque lancement de Vitest, `mkdtempSync` retiré en `afterAll` ;
cargo : `tester` et `verifier`, le crate `tempfile`). Ainsi un essai oublié ne remplit jamais le
dossier temporaire de la machine, et le test qui l'oublie est nommé.

**Un fichier temporaire meurt avec son propriétaire** : une base a pour propriétaire un
processus, un ticket ou un dossier, comme `PrivateTmp=` de systemd donne à un service un /tmp
détruit avec lui. Une passe et une séance hors ticket ont la base de leur processus. Le dossier
temporaire d'un ticket, `grillhouse-ticket-<id>/`, est celui de ses agents : le lanceur le donne à
chaque séance du ticket (son `TMPDIR`, `TMP` et `TEMP`, ses scratchpads et son dossier de travail
dedans), `npx grillhouse temporaire <ticket>` au superviseur pour ses sous-agents ; il reste d'une
séance et d'une reprise à l'autre, gel compris, et part avec les copies finies quand le ticket
est fermé, comme une politique de rétention fixée d'avance. Ce qu'un agent doit avoir pour reprendre vit dans
la copie du ticket ou sa passation, jamais dans le seul dossier temporaire. Les caches de compilation ne vivent jamais dans le dossier temporaire : sccache et uv sous
`~/.cache/grillhouse/` (`cacheDeCompilation`), comme l'output_base de Bazel, et un espace cargo
enraciné dans le dossier temporaire compile sous `~/.cache/grillhouse/cargo/`, balayé quand sa
racine n'est plus, vue de l'espace de processus qui l'a ouvert, ou, depuis l'hôte, après 7 jours
sans usage, comme un cache de GitHub Actions. Une passe lourde (le verrou de la machine, les tests de nuit) qui trouve moins
de 4 Go libres dans le dossier temporaire attend la place sous la borne du verrou et dit ce qui
l'occupe, le ticket dont le dossier tient la place nommé, au lieu d'échouer faute de place (la nuit du 2026-11-01 : 25 rouges, 8 Go de
scratchpads sur 16). Ainsi le disque en mémoire du poste ne sature jamais.

**Une passe lourde attend aussi la place sur le disque de sa copie**, où cargo écrit ses
`target/` : sous le même plancher de 4 Go (`GRILLHOUSE_COPIE_LIBRE` en nomme un autre), elle
attend sous la même borne, comptée depuis le début de l'attente, et dit ce qui occupe ce disque :
les copies de son dépôt, les cinq plus grosses d'abord, chacune avec son ticket, sa place et celle
des sorties de ses outils (« .claude/worktrees/SH-ae6.2.7 (le ticket SH-ae6.2.7, 5,0 Go, dont
target 4,8 Go) », `occupantsDesCopies`), puis « à repasser » (75), comme Bazel et Buildkite
refusent de démarrer une construction sous un plancher de place libre plutôt que d'échouer en
cours. Ainsi une passe ne meurt jamais faute de place sans l'avoir dit (le disque principal plein
le 2026-11-01 : trois circuits tués sans un mot).

**Le dossier du circuit appartient au ticket** : `.claude/worktrees/<ticket>.travail` vit autant
que le ticket, comme l'espace de travail d'un pipeline ; aucun balayage n'y touche, la file
l'efface quand elle en a fini avec le ticket fermé (sa CI conclue, ou sa poussée non faite), car
il porte l'avancement que le panneau lit, celui de la CI compris, `npx grillhouse retirer-copie` avec la copie d'un ticket fermé sans
intégration. Ainsi une séance qui survit à son circuit garde ce qu'il lui a remis.

**La nuit et la fin de chaque circuit retirent les copies finies**
(`packages/grillhouse/scripts/copies-finies.mjs`, que la nuit lance par sa commande
`retirer-les-copies-finies.mjs` ; le module n'importe rien du `dist/` construit, car le verrou
de la machine et la configuration de base des tests l'importent) : après ses étapes, quel que soit son verdict,
la nuit passe chaque copie que `git worktree list` nomme, hors
l'arbre principal et sa propre copie, par `retirer-copie.sh` sans `--jetable`, comme une CI
nettoie ses espaces de travail à la fin d'un pipeline et comme `git worktree prune`, qu'elle joue
d'abord. Une copie dont les commits et le travail local sont tous entrés sur main, jugés par le
contenu comme le retrait juge le travail, part avec sa branche (main et une branche qu'une autre copie tient restent) ; un fichier que le
pilote de fusion du CHANGELOG fusionne (`merge=grillhouse-changelog`) est entré quand chacune de
ses entrées est sur main, puisqu'il y entre fusionné aux entrées des lots voisins ; le lien
`node_modules` d'une copie, quand il est tout son travail local, n'est pas du travail ; une copie refusée (commits ou travail non entrés, verrou) reste, et le
journal la nomme avec sa raison, le premier chemin non entré compris. Une copie qu'un circuit tient reste sans passer : son ticket en
cours, son dossier `.travail`, son verrou de git (la copie d'un agent vivant), ou, pour la copie
de l'intégration et celle de la file, leur verrou ; des tickets en cours illisibles, ou lus au-delà d'une minute, gardent toutes les
copies. Les tickets en cours se lisent seulement quand une copie reste à juger : une nuit sans
autre copie que la sienne n'appelle pas Beads. Une copie gardée dont le ticket est fermé perd
ce que les outils de ses langages y écrivent, hors du suivi de git : les dossiers que le module
du langage nomme (`ignorer` : `target`, `.turbo`) et `node_modules` ; son travail suivi reste.
Chaque ligne d'une copie gardée nomme la place qu'elle tient. Une copie dont le circuit ne tourne
plus (son `.travail` là, son ticket hors des circuits que le serveur Temporal fait tourner, que
l'appelant lui donne : la commande les lit, la fin d'un circuit, dont l'acte ne lit aucun serveur,
ne les donne pas), son ticket ouvert, reste, son code et ses commits intacts, et sa ligne le dit
avec la place de chaque sortie de ses outils (« son circuit ne tourne plus ; target y tient
5,1 Go »). Les copies qui durent perdent les sorties de leurs outils une fois leur passe jouée,
leur `node_modules` gardé, puisque leur préparation suivante les efface (`git clean -x`) : la
nuit nomme sa propre copie au retrait après ses étapes, et la copie de l'intégration ou de la
file, gardée sans son verrou, les perd de même ; ainsi une copie qui dure ne tient jamais plus
qu'une passe (synthhub : 2,9 Go dans la nuit, 4,8 Go dans l'intégration). Le même retrait tourne
à la fin de chaque circuit, sa copie de nuit laissée à la nuit, ses lignes au journal du ticket. Le retrait
ne change ni le verdict de la nuit, ni le code du circuit. Ainsi aucune copie ne survit à
l'entrée de son contenu sur main, ni un dossier de compilation à son ticket (Grillhouse, 79
copies d'agents, 5,7 Go ; OSC Bridge, 4,4 Go ; synthhub, 34 Go de `target/`).

**La commande du circuit est le client de son déroulé** (`src/temporal/circuit/commande.ts`,
grillhouse-4nr.12) : comme `gh workflow run` ou le client de Temporal, `npx grillhouse circuit`
écrit une ligne et rend la main aussitôt ; le circuit tourne sur le serveur Temporal, dans le
déroulé de son ticket, que le travailleur du projet mène, hors du groupe, de l'arbre et du groupe
de contrôle de son appelant. Seul, le ticket entre dans la file des tickets du projet ;
`--reprendre`, `--depuis` et `--etendre` répondent à son arrêt, `--arreter` l'arrête. Un ticket
que le circuit ne pourrait pas mener (illisible, sans section « ## Architecture », un titre sans
composants, un composant inconnu, `scripts/depart-du-ticket.mjs`) est refusé à la porte, par son
nom ; `--arreter` ne lit ni le titre ni l'architecture, et refuse un lot intégré (« le lot de
<ticket> est intégré »). Un déroulé fini sans son issue (terminé de force, en échec), pendant une
question ou en plein travail, se rouvre par `--reprendre`, depuis l'état que son dernier mémo
garde entier, ou par `--depuis` ; `--etendre` et `--arreter` y sont refusés, et `--depuis` seul le
rouvre quand aucun état n'est écrit. Les réponses que le client accepte, selon le statut du
déroulé et l'état écrit, ont une seule règle (`lesReponses` de
`scripts/reponses-du-circuit.mjs`), que le client, l'ouverture, l'attente et le panneau
reprennent : ils ne proposent que ce qui marche. La question d'un circuit
réveille le superviseur par la seule attente des questions (ci-dessous), et sa fin aussi : un
arrêt comme une question, une intégration une fois (grillhouse-44b.15).
L'ouverture d'une séance de supervision (`packages/grillhouse/scripts/superviseur.mjs`, joué par le
crochet de démarrage), quand cette ouverture prend le verrou du dépôt (non quand la même séance le
garde déjà, après un compactage ou un `/clear`), demande de lancer l'attente des questions, puis
nomme les circuits du dépôt dont le ticket est ouvert : chaque circuit qui tourne ; chaque circuit
arrêté sur une question (hors l’arrêt `arrete` du superviseur), avec sa question et la commande qui
répond ; chaque circuit dont le déroulé a fini sans son issue, avec la commande qui le rouvre
(`--reprendre` depuis son dernier état écrit, `--depuis` sans état écrit), que le superviseur
lance sans attendre le mot du responsable. Le panneau range sous
« ⤷ Question · superviseur » tout circuit qui attend le superviseur, par la même règle que
l'ouverture et l'attente : un circuit fini sans son issue, la commande qui le reprend en tête de
sa fiche, et un circuit arrêté sans texte de question, « à repasser » (75) compris, que le
superviseur reprend une fois la machine libre. Le panneau, l'ouverture et l'attente lisent les
circuits du dépôt sur le serveur Temporal, en un appel (`circuits-du-serveur.mjs`, sur
`lireLesCircuits` du client du circuit : une liste des déroulés, leur mémo et leur statut, sans
travailleur), comme l'interface de Temporal liste ses déroulés : le déroulé publie dans son mémo
le résumé du dernier état qu'il écrit (étape, tentative, arrêt et première ligne du rapport,
objet du questionnement, boucles, début de l'étape menée) et sa question, numérotée dans son run ;
de son ouverture à son plan passé, ce résumé est l'étape `plan`, publié dès l'ouverture et à
chaque pas du plan, que le panneau montre en « 1 Plan » (`patched('etat-au-plan')`, comme la file) ;
l'étape `plan` n'est aucune étape de la table des transitions : un arrêt pendant le plan s'écrit à
l'état que le plan écrit (le testwriter, le travail sur le plan nommé), d'où une réponse rouvre le
plan, l'explorateur puis le questionneur (`etatDeReprise` de `transitions.mjs`,
`patched('reprise-au-plan')`) ;
un circuit tourne quand son déroulé tourne sans question en attente, et finit sans son issue
quand il est terminé, en échec ou expiré sans question. L'avancement d'une passe se lit dans le
dossier de travail du ticket (`<copie>.travail/avancement-*`), où chaque passe du circuit ouvre le
sien, une à la fois, le rejeu de sa branche par la file (l’acte `avancer`) et la lecture de sa CI
compris ; un lot entré sur main garde celui de la file jusqu’à ce que la file en ait fini avec le ticket fermé, comme le circuit le
gardait toute son étape de la file. Une lecture attend le serveur 5 s au plus : un serveur absent se dit à
l'ouverture et en première alerte du panneau (« Temporal ne répond pas en 5 s »), qui montre ses tickets
sans circuits, et l'attente le relit au pas suivant ; une autre faute de la lecture, un client non
construit compris, est la première alerte telle qu'elle est (« Circuits illisibles : … »). La fiche d'un ticket qui a un circuit finit sur la page de son déroulé au tableau web du
serveur (`lienDuTableauWeb` du client : le port du serveur plus 1000), qui montre son histoire.
Comme la demande de revue de GitHub et l'ensemble d'attention de Gerrit appellent celui qu'un
changement attend, quel que soit son chemin, `npx grillhouse superviseur --attendre` est l'attente
que la séance de supervision lance en arrière-plan, seule voie par laquelle une question la
réveille, une seule à la fois par dépôt
(`.claude/worktrees/attente-des-questions.lock`, qui nomme son processus : la présence d'une
attente, que lisent le panneau et les crochets) : comme `gh run watch` ou `kubectl wait` rendent
la main à leur événement, elle imprime le lot des questions dues à son départ, sinon attend la
première, et se termine sur ce lot, par question le ticket, l'étape, la question et la commande
qui répond, quel que soit le lanceur du circuit (seul, dans une file ou par une autre séance) ;
sa fin réveille la séance, quel que soit le tube qui la suit, et la séance la relance après
chaque lot traité, sans tube ni veille à durée (grillhouse-d4n.9 : une attente sans fin lancée
derrière `| tail` n'a été lue par personne pendant 40 min). Une question toujours sans réponse
(le circuit est arrêté sur la même clé) est re-présentée toutes les 5 min
(`--rappel <minutes>`), comme SQS redonne un message non acquitté après son délai de visibilité,
jusqu'à ce que le circuit quitte l'arrêt ; une clé qui change est une question neuve, rendue
aussitôt. `.claude/worktrees/questions-remontees.json` garde, par arrêt, `depuis` (sa première
remontée) et `presentee` (sa dernière présentation), en ms ; un fichier à l'ancien format (liste de
clés) se lit, ses arrêts prenant l'heure de la lecture. Le tableau les lit : une alerte orange par
circuit arrêté sur une question au superviseur dit depuis combien de minutes il attend, rouge
passé deux intervalles de re-présentation, et une alerte rouge « à corriger », distincte, quand un
tel circuit attend alors qu'aucune attente ne vit (son verrou nomme un processus mort ou
manque). L'attente lit aussi les circuits intégrés (`lireLesCircuits` avec `integres`) et rend une
fois chaque circuit intégré après la dernière lecture de l'attente précédente, sous « Circuit
intégré » : `.claude/worktrees/integrations-rendues.json` garde cette heure et les intégrations
rendues, que l'ouverture remet à son heure, pour qu'une intégration entre deux attentes ne se
perde pas ; l'arrêt `arrete` du
superviseur ne réveille rien. Le plancher ne dépend pas de cette attente, qui peut mourir sans bruit : le
panneau tague « en attente du superviseur » chaque circuit arrêté sur une question du superviseur,
et le crochet `UserPromptSubmit` du mod (`npx grillhouse attente-au-tour`) nomme, à chaque tour
d'une séance de supervision, chaque circuit en attente (ticket, question, commande qui répond,
relance de l'attente), un circuit fini sans issue compris. Il se tait quand le verrou de l'attente
nomme un processus vivant (un verrou au processus mort compte pour aucune attente), et hors d'une
séance de supervision (séance d'agent, copie de travail). Comme une alerte non acquittée relance
(PagerDuty), le crochet `Stop` du mod (`npx grillhouse attente-a-l-arret`,
`scripts/attente-a-l-arret.mjs`) bloque la fin du tour de la séance de supervision, la même porte
que le signal du tour (`racineDeLaSupervision`), tant qu'un circuit attend sa réponse (chaque
question, sa commande à l'appui) ou qu'un circuit tourne sans attente vivante (les circuits qui
tournent, l'attente à lancer) : la raison, que la séance reçoit comme sa consigne suivante, part
sur la sortie d'erreur, code 2. Chaque question ne bloque qu'une fois, par sa clé, et chaque
état des circuits qui tournent sans attente une fois, par leurs tickets
(`.claude/worktrees/signale-a-l-arret.json`, réduit aux questions encore en attente) : une
question portée au responsable laisse passer l'arrêt suivant. Un serveur muet ou une note
impossible laissent passer l'arrêt. Les questions en attente ont une seule règle, `attendLeSuperviseur` de
`tableau.mjs` (un circuit arrêté hors l'`arrete` du superviseur, « à repasser » compris, ou fini
sans son issue) : le panneau la lit, et `questionsEnAttente` de `superviseur.mjs`, que lisent
l'ouverture et l'attente. L'attente relit les circuits sur le serveur toutes les 5 s, comme
l'interface de Temporal rafraîchit sa liste. Une question remontée (par l'attente, ou nommée à
l'ouverture) s'inscrit dans `.claude/worktrees/questions-remontees.json`, par son ticket, le run
de son déroulé, le rang de sa question dans ce run et son arrêt : elle ne réveille plus la
séance, et elle en sort une fois répondue, le circuit reparti ou fini (grillhouse-pq6 :
SH-ae6.5.2, SH-ae6.5.6 et SH-br0.1.5 de SyntHub, lancés par une file en arrière-plan, ont
attendu des heures leur réponse). L'ouverture nomme toutes les questions en attente, remontées
ou non : une séance fermée puis rouverte les retrouve. L'inscription se fait sous le verrou du
fichier.
L'état du circuit le nomme par son numéro et son heure de départ (`processus`, `depart`, le champ
22 de `/proc/<pid>/stat`), comme un gestionnaire de services vérifie qu'un numéro réutilisé ne
désigne pas un autre processus : une seconde course du ticket est refusée tant qu'il vit, et
`--arreter` ne vise que lui ; le panneau tient un circuit pour vivant sur le serveur Temporal
seul, son déroulé en marche sans question en attente. Ainsi un circuit survit à la séance qui le lance, et
son arrêt monte à la séance de supervision ouverte (BP 320.8 : un circuit mort avec la séance du
superviseur, repris à la main ; SyntHub SH-br0.1 : un arrêt 27 s après la relance de la séance,
lu sur un mot du responsable).

**Main reste vert** : la file n'avance main que sur l'arbre que la CI de la branche du ticket a
jugé vert, sans rouge admis (bors, Zuul), et la CI de main ne rejoue pas cet arbre : son premier
job (`judged` de `ci.yml`, du dépôt et du gabarit) cherche, sur un push vers main seul, un run vert
du même workflow sur une branche `agent/**` pour le même commit, et chaque job de la passe est sauté
quand il le trouve ; tout autre événement joue la passe. La nuit rejoue la passe complète. La mise à jour du cadre
(`npx grillhouse maj`) finit par `npm run verifier` dans le projet, dont le vert pose le dernier
vert sur l'arbre qu'elle laisse, comme Nx affected avance sa base au dernier commit vert de main ;
elle rend le code de la vérification, et son compte rendu dit le vert posé, ou pourquoi il ne
l'est pas (un rouge, un « à repasser », un `npm install` à faire d'abord). Un test connu
rouge se met en quarantaine dans le test lui-même (`it.skip` ou `it.fails`), avec le ticket qui
le corrige, comme le fait une intégration continue mature. Ainsi chaque rouge a son ticket, et
main ne porte aucun rouge.

**Le délai d'un test** (module typescript, `vitest-config/delais.mjs`, appliqué par un fichier
d'amorce de la configuration de base) : comme le `size` de Bazel (test-encyclopedia), chaque taille
a son délai, petit 60 s, moyen 300 s, grand 900 s, écrits une fois dans `vitest-config/bornes.mjs` ;
Vitest tue un test à celui de la taille de son fichier, lue par `classer` de la garde des tailles,
une seule adresse. Un fichier hors du jour qu'un lancement ciblé nomme a le délai de la grande
taille, comme un test de nuit, dont la configuration l'écrit. `slowTestThreshold` (300 ms, fixé)
marque les tests lents, et le rapport de durée nomme les 20 fichiers les plus lents et leur part du
temps ; la ligne d'un test rouge pour délai dépassé écrit la taille et le délai de son fichier
(« petit, 60 s »). Un délai est un garde-fou, pas une mesure : dépassé, le test du jour est rouge.

**La taille d'un test** (`packages/grillhouse/scripts/langages/typescript/tailles-des-tests.mjs`, une garde du
cadre) : comme la pyramide des tests de Google et le `size` de Bazel, chaque fichier de tests
que git liste est petit, moyen ou grand, lu dans son texte et dans la matière de test qu'il
importe, par un chemin relatif ou par le nom d'un paquet de la matière partagée (son entrée
`./test-fixtures`, suivie jusqu'aux modules qui déclarent les noms importés) : grand, il monte un dépôt d'essai (`init`, `clone` ou `worktree add` de git) et y lance
autre chose que git, ou il monte un dossier temporaire (`mkdtemp`, `tmpdir`) et y lance, dans un
appel de processus à option `cwd:` (ou `-C`, `--prefix`), un outil lourd du produit (turbo,
vitest, knip, depcruise, api-extractor : la constante `OUTILS_LOURDS`, nom littéral ou chemin
littéral de son binaire ; un outil nommé par variable ou par script npm échappe à la lecture), ou
il démarre un serveur Temporal de développement (les arguments littéraux `'server', 'start-dev'`,
dans son texte ou dans la matière qu'il importe : constante `SERVEUR_TEMPORAL`) ; un tel test de
jour est refusé, il s'écrit en `*.nuit.spec.ts` ; moyen, il lance un processus ou importe plusieurs modules du dépôt ;
petit, sinon. Un grand test de jour est un constat (`grand-de-jour`), un test de nuit ou un banc
jamais ; les grands tests de jour d'un projet s'inscrivent dans sa dette à la mise à jour qui
apporte la garde (`npx grillhouse maj`, migration 0.25.0), et celles que l'outil lourd fait grandes à la migration
0.30.0, sans qu'un test se réécrive. Chaque
module de langage porte la sienne sous la même commande, chacune sa part de la dette : le module
python lit un test et ses `conftest.py` ; le module cargo lit chaque cible de test et chaque
fichier de tests unitaires d'un crate, les modules qu'il déclare (`mod common;`) et les crates de
la matière partagée qu'il nomme, un processus étant `std::process`, `assert_cmd`, `duct` ou
`xshell`, un dépôt d'essai celui de git ou de git2 (`Repository::init`), et un test de nuit ou un
banc jamais un constat ; les grands tests de jour d'un projet de cargo s'inscrivent à la
migration 0.28.4. Un grand
test de jour qui ne vérifie qu'un module en sort ainsi : ses cas se réécrivent en petits tests par
l'interface du module (le plan de l'enveloppe, les options qu'un greffon laisse à Vitest, la
configuration du jour et celle de la nuit, la fonction qui lit l'avancement), le module recevant
en argument ce qu'il lit au dehors (la lecture de l'historique et les réponses de Beads du crochet
d'un commit par ticket, le git qui pose l'étiquette d'une sortie, les textes des interfaces et les
lecteurs du ticket de la garde des consommateurs), et ses cas que seul un grand test prouve (bwrap
réel, une passe réelle de Turborepo et de Vitest, un crochet ou une commande lancés dans un dépôt
git) se déplacent tels quels en tests de nuit dans `packages/grillhouse-essais`. Grillhouse
n'a plus aucun grand test de jour : sa dette des tailles ne garde aucun constat `grand-de-jour`,
et aucun constat neuf n'y entre. Ainsi le jour ne joue que des tests courts, et la dette des
grands ne fait que baisser.

**Le titre d'un test** (`packages/grillhouse/scripts/langages/typescript/titres-de-tests.mjs`, une
garde du cadre) : comme Software Engineering at Google (chap. 12, un test par comportement), un
test porte le nom du comportement qu'il prouve, jamais celui de son ticket, qui va au message du
commit. La garde lit les tests Vitest que liste la garde des tailles (`*.test.*`, `*.spec.*`, les
tests de nuit compris) : chaque titre de `describe`, `it`, `test` et de leurs variantes (`skip`,
`only`, `each`, `todo`…) qui nomme un ticket du projet (son préfixe, lu dans la clé `issue-prefix` du
fichier commité `.beads/config.yaml`, jamais par `bd`, absent d'une CI ; sans ce fichier ou sans la
clé, la garde le dit par son nom au lieu de compter à moitié ; suivi d'un identifiant) ou un « critère N » est un constat
(`titre-nommant-un-ticket`), compté une fois s'il nomme les deux. Elle voit le texte statique d'un
titre : un littéral, les parties fixes d'un gabarit, le format d'un `each` ; un titre porté par une
variable ou écrit dans un commentaire lui échappe. Les tests Rust et Python sont hors du compte :
leurs titres sont des noms de fonction, sans `describe` ni `it`, écart que la garde et son refus
écrivent. La dette compte les constats fichier par fichier : un fichier dont le compte monte
au-dessus de sa dette, ou absent de la dette avec un titre compté, est refusé par son nom ; une
dette plus haute que le compte l'est aussi, et le lot qui renomme des titres l'abaisse par
`npm run grillhouse:dette:elaguer`, jamais à la main. Un fichier de tests que le lot déplace ou
renomme, son contenu gardé à moitié au moins (`renommesDuLot`), reprend la dette de son ancien nom.
`bd init` laisse cette clé en commentaire : le cadre l'écrit par une seule fonction
(`ecrireLePrefixe` de `packages/grillhouse/scripts/prefixe-des-tickets.mjs`, qui la lit aussi),
que la préparation d'un projet neuf (`npx grillhouse init`) appelle après `bd init`, avec le
préfixe donné. La mise à jour qui apporte la garde (`npx grillhouse maj`) écrit la clé depuis
`bd config get issue_prefix` (migration 0.30.0 `préfixe des tickets`, un projet sans `.beads/`
n'écrivant rien), puis inscrit dans sa dette les titres d'un projet qui nomment déjà un ticket
(migration 0.30.0 `titres nommant un ticket`), sans qu'un test se réécrive.
Ainsi le compte des titres qui nomment un ticket ne fait que baisser.

**Les chemins des tests** (`packages/grillhouse/scripts/langages/typescript/chemins-des-tests.mjs`, une
garde du cadre) : comme le bac à sable de Bazel, qui fait échouer un test qui lit une entrée non
déclarée, un test qui nomme un module de son paquet par un chemin que le cadre ne lit pas (un
chemin construit à l'exécution, `path.join(SCRIPTS, nom)`, ou un motif sans début fixe qui nomme
un de ses dossiers), hors de ce qu'il importe et nomme et
hors du `grillhouse.lit` de son paquet, est un constat (`chemin-non-declare`) : le test écrit le
chemin entier, ou son paquet le déclare. Les constats d'un projet s'inscrivent dans sa dette à la
mise à jour qui apporte la garde (migration 0.25.0). Ainsi aucun script lancé par un test ne se
perd en silence, et un changement d'un script ne rejoue que les tests qui le lisent.

**Des places bornées pour les séances et les passes** (grillhouse-9kq, grillhouse-4nr.12 ; modèles :
les agents de Buildkite, le serveur de tâches de GNU make, l'admission de `make -l`) : chaque séance
d'agent, et chaque passe (preuve du rouge, contrôles, passe finale, vérification, références),
prend une place à son départ et la rend à sa fin ; un circuit qui attend une question ou une séance
n'en tient aucune, et une passe jouée sous une place tenue (`GRILLHOUSE_PLACE_TENUE`) n'en prend pas
une seconde. Les places vivent sur le serveur Temporal, dans le déroulé de la machine (ci-dessous),
que `scripts/places-de-la-machine.mjs` lit et prend par un processus à lui
(`scripts/places-du-serveur.mjs`) ; le serveur est requis sur le poste, et la CI n'en prend aucune.
Une machine d'essai des tests ne prend que les places du serveur d'essai que nomme
`GRILLHOUSE_PLACES_D_ESSAI`. `GRILLHOUSE_MESURE_D_ESSAI` fixe la mesure de la machine en JSON
`{ coeurs, charge, memoireLibre }` (la forme de `Mesure`) : posée, l'état des places en tire sa
charge, ses cœurs et sa mémoire, au lieu de lire la machine ; une valeur fautive (JSON illisible,
champ manquant ou non numérique) est refusée en nommant la variable, et le tableau n'affiche alors
aucune ligne des places. La configuration de base de Vitest la pose dans les tests de chaque
projet, de sorte que la ligne des places du texte et celle du JSON ne varient pas avec la charge.
3 places par défaut (`GRILLHOUSE_PLACES`) ; une place porte le
processus de la séance et son début (pid et heure de départ), et le déroulé la libère quand ce
processus n'existe plus, sans bail. Un départ n'est admis que si la charge sur 1 min est sous le
nombre de cœurs et si 4 Go au moins sont libres, deux départs étant espacés de 10 s
(`GRILLHOUSE_ESPACEMENT_MS`) ; l'attente dit sa raison (place, charge, mémoire,
espacement), garde le rang d'arrivée du circuit (pris à son lancement) et s'arrête à la borne de
l'attente du verrou, 75. Chaque séance joue ses tests sur max(1, cœurs ÷ places) travailleurs
(`GRILLHOUSE_TRAVAILLEURS`, lu par le module de chaque langage : `maxWorkers` de Vitest, `-j` de
cargo et nextest, `-n` de pytest), sous `nice` et `ionice` ; une passe lourde garde tous les cœurs.
Une passe lourde prend sa place, puis le verrou exclusif de la machine ; une passe ciblée part
pendant qu'une passe lourde tient le verrou.

**La file des tickets** : chaque projet garde la sienne, ses tickets `circuit` ; ceux dont la
description porte sa section « ## Architecture » et dont toutes les dépendances `blocks` sont
fermées partent par priorité Beads (la règle, `ticketsAPartir` de `scripts/file-des-tickets.mjs`),
et attendent une place dans l'ordre d'arrivée, commun aux projets ; ceux dont une dépendance est
ouverte restent. Comme une file de fusion n'admet qu'un changement qui passe ses contrôles
d'entrée, un ticket sans sa section ne part jamais (grillhouse-d4n.10) : le panneau (une alerte)
et l'ouverture de la séance du superviseur (« ## La file des tickets ») le nomment, « En file sans
architecture : <tickets> » (`enFileSansArchitecture`), pour que le superviseur l'écrive. Le déroulé de la file des tickets sous
Temporal la mène (ci-dessous).

**Une mesure lourde à la fois sur la machine** : chaque `npm run verifier` et chaque passe
lourde du circuit (la passe finale, la vérification, la nuit) prennent le verrou de la machine,
partagé par tous ses dépôts (`~/.cache/grillhouse/mesure-lourde.lock`) ; une seconde mesure
attend la fin de la première et le redit toutes les 30 s, en nommant qui tient le verrou (le
processus, son dossier, sa commande, depuis quand) ; un verrou dont le processus est mort se
reprend, comme le serveur de tâches de GNU make. L'attente a une borne, 60 min
(`GRILLHOUSE_ATTENTE_MACHINE_MS`), plus longue que la plus longue passe complète mesurée : au-delà,
la mesure s'arrête « à repasser » (code 75), comme `flock -w`. Un verrou tenu par un ancêtre de
celui qui attend est un blocage : l'attente le dit tout de suite et s'arrête, rouge. La passe
borne ses tâches côte à côte à la moitié des cœurs. Ainsi une mesure rend le résultat du code, et
non celui d'une autre mesure à côté, et aucune passe ne reste figée sans le dire.

**Le cadre passe avant les projets** : une mesure jouée dans le dépôt du cadre lui-même (le
paquet en développement, ses copies d'agents comprises) est de premier rang, « mesure du cadre » ;
celle d'un projet, de second rang, « mesure d'un projet ». Une mesure d'un projet ne prend pas le
verrou, même libre, tant qu'une mesure du cadre attend ; la mesure en cours finit toujours. L'attente
dit son rang et qui elle attend, sous la même borne. Ainsi la version suivante du cadre, que tous
les projets attendent, ne reste pas derrière leurs mesures, comme une file à priorités de Slurm et
comme Bazel ordonne ses tests par priorité.

**Le panneau montre qui tient le verrou et qui l'attend** : celui qui prend le verrou de la
machine, quel qu'il soit (une passe hors ticket, le circuit d'un ticket, de n'importe quel projet
de la machine), se nomme à côté (la racine de son dépôt, celle de sa copie de travail, son ticket
s'il en a un, sa sorte, depuis quand, puis son avancement) ; chaque passe qui attend le verrou ou la place sous /tmp s'y inscrit, une par
processus. Le panneau de chaque projet montre d'abord la ligne des places, « Places n/N · charge x/c ·
mémoire m Go », puis, pour un ticket qui attend une place, ⏳ « attend une place », et, pour une
dépendance ouverte, « attend <ticket> ». Le détenteur ou l'attente d'un circuit que montrent les
agents tient sur la ligne de ce circuit, une ligne par ticket, à la place de l'avancement de sa
passe : « · 🔒 <sorte> faits/prévus · <durée> », « · ⏳ <sorte> · <durée> », la sorte en minuscules.
Les autres vont en tête des agents : « 🔒 <sorte> · <projet> · <qui> · faits/prévus · <durée> »
pour le détenteur, « ⏳ <sorte> · <projet> · <qui> · attend · <durée> » pour chaque attente.
<qui> est son ticket, sinon le dossier de sa copie (sous .claude/worktrees/). Le projet, nommé
comme le tableau le nomme (son étiquette pour un autre projet du tableau, son dossier hors du
tableau), s'omet pour le projet du panneau, le verrou valant pour tout le poste. La largeur coupe
d'abord le sujet, puis le projet, puis omet « attend », puis coupe <qui> en dernier ; jamais la
sorte, les chiffres ni la durée. Un circuit qui
attend montre aussi ⏳ en tête de sa ligne. Une ligne part avec son processus, et un détenteur mort ne s'affiche pas ; un verrou tenu
par un cadre plus ancien, qui ne se nomme pas, se montre « 🔒 Verrou · <projet> ». La ligne d'état
compte les alertes par leur signe, puis nomme le détenteur et le nombre des attentes. Comme
lslocks nomme qui tient un verrou et comme cargo dit qui bloque son attente (« Blocking waiting
for file lock »). Ainsi une attente se voit, avec ce qui la bloque, depuis n'importe quel projet.

**Un signe par sorte d'état** (décision du responsable, 2026-11-01) : ▶ en cours ; ⏸ circuit
arrêté ; 🔒 tient le verrou de la machine ; ⏳ attend le verrou, une place ou la place sous /tmp ; 💤 ticket
pris sans rien qui tourne ; 🌙 nuit rouge ; ⚠ les alertes sans sorte à elles (une passe figée, un
projet illisible, un agent silencieux). Un signe large se cale comme les autres, un signe puis une
espace, et la largeur d'une ligne compte ses colonnes. Ainsi chaque signe garde un seul sens.

**Une passe automatique montre son avancement** : chaque passe automatique écrit ses fichiers
de tests faits sur prévus (la file, les étapes de sa CI), dans le dossier de travail de son
ticket pour une passe du circuit, que le panneau affiche avec le temps
depuis son dernier signe, « ⚠ figée » au-delà de 5 min, comme le compteur d'actions de Bazel.
Ainsi une passe qui fige se voit.

**Une mesure de temps joue la nuit** : le jour sert l'activité, et la machine y est toujours
chargée ; toute mesure qui demande une machine au repos joue la nuit, dans chaque langage, comme
Bazel laisse une cible `manual` hors de tout motif et joue seul un test `exclusive`, et comme les
bancs de performance de Chromium et de rustc-perf quittent la CI de chaque commit pour une
machine au repos (grillhouse-bd7). Une mesure de temps est un banc de temps (en TypeScript un
fichier `*.budget.test.*` ou `*.budget.spec.*`, en Rust une cible `tests/<nom>_budget.rs`) ou un
témoin de temps (un fichier de test qui importe `mesurerAuRepos`) ; un test de nuit, un fichier
`*.nuit.test.*`, `*_nuit_test.py` ou une cible `tests/<nom>_nuit.rs`. `npm test` et la
vérification les laissent hors (la configuration de base de Vitest et son greffon ; nextest y
joue la bibliothèque, les binaires et chaque autre cible) ; la nuit seule les joue
(`tests-de-nuit` de chaque module) : les tests de nuit, puis les mesures seules, un fichier ou
un test à la fois ; un lancement ciblé qui nomme le fichier le joue. Un échec qui dépend d'une
durée (l'échec d'une mesure, un délai dépassé dans un test de nuit) survenu sous charge (la
pression CPU du noyau, `/proc/pressure/cpu`, à 25 % ou plus) est « à repasser » (code 75), ni
vert ni rouge : la nuit attend le repos (15 min au plus) et rejoue une fois, comme Bazel classe
un délai dépassé et CTest le rejoue. Le jour n'attend aucun repos : un délai de test est un
garde-fou, pas une mesure (Bazel, Vitest) ; un délai dépassé y est un rouge, et un délai trop
juste s'élargit, très au-dessus de la durée normale du test ; `npm run verifier` tient une tâche
à 75 pour un rouge. Ainsi une mesure ne se prend jamais sous la charge du jour, et le jour
n'attend jamais la machine.

**La nuit d'une machine partagée** (`.github/workflows/nuit.yml`, chaque nuit, sur l'exécuteur
que nomme la variable `RUNNER` du dépôt, `ubuntu-latest` de GitHub sans elle) joue les tests de nuit
du cadre sans aucune mesure de temps, puisqu'une machine partagée ne mesure pas un temps
(`tests-de-nuit --hors-du-poste` du module typescript), en tranches comme la vérification de la
CI : chaque job joue sa tranche (`--tranche i/n`), et `fusion-des-tranches` refuse un test de nuit
qu'aucune tranche ne joue ou que deux jouent, puis réunit leurs rapports. Elle laisse au poste chaque test de nuit
qui porte l'étiquette `@poste` : une ligne `// @poste: <raison>` du commentaire de sa tête, comme
les étiquettes de Bazel (`manual`, `exclusive`) et les marqueurs de pytest vivent avec le test,
jamais dans une liste à côté. La garde des tests du poste
(`packages/grillhouse/scripts/langages/typescript/tests-du-poste.mjs`) refuse un test de nuit qui
dépend du poste sans l'étiquette, vu par ses appels et par la matière de test qu'il importe par un
chemin relatif : l'enveloppe (`canWrap`, `bwrap`, le lanceur ou l'enveloppe du cadre), le `bd`
réel (`hasBd`), un serveur Temporal (`server start-dev`), sccache, systemd, le trousseau, la session
de l'utilisateur (`/run/user/`), la commande `claude` lancée pour autre chose que `plugin` ou
`--version` ; ce que la lecture ne voit pas (un chemin bâti à l'exécution, ce que lance le code du
produit) prend l'étiquette à la main, et une étiquette sans marque passe. Un vert de cette nuit ne
pose jamais le dernier vert : la nuit du poste (`scripts/nuit.sh`) seule le pose, après tous les
tests de nuit, étiquetés compris, puis les mesures. Ainsi la CI joue chaque nuit ce qu'elle peut
jouer, et le poste garde ce qu'il est seul à avoir.

**Le cadre porte la CI d'un projet** (`templates/projet/.github/workflows/`,
`packages/grillhouse/scripts/workflows-du-cadre.mjs`) : `ci.yml`, le lot (les gardes, les
tranches mesurées contre le commit d'avant un push, leur fusion ; il écoute
aussi les branches `agent/**` que pousse la file), et `nuit.yml`, les tests de nuit hors du
poste, tels que Grillhouse les joue chez lui. Chaque job tourne sur la variable `RUNNER` du dépôt
(`fromJSON(vars.RUNNER || '"ubuntu-latest"')`, une étiquette ou une liste d'étiquettes en JSON,
la convention de SyntHub), qui vit dans les réglages du dépôt sur GitHub et qu'aucun fichier
n'écrit. Les tranches couvrent chaque langage, chaque test joué une fois dans leur union :
Vitest par son découpage (`--shard`), cargo par celui de nextest (`--partition hash:i/n`, ses
doctests dans la première tranche), Python, que pytest ne découpe pas, dans la première tranche
seule ; la fusion ne relit que les rapports de Vitest, et un rouge de cargo ou de Python est le
rouge du job de sa tranche. La construction se prouve dans le job des gardes, dont les tâches
attendent la construction de chaque paquet : aucun job ne construit une seconde fois. Un workflow du cadre porte sur sa première ligne la marque « Généré par `npx grillhouse
maj` », comme un fichier engendré : `grillhouse init` les copie, et `npx grillhouse maj` réécrit
chaque workflow marqué qui diffère du gabarit et écrit celui qui manque à un projet qui en tient
déjà un. Un workflow sans la marque est au projet, et la mise à jour n'y touche pas ; un projet
sans workflow du cadre n'en reçoit aucun (la mise à jour ne lance aucune CI sur un dépôt), et la
migration 0.33.0 lui dit une fois comment l'adopter. Ainsi chaque projet joue la CI du cadre à sa
version, et garde la sienne tant qu'il ne l'adopte pas.

**Le cache distant de Turborepo** est partagé entre la CI et le poste, comme le cache distant de
Turborepo le prévoit (`TURBO_API`, `TURBO_TEAM`, `TURBO_TOKEN`, `TURBO_CACHE`, la signature HMAC
`remoteCache.signature` du `turbo.json` racine et sa clé `TURBO_REMOTE_CACHE_SIGNATURE_KEY`) ;
le serveur de Grillhouse est un `ducktors/turborepo-remote-cache` auto-hébergé. Dans la CI
(`ci.yml` du dépôt et du gabarit), le serveur et l'équipe viennent des variables du dépôt, le
jeton et la clé de ses secrets ; un push vers main ou une branche `agent/**` écrit le cache (le
run qui juge l'arbre sur lequel la file avance main), tout autre run le lit seul, et sans la
variable `TURBO_API` le cache reste local à l'exécuteur, aucune étape ne s'y ajoutant. Sur le
poste, les mêmes quatre variables vivent dans `~/.config/grillhouse/turbo-cache.env`
(`$XDG_CONFIG_HOME/grillhouse/` quand il est posé), hors de tout dépôt : chaque commande du module
du langage (`tests`, `verifier`, donc la nuit et les passes du circuit, qui les appellent) joue
sous l'environnement du poste que le module donne (`environnementDuPoste` de la jointure,
`avecLeFichierDuPoste` de `scripts/fichier-du-poste.mjs`), le cache lu seul
(`TURBO_CACHE=local:rw,remote:r`) ; sans le fichier rien ne change, et un environnement qui nomme
déjà l'une de ses variables (une CI sur un exécuteur du poste) le garde. La séance d'un agent
n'en a pas besoin : l'enveloppe ne lui rend ni le fichier (sa maison est vide) ni les variables
(son environnement est déclaré), et ses passes partagent le cache local de l'arbre principal.
Ainsi chaque run sert les suivants pour ce qui n'a pas bougé, et le poste en profite sans jamais
l'écrire ; la CI de main après l'avance rapide ne rejoue rien (« Main reste vert »).

**Le cadre arrive en un seul morceau** : le paquet npm `@roomi-fields/grillhouse` porte les
scripts, appelés par `npx grillhouse <sous-commande>`, et il est le greffon `grillhouse`, qui
porte les compétences, les agents, les crochets de Claude Code, cette charte et le métacadre,
comme un paquet d'ESLint porte son greffon. La place de marché `roomi-fields`
(`roomi-fields/claude-plugins`) le désigne par sa source npm ; le projet la déclare et active
`grillhouse@roomi-fields` (`npx grillhouse maj`). Ce qui est propre à un projet (sa charte, ses
réglages, sa version du paquet) vit dans le projet, jamais dans ce qui se publie. Une version de
npm vaut pour les deux : `npx grillhouse maj` met à jour le greffon resté derrière le paquet
(`claude plugin update`), comme `npm install` aligne ce qui est installé sur ce qui est déclaré,
et finit non nulle, avec la commande à taper, quand les deux restent en désaccord ; l'ouverture
de séance nomme un greffon chargé à une autre version que le paquet du projet, avec la commande
qui les remet d'accord. Dans un projet de TypeScript, `npx grillhouse maj` monte à `^<version>` la
plage du paquet dans chaque manifeste qui la déclare plus basse (la racine et chaque paquet,
`dependencies` ou `devDependencies`), comme `npm install <paquet>@<version> --workspaces` ou
syncpack alignent les déclarations d'une dépendance : un paquet resté sur l'ancienne plage
garderait sous lui une copie de l'ancienne version ; une plage qui couvre déjà la version reste.
Un projet n'en garde aucune copie
(`npx grillhouse maj` retire, à leur empreinte, celles que posait la 0.22) ; sans le paquet installé, l'ouverture de séance dit « lance `npm install` », et les autres crochets
sortent sans effet, comme un crochet que le paquet installé, plus ancien que le greffon, ne connaît
pas (sa commande répond « sous-commande inconnue ») : un crochet neuf ne bloque jamais un outil, un
tour ou un arrêt. Les crochets git du cadre suivent le modèle de Husky : le `prepare` du
projet lance `grillhouse hooks`, qui les pose à côté des sections de Beads, et chacun appelle
`grillhouse hook <nom>`, sans effet sans le paquet. Le même geste écrit dans la configuration du
dépôt le pilote de fusion du CHANGELOG (`scripts/fusion-du-changelog.mjs`, sur le modèle de
git-merge-changelog de gnulib), que le `.gitattributes` du projet nomme
(`CHANGELOG.md merge=grillhouse-changelog`, posé par le gabarit et par `npx grillhouse maj` ; Grillhouse l'y pose pour son propre fichier, le CHANGELOG du paquet publié, `packages/grillhouse/CHANGELOG.md`, dans le dossier de son paquet comme changesets et lerna : le plan de tout lot du paquet l'ouvre) :
partout où git fusionne en trois voies (l'intégration, la relance, la copie ramenée sur main),
deux ajouts au même endroit sont gardés tous deux, ceux de main d'abord, et tout autre conflit
reste un conflit. Ainsi chaque projet suit la version du cadre qu'il installe, sans fichier à
recopier.

**Un agent d'une équipe ne s'arrête pas sur un message non lu** : comme un consommateur d'une file
(SQS, Kafka) ne s'arrête pas sur des messages non acquittés, les crochets `SubagentStop` et
`TeammateIdle` du greffon (`npx grillhouse messages-non-lus`, `scripts/messages-non-lus.mjs`)
lisent la boîte de l'agent qui s'arrête (`~/.claude/teams/<équipe>/inboxes/<nom>.json`, que
Claude Code écrit) et bloquent l'arrêt tant qu'elle porte un message non lu (`read: false`) :
la raison, que l'agent reçoit comme sa consigne suivante, donne chaque message, son expéditeur et
son texte. Le nom de l'agent vient de l'entrée du crochet (`teammate_name`, le fichier méta de sa
transcription, un `agent_id` `<nom>@<équipe>`, son `agent_type`), son équipe du fichier méta ou
de la séance de son chef (`leadSessionId` du `config.json` de l'équipe) ; la liste des membres
n'est pas lue, un agent qui la quitte gardant sa boîte. Chaque message ne bloque qu'une fois : son `msg_id` se note sous
`~/.claude/grillhouse/messages-signales/<équipe>/<nom>.json`, que le crochet réduit aux messages
encore dans la boîte. Le crochet ne modifie jamais la boîte, et une boîte absente ou illisible,
une équipe introuvable ou une note impossible laissent passer l'arrêt. Ainsi une consigne
envoyée pendant qu'un agent rédige sa fin est traitée avant sa pause.

**Les dépendances notent le Node qui les a installées** : comme le fichier d'intégrité de Yarn
garde le système pour lequel il a installé, une installation complète (`npm ci`) écrit
l'interface binaire de son Node (`process.versions.modules`) dans `node_modules/.grillhouse-abi`
(`scripts/abi-des-dependances.mjs`) : le `prepare` du projet sous `npm ci`, et la nuit après le
sien ; `npm install` ne reconstruit rien de déjà installé et laisse la marque. La nuit réinstalle
quand le `package-lock.json` bouge ou quand la marque n'est pas celle de son Node, absente
comprise ; l'ouverture de séance nomme sous « Manque » une marque d'un autre Node, avec
`npm ci`. Ainsi un module natif construit pour un autre Node se reconstruit au lieu de refuser
de charger.

**Le cadre tourne sur le support long actif de Node** (le calendrier de nodejs.org) : le poste et
la CI de chaque lot sur Node 26, la nuit de GitHub et la sortie sur Node 24 et 26, le plus ancien
support long encore maintenu ; `engines.node` vaut `>=24.0.0` à la racine, dans le paquet et dans
le gabarit, dont le `packageManager` nomme le npm livré avec Node 26. Ainsi un projet ne dépend
jamais d'un Node en fin de vie.

**Le dépôt du cadre se mène avec une version publiée** : comme rustc se construit avec son
stage0 (un compilateur publié, fixé dans `src/stage0`, téléchargé dans un cache) et Bazel avec un
Bazel publié, l'outil qui orchestre est une version publiée, et le code construit et testé est
celui en cours. Dans Grillhouse, `node_modules/.bin/grillhouse` est le paquet de l'espace de
travail, le code que les tickets changent ; la clé `grillhouse.outil` du `package.json` racine
nomme la version publiée (`x.y.z`), que `npx grillhouse outil` installe sous
`~/.cache/grillhouse/outil/<version>/`, et que `npx grillhouse outil <x.y.z>` écrit puis
installe : changer de version est ce seul geste, que la sortie propose. L'installation pose le
paquet publié, puis les dépendances qu'il attend du projet (`peerDependencies`, les facultatives
comprises : TypeScript, Turborepo, API Extractor…), aux plages qu'il déclare : l'outil est
autonome, comme un stage0 apporte sa bibliothèque. Elle se fait dans un dossier à côté, renommé
une fois complet ; le dossier d'un processus mort se balaie à l'installation suivante, et celui
qu'un autre lancement a complété entre-temps se prend. La commande (`bin/grillhouse.mjs`)
aiguille avant toute sous-commande (`scripts/aiguillage.mjs`), selon trois listes où chaque
sous-commande du noyau a sa place, qu'un test tient :

- l'orchestration tourne par la version nommée, installée à son premier lancement : `circuit`,
  `superviseur`, `nuit`, `tableau`, `ligne-etat`, les crochets de Claude Code (`session-start`,
  `structure-guard`, `ticket-du-sous-agent`, `registre`, `attente-au-tour`, `attente-a-l-arret`, `messages-non-lus`), les verrous et les droits des séances
  (`verrou`, `commande`, `droits`), l'enveloppe et son lanceur (`enveloppe`, `lancer`),
  l'intégration et la file (`integrer`, `file`), `resultats`, `retirer-copie` et `bilan`, même
  lancés à la main par le superviseur ;
- le code de la copie : `tests`, `verifier`, `gardes-du-cadre`, `langages-des-paquets`,
  `dependances-internes`, `flux-des-paquets`, `temporaire`, `style-a-l-ecriture`, les crochets git (`hook`, `hooks`), `fusion-du-changelog`,
  `composants-affectes`, et les commandes des modules de langage ;
- les outils du dépôt, qui tournent par son code : `init`, `maj`, `paquet`, `sortie`, `outil`,
  `greffons`, `sous-modules`, `pression`, `temporal`, `ticket`.

Une version non installable (le réseau absent) se dit en une ligne sur la sortie d'erreur, et le
code du dépôt la remplace. L'échec s'écrit dans le fichier d'état de l'outil
(`~/.cache/grillhouse/outil/<version>.echec`, sa date et sa raison), retiré à la première
installation réussie : pendant 5 minutes, aucun lancement ne relance npm ; tant qu'il existe pour
la version de la clé, l'ouverture de séance le dit sur sa sortie standard (« l'orchestration tourne
sur le code du dépôt », avec `npx grillhouse outil` qui la réinstalle), et le tableau porte une
alerte orange, « Outil <version> non installable : code du dépôt ». Ainsi un échec qui dure se
voit. Le paquet qui tourne est la version installée quand leurs chemins sont les mêmes : il
tourne alors sur place, sans variable d'environnement qui passerait aux agents. Le circuit lancé
par la version publiée lance ses scripts voisins et le greffon de son paquet, et joue les tests,
la preuve du rouge, les contrôles et les gardes par `npm` dans la copie du ticket, dont
l'installation lie son propre `packages/grillhouse` ; la nuit joue sa passe de même dans sa copie.
Les crochets du greffon installé, les droits des séances et le panneau appellent la commande du
projet, donc l'aiguillage. Un projet ordinaire n'a pas la clé : rien ne change, sa commande est
déjà la version qu'il installe. Ainsi un défaut du jour ne casse jamais le circuit qui le corrige.

**Le service Temporal du compte porte les déroulés du cadre** (grillhouse-4nr, décisions D1, D2,
D8) : un serveur de développement de Temporal tourne en service durable du compte, en local, et des
travailleurs en TypeScript y servent les déroulés, comme une application Temporal se déploie (un
serveur, des travailleurs par file de tâches, des clients). Le code vit sous `src/temporal/`, le
seul TypeScript du paquet : `tsc -p tsconfig.build.json` (son script `build`) le construit dans
`dist/temporal/`, que git ignore. Trois gestes le construisent : `npm ci` (le script `prepare` du
paquet, que npm joue pour un paquet de l'espace de travail), la tâche `build` de Turborepo avant les
tests et le typage, et le `prepack` avant toute archive, si bien que le paquet publié porte `dist/`
(le champ `files`) même quand la publication suit `npm ci` seul. Une sous-commande dont le script
construit manque (une copie dont `dist/` est absent) le dit, nommée avec `npm run build --workspace
@roomi-fields/grillhouse`, et sort en 1 (`scriptAbsent` de `scripts/sous-commandes.mjs`). Les
dépendances `@temporalio/*` sont épinglées à une version exacte.

- **La bibliothèque cliente commune** (`src/temporal/client.ts`) est le seul module qui ouvre le
  client Temporal et la connexion d'un travailleur ; le travailleur et `grillhouse temporal etat` la
  lisent. L'adresse et l'espace de noms viennent des variables de Temporal (`TEMPORAL_ADDRESS`,
  `TEMPORAL_NAMESPACE`), le serveur du compte, `127.0.0.1:7233`, par défaut. Le client s'ouvre
  paresseux : aucune connexion avant son premier appel. `lireLeDeroule` lit d'un déroulé, au serveur
  seul, sans travailleur vivant, son statut, son mémo, ses attributs de recherche et le dernier
  signe de vie de son activité en cours.
- **Les attributs de recherche du cadre** (`src/temporal/attributs.ts`) sont `GrillhouseTicket` et
  `GrillhouseEtape`, deux mots-clés ; le serveur les enregistre à son démarrage, et un déroulé les
  met à jour à chaque étape, si bien que le tableau et `temporal workflow list` les lisent au
  serveur.
- **Le travailleur** (`dist/temporal/travailleur.js --file <file>`) sert les déroulés du cadre et
  leurs activités sur une file de tâches, et écrit `prêt <file>` une fois à l'écoute ; SIGTERM
  l'arrête proprement. Il sert tous les déroulés du cadre (`src/temporal/deroules.ts` : la sonde,
  les places de la machine, le circuit d'un ticket, la file d'un projet et la CI d'un commit, la
  file des tickets d'un projet, les nuits du poste). La sonde (`src/temporal/sonde/`) est un déroulé dont
  l'activité lance un processus, envoie un signe de vie à chaque pas (`heartbeat`), et reprend au
  dernier signe de vie que le serveur garde quand son travailleur meurt ; le déroulé attend au
  besoin le signal `finir`. Le serveur tué par SIGKILL et relancé sur le même fichier, le déroulé
  reprend avec son histoire (`tests/temporal/sonde.nuit.spec.ts`).
- **`grillhouse temporal installer`** pose le programme `temporal` à sa version épinglée (`EPINGLE`
  de `src/temporal/installation.ts` : la version et la somme SHA-256 de l'archive de chaque
  plateforme, celles du `checksums.txt` de la publication), téléchargé depuis la publication de
  temporalio/cli, sous `~/.cache/grillhouse/temporal/<version>/temporal`, comme rustup et le stage0
  de rustc posent un binaire vérifié dans un cache. Une archive dont la somme diffère est refusée
  avant tout dépôt, les deux sommes nommées. Il écrit ensuite trois unités systemd du compte,
  chacune relancée par systemd (`Restart=always`) : `grillhouse-temporal.service`, le serveur
  (`temporal server start-dev`, sur `127.0.0.1` seulement, son état dans
  `~/.local/share/grillhouse/temporal/temporal.db`, les attributs du cadre enregistrés, le tableau
  web sur le port 8233, son espace `default` réglé à chaque départ, une fois le serveur prêt, pour
  garder un déroulé fermé 30 jours, `temporal operator namespace update --retention 720h`, là où
  start-dev donne 24 h) ; `grillhouse-travailleur-<projet>.service`, le travailleur du projet sur
  la file `grillhouse-projet-<projet>` ; `grillhouse-travailleur-machine.service`, le travailleur
  de la machine sur la file `grillhouse-machine`. Chaque travailleur joue la version publiée que le
  projet nomme (`grillhouse.outil`), posée sous `~/.cache/grillhouse/outil/<version>/` quand elle
  manque, comme la commande du circuit, une version sans travailleur refusée par son nom (la
  version se pose dans son cache avant ce refus, qui l'y lit : seule écriture avant un refus) ; sans clé,
  la version du cadre que le projet installe. Une unité de systemd part d'un PATH nu : celle de
  chaque travailleur nomme le PATH des outils du compte qu'un circuit lance (node, npm, claude, bd,
  gh, trouvés dans le PATH de l'installation, un outil absent refusé par son nom avant toute
  écriture), puis les dossiers des `executables` de chaque langage que l'architecture du projet
  déclare (`langagesDe` : cargo, python3 ; un absent refusé par son nom, un projet sans langage
  ou à langage inconnu refusé avant toute écriture ; un dossier une seule fois, après ceux du
  compte et avant ceux du système), et chaque outil du projet (`grillhouse.outils`), sa variable. L'unité de chaque travailleur reçoit enfin `Environment=TEMPORAL=<programme posé>`, tiré du
  programme posé et non d'une clé `grillhouse.outils.TEMPORAL` que le `package.json` porterait ; l'installation
  n'écrit jamais ce `package.json`. Ce que systemd a
  appliqué se tient à part de ce qui est écrit : la somme du texte de chaque unité, une fois
  `systemctl --user daemon-reload`, `enable` des trois unités et `restart` des unités en attente
  réussis (`~/.local/state/grillhouse/temporal/unites-appliquees.json`). Une unité écrite que
  systemd n'a pas appliquée (un `systemctl` en échec) l'est au passage suivant. Rejouée sur une
  installation à jour et appliquée, l'installation ne change rien : rien ne se télécharge, aucun
  fichier ne s'écrit, systemd n'est pas appelé.
- **La montée de version est transparente** : quand `grillhouse.outil` change de version, l'unité du
  travailleur reste sur l'ancienne jusqu'à `npx grillhouse temporal installer`. L'ouverture de séance
  le détecte (`travailleurPerime`, lue par `grillhouse temporal perime`) : les sommes appliquées
  (`unites-appliquees.json`) comparées aux textes que `installer` écrirait, calculés par le même code
  (`textesAttendus`), le travailleur de la version pris dans son dossier du cache des outils, sans
  rien poser, lancer ni écrire. Un écart, un outil introuvable ou aucun outil déclaré compris, range
  « le travailleur de Temporal périmé » sous « Manque », avec la seule commande ; sans état appliqué
  (le déploiement initial), rien ; la copie d'un agent ne le lit pas.
- **`grillhouse temporal installer --programme-seul`** pose le programme seul, vérifié de même, et
  écrit son chemin sur la sortie standard : aucune unité, aucun `package.json`, aucun `systemctl`.
  La nuit obtient ainsi le programme épinglé (idempotent), par la commande construite de la version
  qui la joue, non celle de sa copie, pas encore construite, et l'exporte en `TEMPORAL` avant ses
  commandes (`scripts/nuit.sh`), par-dessus toute clé restée dans un `package.json` ; la CI, dont aucun
  test de jour ne lance Temporal, ne l'installe pas.
- **`grillhouse temporal etat`** dit, pour le serveur, le travailleur du projet et le travailleur de
  la machine, s'ils tournent (`systemctl --user is-active`), la version du programme posé et si le
  serveur répond ; sans installation, il dit ce qui manque et sort en 1.
- La maison, le dossier des unités, le projet et le programme `systemctl` sont des options
  (`--maison`, `--unites`, `--racine`, `--systemctl`) : les tests installent sous une maison
  d'essai, avec un faux `systemctl`, et jamais dans le systemd du compte. Les tests qui jouent un
  déroulé lancent le programme de `TEMPORAL` s'il nomme un programme existant, sinon le programme épinglé déjà
  posé sous `~/.cache/grillhouse/temporal/<version>/temporal`, sur un port libre et un fichier de base
  temporaire ; sans l'un ni l'autre, ils échouent en nommant la variable et la commande de pose
  (`npx grillhouse temporal installer --programme-seul`). Ce sont des tests de nuit. Le fichier de base de référence (`tests/temporal/base-de-reference/temporal.db`,
  commité par une exception du `.gitignore`), enregistré par la version épinglée, se relit sous le
  serveur courant avec son histoire ; à la prochaine montée d'épingle, il reste celui de la version
  d'avant, et le même test mesure la relecture d'une vraie version précédente. Son espace `default`
  garde un déroulé fermé un siècle : les 24 h que lui donne start-dev purgeaient le déroulé du
  fichier un jour après son enregistrement. Il se réenregistre (`tests/temporal/
enregistrer-la-base-de-reference.mjs`, avec la version épinglée d'alors) quand son déroulé de
  sonde change de forme au point que la relecture ne le reconnaît plus, jamais à une montée
  d'épingle. Le serveur du compte, lui, garde un déroulé fermé 30 jours (`RETENTION` de
  `installation.ts`) : un circuit arrêté sur le mot du superviseur se rouvre de son état dans ce
  délai, et au-delà par `--depuis` ; ce qui doit durer plus vit au ticket. Les tests démarrent leur serveur d'essai quand son
  frontal se dit en service et décrit son espace, non quand son port s'ouvre.

- **Le déroulé de la machine tient ses places** (grillhouse-4nr.7, décision D2), comme le serveur
  de tâches de GNU make partage ses places entre tous les make d'une construction, et comme le
  sémaphore des exemples de Temporal (samples-typescript « mutex ») accorde ses baux : un seul déroulé
  pour la machine (`src/temporal/places/`), le seul état des places. Un circuit tire son rang
  d'arrivée à son lancement par la mise à jour `tirerUnRang` ; une séance demande une place par la mise à jour `prendre`, qui inscrit la demande et rend aussitôt ;
  la boucle du déroulé accorde les places, et la séance apprend la sienne par la requête
  `laDemande`. Aucun gestionnaire ne reste ouvert pendant une attente, si bien qu'une demande vit
  dans l'état que porte la continuation. Le signal `rendre` rend la place ou retire la demande,
  `rattacher` nomme le processus qui la tient ; la requête `lesPlaces` donne au tableau les places
  et les attentes. Un accord passe par la règle des places
  (`refusDeLaPlace` de `scripts/regles-des-places.mjs`, sans entrée-sortie, que le déroulé importe) :
  une place libre sous le plafond, le tour de son rang d'arrivée entre projets, l'admission à la
  charge et à la mémoire (mesurée par une activité, `scripts/mesure-de-la-machine.mjs`, une fois par
  jugement et seulement quand la place et le tour passent), l'espacement des départs. Les demandes
  se rejugent à chaque changement et à chaque veille ; une place ou une demande dont le processus a
  disparu (une seule activité pour toutes) part alors pour de bon. Passé sa longueur d'histoire, le
  déroulé se continue (Continue-As-New) avec son état. Le travailleur sert ses activités avec celles de la sonde
  (`src/temporal/deroules.ts`). Les séances, les passes et le tableau le lisent par
  `scripts/places-de-la-machine.mjs`, qui le démarre quand aucun ne tourne.
- **Le déroulé d'un ticket mène son circuit** (grillhouse-4nr.6, décision Q3), comme un pipeline de
  GitLab qui attend un job manuel : un déroulé par ticket, `circuit:<racine>:<ticket>`
  (`src/temporal/circuit/`). Il décide par les fonctions pures du circuit (`transition` de
  `scripts/transitions.mjs`, qu'il importe) et joue chaque acte en activité : l'ouverture d'un run
  et son plan (`ouvrir` de `scripts/circuit.mjs`), le début d'une étape et la préparation de sa
  passe, chaque fait qu'une décision demande (`lireLeFait`), les effets, un arrêt écrit
  (`publierLArret`, puis `monter`), la fin. Chaque acte joue dans un processus à lui
  (`scripts/faits-du-circuit.mjs`), dans l'arbre principal du dépôt, comme un runner de CI joue
  chaque job, si bien que le travailleur, que les passes synchrones du circuit ne bloquent pas, bat
  son cœur toutes les 5 s, le dernier signe de vie de la séance dans ses détails. Une tentative
  rejouée après la mort de son travailleur tue le groupe de la tentative morte, son meneur mort ou
  non (`groupeVivant`, `signalerGroupe` de `scripts/mesure-de-la-machine.mjs`, seuls), et sa séance
  attend le groupe que celle-ci a laissé (`precedent` de `lancer`) : jamais deux séances vivantes.
  Une activité est livrée au moins une fois, et le déroulé suit donc le modèle documenté de
  Temporal : **une activité, un effet extérieur qui ne se rejoue pas sans dommage, une clé**, et
  le « functional core, imperative shell » pour le code de ses actes.
  - Le code partagé (`scripts/circuit.mjs`, `scripts/seances.mjs`, `scripts/activites.mjs`) rend
    ses écritures extérieures en données, des effets (`scripts/effets.mjs`, seul à les écrire) : un
    commentaire au ticket, une fiche gardée, une découverte consignée, l'état du circuit, le bilan,
    le plan écrit au ticket, une ligne du registre. Un acte du déroulé les
    rassemble et les rend avec son résultat, ses propres lectures voyant ceux qu'il a déjà rendus.
    Le déroulé joue ensuite chaque effet en activité, l'un après l'autre (`jouerUnEffet`), jusqu'au
    dernier même sous un `--arreter`, qui arrête le run à l'acte suivant. Une activité qui
    écrirait plusieurs de ces effets n'existe pas ; le journal du ticket et la sortie d'erreur, qui
    se relisent sans dommage, restent écrits en place. L'état d'une séance en cours
    s'écrit à son début, sous un acte aussi (`ecrireAussitot`), que `--arreter` et une reprise
    lisent ;
    le port du signe de vie relit l'état que le dépôt tient quand l'acte n'en tient aucun
    (`portsDe`), si bien que cet état garde son étape.
  - Un effet raté a sa suite (`ecrireLEffet`) : un commentaire, une découverte non créée, une ligne du registre, le bilan,
    la ligne du tri, des étiquettes ou une réouverture non écrits se disent sur la sortie
    d'erreur et le circuit continue ; l'état, une fiche (la ligne d'une découverte créée
    comprise) ou le plan non écrits l'arrêtent ; une réponse de bd illisible
    vaut une panne. Sous le déroulé, un effet qui se dit reste une panne que Temporal rejoue
    (`EffetNonEcrit`, rejouable pour acte.ts) jusqu'à la dernière tentative de son activité,
    et ne se dit qu'à elle. La ligne du tri s'écrit après ses écritures et lit alors chaque
    découverte (`resume-du-tri` : son verdict parmi ses commentaires, ses étiquettes, son état
    quand il la rouvre) : une écriture absente est nommée parmi les écritures en échec, avec la
    cause que bd a donnée quand elle a raté (gardée parmi les fiches du ticket), une
    découverte restée fermée n'est pas comptée rouverte.
  - La clé d'un effet est celle de son activité : le déroulé, son run et l'identifiant d'activité
    que le déroulé fixe de façon déterministe (le rang de l'effet dans le run, puis sa sorte :
    `effet:<rang>:<sorte>`), que Temporal garde identique d'un essai à
    l'autre ; le run en fait partie, comme Temporal le recommande, parce qu'un même déroulé repart
    sous un run neuf (Continue-As-New, un circuit relancé) avec des pas comptés de nouveau. Elle
    n'est jamais calculée dans l'activité à partir de l'état, du texte ni d'un événement nommé.
    Deux effets d'un même acte sont deux activités, donc deux clés.
  - Un effet qui se rejoue sans dommage (réécrire l'état entier, écrire le plan, poser des
    étiquettes) n'a pas de clé. Un effet qui ne l'est pas se lit avant de s'écrire sous sa clé : un
    commentaire la porte dans une ligne de commentaire HTML et se cherche d'abord, le bilan dans son
    commentaire, une fiche ou une ligne du registre la porte dans sa ligne, une découverte dans son
    corps.
  - Une séance d'agent est une activité. Son identifiant porte l'essai de l'activité
    (`<séance>-e<essai>`), si bien que deux essais ne se disputent jamais un `--session-id`.
    lancer.sh range le résultat de chaque séance sous son identifiant
    (`<copie>.travail/seances/<id>/` : `fin`, `resultat.json`, `hors-plan` ; `rangDeLaSeance` de
    `scripts/seances.mjs`), une séance hors de l'enveloppe le sien au même lieu. À l'essai 2 et plus, l'activité cherche d'abord l'essai mort par le signe de
    vie de son groupe : un groupe encore vivant s'attend, puis son résultat se lit ; un résultat
    rangé se rend, sans seconde séance, au dernier lancement de l'essai mort quel que soit son
    rang (la séance ou sa reprise), avec la ligne de lancement morte avec lui, que le bilan
    compte ; seul un essai mort sans résultat se relance, par une séance neuve : jamais deux
    séances vivantes, et une séance presque finie n'est jamais jetée.
  - Le plan et les arrêts sont ordonnés par le déroulé, leurs décisions dans des fonctions pures
    (`scripts/transitions.mjs`), les reprises de `scripts/circuit.mjs` inchangées. L'ouverture
    s'arrête avant le plan (`ouvrirJusquAuPlan`) et rend le plan à écrire ; le déroulé joue
    chacun de ses pas dans une activité à lui (`jouerUnPasDuPlan` : l'explorateur, le
    questionneur, la réponse de l'explorateur), le suivant décidé par `pasDuPlan`, la conclusion
    jouée avec le dernier (`unPasDuPlan`), si bien que le plan tient en trois séances au plus. Un arrêt se publie en effets
    ordonnés, un par activité, sa question une seule fois.
  - Un circuit arrêté sur le mot du superviseur a fini son déroulé : sa réponse (`--reprendre`,
    `--depuis`, `--etendre`) démarre un déroulé neuf sur le même identifiant et la même file,
    avec les bornes de l'entrée qu'il suit (`repasserMs`, `repassesMax`, `ci`), qui s'ouvre sur
    elle depuis l'état que le déroulé arrêté a rendu (`reprise` et `etatDArret` de son entrée),
    et non comme un premier lancement ; un déroulé fini sans son issue se rouvre de même depuis
    l'état que son mémo garde entier (`ecrit`). Au-delà de la rétention du serveur (30 jours),
    seul `--depuis` rouvre un circuit, sur la file du travailleur du projet. Le client refuse,
    avant tout déroulé, `--reprendre` sur un état absent ou intégré, `--etendre` sur un état
    intégré ou un déroulé fini sans son issue, jamais `--depuis`. Ces refus, le refus
    d'un validateur d'un déroulé qui tourne (son échec de type `RefusDuValidateur`, seul nommé
    ainsi ; tout autre échec d'une mise à jour reste celui de Temporal), un déroulé fini sans son
    issue (terminé de force, en échec) et une réponse qu'une autre a devancée lèvent une erreur
    nommée (`ReponseRefusee`), que la commande rend en code 2.
  - Les tests mordent là où la clé se construit : une mutation de chaque sorte d'identité (le
    déroulé, le run, l'identifiant d'activité) rougit, et un test de nuit sous Temporal tue le
    travailleur pendant une séance.
    Un fait se relit sur une tentative rejouée : une lecture, une mesure, une passe des contrôles,
    une régénération se rejouent sans dommage. La file d'un projet suit le même modèle : chacun de ses gestes se rejoue sans
    dommage (main avancé sur un lot déjà sur main l'entre, un ticket fermé reste fermé, un commit
    poussé se repousse tel quel), et ses commentaires sont des effets que ses actes rendent, que le
    déroulé de la file écrit un par activité (`jouerUnEffetDeLaFile`, d'identifiant
    `<lieu>:effet:<rang>:<sorte>`). Un arrêt ne finit pas le déroulé : il écrit sa
    question, puis attend la réponse du superviseur, les mises à jour `reprendre`, `depuis` et
    `etendre`, dont le validateur refuse une réponse hors d'une attente, ou une seconde réponse à la
    même question, sans rien écrire dans l'histoire, et le signal `arreter` ; une réponse dit ce
    que le tour a tranché (« repris », ou l'arrêt qu'un `arreter` du même tour impose) ; la réponse rouvre le
    run sur l'état arrêté (`ouvrir`). `arreter` pendant une
    étape annule son activité, sa séance tuée ; pendant l'écriture d'un arrêt, il arrête le circuit
    une fois l'arrêt écrit. Un acte qui échoue (l'ouverture, la préparation d'une passe, un fait, les
    effets, la fin, l'arrêt sur le mot du superviseur) est l'arrêt « inattendu » à l'étape où il est
    tombé, sa réponse attendue ; quand l'acte de l'arrêt
    échoue lui aussi, l'arrêt tient dans le seul mémo (`arretSansActe` de `scripts/transitions.mjs`). Un « a-repasser » (75) se rejoue seul après
    10 min, 6 fois de suite au plus, puis sa question monte (décision D4). Les effets qu'une étape a
    décidés avant un fait qui échoue s'écrivent avant son arrêt : `transition` les rend avec chaque
    fait qu'elle demande. L'étape et la question sont un attribut de recherche et le mémo. Une
    histoire enregistrée (`tests/temporal/histoires/`) se rejoue sur le code courant (décision D7).
    `npx grillhouse circuit` en est le client.
- **La file d'un projet fait entrer ses lots un à un, chacun jugé par la CI de sa branche**
  (grillhouse-4nr.8), comme bors et Zuul ne fusionnent que l'arbre que la CI a jugé : un déroulé par
  projet, `file:<racine>` (`src/temporal/file/`), que le déroulé d'un ticket démarre quand aucun ne
  tourne (un enfant détaché, que ni la fin ni l'annulation de son parent n'atteignent) et où il
  entre à son étape 5.2. La file prend une entrée à la fois, dans son ordre d'arrivée : la branche
  `agent/<ticket>` devient la candidate, sur la pointe de main (replacée dans la copie de la file
  quand main a bougé, ses fichiers engendrés régénérés), poussée sur origin ; la CI de cette
  branche se suit jusqu'à sa conclusion, quel que soit l'exécuteur qui la joue (la file lit le
  passage de la branche, `gh run list --commit <sha> --branch agent/<ticket>`) ; verte, main
  avance en avance rapide sur la candidate, l'arbre jugé, le ticket se ferme, main se pousse et
  la branche quitte origin ; main a bougé entre-temps, la branche se replace et sa CI se rejoue,
  cinq jugements au plus. Rouge, main ne bouge pas, le ticket se rouvre avec l'adresse du passage
  et la fin de son journal d'échec ; non lue (sans `gh`, sans passage, au-delà de l'attente), la
  branche reste en file, sa raison dite. Aucun flux ne se lance sur la branche : pas de vert, pas
  d'entrée, comme bors sans son statut requis ; la branche reste en file, le ticket dit que la CI
  du projet doit écouter `agent/**`, que l'ouverture de séance signale (rubrique « Manque »,
  `scripts/ci-des-branches.mjs`) et que `npx grillhouse maj` ajoute au push du flux de la CI des
  lots (migration 0.33.0). Le changement du code du déroulé suit le « patching » de Temporal
  (`patched('ci-de-la-branche')`) : un run qui a enregistré ses entrées avant lui les rejoue sur le
  code d'avant, chaque entrée neuve prend le chemin neuf ; la version suivante passe à
  `deprecatePatch`, puis retire le code d'avant. Rien ne se vérifie sur le poste : ni l'intégration ni la file ne jouent `npm run
  verifier`. Son issue revient au déroulé du ticket, le fait `file` de ses décisions. La CI d'un
  commit (`ciDuCommit`, un déroulé enfant) se lit une lecture à la fois, un minuteur durable entre
  deux (10 s), sa recherche (2 min) et son attente (30 min) comptées sur l'horloge du déroulé : la
  mort du travailleur n'en perd pas l'attente. Les gestes sont ceux de
  `scripts/integration/file.mjs`, que ses actes appellent ; un lot déjà sur main est entré, pas
  écarté (la branche pointe sur le commit de main qui livre son ticket, ou chacun de ses commits a
  son équivalent sur main, même patch selon `git cherry`, le rejeu qu'écrit un rebase, ou la
  branche n'est plus ; l'ancien lot d'un ticket rouvert n'est ni l'un ni l'autre), si bien qu'une
  tentative rejouée après la mort de son travailleur finit le ticket sans le rouvrir. Un acte de
  la file qui échoue rend à l'entrée l'issue `echec`, sa raison, sur laquelle le circuit du ticket
  pose son arrêt « inattendu », et la file continue avec les entrées suivantes ; une fermeture qui
  échoue une fois main avancé le dit (le main local porte le lot, non poussé), et `--reprendre`
  repasse le ticket par la file, qui trouve son lot sur main, le ferme et le pousse sans le juger
  de nouveau. Une lecture de la CI qui échoue la conclut non lue, l'échec pour raison. Un acte
  arrêté (`--arreter`, le délai d'une activité) finit son groupe de processus, les commandes
  qu'il lance comprises, avant que son activité échoue. Les histoires enregistrées de la file et de
  la CI d'un commit se rejouent sur le code courant. Une CI rouge rouvre le ticket, et sa question
  monte ; `--reprendre` après un rejeu vert renvoie la branche, que la file fait entrer. Le
  déroulé est le seul registre de la file : l'intégration n'inscrit aucune entrée, elle pose
  l'étiquette `en-file`, que la file retire ; la copie de la file (`.claude/worktrees/file`) se
  garde toujours, sans verrou.
- **La file des tickets d'un projet lance ses circuits, pas plus que son réglage** (grillhouse-4nr.9,
  décision D9), comme Zuul et les merge queues lancent un changement dès que ce dont il dépend est
  fusionné : un déroulé par projet, `tickets:<racine>` (`src/temporal/tickets/`), réveillé toutes
  les 60 s et à la fin de chacun de ses circuits. À chaque réveil, il
  compte les circuits vivants du projet (ceux que le serveur fait tourner, et ceux qu'il vient de
  lancer, que la visibilité du serveur peut ne pas montrer encore), puis lance le circuit de chaque
  ticket qui part (`ticketsAPartir` de `scripts/file-des-tickets.mjs` : ouvert, étiqueté `circuit`, sa
  section « ## Architecture » écrite, ses dépendances fermées, par priorité), pas plus de vivants à la fois que le réglage
  du projet (`grillhouse.circuits` du `package.json`, `scripts/circuits-cles.mjs`, 1 quand il
  manque). Un circuit qui attend la réponse du superviseur est vivant : son déroulé tourne, en
  attente durable de la réponse, et le serveur ne le purge jamais ; à 1, le suivant part quand le
  précédent finit. Un déroulé ne se ferme qu'intégré (son ticket fermé dans Beads) ou arrêté sur le
  mot du superviseur (`--arreter`, l'étiquette `circuit` retirée) : Beads, le registre durable,
  le garde de repartir. Un circuit vivant dont le ticket est fermé hors de son circuit (livré en
  direct), avant son intégration, ne compte plus : la file l'arrête (`ARRETER`) à son réveil
  suivant et écrit sa ligne « termine » au journal des états (`fermesHorsCircuit` de
  `scripts/file-des-tickets.mjs`), comme Zuul retire de son pipeline un changement abandonné ou
  fusionné ; un circuit à son intégration (5.1 à 5.3) a fermé son ticket lui-même, et reste. Les circuits que le serveur tient sans les avoir intégrés
  (`circuitsNonIntegres`, sur `lireLesCircuits`, un appel) tiennent aussi leur ticket, un circuit
  fini sans son issue compris. Chaque circuit est un enfant détaché ; un ticket dont le circuit tourne
  déjà, visible ou pas encore, ne repart pas. Une faute (le réglage, un `package.json` qui ne se
  lit pas, une Beads qui échoue) ne lance rien, nommée dans la requête. Après une reprise à neuf
  (Continue-As-New), la fin d'un circuit lancé avant se lit au réveil suivant.
  `npx grillhouse circuit <ticket>` y met un ticket.
- **Les nuits du poste passent l'une après l'autre, sous une seule planification**
  (grillhouse-4nr.13, décision D6), comme une planification de Temporal, avec sa fenêtre de
  rattrapage et son refus de chevauchement, remplace des lignes de table des tâches, et comme
  Jenkins ne construit pas sans changement : le code vit dans `src/temporal/nuits/`. Une seule
  planification du poste (`grillhouse-nuits`, sur la file `grillhouse-machine`) part chaque jour
  à son heure, dans le fuseau du poste : une heure de la machine, que la planification garde, à
  part de la plage de nuit de chaque projet que compte le bilan (1 h par défaut, le plus tôt des
  départs de l'ancienne table des tâches), chevauchement SKIP, une nuit manquée (le poste éteint) rattrapée dans les
  24 h, une fois. Son déroulé `nuitPlanifiee` demande les nuits planifiées au seul déroulé des
  nuits, `nuitsDeLaMachine` (`grillhouse-nuits-de-la-machine`, démarré s'il ne tourne pas), puis
  finit : une planification suffixe l'identifiant de ce qu'elle lance, et le déroulé des nuits
  garde ainsi le sien. Une demande planifiée lit les projets du registre du poste
  (`~/.claude/grillhouse/registre.jsonl`, `scripts/registre.mjs`) : un projet neuf entre à sa
  première séance notée. Un projet dont la racine n'existe plus, ou sans nuit branchée
  (`node_modules/.bin/grillhouse`, le script `verifier`, un commit), est écarté avec sa raison ;
  un projet dont le sommet est le commit de sa dernière nuit verte (`<git common
  dir>/nuit/dernier-vert`, que la nuit verte seule écrit, à part du dernier vert que les passes du
  jour écrivent aussi) est sauté, sa raison, le sommet et la référence écrits au journal de sa
  nuit et au registre (une ligne de rôle `nuit`, que le tableau ne compte nulle part) ; un projet
  sans marqueur, ou dont le marqueur ne se lit plus comme un commit, joue. Un projet intégré vert
  dans la journée rejoue donc ses tests de nuit et ses bancs. Les nuits passent l'une après
  l'autre, chacune à la fin de la précédente, quel que soit son verdict : une nuit rouge, ou une
  activité en échec, n'arrête pas les suivantes. La passe d'une nuit est `node_modules/.bin/
  grillhouse nuit` dans l'arbre principal du projet (`scripts/nuit.sh`, inchangé, de la version
  que le projet installe), dans un groupe de processus à elle ; une tentative rejouée après la
  mort de son travailleur termine d'abord le groupe que la morte a laissé. `npx grillhouse nuit
  <projet>` demande la nuit d'un projet sans lire son marqueur, par le même déroulé ; un projet
  déjà en file ou en cours n'est pas joué deux fois. `npx grillhouse nuit --planifier [--heure <0-23>]`
  crée la planification, ou met à jour celle qui existe ; sans `--heure`, elle garde l'heure
  qu'elle a déjà. L'ouverture de séance ne propose aucune ligne de
  la table des tâches, et nomme une ligne qui lance encore la nuit, avec son retrait.

Ainsi les déroulés du cadre survivent à une séance fermée et à un redémarrage, et chaque transition
s'inscrit dans l'histoire du serveur.

**Les décisions du circuit ne lisent pas la machine** (grillhouse-4nr.5, décision D3) : comme un
déroulé de Temporal décide sur les résultats de ses activités et un réducteur de Redux sur ses
actions, les décisions de chaque étape du circuit vivent dans `scripts/transitions.mjs`, sans
entrée-sortie. `transition` reçoit l'état de l'étape (son numéro, sa tentative, son rapport, le
drapeau de la passe finale), la mémoire du circuit (les contrôles rouges, le renvoi au testwriter,
le refus de l'intégration, la régénération à faire et celle faite, le lot vérifié, les constats
ouverts) et les faits lus jusque-là ; elle rend le prochain fait à lire (une séance, une passe,
une lecture de la copie ou du ticket, avec ses paramètres), ou la décision : l'étape suivante, la
mémoire changée, les effets en données (une ligne au ticket, un geste, un rapport, un résultat
gardé), puis l'arrêt par son nom, la fin ou un usage fautif. Chaque appel se rejoue depuis le
début de l'étape sur les faits déjà lus, comme Temporal rejoue un déroulé sur son histoire. La
boucle de `derouler` (`scripts/circuit.mjs`) lit les faits demandés et joue les effets, sans
décider elle-même. Le code de sortie « à repasser », 75, vit dans `scripts/codes-de-sortie.mjs`,
que la liste des étapes importe. Une garde (`tests/unit/transitions.spec.ts`) refuse `node:fs` et
`node:child_process` dans ces trois modules et dans ce qu'ils importent, et la table des
transitions de chaque étape y est testée. Ainsi le déroulé d'un ticket sous Temporal (4nr.6)
reprend ces décisions telles quelles.

**Les séances d'agent sont des activités** (grillhouse-4nr.3, décision D3) : comme une activité
de Temporal, chaque séance (`scripts/seances.mjs` : `lancer`, `jusquALaFiche`, `seance`) joue un
groupe de processus (`jouerLeGroupe`) qui envoie un signe de vie `{ pid, depart, seanceId }` à son
lancement et à chaque pas de sa veille, puis null à sa fin ; le circuit l'écrit dans son état
(`seance`), que le tableau, `--arreter` et une reprise lisent. Une transcription immobile arrête le
groupe ; une annulation (un `AbortSignal`) le tue et la séance finit sur `SeanceAnnulee` ; un
lancement qui trouve vivant le groupe d'un lancement d'avant (son dernier signe de vie : le même
processus, par son départ) l'attend, sous la même veille, avant de prendre sa place (`lancer`) :
le second essai de `jusquALaFiche`, et la séance neuve qui suit une reprise en échec. L'identifiant
de chaque séance vient de son appelant, qui en donne un neuf à chaque séance qu'il lance ; sans
lui, la séance est refusée avant tout lancement. Les lectures et écritures du ticket que le circuit et ses activités
partagent (commentaires, fiches, journal, l'arrêt `Arret`, les gestes `geste`) vivent dans
`scripts/ticket-du-circuit.mjs`.

**Les passes, les références, l'intégration, la relecture et le tri sont des activités**
(grillhouse-4nr.4, décision D3) : `scripts/activites.mjs` porte la preuve du rouge (`preuve`), les
contrôles et la passe finale (`controles`), la régénération des références (`regenerer`),
l'intégration (`integrer`), la relecture (`relire`), le tri (`trier`) et les lectures de la copie
(son arbre, son lot gardé, son empreinte, ce qu'elle livre). Chacune reçoit ses entrées et rend
son issue, sans lire ni écrire la mémoire du circuit : la relecture reçoit les constats ouverts, la
preuve sa dernière mesure et rend la nouvelle (la même pour un lot de seuls fichiers mis de côté,
qui ne mesure rien), une séance les constats ouverts et la séance à reprendre, et rend ses
constats et nomme sa séance neuve, que le circuit garde ; la garde suit chaque module que les
activités importent, `scripts/seances.mjs` compris ; le signe de vie passe par le port du
circuit (`ctx.ports`), le dossier d'avancement d'une passe s'ouvre dans le dossier de travail du
ticket (`ctx.tmp`), et les fichiers d'une séance se
numérotent sur ceux du dossier de travail (`prochainNumero`), sans compteur partagé. La
régénération commence par restaurer la copie au lot gardé avant elle, si bien qu'un essai rejoué
après un essai coupé part de la même copie. L'intégration d'un lot déjà commité, sa branche en
file, ne fait pas de second commit : elle rend vert sans jouer le script, comme une CI ne rejoue
pas une tâche indexée par son commit.

**Le verrou d'écriture charge son code de la version publiée, jamais de la copie qu'il garde** :
celui qui juge un changement ne tourne pas sur ce qu'il juge (`pull_request_target` joue le flux de
la branche de base, un crochet pre-commit tourne sur une version épinglée, la chaîne d'outils de
Bazel est fixée hors de la cible construite). `verrou` est une sous-commande de l'orchestration :
la commande de la copie remet l'écriture à la version nommée par `grillhouse.outil`, avant de
charger le moindre module de la copie (`bin/grillhouse.mjs` ne charge les scripts de la copie
qu'une fois la sous-commande sue locale). Une copie dont un module ne se charge plus (une erreur
de syntaxe, un export retiré qu'un autre module importe) est donc jugée comme une copie saine :
l'écriture du plan qui la répare passe, une écriture hors du plan reste arrêtée, un test du
testwriter ou du développeur reste refusé avec son message. L'enveloppe monte
`~/.cache/grillhouse/outil` en lecture seule pour tout projet qui nomme la clé, et installe la
version absente avant le lancement de la séance, hors de la séance, qui ne peut pas la poser. Si la version n'est pas
installable et que le code de la copie ne se charge pas non plus, le verrou refuse l'écriture,
code 2, en nommant la version, les deux causes et l'arbre principal : il ne laisse jamais passer
une écriture ni n'échoue sans message. Limite voulue : un lot qui change le verrou, ses règles de
paquets du plan ou le langage est jugé, pour ses propres écritures, par la version publiée, donc
l'ancienne ; ses changements ne jugent qu'après la montée de la version. La réparation d'un
arbre principal cassé, ou d'une version publiée qui ne se charge pas, revient au superviseur, hors
séance d'agent.

**Le style s'applique à l'écriture** (`style-a-l-ecriture`, `scripts/style-a-l-ecriture.mjs`),
comme le format-on-save d'un éditeur et lint-staged : le crochet PostToolUse du greffon
(`hooks.json`, pour Write, Edit et MultiEdit) lit le fichier qu'un agent vient d'écrire, trouve le
paquet qui le porte (le `package.json` le plus proche, la racine sinon), et, si les motifs des
scripts `format:check` et `lint` de ce paquet le couvrent, applique les corrections du lint puis
la mise en forme à ce seul fichier. Un constat qu'aucune correction ne lève, ou un fichier illisible
pour l'outil, revient à l'agent avec sa ligne et sa règle, à chaque écriture tant qu'il subsiste ;
rien ne bloque, et le crochet n'échoue jamais sur l'outil (Prettier ou ESLint absent : aucun
effet). Un constat laissé reste un rouge de la passe finale, attribué à l'auteur du fichier.
Ainsi le style se règle au moment où l'on écrit.

**Le paquet publie ses entrées nommées, son interface** : un projet importe le paquet par son
nom et l'une de ses entrées (le champ `exports`), jamais par l'adresse d'un fichier, comme
`eslint/use-at-your-own-risk` publie les outils d'ESLint. Chaque entrée sort du module qui porte
la fonction, sans réexport, avec sa déclaration de types à côté (`scripts/<module>.d.ts`) :
`@roomi-fields/grillhouse/dette` (`trancher`, la dette connue d'une garde du projet),
`@roomi-fields/grillhouse/consommateurs` (`matieres`, les paquets de la matière de test
partagée), `@roomi-fields/grillhouse/paquets` (`horsCadre`, les paquets hors cadre),
`@roomi-fields/grillhouse/resultats` (`ecrireSarif`, les constats d'une garde du projet en
SARIF), `@roomi-fields/grillhouse/jointure` (`langageDe`, les modules de langage d'un projet composés, et les
types de la jointure, `scripts/jointure.d.ts`), `@roomi-fields/grillhouse/conformite` (`cas` et
`echecs`, la suite de conformité d'un module de langage), et la
configuration de base de Vitest, `@roomi-fields/grillhouse/vitest-config`,
`@roomi-fields/grillhouse/vitest-config/mesure` et son rapporteur de durée,
`@roomi-fields/grillhouse/vitest-config/duree`, que Vitest charge par son nom, et la base TSDoc,
`@roomi-fields/grillhouse/tsdoc-base.json`, dont hérite le `tsdoc.json` d'un projet : elle hérite
de celle d'API Extractor, que le paquet déclare, comme un rig de Rushstack porte la configuration
de base à côté de la dépendance qu'elle nomme ; TSDoc lit un `extends` par son chemin sous le
paquet, sans le champ `exports`, et le fichier se tient donc à la racine du paquet. Une entrée s'ajoute ou se retire avec ce
paragraphe, que `tests/unit/paquet-publie.spec.ts` confronte au champ `exports`. Un paquet du
projet dont le code de `src/` hors des tests importe une entrée déclare le paquet du cadre dans
ses `dependencies`, comme npm y met ce que le code publié importe : `npx grillhouse maj` l'y
place, ses imports lus par TypeScript. Ainsi une version du paquet dit ce qu'un projet peut
importer, et ce qu'elle lui retire.

## Le journal des états

Le superviseur et le responsable suivent les circuits, la file et les places par des instantanés ;
entre deux relevés l'état a changé. Le journal des états garde la chronologie, comme le journal
d'un ordonnanceur : une ligne datée par changement, rejouable (`scripts/journal-des-etats.mjs`).

- **Le but** : reconstruire le séquencement des événements pour voir la concurrence réelle dans le
  temps, repérer qu'à un instant un seul ticket est en travail alors que le plafond
  (`grillhouse.circuits`) en permet deux.
- **La ligne** : `{ ts, genre, ticket, etape, boucle, place, raison }` ; `ts` en ISO 8601 avec le
  décalage local ; `genre` : `circuit`, `file` ou `places` ; `raison` vide pour une transition
  normale, le nom de l'arrêt (`ARRETS`) pour un arrêt, la cause du retour pour un bouclage (la
  boucle comptée), le message d'attente pour une attente de place.
- **Qui écrit** : les fonctions qui changent l'état, une ligne par changement, jamais un relevé
  périodique. Le circuit émet l'effet `trace` à chaque `ecrireEtat` (rejouable sans clé, la ligne
  porte sa date) ; la file l'écrit au lancement et à la fin d'un circuit (activité `tracerLaFile`) ;
  les places à une place prise, rendue ou mise en attente (`prendreUnePlace`, la raison reprise du
  message que `dire` dit).
- **Où** : un segment par date locale, `<dossier git commun>/grillhouse-journal/<AAAA-MM-JJ>.jsonl`,
  non versionné ; un journal par projet, que partagent ses copies.
- **Sans attente** : une écriture ajoute une ligne entière d'un seul append (`O_APPEND`), déjà
  tronquée (la raison) pour tenir sous 4096 octets, sans verrou ni attente ; deux écritures
  simultanées donnent deux lignes entières. Une écriture qui échoue ne retarde ni n'arrête rien :
  l'échec se dit une fois sur la sortie d'erreur.
- **Les bornes** : 14 jours et 50 Mo, décidées par le responsable. La passe de nettoyage
  (`retirerLesCopiesDuDepot`, celle de la nuit et de la fin de chaque circuit) retire les segments
  entiers plus vieux que 14 jours puis, au-delà de 50 Mo au total, les plus anciens d'abord ; elle
  ne réécrit aucun segment, et laisse toujours le plus récent.
- **La lecture** : `npx grillhouse journal [--depuis <ISO>] [--jusqu-a <ISO>] [--ticket <id>]`
  (`scripts/journal.mjs`, interface publiée du paquet) rend les lignes de tous les segments dans
  l'ordre de leur horodatage (bornes comprises, comparées en instants ; une ligne illisible est
  ignorée), et, après chaque lancement ou fin de circuit de la file, l'ensemble des tickets en
  travail contre le plafond (`en travail 1/2 : d-1`). Un ticket est en travail de sa ligne `lance`
  à sa ligne `termine`. Sans journal ou sans ligne dans la plage, elle le dit et sort 0 ; une
  option inconnue ou une date illisible, 2.

## La cible : un noyau et un module par langage

Décidée au grill du 2026-10-28 avec le responsable, la forme d'un seul paquet le 2026-10-29 ; les paragraphes ci-dessus décrivent le cadre
d'aujourd'hui, et chaque ticket de l'épopée qui la mène les réécrit au présent quand il la livre.

**Une vérification à la mesure de ce qui change** : une vérification sur main qui ne touche
qu'un ou deux scripts du cadre prend moins de 5 minutes ; la passe complète reste à la nuit et à
la sortie. Le journal des tickets ne rejoue aucun test : `grillhouse.lit` (la règle 5 de
`vitest-config/changements.mjs`) nomme un par un les fichiers de `.beads` que les tests lisent
(ses crochets, sa configuration), jamais ses journaux, que chaque commande de tickets réécrit. Un
changement d'un script du cadre ne rejoue que les tests qui l'importent ou le lancent : le paquet
du cadre ne déclare plus ses scripts dans son `grillhouse.lit`, chaque test nomme les scripts
qu'il lance par leur chemin, et la garde des chemins des tests refuse un chemin que le cadre ne
lit pas (grillhouse-3dr.3.4). Après un changement de `verrous/verrou.mjs`, 58 fichiers de tests
sur 127 rejouent (1 070 s des 3 987 s cumulées de la mesure de départ) ; après
`services-du-noyau.mjs`, que la plupart du cadre importe, 105.

**Un noyau, et un module par langage** : comme Pants, qui publie un seul paquet et active ses
langages dans sa configuration (`backend_packages`), le cadre publie un seul paquet,
`@roomi-fields/grillhouse`. Il porte le **noyau** (les tickets, le circuit, les rôles et leur
relecture, le tableau, l'enveloppe, les crochets, la mise à jour, le greffon Claude) et un
**module de langage** par famille, sous `scripts/langages/` : `typescript` (la vérification par
Turborepo et Vitest, les gardes de structure), `cargo` (la même chose pour Rust, l'épopée
grillhouse-pkl) et `python` (uv et pytest, grillhouse-ziy). Un projet déclare le langage de chaque paquet à la conception, dans la colonne
« Langage » du tableau des composants de son `docs/ARCHITECTURE.md`, comme le fichier BUILD de
Bazel nomme la règle de chaque cible : le grill l'écrit (branche 8), le gabarit d'un projet la porte,
et rien ne se devine aux fichiers ; un projet qui n'en déclare aucun est refusé, nommé. La garde
des langages des paquets (`scripts/langages-des-paquets.mjs`) refuse un paquet que l'architecture
ne déclare pas, un paquet dont le manifeste suit un autre langage, un dossier déclaré sans le
manifeste de son langage, et une interface qui en nomme un autre. Les outils npm d'un langage (Turborepo, Vitest, knip, api-extractor)
sont des dépendances facultatives du paquet, ses binaires (cargo-nextest, cargo-deny, sccache) s'installent
sur la machine par `cargo binstall`, que cargo installe d'abord quand il manque, et uv par
l'installeur d'Astral à sa version : `maj` n'installe que ceux des langages déclarés.
Ainsi chaque projet n'installe que les outils qu'il utilise : un projet tout Rust n'a aucun outil
TypeScript, BPScript aucun outil Rust ; les scripts d'un langage non déclaré restent sur le disque,
inertes. Un module par langage et un seul paquet, plutôt qu'un paquet par langage comme ESLint
ou Nx : une seule équipe tient tous les langages, et un seul paquet n'a ni versions à aligner ni
imports à réécrire chez les projets.

**Un flux de la CI déclare les paquets qu'il exerce, le relecteur le lit** : un projet déclare sous
`grillhouse.flux` de son `package.json` racine, de la famille de `engendres` et d'`outils`, chaque
fichier de `.github/workflows` avec les noms des paquets du graphe qu'il exerce
(`{ ".github/workflows/<flux>.yml": ["<paquet>", …] }`), lue dans l'arbre principal
(`packages/grillhouse/scripts/flux-des-paquets.mjs`) ; une valeur qui n'est pas cet objet, une clé
hors de `.github/workflows` ou une liste qui n'est pas de chaînes est refusée par le nom de la clé
avant tout travail. La garde `flux-des-paquets`, jouée avec celles du cadre sur le dépôt entier,
refuse un fichier de `.github/workflows` sans entrée, un flux déclaré dont le fichier n'existe pas
et un nom de paquet que le graphe ne porte pas, quel que soit le langage du paquet ; un projet sans
`.github/workflows` ni clé n'a rien à dire. La consigne du relecteur porte une ligne par flux que
le lot touche : le flux lui-même, ou un fichier sous le dossier d'un paquet qu'il déclare, sans
compter les dépendants ni les dépendances du graphe (le flux déclare chaque paquet qu'il exerce).
Référence et écart : GitHub joue un flux sur son filtre `paths:` (le filtre de chemins des
déclencheurs de GitHub Actions), qui décide quand GitHub le joue et ne dit rien au relecteur ; la
liste écrite à la main dit ce que le flux exerce, ce qu'aucun outil ne déduit des commandes d'un
flux. Un flux de SyntHub qui ne suivait pas un changement du service, sans que personne le relise,
a motivé la règle.

**La jointure des langages** : le noyau ne demande à un module de langage que cinq choses — ses
composants et celui d'un fichier, avec les lecteurs par le code des éléments qu'un ticket nomme ;
les commandes qui testent,
typent et vérifient, les composants qui jouent des tests (`joueDesTests` ; le script des tests
porte un nom neutre, `test:unit`, le même pour chaque langage), et la lecture de leur verdict ; la règle qui dit qu'un fichier est un test
(le verrou du testwriter), et celle qui dit qu'un fichier de test est hors du jour, que la nuit
seule joue (`horsDuJour` : les définitions que le module a déjà, `horsDuJour` de cargo,
`estDeNuit` de python, `horsDuJour` et `estTemoin` de typescript, sans seconde liste ; un nom
qui ne les suit pas est du jour), que la preuve du rouge met de côté ; où la preuve du rouge joue
la version de HEAD d'un fichier de test :
dans un arbre à elle pour Rust et Python (`arbreDAvant`, `envDArbre` : la copie, code du lot
compris, où ce seul fichier est remplacé par sa version de HEAD sous son propre nom, bâtie dans le
dossier temporaire du ticket sans `.git`, `target`, `node_modules` ni `.venv`, retirée à la fin de
la preuve, un rouge compris ; comme `git bisect run`, jamais un fichier de plus dans le dossier de
tests qu'un autre test parcourt), ou, pour TypeScript, à côté de lui, dans le même lancement que
lui (`soeurDAvant` : un nom que l'outil du langage
joue de lui-même, ses tests nommés comme ceux du fichier, de sa classe, jour, nuit ou banc ; le
circuit ne bâtit aucun nom de langage ; une sœur qu'un processus tué a laissée, un fichier non
suivi par git, sœur d'un fichier suivi de son dossier qui existe, est retirée au départ du
circuit et avant chaque mesure, donc n'entre jamais au lot, nommée au journal du ticket ; le
balayage tient une portée de lecture unique (`scripts/lecture-unique.mjs`), où les composants
de la composition et ce qu'un module lit à grand coût, les métadonnées de cargo, se lisent une
fois, quel que soit le nombre de fichiers ; pour un fichier que l'outil ne sait pas jouer en deux
versions, un test unitaire Rust de `src/` ou une cible `tests/<dossier>/main.rs`, pas d'arbre :
`testsDeHead` lit sans les jouer les noms des tests de sa version de HEAD, que la preuve tient pour
des verts que HEAD tient déjà ; un arbre qui ne compile plus n'est pas un rouge du lot : quand la
construction échoue avec les arbres et que le lot seul construit, la preuve rejoue le paquet sans
eux et lit de même les noms de HEAD de ces fichiers, `testsDeHead` ; une
construction que le lot seul casse reste un rouge), et la partie d'un manifeste qui déclare ce dont ses tests dépendent,
avec le fichier de verrouillage des versions (`manifestes` : le testwriter les écrit, comme
l'auteur d'un test de Bazel déclare les dépendances de sa cible ; le verrou refuse tout autre
changement du manifeste, chaque partie nommée ; en cargo, d'un fichier de code, le testwriter
n'écrit que le module de test) ; ses fichiers engendrés, leur commande et ses gardes de structure ;
où écrivent ses outils et l'outil de test qu'un rôle ne lance pas lui-même.
L'INTERFACE.md du noyau l'écrit (`packages/grillhouse/docs/INTERFACE.md`), `scripts/jointure.d.ts`
la type, et `scripts/langages.mjs` charge les modules que le projet déclare (la colonne
« Langage » de son architecture ; un projet qui n'en déclare aucun est refusé, la colonne nommée).
Un projet a plusieurs langages, un paquet un seul, comme Bazel et Nx jouent une même liste de
cibles, un outil par langage, chaque cible d'un seul langage : le noyau compose les modules
déclarés (`scripts/composition-des-langages.mjs`), range chaque fichier au composant qui le tient,
donc au module de son langage, et refuse un dossier que deux modules revendiquent ; chaque
commande joue dans chaque module qui la décrit, avec son outil, et les verdicts s'unissent
(`scripts/commandes-composees.mjs`) ; l'index des interfaces, que chaque module engendre, reste
un seul fichier, assemblé par le noyau des entrées de chaque module (`scripts/index-interfaces.mjs`) ;
le verrou des rôles, l'enveloppe et `maj` prennent l'union de ce que demandent les modules. Passent par elle : les
composants et leurs lecteurs du relevé des composants ; la règle d'un fichier de test des verrous,
des lots de l'intégration et du circuit ; la sœur de la version de HEAD de la preuve du rouge ; les commandes de `grillhouse tests` et `grillhouse
verifier` ; le verdict que le circuit lit, et les paquets du plan qui portent des tests ; les fichiers engendrés du circuit ; les gardes de
`grillhouse gardes-du-cadre` ; les sous-commandes du module, chacune de son nom (`grillhouse
frontieres`) ; les éléments du lot que le circuit donne au relecteur ; la matière de test que
l'enveloppe monte ; où écrivent les outils du langage (`sorties`), que l'enveloppe ouvre à la
séance, comme un bac à sable de Bazel ouvre ce que l'action déclare (le cache de Turborepo ; le
`target/` et les magasins de cargo) ; l'outil de test lancé directement, que les droits refusent
à un rôle qui écrit (`droits`) ; la construction de la copie d'un agent que joue
le lanceur (`construire --echec`, une seule implémentation du noyau pour tous les langages :
`turbo run build --filter=<paquet>…` sur le plan et ses fournisseurs, la copie entière pour un
plan dont un chemin n'est pas un paquet, `scripts/taches-du-graphe.mjs`), les tests de nuit que joue la nuit (`tests-de-nuit`), et la commande
qui rejoue seule une tâche rouge, que la vérification écrit pour la bissection de la nuit ; les
migrations du langage, que `maj` joue avec celles du noyau, comme `nx migrate` réunit celles de
chaque greffon ; la part du langage dans `maj` (`miseAJour`), comme le générateur `init` d'un
greffon de Nx : son gabarit (`templates/projet/`, `templates/cargo/`), ce que ses outils
demandent au projet, ses générateurs ; le squelette d'un paquet neuf (`squelette`), que
`grillhouse paquet` écrit, comme le générateur d'une bibliothèque d'un greffon de Nx ; ses binaires (`binaires`), que `maj` installe par
`cargo binstall` ; ce que ses outils écrivent dans un projet (`ignorer` : `.turbo`, `target`), que
les fichiers sources laissent de côté, que `maj` écrit dans le `.gitignore` et que le retrait
des copies finies retire d'une copie gardée dont le ticket est fermé. `maj` y joint ce que le
cadre lui-même écrit dans un projet (`IGNORES_DU_CADRE` : les copies des tickets,
`.claude/worktrees`) ; le `.gitignore` du gabarit ne porte aucune de ces lignes, que `maj`, que
lance `init`, pose seule, dans un projet neuf comme dans un projet existant. Le module typescript vit sous
`scripts/langages/typescript/` (`tests/temoins/repartition.json` range chaque fichier), ses tests
sous `tests/unit/langages/typescript/` ; le module cargo sous `scripts/langages/cargo/` (les crates
de `cargo metadata` ; les fichiers de test que le testwriter écrit, chacun un fichier à lui : les
tests par l'interface sous `tests/` d'un crate, les tests unitaires près de leur module, un
`tests.rs` ou un dossier `tests/` sous `src/`, comme le contrôle tidy de rustc, que le module
déclare par `#[cfg(test)] mod tests;`, ligne que le testwriter écrit avec son test ; un test de nuit `tests/<nom>_nuit.rs` et un banc de temps `tests/<nom>_budget.rs`, reconnus au nom de leur cible ; les tests par nextest puis les doctests, après la construction des cibles de
test de chaque crate (`cargo test --no-run`), une tâche `build` du verdict avec son journal, comme
la tâche `test` de Turborepo dépend de `build` : des tests qui ne compilent pas sont le rouge
« construction de <crate> » de la preuve du rouge, et se jouent aux contrôles ; une fois ses tests
et ses bancs joués, la tâche retire les exécutables de test que sa construction a produits, ceux
que cargo déclare dans ses messages JSON (`--message-format=json-render-diagnostics`, l'`executable`
d'un artefact d'un profil de test), comme le cache Rust de référence des CI (Swatinem/rust-cache)
garde les dépendances et retire les artefacts propres à l'espace de travail : ils tenaient 3,4 des
4,6 Gio d'une copie de synthhub, et cargo reconstruit à la passe suivante l'exécutable qui lui
manque ; les dépendances, les bibliothèques et les binaires de `cargo build` (la sortie d'un crate
que les tests d'un autre paquet lancent, `grillhouse.donnees`) restent, et seule la tâche du crate
joue ses exécutables de test ; ces tests sont la
tâche `test:unit` de chaque crate, jouée par Turborepo (`tests-du-paquet`, grillhouse-44b.5) ; la
vérification par cargo-deny, après les tâches de Turborepo des crates, sous le verrou de la machine ; chaque commande qui compile (tests, vérification, typage, clippy)
sans compilation incrémentale (`CARGO_INCREMENTAL=0`, comme la CI de Rust : une copie compile une
fois, et son `target/debug/incremental` tenait 1,1 Go d'un `target/` de 5,0 Go chez synthhub),
sauf quand l'appelant la décide (`CARGO_INCREMENTAL`, `CARGO_BUILD_INCREMENTAL`, un
`CARGO_PROFILE_<nom>_INCREMENTAL`, ainsi `CARGO_INCREMENTAL=1` pour déboguer) ou le projet (un
`incremental` dans un `[profile.*]` de son Cargo.toml, `build.incremental` ou un profil d'un
`.cargo/config.toml`), que cargo laisse primer sur chaque profil et que le cadre n'écrase pas ;
à travers sccache (`RUSTC_WRAPPER=sccache`), le cache de compilation de Mozilla qu'emploient
Firefox et les CI Rust, son cache sous la maison (`~/.cache/grillhouse/sccache`), commun aux copies du poste
et que l'enveloppe ouvre en écriture : chaque copie garde son `target/`, sans le verrou que cargo
pose sur un dossier commun, et ne recompile pas ce qu’une autre a compilé ; un serveur de sccache par copie et par espace de processus (`/proc/self/ns/pid`, que chaque enveloppe crée), sur un socket unix abstrait nommé d'après eux (`SCCACHE_SERVER_UDS`), puisque le serveur par défaut écoute 127.0.0.1:4226 pour toute la machine et que l'enveloppe partage le réseau ; ce serveur démarre avant chaque lancement de cargo qui compile, sous `/tmp` (celui de la machine, ou dans une enveloppe celui, vide, de la séance), car sccache 0.19.0 démarre le sien par un socket au chemin sous TMPDIR, refusé au-delà des 108 octets d'un chemin de socket, et le dossier temporaire d'une passe sous le dossier de travail d'une séance les dépasse ; un lanceur de rustc que le projet pose reste le sien, sans sccache, lu comme cargo le lit (l'environnement, puis `build.rustc-wrapper` des `.cargo/config.toml` du projet vers la racine, puis de `$CARGO_HOME`) ; sans sccache sur le PATH, ces commandes refusent avant cargo, en une ligne qui nomme `npx grillhouse maj` ; le refus, avant tout lancement de cargo, d'un espace dont git ne
suit pas le Cargo.lock, comme `npm ci` refuse un projet sans package-lock.json : les tests, la
vérification et la préparation le nomment en une ligne avec son geste (`git add Cargo.lock`), et
`maj` le laisse au projet (`aFaire` de sa part), sans jouer la vérification ; ses gardes, la taille des tests, clippy, les frontières entre crates contre la liste
permise du manifeste de l'espace de travail, `[workspace.metadata.grillhouse.frontieres]`, comme
les `depConstraints` de Nx, et l'index des interfaces, qu'il engendre, chacune aussi une
commande de son nom, que la ligne d'une garde rouge nomme), ses
tests sous `tests/unit/langages/cargo/`, contre un faux cargo en tête du PATH, le vrai à la nuit ; le module
python sous `scripts/langages/python/` (un paquet par `pyproject.toml`, PEP 621 ; les tests
`test_*.py` et `*_test.py` que pytest trouve, un test de nuit `*_nuit_test.py`, `conftest.py` et
`tests/` ses aides ; du manifeste, le testwriter n'écrit que le groupe `test` de
`[dependency-groups]`, PEP 735, et `uv.lock` ; les tests par `uv run --locked --group test pytest`
dans chaque paquet (la tâche `test:unit` du paquet dans Turborepo, par `tests-du-paquet`), leur
rapport JUnit ; les tests de nuit laissés de côté de tout dossier, le
paquet entier ou un dossier nommé, et joués quand leur fichier est nommé, comme le module cargo
(Python n'a pas de banc de temps) ; un paquet joué entier, sans chemin ou son dossier nommé,
dont pytest ne collecte aucun test (code 5) est vert, comme `cargo test` sur un crate sans test et
le `passWithNoTests` du squelette typescript, et un chemin dans le paquet qui n'en collecte aucun
reste rouge ; le typage par `python -m compileall`, la préparation par
`uv sync --locked`, la version de Python celle que choisit uv d'après `requires-python` et
`.python-version` ; le code-octet sous un seul `__pycache__` à la racine, PYTHONPYCACHEPREFIX, que
l'enveloppe rend propre à la séance ; l'environnement de uv et le cache de pytest de chaque paquet
sous `.venv/<dossier>` et `.pytest_cache/<dossier>` à la racine, que l'enveloppe ouvre en écriture
avec le cache de uv, `~/.cache/grillhouse/uv` (UV_CACHE_DIR), plutôt que dans le dossier du paquet, qu'une séance dont le plan ne l'écrit pas
ne pourrait écrire ; les Python de uv en lecture ; la garde des tailles des tests en Python, et celle
du dossier temporaire, `tempfile` et jamais `mkdtemp` à la main ; l'index des interfaces, qu'il
engendre comme cargo, et que l'index du noyau remplace dans un projet de plusieurs langages), ses
tests sous `tests/unit/langages/python/`, la suite de conformité comprise, contre un faux uv, le
vrai à la nuit ; les entrées publiées (`./consommateurs`,
`./vitest-config`, `./vitest-config/mesure`, `./vitest-config/duree`, `./tsdoc-base.json`) mènent au module. Comme un
greffon de Nx n'importe que `@nx/devkit`, le module n'importe du noyau que ses entrées publiées :
`./jointure` (`scripts/services-du-noyau.mjs`) lui donne les services du noyau qu'il emploie (le plan d'une
enveloppe, l'avancement et la mesure d'une passe, la pression et le verrou de la machine, le
dernier vert, les arbitrages d'un ticket, le préfixe des tickets, lu et écrit dans le fichier
commité de Beads, les fichiers sources d'un projet).
La garde des frontières refuse aussi un import que le `package.json` du paquet importateur ne
déclare pas (`pas-d-import-non-declare`, `no-non-package-json` de dependency-cruiser, comme npm et
pnpm en mode strict) : son refus nomme le fichier et le paquet, puis dit les deux suites, déclarer
l'usage (et, pour un composant du dépôt, dans la section « Consommateurs » de l'INTERFACE.md du
fournisseur), sinon ouvrir une question d'architecture au superviseur.
La garde des frontières tient les deux sens, par les
règles propres au dépôt (`.dependency-cruiser.projet.cjs`), comme `enforce-module-boundaries` de
Nx ; le test de la jointure (`tests/unit/jointure.spec.ts`) refuse tout mot d'un outil dans le
code du noyau et tout fichier d'un module que le noyau lance par son chemin.
Les outils du langage (api-extractor et son modèle, la configuration de TSDoc, jsonc-parser,
Turborepo, Vitest, knip, dependency-cruiser, TypeScript ; pour cargo et python, smol-toml, le
lecteur d'un Cargo.toml et d'un pyproject.toml) sont des pairs facultatifs du paquet, comme Vite déclare les préprocesseurs qu'il
importe, chacun chargé à la demande ; `maj` ajoute au projet ceux du module de son langage
(`outils`), aux versions du gabarit de ce module. Une même suite de conformité (`scripts/conformite.mjs`) tient chaque module de langage,
comme le RuleTester d'ESLint une règle. Ainsi le reste du noyau ignore le langage du projet.

**Les tests d'intégration, un paquet à part** : les tests qui montent un dépôt d'essai et y
lancent un point d'entrée qui en enchaîne plusieurs (le circuit, plus de la moitié du temps des
tests ; la nuit, l'intégration et sa file, le lanceur d'un agent, l'ouverture de séance, la mise à
jour et l'init, le retrait d'une copie) vivent dans
`packages/grillhouse-essais`, privé, comme `turborepo-tests` de Turborepo : des tests de nuit
(`*.nuit.spec.ts`), qui lancent en processus les scripts du cadre de leur propre arbre, et n'en
importent aucun dans leur processus ; la nuit les
joue tous, et un fichier nommé se joue par `npm test -- <fichier>`. La matière de test que
partagent ses tests et ceux du cadre vit dans un troisième paquet, `packages/grillhouse-matiere`,
privé, qui n'importe aucun paquet et exporte `./test-fixtures`, comme le corpus de BPScript : le
cadre et ses essais en dépendent sans cycle. Les tests du greffon
(`mods/grillhouse/tests`) sont les gardes propres du dépôt, son script racine `gardes`
(`claude plugin test mods/grillhouse`) : la vérification les joue, et Turborepo les relit de son
cache tant que rien ne bouge dans le dépôt (les entrées d'une tâche de la racine) ; la CI installe la commande claude à une version
fixée. Ainsi un test unitaire ne paie jamais le prix d'un test
d'intégration.

**L'ordre** : les deux causes du « tout rejoué », mesurées ; la jointure et le module
TypeScript ; le paquet des tests d'intégration ; le module cargo, sur la jointure.
