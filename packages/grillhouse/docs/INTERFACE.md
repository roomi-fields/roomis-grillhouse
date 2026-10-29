# Le noyau de Grillhouse — interface

Le noyau demande à un module de langage ce que ce document écrit, et rien d'autre.

Le noyau porte les tickets, le circuit, les rôles et leur relecture, le tableau, l'enveloppe, les
crochets et la mise à jour. Un module de langage, sous `scripts/langages/<nom>/`, porte ce qui
dépend du langage du projet : ses outils de test, de typage et de structure. Comme Pants, qui
active les backends que sa configuration nomme, le noyau charge le module que le projet déclare et
ne lit aucun autre de ses fichiers. Ainsi le reste du noyau ignore le langage du projet.

Les types de la jointure sont `scripts/jointure.d.ts` ; l'entrée publiée
`@roomi-fields/grillhouse/jointure` les porte.

## Le langage d'un projet

Un projet déclare son langage dans son `package.json`, sous `grillhouse.langages` :
`["typescript"]`. Le nom vient de la liste fermée des langages du cadre (`LANGAGES` de
`scripts/langages.mjs`) ; un nom hors de la liste est refusé, nommé, avec la liste.

Un projet sans déclaration est lu comme `["typescript"]`, jusqu'à grillhouse-3dr.2.3, où `init` et
`maj` écriront la déclaration d'après ce qu'ils trouvent. Un seul langage est servi par projet ; la
fusion de plusieurs langages est grillhouse-pkl.3.

`langageDe(racine)` rend le module qui sert le projet de `racine`, chargé une fois par processus.

## Les demandes

Le module de langage exporte par défaut un objet `Langage`. Chaque membre répond à une demande du
noyau, et chaque réponse décrit sans agir, sauf `verifier` d'un fichier engendré, qui juge.

- `nom` : le nom du langage, celui de la liste du cadre.
- `composants` : les composants du projet, chacun `{ dossier, nom, paquet }`, le dossier absolu.
- `composantDe` : le composant qui tient un fichier, ou null pour un fichier hors de tout
  composant ; toujours l'un de ceux que `composants` rend.
- `lecteurs` : les fournisseurs et les lecteurs, par le code, des éléments qu'un ticket nomme : son
  interface, ses imports, ses tests, ses types. Le relevé des composants touchés
  (`composants-affectes`) y ajoute les chemins lus et l'architecture.
- `touches` : les composants touchés depuis un commit, leurs dépendants, transitivement, et les
  fichiers hors de tout composant (`{ touches, dependants, horsGraphe }`), comme le
  `--filter=...[<commit>]` de Turborepo.
- `commandes` : les commandes qui testent (`tester`), vérifient (`verifier`) et typent (`typer`),
  chacune `{ script, args }`, le script absolu, jamais lancée. `grillhouse tests` et
  `grillhouse verifier` lancent `tester` et `verifier`.
- `verdict` : ce qu'un lancement a laissé dans son dossier de résultats (`GRILLHOUSE_RESULTATS`) :
  `{ rapports, taches }`, chaque fichier de test avec ses tests, chaque tâche avec son code, 0 vert,
  1 rouge, 75 « à repasser ».
- `estUnTest` : ce que le testwriter écrit dans un fichier, `{ joue, test, matiere }` (un test que
  le lanceur joue, un fichier de test ou d'un dossier de tests, un fichier de la matière de test
  partagée), ou null pour un fichier qu'il n'écrit pas. Les verrous des rôles, l'intégration et le
  circuit le lisent.
- `fichiersEngendres` : les fichiers que le module engendre, chacun avec sa commande, ses fichiers,
  ceux qu'il lit, les noms de ses constats et sa vérification (`verifier`), qui rend ses écarts.
  Le circuit les régénère et les juge (étape 4.2).
- `gardes` : les gardes de structure du module, chacune `[script, ...args]`, dans l'ordre où elles
  jouent ; `grillhouse gardes-du-cadre` joue ensuite celles du noyau.

## La conformité

`@roomi-fields/grillhouse/conformite` tient chaque module de langage à ces demandes, comme le
RuleTester d'ESLint tient une règle à ses cas. `cas(langage, exemples)` rend un cas par demande :
sur son entrée valide, un module sain ne donne aucune faute ; sur son entrée défectueuse, il donne
exactement les fautes attendues. `echecs(langage, exemples)` rend les cas qu'un module manque. Les
entrées sont celles du module (`scripts/langages/typescript/exemples.mjs`).

Le test du noyau joue la suite sur le module typescript et sur sept modules défectueux, un défaut
chacun ; chacun manque son seul cas. Ainsi la suite attrape un vrai défaut.
