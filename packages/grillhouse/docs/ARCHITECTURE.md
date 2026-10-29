# Les outils du cadre

Ce que font les outils du paquet `@roomi-fields/grillhouse`, que la charte commune résume pour
les agents. Chaque règle dit le comportement, et le modèle mûr qu’il suit.

**Les tests se lancent par `npm test`** (Turborepo : la construction, puis les tests) :
`npm test -- <chemins>` pour un lancement ciblé, chaque chemin écrit depuis la racine du dépôt
et joué dans son paquet avec ce dont ses tests dépendent (un autre jeu de chemins relit les
constructions du cache ; un changement de ce qu'ils importent les rejoue),
`npm run test:forcer -- <chemins>` pour rejouer pour de vrai un test soupçonné instable ; un
lancement qui ne joue aucun test échoue ; un banc de temps ou un test de nuit se joue quand son
propre fichier est nommé, au repos (un dossier ou un paquet nommé les laisse hors, comme le
jour) ; aucun agent ne lance l'outil de test directement, ni Vitest ni Turborepo (les droits d'un
rôle qui écrit les refusent, `droits.mjs`). `npm run verifier` joue, après la
construction : les gardes du cadre,
celles du projet (son script racine `gardes`, un nom que le cadre réserve ; une garde juge les
fichiers de l'arbre de travail, que le cache de Turborepo compte, jamais l'index de git ; elle
écrit ses constats en SARIF, chacun avec son fichier et sa ligne, par `ecrireSarif`, que
publie l'entrée `@roomi-fields/grillhouse/resultats`, dans le dossier que nomme `GRILLHOUSE_RESULTATS`, et sans eux son rouge
ne revient à aucun composant), le typage de chaque paquet (son script `typecheck`, qui type ses
sources et ses tests, `tsc -p tsconfig.json --noEmit` du gabarit et de `npx grillhouse maj` ; la
tâche `typecheck` du turbo.json racine, que le générateur tient, attend, comme `test:vitest`,
la construction du paquet, dont ses tests peuvent importer l'entrée construite, et celle de ses
dépendances, `build` et `^build`, comme `check-types` des exemples de create-turbo) et les
tests, côte à côte ; un rouge n'arrête pas la passe, qui joue tout ce que ses tâches
préalables permettent et nomme chaque rouge ; `npm run verifier -- --gardes` joue les gardes
seules, ce que le relecteur joue sur la copie du ticket. Une tâche dont
rien n'a bougé n'est pas rejouée : Turborepo relit sa sortie consignée dans son cache (« cache
hit, replaying logs »), et cette relecture vaut un lancement. Une passe se mesure contre le
dernier vert, l'arbre de la dernière passe verte de sa branche, celle de main pour une copie
qui n'en a pas encore, comme `vitest --changed` : un paquet que Turborepo rejoue joue les seuls tests que Vitest relie aux fichiers changés depuis,
et tous ses tests quand un changement sort du graphe de Vitest (un fichier supprimé, une
configuration, un fichier qu'aucun module n'importe, un fichier, changé ou supprimé, que lit
la construction d'un paquet dont il dépend, un chemin que ses tests déclarent lire,
`grillhouse.lit`) ; la construction d'un voisin lit les entrées du `build` de son turbo.json,
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
index compris (`.codegraph`, `.rtfm`), et n'écrit que les paquets que le plan de son ticket nomme
(les paquets du titre), la base des tickets et le cache de Turborepo ; `.git` reste en lecture
seule, et la matière de test partagée s'écrit par le seul testwriter. Un chemin du plan hors des
paquets écrit la racine, toute la copie. `GRILLHOUSE_ENVELOPPE` porte la liste aux commandes du
cadre, qui construisent, jugent et écrivent ses seuls paquets. Une écriture hors du plan échoue
au montage, et le verrou de l'agent arrête sa séance en nommant le paquet ; le circuit s'arrête à
« hors-plan », une question pour le superviseur, qui étend le plan (`--etendre`) ou refuse. Comme la visibilité de Bazel et
les frontières de modules de Nx, la règle refuse et le code reste lisible ; comme
`bwrap --ro-bind / --bind`, le bac à sable n'ouvre en écriture que ce qu'il lie. Ainsi l'agent
lit ce dont il a besoin, et les gardes tiennent l'architecture (BP 320.9 : la lecture cloisonnée
causait l'essentiel des pertes).

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
références, un développeur sans rien à livrer jugé par les contrôles ; chaque geste s'écrit au ticket et au
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
autres rouges restent, chacun à son propriétaire. Des contrôles du plan verts hors des rouges de
références les régénèrent aussitôt, comme make refait un fichier engendré avant ce qui le lit :
la passe finale due joue alors une fois, sur l'arbre régénéré, sans régénérer de nouveau une
référence régénérée sur ce même arbre (BP 320.3.9 : le plafond des mots, rouge aux contrôles,
laissé à une passe finale qui rejouait les mêmes tests sur le même arbre, 6,1 min). Les références sont celles que le projet déclare
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
entre dans le commit. Le circuit lui passe ses références (`--references`), la seule liste. Un
conflit sur tout autre fichier refuse le lot ; une commande en échec, ou un fichier changé
qu'aucune référence rejouée n'écrit, aussi. Les rapports d'API, qui lisent la construction, et la
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
le lot ajoute, change ou supprime (`scripts/elements-du-lot.mjs`), avec son paquet, son
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

**Un circuit par ticket** : comme une demande de fusion (un auteur, une série de tests et de
code, une CI sur l'ensemble, une revue), le circuit lance un seul testwriter et un seul
développeur pour tout le ticket, chacun dans l'enveloppe de tous les paquets du plan, puis la
passe finale et le relecteur sur l'ensemble ; aucun composant n'est une unité du circuit. Les
étapes (`packages/grillhouse/scripts/etapes.mjs`) : 1 Plan · 2 Tests · 2.1 Preuve du rouge ·
3 Code · 3.1 Contrôles · 4 Passe finale et relecture (4.1 Passe finale, 4.2 Régénération des
références, 4.3 Relecture) · 5 Intégration (5.1 Commit, 5.2 File, 5.3 Tri des découvertes). `--depuis <testwriter|developpeur>` rejoue le
ticket entier depuis cette étape ; `--etendre <paquet>` ajoute un paquet au plan, puis reprend
l'étape en cours, celle du testwriter après un arrêt sur un renvoi du développeur vers lui. Comme
une file de fusion (GitHub merge queue, bors, Zuul) renvoie le lot à son auteur avec le journal de
sa vérification, et ne le laisse repasser qu'avec un changement, `--depuis developpeur` après un
refus de l'intégration repart du développeur, le refus comme le rouge à lever ; une séance ainsi
lancée qui ne change aucun fichier du lot refusé ne va pas aux contrôles de la copie, qui ne
voient pas ce rouge : le circuit la relance une fois avec le refus, puis s'arrête en
`sans-livraison`. `--reprendre` rejoue l'intégration (ou la file) sur le même lot, comme bors
rejoue un lot : un refus peut venir de la charge ou de main (BP 320.16, 320.16.2) ; `--depuis
testwriter` refait le lot et oublie le refus (BP 320.37 : trois fois « FAIT » sans un fichier changé, les contrôles de la copie
verts, l'intégration rouge sur le même lot). Un constat bloquant du relecteur va droit à l'agent qu'il nomme et reste ouvert
d'une relance à l'autre, comme un fil de revue non résolu, jusqu'à ce que le relecteur le dise
levé ou accepte le lot. Comme l'auteur répond dans chaque fil d'une revue GitHub ou Gerrit, la
fiche FAIT du développeur répond à chaque constat ouvert pour lui, par son titre (`reponses` :
`levé` avec sa pièce, ou `contesté` avec sa raison et sa pièce) ; le circuit refuse une fiche à
laquelle il en manque une (`reponsesAuxConstats`), garde chaque réponse avec son constat, et la
relecture suivante la lit sous lui (BP 320.21 : la cause de son choix dans une passation que le
circuit ne lit pas, « la relecture n'a reçu aucune fiche du développeur », trois `RENDU`, puis
l'arrêt). Le bilan compte par étape et par rôle. Ainsi un type change avec ses
lecteurs en une seule séance, et un constat n'est jamais perdu (BP 320.9 : seize composants
joués l'un après l'autre, 118 min d'étapes vertes rejouées, un constat sur `exemplar` perdu six
fois).

**Le tri des découvertes en fin de ticket** : comme Chromium et Mozilla donnent un verdict à
chaque rapport de défaut neuf avant de le ranger, une fois le lot entré sur main (5.2), le
circuit mène l'étape 5.3 : sans découverte consignée par les fiches du ticket, aucune séance ;
sinon une séance de l'explorateur hors de l'enveloppe, sur Sonnet, dans l'arbre principal, aux
droits de la lecture (`droits.mjs` : la construction d'un paquet, `npm run build --
--filter=<paquet>...`, avant de juger une erreur de types de son export ; aucune passe, aucune
écriture), sa consigne du huitième gabarit. Sa fiche (`tri` de `resultats.mjs`) donne une ligne
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
nomment dans `TMPDIR` à ce qu'ils lancent (les dossiers d'essai des tests, celui de Vitest, celui
de Claude Code) et l'effacent à leur fin, verte ou rouge ; la base d'une passe tuée, la suivante
la balaie, comme Bazel donne à chaque test son `TEST_TMPDIR` et nettoie ses bacs à sable
(`packages/grillhouse/scripts/mesure/base-de-passe.mjs`). Ainsi un essai oublié ne remplit jamais le dossier
temporaire de la machine.

**Le dossier du circuit appartient au ticket** : `.claude/worktrees/<ticket>.travail` vit autant
que le ticket, comme l'espace de travail d'un pipeline ; aucun balayage n'y touche, la file
l'efface à la clôture, `npx grillhouse retirer-copie` avec la copie d'un ticket fermé sans
intégration. Ainsi une séance qui survit à son circuit garde ce qu'il lui a remis.

**Le circuit est un démon** (`packages/grillhouse/scripts/demon.mjs`) : comme daemon(3) et
`setsid --fork`, `npx grillhouse circuit` lance
un relais, qui lance le circuit dans une session à lui puis finit aussitôt ; le circuit n'est ni
dans le groupe de son appelant ni sous lui dans l'arbre des processus. L'appelant relaie sa sortie
jusqu'à sa dernière ligne et rend son code de fin ; mort, il laisse le circuit aller à sa fin.
L'état du circuit le nomme par son numéro et son heure de départ (`processus`, `depart`, le champ
22 de `/proc/<pid>/stat`), comme un gestionnaire de services vérifie qu'un numéro réutilisé ne
désigne pas un autre processus : le panneau tient un circuit pour vivant sur ce seul processus,
jamais sur la ligne de commande de l'appelant, une seconde course du ticket est refusée tant
qu'il vit, et `--arreter` ne vise que lui. Ainsi un circuit survit à la séance qui le lance (BP 320.8 : un circuit mort avec
la séance du superviseur, repris à la main).

**Main reste vert** : l'intégration exige un `npm run verifier` vert, sans rouge admis, mesuré
contre le dernier vert ; la nuit rejoue la passe complète. La mise à jour du cadre
(`npx grillhouse maj`) finit par `npm run verifier` dans le projet, dont le vert pose le dernier
vert sur l'arbre qu'elle laisse, comme Nx affected avance sa base au dernier commit vert de main ;
elle rend le code de la vérification, et son compte rendu dit le vert posé, ou pourquoi il ne
l'est pas (un rouge, un « à repasser », un `npm install` à faire d'abord). Un test connu
rouge se met en quarantaine dans le test lui-même (`it.skip` ou `it.fails`), avec le ticket qui
le corrige, comme le fait une intégration continue mature. Ainsi chaque rouge a son ticket, et
main ne porte aucun rouge.

**La taille d'un test** (`packages/grillhouse/scripts/tailles-des-tests.mjs`, une garde du
cadre) : comme la pyramide des tests de Google et le `size` de Bazel, chaque fichier de tests
que git liste est petit, moyen ou grand, lu dans son texte et dans la matière de test qu'il
importe : grand, il monte un dépôt d'essai (`init`, `clone` ou `worktree add` de git) et y lance
autre chose que git ; moyen, il lance un processus ou importe plusieurs modules du dépôt ;
petit, sinon. Un grand test de jour est un constat (`grand-de-jour`), un test de nuit ou un banc
jamais ; les grands tests de jour d'un projet s'inscrivent dans sa dette à la mise à jour qui
apporte la garde (`npx grillhouse maj`, migration 0.25.0), sans qu'un test se réécrive. Ainsi
le jour ne joue que des tests courts, et la dette des grands ne fait que baisser.

**Une mesure lourde à la fois sur la machine** : chaque `npm run verifier` et chaque passe
lourde du circuit (preuve du rouge, contrôles, passe finale) prennent le verrou de la machine,
partagé par tous ses dépôts (`~/.cache/grillhouse/mesure-lourde.lock`) ; une seconde mesure
attend la fin de la première et le redit toutes les 30 s, en nommant qui tient le verrou (le
processus, son dossier, sa commande, depuis quand) ; un verrou dont le processus est mort se
reprend, comme le serveur de tâches de GNU make. L'attente a une borne, 60 min
(`GRILLHOUSE_ATTENTE_MACHINE_MS`), plus longue que la plus longue passe complète mesurée : au-delà,
la mesure s'arrête « à repasser » (code 75), comme `flock -w`. Un verrou tenu par un ancêtre de
celui qui attend est un blocage : l'attente le dit tout de suite et s'arrête, rouge. La passe
borne ses tâches côte à côte à la moitié des cœurs. Ainsi une mesure rend le résultat du code, et
non celui d'une autre mesure à côté, et aucune passe ne reste figée sans le dire.

**Le projet passe avant le cadre** : une mesure jouée dans le dépôt du cadre lui-même (le paquet
en développement, ses copies d'agents comprises) est de second rang ; celle d'un projet, de
premier rang. Une mesure de second rang ne prend pas le verrou, même libre, tant qu'une mesure de
premier rang attend ; l'attente dit son rang et qui elle attend, sous la même borne. Ainsi le
circuit d'un projet n'attend pas les vérifications du cadre, comme le serveur de tâches de GNU
make sert sa construction et Bazel ordonne ses tests par priorité.

**Une passe automatique montre son avancement** : chaque passe automatique écrit ses fichiers
de tests faits sur prévus (la file, les étapes de sa CI), que le panneau affiche avec le temps
depuis son dernier signe, « ⚠ figée » au-delà de 5 min, comme le compteur d'actions de Bazel.
Ainsi une passe qui fige se voit.

**Un témoin de temps joue seul** : un fichier de test qui importe `mesurerAuRepos` est un
témoin de temps ; `npm run verifier` joue tous les autres tests, puis les témoins dans une passe
à eux, une tâche après l'autre, comme Bazel joue un test `exclusive`. Un échec qui dépend d'une
durée (un délai dépassé, un banc `*.budget.test.*`, un test marqué `mesurerAuRepos`) survenu sous
charge (la pression CPU du noyau, `/proc/pressure/cpu`, à 25 % ou plus) est « à repasser » (code
75), ni vert ni rouge : `npm run verifier` rejoue sa tâche seule une fois la machine au repos ;
sans repos en 15 min, la livraison reste en attente et se représente, comme Bazel classe un
délai dépassé et CTest le rejoue. Ainsi un témoin ne se mesure jamais sous la charge de sa
propre passe, et un rouge au repos reste un rouge.

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
qui les remet d'accord. Un projet n'en garde aucune copie
(`npx grillhouse maj` retire, à leur empreinte, celles que posait la 0.22) ; sans le paquet installé, l'ouverture de séance dit « lance `npm install` », et les autres crochets
sortent sans effet. Les crochets git du cadre suivent le modèle de Husky : le `prepare` du
projet lance `grillhouse hooks`, qui les pose à côté des sections de Beads, et chacun appelle
`grillhouse hook <nom>`, sans effet sans le paquet. Ainsi chaque projet suit la version du cadre qu'il installe, sans fichier à
recopier.

**Le paquet publie ses entrées nommées, son interface** : un projet importe le paquet par son
nom et l'une de ses entrées (le champ `exports`), jamais par l'adresse d'un fichier, comme
`eslint/use-at-your-own-risk` publie les outils d'ESLint. Chaque entrée sort du module qui porte
la fonction, sans réexport, avec sa déclaration de types à côté (`scripts/<module>.d.ts`) :
`@roomi-fields/grillhouse/dette` (`trancher`, la dette connue d'une garde du projet),
`@roomi-fields/grillhouse/consommateurs` (`matieres`, les paquets de la matière de test
partagée), `@roomi-fields/grillhouse/paquets` (`horsCadre`, les paquets hors cadre),
`@roomi-fields/grillhouse/resultats` (`ecrireSarif`, les constats d'une garde du projet en
SARIF), `@roomi-fields/grillhouse/jointure` (`langageDe`, le module de langage d'un projet, et les
types de la jointure, `scripts/jointure.d.ts`), `@roomi-fields/grillhouse/conformite` (`cas` et
`echecs`, la suite de conformité d'un module de langage), et la
configuration de base de Vitest, `@roomi-fields/grillhouse/vitest-config` et
`@roomi-fields/grillhouse/vitest-config/mesure`, et la base TSDoc,
`@roomi-fields/grillhouse/tsdoc-base.json`, dont hérite le `tsdoc.json` d'un projet : elle hérite
de celle d'API Extractor, que le paquet déclare, comme un rig de Rushstack porte la configuration
de base à côté de la dépendance qu'elle nomme ; TSDoc lit un `extends` par son chemin sous le
paquet, sans le champ `exports`, et le fichier se tient donc à la racine du paquet. Une entrée s'ajoute ou se retire avec ce
paragraphe, que `tests/unit/paquet-publie.spec.ts` confronte au champ `exports`. Un paquet du
projet dont le code de `src/` hors des tests importe une entrée déclare le paquet du cadre dans
ses `dependencies`, comme npm y met ce que le code publié importe : `npx grillhouse maj` l'y
place, ses imports lus par TypeScript. Ainsi une version du paquet dit ce qu'un projet peut
importer, et ce qu'elle lui retire.

## La cible : un noyau et un module par langage

Décidée au grill du 2026-10-28 avec le responsable, la forme d'un seul paquet le 2026-10-29 ; les paragraphes ci-dessus décrivent le cadre
d'aujourd'hui, et chaque ticket de l'épopée qui la mène les réécrit au présent quand il la livre.

**Une vérification à la mesure de ce qui change** : une vérification sur main qui ne touche
qu'un ou deux scripts du cadre prend moins de 5 minutes ; la passe complète reste à la nuit et à
la sortie. Le journal des tickets ne rejoue déjà aucun test : `grillhouse.lit` (la règle 5 de
`vitest-config/changements.mjs`) nomme un par un les fichiers de `.beads` que les tests lisent
(ses crochets, sa configuration), jamais ses journaux, que chaque commande de tickets réécrit. Un
changement d'un script du cadre rejoue encore les 3 200 tests (environ 22 minutes), ses tests le
lançant par son chemin ; la pyramide des tests (grillhouse-3dr.4) et les tests d'intégration dans
leur paquet (grillhouse-3dr.3) le ramènent aux tests qui le lisent.

**Un noyau, et un module par langage** : comme Pants, qui publie un seul paquet et active ses
langages dans sa configuration (`backend_packages`), le cadre publie un seul paquet,
`@roomi-fields/grillhouse`. Il porte le **noyau** (les tickets, le circuit, les rôles et leur
relecture, le tableau, l'enveloppe, les crochets, la mise à jour, le greffon Claude) et un
**module de langage** par famille, sous `scripts/langages/` : `typescript` (la vérification par
Turborepo et Vitest, les gardes de structure) et `cargo` (la même chose pour Rust, l'épopée
grillhouse-pkl). Un projet déclare ses langages dans son `package.json` (`grillhouse.langages`),
que `init` et `maj` remplissent d'après ce qu'ils trouvent (`tsconfig.json`, `Cargo.toml`).
Les outils d'un langage (Turborepo, Vitest, knip, api-extractor ; cargo-nextest, cargo-deny)
sont des dépendances facultatives du paquet : `maj` n'installe que ceux des langages déclarés.
Ainsi chaque projet n'installe que les outils qu'il utilise : un projet tout Rust n'a aucun outil
TypeScript, BPScript aucun outil Rust ; les scripts d'un langage non déclaré restent sur le disque,
inertes. Un module par langage et un seul paquet, plutôt qu'un paquet par langage comme ESLint
ou Nx : une seule équipe tient tous les langages, et un seul paquet n'a ni versions à aligner ni
imports à réécrire chez les projets.

**La jointure des langages** : le noyau ne demande à un module de langage que cinq choses — ses
composants et celui d'un fichier, avec les lecteurs par le code des éléments qu'un ticket nomme ;
les composants touchés depuis un commit, avec leurs dépendants ; les commandes qui testent,
typent et vérifient, et la lecture de leur verdict ; la règle qui dit qu'un fichier est un test
(le verrou du testwriter) ; ses fichiers engendrés, leur commande et ses gardes de structure.
L'INTERFACE.md du noyau l'écrit (`packages/grillhouse/docs/INTERFACE.md`), `scripts/jointure.d.ts`
la type, et `scripts/langages.mjs` charge le module que le projet déclare (`grillhouse.langages`
de son `package.json`, lu comme `["typescript"]` sans déclaration, jusqu'à grillhouse-3dr.2.3) ;
un seul langage est servi, la fusion de plusieurs est grillhouse-pkl.3. Passent par elle : les
composants et leurs lecteurs du relevé des composants ; la règle d'un fichier de test des verrous,
des lots de l'intégration et du circuit ; les commandes de `grillhouse tests` et `grillhouse
verifier` ; le verdict que le circuit lit ; les fichiers engendrés du circuit ; les gardes de
`grillhouse gardes-du-cadre`. Le noyau importe encore cinq fichiers rangés côté TypeScript, que
grillhouse-3dr.2.2 fait passer par la jointure : le circuit `elements-du-lot.mjs`, l'intégration
`consommateurs-arbitres.mjs`, `resumes.mjs` `index-interfaces.mjs` et `interfaces-contre-code.mjs`,
l'enveloppe `consommateurs.mjs`, et `grillhouse-maj.mjs`. Les trois modules du noyau que rangeait
`vitest-config/` (l'avancement, la base d'une passe, la pression) vivent sous `scripts/mesure/`.
Le module typescript (`scripts/langages/typescript/`) appelle encore les scripts à leur place, que
grillhouse-3dr.2.2 range sous son dossier d'après `tests/temoins/repartition.json`. Une même suite
de conformité (`scripts/conformite.mjs`) tient chaque module de langage, comme le RuleTester
d'ESLint une règle ; une garde refusera un import d'un module de langage par le noyau hors de la
jointure (grillhouse-3dr.2.2), et le test de la jointure (`tests/unit/jointure.spec.ts`) inscrit
chaque reste du noyau qui nomme encore un outil, avec le ticket qui le retire. Ainsi le reste du
noyau ignore le langage du projet.

**Les tests d'intégration, un paquet à part** : les tests qui montent un dépôt d'essai et y
lancent le cadre entier (le circuit, plus de la moitié du temps des tests) vivent dans
`packages/grillhouse-essais`, privé, comme `turborepo-tests` de Turborepo ; ils se jouent quand
un fichier qu'ils lancent change, et en entier la nuit. Les tests du greffon
(`mods/grillhouse/tests`) entrent dans la vérification et la CI. Ainsi un test unitaire ne paie
jamais le prix d'un test d'intégration.

**L'ordre** : les deux causes du « tout rejoué », mesurées ; la jointure et le module
TypeScript ; le paquet des tests d'intégration ; le module cargo, sur la jointure.
