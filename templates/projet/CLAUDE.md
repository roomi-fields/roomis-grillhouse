# <Nom du projet>

<Ce qu'est le projet et ce qu'il fait, en deux ou trois phrases.>

**Responsable** : <nom>. Il valide <la spécification, les ARCHITECTURE.md, les CADRE.md, les
INTERFACE.md> ; le superviseur valide les autres documents. Ainsi le responsable tranche
l'essentiel.

Les règles du cadre : @node_modules/@roomi-fields/grillhouse/charte.md

## Ce qui décide

Le métacadre (`node_modules/@roomi-fields/grillhouse/METACADRE.md` : les intentions du cadre et
l'écriture des règles), puis
<la spécification ou la cible>, puis le cadre de chaque composant (`docs/CADRE.md`,
`docs/INTERFACE.md`, `docs/ARCHITECTURE.md`), puis le code. Ainsi l'architecture décide, et le
code suit.

## Comment on arbitre

Dans cet ordre ; le projet ajoute ses propres forces à la liste, à leur rang (« le temps
d'abord », « une personne maintient le projet »…).

1. **Que fait la référence mature ?** <Les références du domaine : un compilateur mature, une
   station audionumérique professionnelle…> Ce qu'elles font est la réponse par défaut ; un écart
   porte sa raison écrite.
2. **Qu'est-ce qui existe déjà ?** Un standard, un outil sur étagère, une bibliothèque éprouvée,
   une convention des projets voisins se reprend tel quel.
3. **Le domaine l'exige-t-il ?** <Les exigences du domaine : la rapidité pour le live coding…> Un
   choix qui les dégrade se mesure et se dit.

## Ce qui monte au superviseur

Une question qu'aucun geste du circuit ne tranche monte au superviseur, avec sa pièce. Il monte au
responsable le fonctionnel, qu'il ne tranche jamais seul : <le langage, le moteur audio, une
interface publiée…>. Le cadre et l'architecture montent toujours (charte commune).

## Commandes

- `npm test` (Turborepo : construction, puis tests ; une tâche dont rien n'a bougé est relue de son cache, `npm run test:forcer` rejoue) · `npm test -- <chemins>` (un lancement ciblé : chaque chemin écrit depuis la racine, joué dans son paquet, avec les constructions dont ses tests dépendent, relues du cache ; ses tests rejouent dès que bouge ce qu'ils importent ; un lancement qui ne joue aucun test échoue ; un test de nuit nommé est refusé, la nuit seule le joue ; une mesure de temps — un banc, un témoin de temps — se joue quand son propre fichier est nommé, sous la mesure du temps) · `npm run verifier` (après la construction, les gardes du cadre, celles du projet — son script `gardes` —, le typage de chaque paquet — son script `typecheck`, ses sources et ses tests —, la mise en forme et le lint de la racine — ses scripts `format:check` et `lint`, joués quand ils existent — et les tests, côte à côte, sur sa part de la machine, sans aucune mesure de temps, que joue la nuit seule : ce que jouent l'intégration, la file, la CI et la nuit ; mesuré contre le dernier vert, un paquet rejoué joue les tests que Vitest relie aux fichiers changés depuis, tous quand un changement sort de son graphe ; 0 vert, 1 rouge, un délai dépassé compris ; 75 quand l'attente de la part de la machine ou de place sous /tmp atteint sa borne, ou quand la veille de la mémoire coupe la passe avant que le système ne tue) · `npm run verifier -- --tout` (la passe complète, chaque test joué pour de vrai : ce que joue la nuit) · `npm run verifier -- --gardes` (les gardes, la mise en forme et le lint, même verdict : ce que joue le relecteur) · `npm run typecheck` · `npm run lint` · `npm run format:check`.
- La préparation de la CI : le script npm `ci:preparer` du `package.json` racine (facultatif ; les
  flux du cadre le jouent, `npm run --if-present ci:preparer`, après `npm ci` et avant la
  vérification, dans chaque job qui vérifie ou teste : paquets système, chaîne de langage, variables
  exportées par `$GITHUB_ENV`). Il est rejoué à chaque job et par version de Node : il est
  idempotent, et porte lui-même les droits d'installation sur un exécuteur du projet. Le fichier de
  CI reste au cadre ; un travail propre au projet (une image Docker, un déploiement) vit dans un flux
  à lui, à côté de ceux du cadre. Un projet à copie sans marque du `ci.yml` pose `ci:preparer`,
  remplace sa copie par le fichier marqué du gabarit, puis joue `npx grillhouse maj`.
- Préfixe des tickets : `<prefixe>-`.
- Les sous-modules partagés : la clé `grillhouse.partage` du `package.json` (les chemins des
  sous-modules qu'aucun ticket n'écrit ; chaque copie les lit dans le dépôt principal, en lecture
  seule, au lieu d'en recevoir un exemplaire).
- La plage de nuit : la clé `grillhouse.plageDeNuit` du `package.json` (`{ "debut": 23, "fin": 8 }`
  par défaut : les heures, à l'heure locale, où l'attente d'une réponse compte au bilan comme nuit,
  à part de l'attente du superviseur et de celle du responsable).
- Les outils du projet : la clé `grillhouse.outils` du `package.json` (`{ "<VARIABLE>": "<chemin>" }`,
  un chemin absolu ou sous `~` : un outil hors du dépôt que les tests exigent ; la forme longue
  `{ "<VARIABLE>": { "chemin": "<chemin>", "contenu": true } }` le hache par son contenu : son
  empreinte SHA-256 (fichier, ou liste triée des entrées d'un dossier) entre dans le hachage des
  tâches par le `globalEnv` du `turbo.json` racine et se donne aux passes en `<VARIABLE>_EMPREINTE`,
  un outil changé rejouant toutes les tâches du projet, et la forme courte reste non hachée ; l'enveloppe d'un
  agent le monte en lecture seule et lui passe la variable, et le circuit, `npm run verifier` et la
  nuit jouent avec la même ; lue dans l'arbre principal ; un chemin qui recouvrirait l'enveloppe
  (`/`, la maison, un dossier caché de la maison hors `~/.local` et `~/.cache`, le trousseau
  `~/.local/share/keyrings`, un montage de l'enveloppe) et une clé fautive sont refusés par leur nom avant tout travail).
- Les fichiers engendrés commités : la clé `grillhouse.engendres` du `package.json`
  (`{ "<nom>": { "commande": "<ligne du shell>", "fichiers": ["<motif>"], "lit": ["<motif>"] } }`,
  chaque motif depuis la racine : un fichier qu'un lecteur ne peut pas construire, une page lue
  sur GitHub ou une somme de contrôle publiée ; l'intégration, la file et l'avance d'une copie
  sur main ne le fusionnent pas, elles prennent la version de main et rejouent sa commande sur le
  lot appliqué ; lue dans l'arbre principal ; une entrée que le lot retire de la clé n'est plus
  rejouée, et ses fichiers suivent le lot, leur suppression comprise ; une clé sans commande, sans
  fichiers ou avec un motif hors du dépôt est refusée par son nom avant tout travail).
- Les dossiers de matière de test : la clé `grillhouse.matieres` du `package.json` (une liste de
  dossiers du dépôt, chacun depuis la racine : des cas qu'aucun paquet ne possède, comme le
  `conformance/` que rejouent les tests d'un crate, le `filegroup(testonly)` de Bazel ou le
  `tests/ui` de rustc ; le testwriter y écrit tout fichier, dans chaque langage, et son enveloppe
  les monte en écriture, celle du développeur en lecture seule ; le relecteur et la preuve du
  rouge les comptent comme de la matière de test, jamais du code ; lue dans l'arbre principal ;
  un chemin vide, absolu, hors du dépôt, absent de l'arbre principal, ou qui est un paquet, en
  contient un ou y est contenu, et une clé fautive sont refusés par le nom
  `grillhouse.matieres` avant tout travail ; sans la clé, rien ne change).
- Le nombre de circuits à la fois : la clé `grillhouse.circuits` du `package.json` (un entier
  ≥ 1, **1** quand elle est absente : les circuits actifs du projet à la fois, que la file des
  tickets tient ; un circuit arrêté sur une question au superviseur, ou repris et en attente de sa
  place de la machine, garde sa place dans la limite, comme une carte bloquée dans la limite d'un
  tableau Kanban : la file ne démarre aucun ticket de plus tant qu'il n'a pas sa réponse ; un
  circuit reporté à une heure, en attente d'un autre projet ou de la nuit, ou arrêté sur une
  question au responsable, rend sa place ; le tableau nomme, pour un projet à sa limite, les
  circuits en attente du superviseur ; un circuit arrêté n'occupe aucune place de la machine ; lue dans l'arbre principal ; toute autre valeur est refusée par son nom avant tout
  travail). La machine borne aussi : un ticket ne part que s'il a une place de circuit de la
  machine, commune à ses projets et donnée dans l'ordre d'arrivée (`GRILLHOUSE_PLACES` de
  `~/.config/grillhouse/machine.env`, 3 par défaut ; un direct en tient une aussi, de son
  agent à sa relecture), et la place d'une copie de plus sur le disque
  des copies (la plus grande copie mesurée du projet, sinon 1 Go, 8 Go pour Rust, plus 4 Go) ;
  sinon il reste en file, non démarré, et le panneau dit « attend une place » ou « attend le
  disque » avec les copies en pause qui l'occupent. Une passe (la passe lourde d'un circuit,
  `npm run verifier`, la nuit) ne prend aucune place : elle prend sa part, que la clé suivante règle.
- La part d'une passe : la clé `grillhouse.part` du `package.json` (`{ "coeurs": <entier ≥ 1>,
  "memoireGo": <nombre > 0> }`, chacun facultatif : ses cœurs et sa mémoire, que la passe réserve du
  budget de la machine, son matériel moins la réserve de l'utilisateur —
  `GRILLHOUSE_RESERVE_COEURS` et `GRILLHOUSE_RESERVE_MEMOIRE_GO` de `~/.config/grillhouse/machine.env`,
  4 Go par défaut, et en cœurs min(4, max(0, cœurs − 4)) : 0 sur 4 cœurs ou moins, 2 sur 6, 4 à
  partir de 8 ; zéro admis, une réserve réglée qui égale les cœurs est refusée ; lue dans l'arbre principal ; toute autre valeur est
  refusée par son nom avant tout travail). Absente, la réservation vaut 3 cœurs pour un
  circuit ordinaire, 2 pour un direct, et en mémoire le plus
  grand pic des passes de jour du projet à son registre des consommations, plus un quart, jamais
  sous le tiers du budget, qu'elle vaut quand le registre n'a pas de mesure ; une clé qui ne déclare que les cœurs
  ou que la mémoire garde le défaut de l'autre ; une part plus grande que le budget vaut le budget, une seule passe jouant alors à la
  fois. Les réservations s'additionnent contre le budget : une séance d'agent et une passe réservent
  leurs cœurs le temps de leur phase, aucune à l'ouverture d'un circuit ni pendant qu'il est arrêté,
  et ce qui ne tient pas attend dans l'ordre d'arrivée, son rang gardé d'une phase à l'autre. La passe n'a que cette part : le système la tient dans un groupe de contrôle de Linux à elle
  (poids de processeur et plafond de mémoire tirés de la part, sans plafond dur de processeur), et
  elle attend, en disant ce qu'elle attend (cœurs, mémoire, charge), quand le budget manque ; la
  nuit joue sur la part du projet, comme une passe, sans réserver la machine ; une mesure de temps
  et un test qui exige de la charge jouent sur des cœurs dédiés (la clé `grillhouse.mesure`). Une séance d'agent est
  bornée comme une passe : elle tourne dans un groupe de contrôle à elle, avec un plafond dur de
  processeur égal aux cœurs de la part (les passes qu'elle lance jouent dans ce plafond, sans groupe
  à elles) ; sans gestionnaire de groupes, elle part sans borne et le journal du circuit le dit.
- Le sigle du projet : la clé `grillhouse.sigle` du `package.json` (une chaîne non vide sans
  espace, le nom court du projet aux affichages partagés entre projets, comme le panneau de
  plusieurs projets ; absente, le préfixe de tickets
  de `.beads/config.yaml` sert ; une autre valeur est une faute que le panneau dit en alerte, le
  préfixe restant le sigle).
- La CI de main : le flux `.github/workflows/ci.yml` que le cadre pose joue sur main, par paquets, au
  plus une fois par heure et seulement si main a bougé depuis son dernier passage, sur la machine du
  projet (la variable `RUNNER`). Un lot entre sur main sur sa passe finale, sans attendre la CI ; la
  CI voit ce que la passe finale ne joue pas (autres plates-formes, matrice de versions, flux hors
  `npm run verifier`). Son rouge alerte le superviseur avec les lots entrés depuis le dernier vert,
  ouvre un ticket de défaut sous `a-valider`, et n'arrête pas la file.
- La machine vierge : le flux `.github/workflows/machine-vierge.yml` que le cadre pose rejoue, sur un
  exécuteur `ubuntu-latest` de GitHub neuf (jamais la variable `RUNNER`), l'installation à neuf puis
  `npm run verifier` complet ; il part au plus une fois par jour sur main, et saute le jour où main est
  le commit de son dernier passage vert, et à chaque étiquette `v*`. Il ne part sur aucune poussée : son
  rouge ne bloque aucune file, il se voit dans GitHub. Un projet qui veut un autre système (macOS, ARM)
  reprend le flux à lui en ôtant la ligne de marque de sa première ligne.
