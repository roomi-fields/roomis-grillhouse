---
name: grill
description: "L'initialisation et l'architecture du projet : initialiser un projet bâti sur le framework Roomi's Grillhouse — préparer le dépôt, mener le grill d'initialisation, puis écrire la charte, l'architecture, le cadre, les interfaces et le lexique, et ouvrir les premiers tickets. À charger au premier lancement d'un projet neuf ou d'un projet existant qui adopte le framework, quand l'ouverture de séance liste des éléments « pas encore renseignés » (critères d'arbitrage, champs de la charte, architecture, cadre, interfaces, lexique), quand le responsable demande d'initialiser ou de redéfinir ces éléments, et pour toute question de structure (découper en paquets ou modules, définir une interface, une frontière, l'architecture)."
---

# Grill — initialiser le projet et décider de sa structure

Le framework fournit les outils et les compétences, et `${CLAUDE_PLUGIN_ROOT}/METACADRE.md` les intentions qu'ils servent ;
l'initialisation leur donne leur objet. Lis le métacadre avant le premier tour : chaque
recommandation du grill sert une de ses intentions. L'initialisation produit les éléments clés que
les compétences `pitmaster` et `developpeur` lisent à chaque séance :

| élément | ce qu'il fixe |
|---|---|
| `CLAUDE.md` | la charte du projet : le projet, le responsable, ce qui décide, ses critères d'arbitrage, ses commandes ; la charte commune du cadre, qu'elle importe du paquet installé (`@node_modules/@roomi-fields/grillhouse/charte.md`), la complète et ne se modifie pas |
| `docs/ARCHITECTURE.md` | comment le projet est construit, et pourquoi |
| `docs/CADRE.md` | le rôle de chaque composant, sa frontière, ce qu'il refuse (R1…) |
| `docs/INTERFACE.md` | ce qui traverse chaque frontière, et le garde qui le tient |
| `CONTEXT.md` | le lexique du domaine |

Dans un dépôt à plusieurs paquets, le cadre, l'interface et l'architecture de chaque paquet vivent
sous `packages/<x>/docs/`, et `docs/ARCHITECTURE.md` décrit l'ensemble.

## 0. Tout le projet, ou les seuls éléments vides

À chaque ouverture de séance, la liste « Pas encore renseignés » dit ce qui reste vide. Un projet
neuf passe par toutes les sections ci-dessous. Un projet déjà engagé grille les éléments listés, ou
celui que le responsable choisit, à n'importe quel moment : le relevé (§3) porte sur ce que
l'élément touche, le grill (§4) sur ses branches, l'écriture (§5) sur son document. Ainsi chaque
élément de l'architecture est décidé et écrit avant que le code en ait besoin.

**Une proposition à corriger** : chaque question arrive avec sa proposition, tirée du projet et de
son domaine. Pour les critères d'arbitrage (branche 2), cherche dans le code, les documents, les
projets voisins et la documentation publique les produits matures qui font le même travail, les
standards et outils en usage, les exigences mesurables du domaine, et propose-les nommément. Ainsi
le responsable corrige une proposition et garde son temps pour les vraies décisions.

## 1. Préparer le dépôt

Un projet neuf naît de `npx @roomi-fields/grillhouse init <dossier> [préfixe]` : le gabarit, les
tickets, l'index, les greffons et les crochets. S'il manque ensuite un élément, l'ouverture de séance
le signale sous « Manque », chacun avec sa commande, sans invite : `npx grillhouse maj` installe pour
le projet chaque greffon que `.claude/settings.json` déclare (`enabledPlugins`), après son
marketplace, et met le greffon du cadre à la version du paquet ; elle finit par `npm run verifier`,
une passe longue : lance-la en tâche de fond et relis son code à la fin. Le préfixe des tickets vient du nom du projet ; il se confirme au premier tour du grill.

## 2. La règle de l'architecture

- **Un petit projet se structure comme un grand** : ses composants, ses frontières et ses
  interfaces se décident sur ses objectifs et sur la construction de son code, comme pour un grand
  projet. Ainsi le projet est propre, pro et mature dès sa première ligne, et le reste en
  grandissant.
- **Les pièces d'abord** : chaque recommandation s'appuie sur une lecture de la construction du
  code, avec ses fichiers et ses symboles. Ainsi elle repose sur une preuve ; un compte de lignes,
  de fichiers ou d'imports ne fonde aucune recommandation.
- **Une question reportée nomme son fait** : reporter une question nomme le fait qui la rouvrira et
  ce qu'elle coûtera alors. Ainsi le report est une décision écrite de l'architecture, que le
  responsable peut juger.
- **Une frontière interne a son interface** : une frontière entre deux modules internes a son
  interface, tenue par le cadre et un test, comme une interface publiée. Ainsi le code suit
  l'architecture à l'intérieur du projet aussi.
- **Un découpage se justifie par ses pièces** : un rôle, un consommateur (dans le dépôt ou hors de
  lui), une raison de changer, une donnée qui traverse. Une fusion se justifie de même : deux
  parties qui changent toujours ensemble, qu'aucun consommateur ne sépare. Ainsi chaque frontière
  découle de l'architecture.
- **Les mots de la structure** : tu charges `mattpocock-skills:codebase-design` avant le grill et tu
  emploies ses mots (module, interface, profondeur, jointure). Ainsi le responsable et les agents
  parlent de la structure avec les mêmes mots.
- **Chaque recommandation cite sa référence mature** : elle dit ce que ferait le produit mature du
  domaine (un compilateur mature, un DAW professionnel, selon le contexte), ce qui existe déjà, et
  ce qu'exige le domaine (la rapidité pour le live coding). Ainsi le responsable arbitre sur pièces,
  sans refaire l'enquête.

### Les façons de penser

- **Comme le produit mature** : avant de proposer un découpage, décris ce que ferait, et comment est
  structuré, le produit professionnel et mature qui fait le même travail (pour un transpileur :
  TypeScript ; pour un moteur audio : une station audionumérique professionnelle). Ta proposition
  dit en quoi elle le suit, et pourquoi elle s'en écarte. Ainsi le découpage repart de ce qui a
  fait ses preuves.
- **Un tout cohérent, une seule API** : un projet qui forme un tout cohérent publie un seul paquet,
  avec une API choisie et maîtrisée par lui. À l'intérieur, ses composants sont des modules, chacun
  avec son interface et ses tests ; un composant se publie à part quand il vit hors du produit.
  Ainsi le découpage interne sert l'architecture, et la publication sert les consommateurs.
- **L'existant d'abord** : on se base sur l'existant. Les conventions des projets voisins de
  l'auteur (organisation des paquets, numérotation, outils, vocabulaire) se reprennent avant toute
  invention, par exemple des dossiers de paquets numérotés comme dans un projet voisin. Ainsi le produit
  hérite de ce qui marche déjà.

## 3. Relever l'existant

**Les faits se cherchent** dans le code et les documents ; seules les décisions se posent au responsable. Ainsi il ne reçoit que des décisions.

**Le relevé structurel vient avant le premier tour** : un sous-agent (Explore, « very thorough ») rend le relevé décrit dans `references/releve-structurel.md`, et tu le juges avec `mesure` ; un relevé fait de comptes se refait. Ainsi l'architecture se décide sur une preuve.

**Le relevé dit ce qui est** : il décrit la construction réelle, défauts compris ; le grill décide
ce qui doit être. Ainsi chaque décision part de l'état réel du code.

## 4. Le grill d'initialisation

Charge `mattpocock-skills:grilling` et suis-le (s'il n'est pas disponible, suis le même format, et
signale au responsable que le greffon `mattpocock-skills` manque) : des tours numérotés, chaque
question avec ta recommandation et ses pièces, la frontière de l'arbre des décisions à chaque tour.
**Le grill se mène en entier**, par tours, même quand le responsable pose la question en une
phrase. Ainsi chaque décision de structure passe par l'architecture, et une réponse directe ne
remplace jamais le grill. Les branches de l'arbre :

1. **Les objectifs** — ce que le projet doit permettre, à qui, à quel horizon ; ce qui doit rester
   vrai dans cinq ans ; ce qu'il ne fait pas (ce que fait un autre système à sa place).
2. **Les références et les exigences** — les produits matures qui font référence dans le domaine
   (ce qu'un compilateur mature, une station audionumérique professionnelle… font du même
   problème), les standards et outils existants à reprendre, les exigences propres au domaine
   (temps de réponse, fiabilité en direct, compatibilité). Elles remplissent « Comment on arbitre »
   de la charte et arbitrent toutes les branches suivantes.
3. **Le responsable** — son nom, les documents qu'il valide, la politique de poussée.
4. **Ce qui décide** — la source d'autorité (une spécification, une cible, un produit de
   référence), puis le cadre, puis le code.
5. **Les consommateurs** — qui utilise le projet ou une de ses parties, aujourd'hui et demain
   (un éditeur, un autre dépôt, une ligne de commande) ; chacun dit une frontière.
6. **Les représentations** — les données qui traversent la chaîne de traitement : texte, arbre,
   graphe, sortie ; où chacune naît, qui la lit. Chaque étape reçoit une structure ; une étape qui
   ré-analyse du texte signale une frontière manquante.
7. **Les axes de changement** — ce qui changera (une syntaxe, une cible, un catalogue, un hôte) ;
   deux axes indépendants vivent dans deux modules.
8. **Les composants** — le découpage qui découle des branches 5 à 7, chaque frontière avec ses
   pièces ; pour chacun, les huit rubriques du cadre : rôle, reçoit, rend, connaît, ne connaît pas,
   refuse, invariants, coût. Puis la forme : un paquet ou plusieurs, bibliothèque ou service (un
   service garde `deployment/`, le démon et `.env`), TypeScript ou JavaScript. **Plusieurs paquets,
   une forme publiée** : chaque paquet publie son entrée dans le champ `exports` de son
   `package.json`, construite dans `dist/` ; ses tests et leurs données restent dans le paquet.
   **Les outils du projet, un paquet** : les scripts propres au projet (son typage, ses gardes, ses
   traces) et leurs tests forment un paquet de l'espace de travail, comme `src/tools/` de rustc,
   nommé selon la convention du projet ; il déclare ses commandes dans le champ `bin` de son
   `package.json`, comme npm le prévoit pour un exécutable, et n'exporte aucun module. La racine
   ne porte aucun test, et chaque test passe par `npm test`. Ainsi un outil se teste, se relit et
   s'intègre comme un paquet.
   **Le corpus du produit, un seul paquet** : les cas qui traversent toute la chaîne, et dont toute
   modification d'un paquet peut changer le résultat, vivent dans un seul paquet qui exporte
   `./test-fixtures`, comme `tests/cases` de TypeScript ou `tests/ui` de rustc ; tous les rôles le
   lisent, le testwriter seul l'écrit. Sa configuration de Vitest s'écrit en CommonJS
   (`vitest.config.cjs`, la base du cadre par `await import()`) : Vite écrit un fichier à côté
   d'une configuration ESM pour la charger, et le corpus est en lecture seule chez les autres
   rôles. Ses données (scènes, paires) ne bougent que les tests qui
   les lisent, comme le `data` de Bazel : chaque paquet déclare dans son `package.json`, depuis la
   racine, les chemins (dossiers ou fichiers) que ses tests lisent (`"grillhouse": { "lit": [...] }`),
   données ou code d'un voisin (ses scripts de capture, un fichier de ses sources), comme le `data`
   de Bazel prend tout fichier ; son test les prend en entrée, et la construction du paquet qui
   porte un chemin de données seules le laisse hors des siennes, tandis qu'un chemin qui contient
   du code, ou un fichier que cette construction lit (son `package.json`, ses `tsconfig*.json`),
   reste dans la construction de son paquet. Une
   trace qu'un étage produit (des grammaires encodées du corpus), comme une genrule de Bazel, vit
   dans le paquet producteur, dans un dossier que git ignore, et se déclare avec ce qu'elle lit
   (`"traces": { "trace:<nom>": { "lit": [...], "ecrit": "<dossier>" } }`, sa commande le script du
   même nom, qui vide son dossier d'abord) ; un lecteur la déclare dans son `lit`. Ainsi un test
   ne dépend que de son code, de ce qu'il importe et des chemins qu'il déclare. Chaque
   paquet construit porte un script `build` qui écrit son `dist/` ; Turborepo les lance
   (`turbo.json`, tâche `build`) : une construction attend celle de ses seules dépendances
   d'exécution (`dependencies`, `peerDependencies`, `optionalDependencies`), et un test celle de
   son propre paquet, dont il importe l'entrée construite, et de tout ce qu'il importe, la matière de test partagée d'un voisin comprise ; une construction
   inchangée se restaure de son cache. Une construction ne compte que ce qu'elle lit : le
   `package.json`, le `tsconfig.build.json` du paquet, ce qu'il étend et les dossiers qu'il inclut
   (un fichier listé, son dossier) ; un fichier de test changé ne rejoue ni elle ni ses dépendants.
   Le `turbo.json` de la racine est au projet : la mise à jour
   du cadre l'écrit une fois, depuis le gabarit de sa forme (`templates/turbo/paquets.json` quand
   le `package.json` déclare `workspaces`), puis n'y écrit que ce que le cadre en tient (les
   dépendances des gardes, la variable des passes ciblées, l'exclusion `!$TURBO_ROOT$/<chemin>/.git`
   à côté d'une entrée qui couvre un sous-module, dont le `.git` nomme la copie). Celui de chaque paquet est
   généré depuis son `package.json` (`npx grillhouse turbo-des-paquets --ecrire`, que la mise à
   jour lance) et `grillhouse:gardes` refuse un fichier absent ou périmé : une dépendance s'écrit
   au `package.json` seul. Chaque paquet testé porte son script
   `test:vitest` et sa configuration Vitest, qui étend la configuration de base du cadre, le
   `@roomi-fields/grillhouse/vitest-config`, que le paquet du cadre exporte (par `mergeConfig`) : les
   exclusions du jour (tests de nuit, bancs de budget) et l'environnement commun y sont, sans
   copie. Le paquet l'importe par son nom (`import base from '@roomi-fields/grillhouse/vitest-config'`) et le
   déclare (`@roomi-fields/grillhouse`) dans ses `devDependencies`, comme les exemples de
   Turborepo atteignent leurs paquets de configuration ; la mise à jour du cadre écrit la
   déclaration. La racine d'un dépôt sans paquets l'importe par le même nom. Un paquet hors cadre (`docs/agents/hors-cadre.txt`) reste un
   espace de travail, qu'un voisin importe par son nom, et Turborepo ne joue aucune de ses tâches :
   son `turbo.json` généré les exclut, et aucune tâche d'un paquet du cadre ne l'attend. Aucune configuration ne lit
   celle d'un voisin. Un test atteint son paquet
   par une seule route : les sources relatives pour un test unitaire, le nom du paquet pour un test
   de porte. Ainsi un agent enveloppé construit et teste son paquet avec ce que ses voisins
   publient.
9. **Les interfaces** — pour chaque frontière : ce qui la traverse, qui offre, qui consomme, qui
   juge quelle faute, et le garde qui la tiendra.
   **Une fois les composants décidés**, la nuit entre dans la table des tâches du poste
   (`crontab -e` : `0 3 * * * export PATH=<dossier de Node>:$PATH; cd <racine> && node_modules/.bin/grillhouse nuit`,
   la ligne que propose l'ouverture de séance, avec le dossier du Node qui l'exécute, que la table
   des tâches ne trouve pas seule) : elle rejoue pour de vrai la passe complète, puis les tests de nuit et les bancs de budget, que le jour ne joue pas. Chaque
   intégration joue `npm run verifier` en entier (les gardes, le typage de chaque paquet et les
   tests), Turborepo relisant de son cache ce qui n'a pas bougé.
   Restent des choix selon la taille du projet, que le responsable tranche :
   - **le contrôle de l'interface contre le code** (`packages/grillhouse/scripts/langages/typescript/interfaces-contre-code.mjs`) : une
     seule passe avant les tests (petit projet), ou un banc par composant qui appelle
     `verifierComposant`, rejoué seulement quand son composant l'est (grand projet).
   - **les sous-modules partagés** : un sous-module qu'aucun ticket n'écrit (un moteur de
     référence, une dépendance externe) se déclare partagé, `npm pkg set 'grillhouse.partage[0]=<chemin>'` ;
     chaque copie le lit alors dans le dépôt principal, en lecture seule
     (`packages/grillhouse/scripts/sous-modules.sh`).
10. **L'architecture** — les trois ou quatre choix qui commandent le reste, chacun avec sa raison et
   l'objectif qu'il sert ; les données centrales ; où le code tourne.
11. **Le lexique** — les mots du domaine dont la définition change du code
    (`mattpocock-skills:domain-modeling`).
12. **Le premier chantier** — ce qui se construit d'abord, et ce qui attend.

**La fin du grill** : le grill est fini quand la frontière est vide, que chaque composant et chaque
frontière porte ses pièces, que chaque recommandation cite sa référence mature et repose sur une
lecture du code, et que le responsable confirme la compréhension partagée. L'écriture commence
ensuite. Ainsi les documents écrivent des décisions prises.

## 5. Écrire

- Les documents lus par un humain s'écrivent avec la compétence `redacteur` (référence
  « Les documents d'un composant ») ; la charte avec `mattpocock-skills:writing-for-agents`.
- **Les champs de la charte** : chaque champ `<…>` de la charte modèle reçoit sa valeur. Ainsi la
  charte cadre les agents dès la séance suivante.
- `package.json` (nom, description, auteur, dépôt), `README.md`, `LICENSE`, `CREDITS.md`,
  `CHANGELOG.md` et `CONTRIBUTING.md` prennent l'identité du projet.
- **Les règles de dépendance propres au projet** (un paquet qui n'importe rien, une couche qui ne
  lit qu'en type) et ses options de la carte (`exclude`, `doNotFollow`…) s'écrivent dans
  `.dependency-cruiser.projet.cjs` ; les règles communes sont générées
  (`npx grillhouse frontieres --ecrire`). Ainsi chaque règle de structure décidée au grill est
  tenue par un test.
- **Ce que la forme écarte se retire** dans le même commit (les parties de service d'une
  bibliothèque, le code d'exemple du modèle, `src/` et ses tests `tests/unit/config.spec.ts`,
  `errors.spec.ts`, `types.spec.ts` ; les tests du cadre restent à Grillhouse et n'arrivent pas
  dans le projet). Ainsi le dépôt contient seulement ce que
  l'architecture décidée garde.
- **Le responsable relit ses documents** : chaque document se relit au responsable avant son
  commit, puisqu'il les valide. Ainsi il tranche l'essentiel avant que le code ne s'y appuie.

## 6. Ouvrir le travail

- **Les premiers tickets attendent son mot** : une épopée pour le premier chantier ; ses tickets
  s'ouvrent sous l'étiquette `a-valider`, chacun avec les règles et les documents qu'il touche,
  et chaque réalisation avec ses critères d'acceptation numérotés (`docs/agents/issue-tracker.md`).
  Ainsi le premier chantier part avec l'accord du responsable.
- `pitmaster/SUIVI.md` : le premier tour, les questions restées ouvertes.
- Un commit `docs: initialiser le projet` qui ne contient que ces éléments.

À la fin, l'ouverture de séance ne signale plus rien : la séance suivante charge `pitmaster`.
