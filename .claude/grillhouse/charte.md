# La charte commune de Roomi's Grillhouse

Les règles du cadre, identiques dans chaque projet qui l'a installé. La charte du projet
(`CLAUDE.md`) l'importe et porte ce qui lui est propre : son nom, son responsable, ce qui décide
chez lui, ses critères d'arbitrage, ses commandes. Ce fichier vient du cadre et ne se modifie pas
dans un projet : un écart se propose à Grillhouse. Ainsi les projets suivent un seul cadre.

## Ce qui décide

Une décision vit dans le document qu'elle règle. Ainsi on la trouve là où on la cherche.

Une règle s'écrit selon le métacadre (`METACADRE.md`, §2).

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
   `testeur`), puis le code qui les rend verts (agent `developpeur`). Ainsi le code se mesure à des
   tests qu'il n'a pas écrits. Un critère répond à un besoin réel de l'usage actuel ; un cas
   seulement possible n'en devient pas un. Ainsi le ticket garde la taille du besoin.
5. Le ticket se ferme sur ses tests ciblés, le verdict de l'agent `relecteur` sur le lot, le
   commit du circuit (`scripts/circuit.mjs`), seul à commiter, sur la branche du ticket, et
   l'entrée de cette branche sur main par la file, qui le ferme. Ainsi ce qui est déclaré fini
   l'est vraiment.
6. Chaque agent laisse sa passation en commentaire au ticket (`bd comments add`,
   `docs/agents/issue-tracker.md`), avec ce qui n'est pas fait et pourquoi. Ainsi l'agent suivant
   la trouve par `bd show`.

Une séance de supervision charge le superviseur (`pitmaster`). Les rôles sont des agents du projet
(`.claude/agents/`), chacun désigné par le numéro de son rôle, dans l'ordre du flux :
0 `chef-de-chantier`, qui mène un ticket de sa prise à son commit, 1 `explorateur`, qui mène une
exploration, 2 `arbitre`, qui tranche une question de conception, 3 `testeur`, 4 `developpeur`,
5 `relecteur`, chacun sous ses verrous. Ainsi chaque agent travaille dans son
cadre, et son numéro dit son rôle.

**Le superviseur intervient sur ce qui dépasse le ticket** : le chef de chantier tranche ce que la
lettre d'un critère, un précédent écrit ou une règle du cadre tranchent ; il fait monter au
superviseur le reste, et tout sujet sensible : le cadre, l'architecture, et le fonctionnel que la
charte du projet nomme (« Ce qui monte au superviseur »). Ainsi chaque décision se prend au plus
près du travail, et le superviseur garde les siennes.

Un objectif dont le découpage n'est pas connu commence par une exploration, sans code ; un ticket
de réalisation fait une seule livraison, en un seul commit ; tout ticket se crée sous sa mère
(`docs/agents/issue-tracker.md`). Ainsi l'avancement se lit ticket par ticket.

**Un ticket de réalisation nomme ses composants** : sa section « Architecture » et son titre
(« numéro — sujet — composant, composant ») les nomment, le fournisseur d'abord, puis ses lecteurs.
Dans la copie du ticket, le chef de chantier lance un agent par composant, chacun enveloppé dans
son paquet, dans cet ordre, et le relecteur relit l'ensemble. Ainsi un type change avec ses
lecteurs, comme dans une demande de fusion de rustc, et chaque agent écrit dans son seul paquet.

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
  `env -C <dossier>` ou `git -C` à la place de `cd` ; une suppression passe par un script du
  scratchpad (`os.remove`) sur un chemin nommé et lu ; un signal vise seulement un processus que la
  séance a lancé. Une commande dont on doute s'écrit dans le compte rendu, sans se lancer. Ainsi
  la séance avance seule, sans geler jusqu'au passage du responsable.
- ⛔ **Aucune commande ne fait attendre le responsable** : dans une séance où il attend, celle du
  superviseur, toute commande qui peut dépasser une minute part en arrière-plan, et son avis de fin
  réveille la séance ; aucune boucle d'attente, aucun long délai au premier plan. Ce que la séance
  annonce de sa façon de faire vaut dès la commande suivante ; quand le responsable arrête, elle ne
  lance plus rien. Un agent de rôle, lui, attend au premier plan ce qu'il lance, car sa séance
  finit avec son tour. Ainsi le responsable n'attend jamais une commande, et aucun travail ne se
  perd.
- **Les tests se lancent par `npm test`** (Turborepo : la construction, puis les tests) :
  `npm test -- <chemins>` pour un lancement ciblé, chaque chemin écrit depuis la racine du dépôt
  et joué dans son paquet avec ce dont ses tests dépendent (un autre jeu de chemins relit les
  constructions du cache ; un changement de ce qu'ils importent les rejoue),
  `npm run test:forcer -- <chemins>` pour rejouer pour de vrai un test soupçonné instable ; un
  lancement qui ne joue aucun test échoue ; aucun agent ne lance l'outil
  de test directement. `npm run verifier` joue tout après la construction : les gardes du cadre,
  celles du projet (son script racine `gardes`, un nom que le cadre réserve ; une garde juge les
  fichiers de l'arbre de travail, que le cache de Turborepo compte, jamais l'index de git) et les
  tests, côte à côte ; un rouge n'arrête pas la passe, qui joue tout ce que ses tâches
  préalables permettent et nomme chaque rouge ; `npm run verifier -- --gardes` joue les gardes
  seules, ce que le relecteur joue sur la copie du ticket. Une tâche dont
  rien n'a bougé n'est pas rejouée : Turborepo relit sa sortie consignée dans son cache (« cache
  hit, replaying logs »), et cette relecture vaut un lancement. Ainsi un test ne tourne qu'une
  fois tant que rien ne change.
- **Main reste vert** : l'intégration exige un `npm run verifier` vert, sans rouge admis. Un test connu
  rouge se met en quarantaine dans le test lui-même (`it.skip` ou `it.fails`), avec le ticket qui
  le corrige, comme le fait une intégration continue mature. Ainsi chaque rouge a son ticket, et
  main ne porte aucun rouge.
- **Un témoin de temps se mesure CPU au repos** : un échec qui dépend d'une durée (un délai
  dépassé, un banc `*.budget.test.*`, un test marqué `mesurerAuRepos`) survenu sous charge (la
  pression CPU du noyau, `/proc/pressure/cpu`, à 25 % ou plus) est « à repasser » (code 75), ni
  vert ni rouge : `npm run verifier` rejoue sa tâche seule une fois la machine au repos ; sans
  repos en 15 min, la livraison reste en attente et se représente, comme Bazel classe un délai
  dépassé et CTest le rejoue. Ainsi une machine occupée ne refuse aucun lot, et un rouge au repos
  reste un rouge.
- **L'index d'abord** : toute recherche commence par `rtfm_search` (mode `hybrid`) pour le quoi, et
  par `codegraph explore` (ou l'outil `codegraph_explore`) pour l'appel ; le shell lit un fichier
  déjà nommé. Une recherche vide se reformule dans les mots du code. Dans son enveloppe, un agent
  lit son paquet, les interfaces de ses voisins et la matière de test partagée ; l'index est aux rôles qui voient tout le dépôt.
  Ainsi une affirmation sur le code repose sur ce que le code contient.
- Tickets : Beads (`bd`), sous le préfixe du projet, voir `docs/agents/issue-tracker.md`.
- Le greffon `mattpocock-skills` s'appelle avec son préfixe ; un document pour un agent s'écrit
  avec `mattpocock-skills:writing-for-agents`.
- Réponses en français ; le code et les noms d'API restent en anglais.

## Le commit

Le circuit du ticket fait chaque commit après le verdict `ACCEPTÉ` du relecteur, par le script
`scripts/integration/integrer.mjs` : commits conventionnels, message par fichier
(`git commit -F`), trailer `Co-Authored-By: Claude`.
