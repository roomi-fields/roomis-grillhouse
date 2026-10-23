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

**Une passe écrit sous sa base** : chaque lancement de Vitest, `npm test`, `npm run verifier`,
un circuit, une intégration et une enveloppe ouvrent leur base dans le dossier temporaire, la
nomment dans `TMPDIR` à ce qu'ils lancent (les dossiers d'essai des tests, celui de Vitest, celui
de Claude Code) et l'effacent à leur fin, verte ou rouge ; la base d'une passe tuée, la suivante
la balaie, comme Bazel donne à chaque test son `TEST_TMPDIR` et nettoie ses bacs à sable
(`packages/grillhouse/scripts/vitest-config/base-de-passe.mjs`). Ainsi un essai oublié ne remplit jamais le dossier
temporaire de la machine.

**Le dossier du circuit appartient au ticket** : `.claude/worktrees/<ticket>.travail` vit autant
que le ticket, comme l'espace de travail d'un pipeline ; aucun balayage n'y touche, la file
l'efface à la clôture, `npx grillhouse retirer-copie` avec la copie d'un ticket fermé sans
intégration. Ainsi une séance qui survit à son circuit garde ce qu'il lui a remis.

**Main reste vert** : l'intégration exige un `npm run verifier` vert, sans rouge admis, mesuré
contre le dernier vert ; la nuit rejoue la passe complète. Un test connu
rouge se met en quarantaine dans le test lui-même (`it.skip` ou `it.fails`), avec le ticket qui
le corrige, comme le fait une intégration continue mature. Ainsi chaque rouge a son ticket, et
main ne porte aucun rouge.

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
npm vaut pour les deux ; l'ouverture de séance nomme un greffon chargé à une autre version que
le paquet du projet, avec la commande qui les remet d'accord. Un projet n'en garde aucune copie
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
partagée), `@roomi-fields/grillhouse/paquets` (`horsCadre`, les paquets hors cadre), et la
configuration de base de Vitest, `@roomi-fields/grillhouse/vitest-config` et
`@roomi-fields/grillhouse/vitest-config/mesure`. Une entrée s'ajoute ou se retire avec ce
paragraphe, que `tests/unit/paquet-publie.spec.ts` confronte au champ `exports`. Ainsi une
version du paquet dit ce qu'un projet peut importer, et ce qu'elle lui retire.
