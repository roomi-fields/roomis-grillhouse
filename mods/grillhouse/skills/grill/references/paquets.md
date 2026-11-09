# Les mécanismes d'un paquet

Le détail que la branche 8 du grill (« Les composants ») résume, à lire au moment de créer un paquet : sa forme publiée, les outils du projet, le corpus et ses données, les traces, Turborepo et la configuration Vitest.

**Plusieurs paquets,
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
`test:unit` et sa configuration Vitest, qui étend la configuration de base du cadre, le
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
