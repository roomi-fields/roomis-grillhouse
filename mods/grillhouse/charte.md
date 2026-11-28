# La charte commune de Roomi's Grillhouse

Les règles que tout agent applique, identiques dans chaque projet qui installe le cadre. La charte
du projet (`CLAUDE.md`) l'importe depuis le paquet installé et porte ce qui lui est propre : son
nom, son responsable, ce qui décide chez lui, ses critères d'arbitrage, ses commandes ; elle ne
décrit aucun réglage. Le détail d'un rôle vit dans sa compétence ; celui d'un mécanisme du cadre
dans son document, sous `node_modules/@roomi-fields/grillhouse/docs/architecture/` : le circuit
(`circuit.md`), l'entrée sur main, la CI et la nuit (`entree.md`), la machine et l'enveloppe
(`machine.md`), les tests et les langages (`tests.md`), l'installation et les réglages d'un
projet (`installation.md`), le greffon et le panneau (`greffon.md`). Une règle de cette charte
renvoie au paragraphe qui la décrit. Ce fichier porte le noyau, les règles de chaque séance, et
importe à sa fin un module par public (« Les modules de la charte ») : une règle d'un module vaut
celle du noyau pour son public. Ce fichier et ses modules ne se modifient pas dans un projet : un
écart se propose à Grillhouse. Ainsi les projets suivent un seul cadre, et chaque séance ne charge
que ce qu'elle applique.

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

**Un agent qui a la réponse l'applique** : une décision qu'il sait trancher et qu'il recommande
(un nom, une signature, un paquet à retirer de son plan), il la prend et l'écrit dans sa fiche,
sans s'arrêter ; seule monte une question qui revient au responsable (le langage, l'architecture,
un écart à la référence) ou dont il n'a pas la réponse, et elle nomme lequel. Ainsi le circuit
n'attend que les vraies décisions.

**Tous les agents jugent sur le plan** : une décision du responsable entre dans la description du
ticket, comme une RFC amendée ; les commentaires restent l'historique. Ainsi chaque agent lit la
même décision.

**Un document prescriptif change sur décision seule** : après la décision du responsable, un agent
architecte met le document en conformité, et le responsable relit son lot ; le relecteur rend tout
autre lot qui modifie un document prescriptif. Ainsi le document reste la décision, et non la trace
du code.

**Un fait repris se relit à sa pièce** (fichier:ligne depuis la racine de la copie,
« $ commande » et sa sortie, ou « ticket, critère N » et « ticket, § <section> » pour ce que dit
le ticket) avant qu'un agent s'appuie dessus, et un fait transmis porte la
sienne. Ainsi une ligne mal lue s'arrête au premier qui la relit.

**Un projet a plusieurs langages, un paquet un seul** : chaque paquet relève du langage de son
outil, et `npm test`, la vérification et le circuit jouent chaque paquet avec cet outil. Ainsi
chaque paquet se construit et se teste d'une seule façon.

**Le langage d'un paquet se décide à la conception** : la colonne « Langage » du tableau des
composants de `docs/ARCHITECTURE.md` le nomme, l'`INTERFACE.md` du paquet le reprend, et le cadre
le lit là, sans le deviner aux fichiers ; la garde `grillhouse langages-des-paquets` refuse un
paquet que l'architecture ne déclare pas, dont le manifeste suit un autre langage, ou qui n'a pas
le manifeste du sien (le document des tests, §5.6). Ainsi l'architecture fixe le langage, et le
code le suit.

## Ce qui tient le dépôt droit

- **Une matière, une adresse** : ce qu'un document décrit déjà s'y verse. Ainsi l'architecture
  écrite reste une, et le code suit une seule version.
- **Un changement de comportement corrige ses textes** dans le même commit. Ainsi les documents
  restent vrais.
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
- **De jour, personne ne fabrique de charge** : un test soupçonné instable se rejoue par
  `npm run test:forcer`, sans boucle ni processus lancés pour occuper la machine. Ainsi le jour
  garde sa machine.
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

## Les modules de la charte

Une séance de rôle reçoit le noyau et les modules de son rôle, ses réglages excluant les autres
(le document de la machine, §3.2). Toute autre séance (le superviseur, une séance lancée à la main)
et ses sous-agents reçoivent la charte entière.

@charte/superviseur.md

@charte/plan.md

@charte/preuve.md

@charte/tests.md
