# La charte commune de Roomi's Grillhouse

Les règles du cadre, identiques dans chaque projet qui l'a installé. Le greffon du cadre
(`grillhouse@roomi-fields`, que porte le paquet du cadre) la donne à chaque séance par son crochet d'ouverture ; la charte du
projet (`CLAUDE.md`) porte ce qui lui est propre : son nom, son responsable, ce qui décide chez
lui, ses critères d'arbitrage, ses commandes. Ce fichier vient du greffon et ne se modifie pas dans
un projet : un écart se propose à Grillhouse. Ainsi les projets suivent un seul cadre.

## Ce qui décide

Une décision vit dans le document qu'elle règle. Ainsi on la trouve là où on la cherche.

Une règle s'écrit selon le métacadre (`${CLAUDE_PLUGIN_ROOT}/METACADRE.md`, §2).

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
4. Le plan va dans le ticket (`bd update <id> -d`). Un travail qui change un comportement est un
   seul ticket, qui passe d'un agent au suivant dans sa copie : les tests d'abord (agent
   `testwriter`), puis le code qui les rend verts (agent `developpeur`). Ainsi le code se mesure à des
   tests qu'il n'a pas écrits. Un critère répond à un besoin réel de l'usage actuel ; un cas
   seulement possible n'en devient pas un. Ainsi le ticket garde la taille du besoin.
5. Le ticket se ferme sur ses tests ciblés, le verdict de l'agent `relecteur` sur le lot, le
   commit du circuit (`packages/grillhouse/scripts/circuit.mjs`), seul à commiter, sur la branche du ticket, et
   l'entrée de cette branche sur main par la file, qui le ferme. Ainsi ce qui est déclaré fini
   l'est vraiment.
6. Chaque agent laisse sa passation en commentaire au ticket (`bd comments add`,
   `docs/agents/issue-tracker.md`), avec ce qui n'est pas fait et pourquoi. Ainsi l'agent suivant
   la trouve par `bd show`. Une séance que le circuit mène (testwriter, développeur, relecteur,
   régulateur) finit sur sa fiche, la sortie structurée que le schéma de son rôle décrit
   (`packages/grillhouse/scripts/resultats.mjs`) ; le circuit décide sur elle, jamais sur un texte libre. Ainsi la
   passation sert l'humain, et la fiche le circuit.

Une séance de supervision charge le superviseur (`pitmaster`) ; un projet a un seul superviseur,
comme Zuul a un seul ordonnanceur : l'ouverture de séance prend le verrou du dépôt, et une seconde
séance le dit au responsable et ne lance aucun circuit. Les rôles sont des agents du greffon du
cadre (ses `agents/`, leurs compétences dans ses `skills/`), chacun sous ses verrous et les droits que nomment les commandes de sa
compétence, sans la configuration propre de l'utilisateur (`packages/grillhouse/scripts/droits.mjs`). Un ticket
parcourt l'arbre de son circuit, les étapes « auto » comprises (`packages/grillhouse/scripts/etapes.mjs`, la seule
liste), comme un pipeline de GitLab CI ses étapes et leurs travaux : 0 Exploration,
l'`explorateur` ; 1 Ouverture : 1.1 Relevé des composants, auto, puis 1.2 Questionnement,
le `questionneur` ⇄ le `referent-technique`, qui répond pour le plan, en tours, quatre au plus ;
2 Composants, pour chaque composant du titre dans son ordre : 2.1 Tests, le `testwriter`, 2.2 Preuve
du rouge, auto, trois essais au plus, puis 2.3 Code, le `developpeur`, 2.4 Contrôles, auto, trois
essais au plus ; 3 Passe finale, auto, puis 3.1 Régénération des références, auto, pour un projet
qui déclare les références qu'il tire de la copie entière (`grillhouse.references` de son
`package.json`, chacune `{ nom, commande, fichiers, tests, gardes }` : `fichiers`, des chemins,
des dossiers ou des motifs `*` et `**`, comme les entrées de Turborepo ; `tests`, les fichiers de
test qui la jugent ; `gardes`, les gardes du projet qui la jugent, par le nom que porte leur
constat SARIF), comme `rustc --bless` : une passe finale rouge sur elles seules (un de leurs
tests, un constat d'une de leurs gardes, quel que soit son fichier, ou un fichier qu'elles
couvrent) les régénère, la
différence va au lot et au relecteur, et un changement que le plan ne nomme pas arrête le circuit
(`references`) ; 4 Relecture, le `relecteur`, trois tours au plus, un lot
rendu revenant en 2 pour les composants nommés ; 5 Intégration : 5.1 Commit et 5.2 File : main,
poussée, CI, auto. Hors de la suite, sous l'étape arrêtée, l'Arbitrage de l'arrêt : le
`regulateur` tranche l'arrêt ⇄ le `questionneur` questionne sa décision avant qu'elle
s'applique, trois arrêts au plus. Le questionneur ne décide rien, et l'échange va au ticket ; le
référent technique tranche aussi une question de conception née d'un ticket, que le superviseur
lui pose. Ainsi chaque agent travaille dans son cadre, et le numéro d'une étape dit où en est
chaque ticket. Un plan que le superviseur rend au responsable passe aussi par le questionneur.
Ainsi une décision se mesure à des questions qu'elle ne s'est pas posées, comme le code à des
tests qu'il n'a pas écrits.

**Le superviseur intervient sur ce qui dépasse le ticket** : le circuit applique lui-même le
geste que la table des arrêts (`packages/grillhouse/scripts/etapes.mjs`) écrit pour un genre d'arrêt, et vérifie sur
son état chaque décision du régulateur avant de l'appliquer ; le régulateur tranche le reste, ce que la
lettre d'un critère, un précédent écrit ou une règle du cadre tranchent ; il fait monter au
superviseur le reste, et tout sujet sensible : le cadre, l'architecture, et le fonctionnel que la
charte du projet nomme (« Ce qui monte au superviseur »). Ainsi chaque décision se prend au plus
près du travail, et le superviseur garde les siennes. La réponse du responsable entre dans le plan
du ticket, comme une RFC amendée : le référent technique la verse dans la description, le circuit
l'écrit, et un plan changé passe le questionneur avant que le régulateur ne reprenne ; tous les
agents jugent sur le plan, les commentaires restent l'historique, et le contexte d'une relance porte
l'arrêt, jamais une décision du responsable. Une décision qu'il donne en séance, hors d'une
question du circuit, suit le même chemin (`--decision`) : le circuit en cours s'arrête, puis
reprend sur le plan changé. Ainsi chaque agent lit la même décision.

Un objectif dont le découpage n'est pas connu commence par une exploration, sans code ; un ticket
de réalisation fait une seule livraison, en un seul commit ; tout ticket se crée sous sa mère
(`docs/agents/issue-tracker.md`). Ainsi l'avancement se lit ticket par ticket.

**Un ticket de réalisation nomme ses composants** : sa section « Architecture » et son titre
(« numéro — sujet — composant, composant ») les nomment, le fournisseur d'abord, puis ses lecteurs.
Le relevé des composants (`packages/grillhouse/scripts/composants-affectes.mjs`) les trouve à la création du ticket, et
le circuit le refait avant le premier testwriter : un composant relevé que le titre ne nomme pas
l'arrête d'emblée. Dans la copie du ticket, le circuit (`packages/grillhouse/scripts/circuit.mjs`), que lance le superviseur, lance un
agent par composant, chacun enveloppé dans son paquet, dans cet ordre, puis le relecteur, qui relit
l'ensemble. Ainsi un type change avec ses
lecteurs, comme dans une demande de fusion de rustc, et chaque agent écrit dans son seul paquet.
Sur un lot rendu, le circuit rejoue les seuls composants que les constats nomment, puis la passe
finale restreinte à ce que le correctif change et à ses dépendants, et le relecteur relit la
différence depuis la relecture d'avant et ses constats ; la passe finale entière joue une fois
avant l'intégration. Ainsi seul ce qui a changé se rejoue, comme Bazel ne joue que les cibles
qu'un changement atteint.

**Un ticket ouvert naît du mot du responsable**, ou d'un besoin direct d'un projet qui utilise le
cadre (un défaut qu'il rencontre). Une découverte d'agent se consigne dans un ticket fermé, sous le
ticket qui l'a trouvée, étiqueté `decouverte` ; elle se rouvre sur le mot du responsable. Ainsi
chaque découverte est gardée, et le backlog reste le plan du responsable.

## Ce qui tient le dépôt droit

- **Une matière, une adresse** : ce qu'un document décrit déjà s'y verse. Ainsi l'architecture
  écrite reste une, et le code suit une seule version.
- **Un changement de comportement corrige ses textes** : un commit qui change un comportement
  corrige dans le même commit tout texte qui le décrit. Ainsi les documents restent vrais.
- **Une décision de structure passe par le grill** (compétence `grill`) : découpage, paquets,
  modules, interfaces, frontières se tranchent sur les objectifs, les consommateurs, les
  représentations de données et les axes de changement, quelle que soit la taille du code. Ainsi
  l'architecture décide de la structure, et le code la suit.
- **Un geste transverse, un seul ticket** : un même changement répété sur plusieurs composants
  (une migration, la configuration des tests ou de la construction, la déclaration des
  dépendances, les scripts du `package.json`) se décide une fois, en gabarit dans la section
  « Architecture » du ticket, et se mène dans une seule copie qui montre tout le dépôt ; un
  comportement propre à un composant va dans un ticket de réalisation. Ainsi le geste reste le même partout, et
  sa question se tranche une fois.
- **Les composants suivent un modèle commun** : chaque composant étend les configurations de base
  du cadre, et le contrôle des gardes nomme chaque écart ; un écart passe seulement inscrit, avec
  sa raison, dans la liste du projet que le superviseur valide. Ainsi le cadre ne maintient
  aucune spécificité par composant.
- **Une dette connue s'inscrit et se gèle** : un projet qui adopte le cadre inscrit les constats
  de ses gardes dans `grillhouse-dette.json` (`npm run grillhouse:dette:inscrire`) ; une garde
  refuse tout constat neuf et signale ce qui est corrigé, que l'élagage retire
  (`npm run grillhouse:dette:elaguer`) ; le compte ne remonte jamais. Ainsi le cadre s'adopte sans
  attendre la fin de la dette, et la dette ne fait que baisser.
- **Un remplacement supprime le remplacé** dans le même commit, avec ses consommateurs et ses
  gardes. Ainsi le produit garde une seule façon de faire chaque chose.
- **Un commentaire dit ce que la chose est**, au présent. Ainsi il reste vrai tant que le code ne
  change pas.

## Outils

- ⛔ **Des commandes sans invite** : tout fichier temporaire dans le scratchpad de session ;
  `env -C <dossier>` ou `git -C` à la place de `cd` ; une suppression passe par un script node du
  scratchpad (`rmSync` de `node:fs`) sur un chemin nommé et lu ; un signal vise seulement un processus que la
  séance a lancé. Une commande dont on doute s'écrit dans le compte rendu, sans se lancer. Ainsi
  la séance avance seule, sans geler jusqu'au passage du responsable.
- ⛔ **Aucune commande ne fait attendre le responsable** : dans une séance où il attend, celle du
  superviseur, toute commande qui peut dépasser une minute part en arrière-plan, et son avis de fin
  réveille la séance ; aucune boucle d'attente, aucun long délai au premier plan. Ce que la séance
  annonce de sa façon de faire vaut dès la commande suivante ; quand le responsable arrête, elle ne
  lance plus rien. Un agent de rôle, lui, attend au premier plan ce qu'il lance, car sa séance
  finit avec son tour : ses réglages lui ôtent les tâches de fond (`packages/grillhouse/scripts/droits.mjs`). Ainsi le responsable n'attend jamais une commande, et aucun travail ne se
  perd.
- **Les tests se lancent par `npm test`** (Turborepo : la construction, puis les tests) :
  `npm test -- <chemins>` pour un lancement ciblé, chaque chemin écrit depuis la racine du dépôt
  et joué dans son paquet avec ce dont ses tests dépendent (un autre jeu de chemins relit les
  constructions du cache ; un changement de ce qu'ils importent les rejoue),
  `npm run test:forcer -- <chemins>` pour rejouer pour de vrai un test soupçonné instable ; un
  lancement qui ne joue aucun test échoue ; un banc de temps ou un test de nuit se joue quand son
  propre fichier est nommé, au repos (un dossier ou un paquet nommé les laisse hors, comme le
  jour) ; aucun agent ne lance l'outil de test directement. `npm run verifier` joue, après la
  construction : les gardes du cadre,
  celles du projet (son script racine `gardes`, un nom que le cadre réserve ; une garde juge les
  fichiers de l'arbre de travail, que le cache de Turborepo compte, jamais l'index de git ; elle
  écrit ses constats en SARIF, chacun avec son fichier et sa ligne, par `ecrireSarif` de
  `packages/grillhouse/scripts/resultats.mjs`, dans le dossier que nomme `GRILLHOUSE_RESULTATS`, et sans eux son rouge
  ne revient à aucun composant) et les tests, côte à côte ; un rouge n'arrête pas la passe, qui joue tout ce que ses tâches
  préalables permettent et nomme chaque rouge ; `npm run verifier -- --gardes` joue les gardes
  seules, ce que le relecteur joue sur la copie du ticket. Une tâche dont
  rien n'a bougé n'est pas rejouée : Turborepo relit sa sortie consignée dans son cache (« cache
  hit, replaying logs »), et cette relecture vaut un lancement. Une passe se mesure contre le
  dernier vert, l'arbre de la dernière passe verte de sa branche, celle de main pour une copie
  qui n'en a pas encore, comme `vitest --changed` : un paquet que Turborepo rejoue joue les seuls tests que Vitest relie aux fichiers changés depuis,
  et tous ses tests quand un changement sort du graphe de Vitest (un fichier supprimé, une
  configuration, un fichier qu'aucun module n'importe, le code d'un paquet dont il dépend, un
  chemin que ses tests déclarent lire, `grillhouse.lit`) ; sans vert connu, la passe est
  complète, et `npm run verifier -- --tout` la joue pour de vrai, comme la nuit. Ainsi un test ne
  tourne qu'une fois tant que rien ne change, et corriger un test ne rejoue que lui.
- **Une passe écrit sous sa base** : chaque lancement de Vitest, `npm test`, `npm run verifier`,
  un circuit, une intégration et une enveloppe ouvrent leur base dans le dossier temporaire, la
  nomment dans `TMPDIR` à ce qu'ils lancent (les dossiers d'essai des tests, celui de Vitest, celui
  de Claude Code) et l'effacent à leur fin, verte ou rouge ; la base d'une passe tuée, la suivante
  la balaie, comme Bazel donne à chaque test son `TEST_TMPDIR` et nettoie ses bacs à sable
  (`packages/grillhouse/scripts/vitest-config/base-de-passe.mjs`). Ainsi un essai oublié ne remplit jamais le dossier
  temporaire de la machine.
- **Le dossier du circuit appartient au ticket** : `.claude/worktrees/<ticket>.travail` vit autant
  que le ticket, comme l'espace de travail d'un pipeline ; aucun balayage n'y touche, la file
  l'efface à la clôture, `npx grillhouse retirer-copie` avec la copie d'un ticket fermé sans
  intégration. Ainsi une séance qui survit à son circuit garde ce qu'il lui a remis.
- **Main reste vert** : l'intégration exige un `npm run verifier` vert, sans rouge admis, mesuré
  contre le dernier vert ; la nuit rejoue la passe complète. Un test connu
  rouge se met en quarantaine dans le test lui-même (`it.skip` ou `it.fails`), avec le ticket qui
  le corrige, comme le fait une intégration continue mature. Ainsi chaque rouge a son ticket, et
  main ne porte aucun rouge.
- **Une mesure lourde à la fois sur la machine** : chaque `npm run verifier` et chaque passe
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
- **Une passe automatique montre son avancement** : chaque passe automatique écrit ses fichiers
  de tests faits sur prévus (la file, les étapes de sa CI), que le panneau affiche avec le temps
  depuis son dernier signe, « ⚠ figée » au-delà de 5 min, comme le compteur d'actions de Bazel.
  Ainsi une passe qui fige se voit.
- **Un témoin de temps joue seul** : un fichier de test qui importe `mesurerAuRepos` est un
  témoin de temps ; `npm run verifier` joue tous les autres tests, puis les témoins dans une passe
  à eux, une tâche après l'autre, comme Bazel joue un test `exclusive`. Un échec qui dépend d'une
  durée (un délai dépassé, un banc `*.budget.test.*`, un test marqué `mesurerAuRepos`) survenu sous
  charge (la pression CPU du noyau, `/proc/pressure/cpu`, à 25 % ou plus) est « à repasser » (code
  75), ni vert ni rouge : `npm run verifier` rejoue sa tâche seule une fois la machine au repos ;
  sans repos en 15 min, la livraison reste en attente et se représente, comme Bazel classe un
  délai dépassé et CTest le rejoue. Ainsi un témoin ne se mesure jamais sous la charge de sa
  propre passe, et un rouge au repos reste un rouge.
- **L'index d'abord** : toute recherche commence par `rtfm_search` (mode `hybrid`) pour le quoi, et
  par `codegraph explore` (ou l'outil `codegraph_explore`) pour l'appel ; le shell lit un fichier
  déjà nommé. Une recherche vide se reformule dans les mots du code. Dans son enveloppe, un agent
  lit son paquet, les interfaces de ses voisins, la matière de test partagée et ce que ses tests
  déclarent lire (`grillhouse.lit`), données ou code d'un voisin ; l'index est aux rôles qui voient
  tout le dépôt.
  Ainsi une affirmation sur le code repose sur ce que le code contient.
- **Le cadre arrive en un seul morceau** : le paquet npm `@roomi-fields/grillhouse` porte les
  scripts, appelés par `npx grillhouse <sous-commande>`, et il est le greffon `grillhouse`, qui
  porte les compétences, les agents, les crochets de Claude Code, cette charte et le métacadre,
  comme un paquet d'ESLint porte son greffon. La place de marché `roomi-fields`
  (`roomi-fields/claude-plugins`) le désigne par sa source npm ; le projet la déclare et active
  `grillhouse@roomi-fields` (`npx grillhouse maj`). Ce qui est propre à un projet (sa charte, ses
  réglages, sa version du paquet) vit dans le projet, jamais dans ce qui se publie. Une version de
  npm vaut pour les deux ; l'ouverture de séance nomme un greffon chargé à une autre version que
  le paquet du projet, avec la commande qui les remet d'accord. Un projet n'en garde aucune copie ; sans le paquet installé, l'ouverture de séance dit « lance `npm install` », et les autres crochets
  sortent sans effet. Les crochets git du cadre suivent le modèle de Husky : le `prepare` du
  projet lance `grillhouse hooks`, qui les pose à côté des sections de Beads, et chacun appelle
  `grillhouse hook <nom>`, sans effet sans le paquet. Ainsi chaque projet suit la version du cadre qu'il installe, sans fichier à
  recopier.
- Tickets : Beads (`bd`), sous le préfixe du projet, voir `docs/agents/issue-tracker.md`.
- Le greffon `mattpocock-skills` s'appelle avec son préfixe ; un document pour un agent s'écrit
  avec `mattpocock-skills:writing-for-agents`.
- Réponses en français ; le code et les noms d'API restent en anglais.

## Le commit

Le circuit du ticket fait chaque commit après le verdict `ACCEPTÉ` du relecteur, par le script
`packages/grillhouse/scripts/integration/integrer.mjs` : commits conventionnels, message par fichier
(`git commit -F`), trailer `Co-Authored-By: Claude`.
