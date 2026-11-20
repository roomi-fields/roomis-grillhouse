# <Nom du projet>

<Ce qu'est le projet et ce qu'il fait, en deux ou trois phrases.>

**Responsable** : <nom>. Il valide <la spécification, les ARCHITECTURE.md, les CADRE.md, les
INTERFACE.md> ; le superviseur valide les autres documents. Ainsi le responsable tranche
l'essentiel.

Les règles du cadre : @mods/grillhouse/charte.md

## Ce qui décide

Le métacadre (`mods/grillhouse/METACADRE.md` : les intentions du cadre et
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
- Préfixe des tickets : `<prefixe>-`.
- La politique de poussée : la clé `grillhouse.poussee` du `package.json` (`commit` : la branche où
  part chaque commit, main par défaut ; `nuit` : la branche où la nuit pousse son commit vert ;
  seule la nuit la pousse, le crochet pre-push refuse toute autre poussée vers elle).
- Les sous-modules partagés : la clé `grillhouse.partage` du `package.json` (les chemins des
  sous-modules qu'aucun ticket n'écrit ; chaque copie les lit dans le dépôt principal, en lecture
  seule, au lieu d'en recevoir un exemplaire).
- Le rappel des questions : la clé `grillhouse.rappel` du `package.json` (un nombre > 0, **5** quand
  elle est absente : les minutes au bout desquelles une question de circuit sans réponse revient dans
  la file des messages de la séance du superviseur ; une autre valeur est refusée par son nom).
- La plage de nuit : la clé `grillhouse.plageDeNuit` du `package.json` (`{ "debut": 23, "fin": 8 }`
  par défaut : les heures, à l'heure locale, où l'attente d'une réponse compte au bilan comme nuit,
  à part de l'attente du superviseur et de celle du responsable).
- Les outils du projet : la clé `grillhouse.outils` du `package.json` (`{ "<VARIABLE>": "<chemin>" }`,
  un chemin absolu ou sous `~` : un outil hors du dépôt que les tests exigent ; l'enveloppe d'un
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
  `~/.config/grillhouse/machine.env`, 3 par défaut), et la place d'une copie de plus sur le disque
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
  refusée par son nom avant tout travail). Absente, la part vaut 4 cœurs au moins, sa mémoire en
  proportion ; une part plus grande que le budget vaut le budget, une seule passe jouant alors à la
  fois. La passe n'a que cette part : le système la tient dans un groupe de contrôle de Linux à elle
  (poids de processeur et plafond de mémoire tirés de la part, sans plafond dur de processeur), et
  elle attend, en disant ce qu'elle attend (cœurs, mémoire, charge), quand le budget manque ; la
  nuit demande le budget entier et joue seule ; une mesure de temps joue sur des cœurs dédiés que
  personne d'autre ne touche (la clé `grillhouse.mesure`, `{ "coeurs": <entier ≥ 1> }`, comme
  `grillhouse.part` ; par défaut la part par défaut du budget), le reste de la machine continuant
  de travailler.
- Le sigle du projet : la clé `grillhouse.sigle` du `package.json` (une chaîne non vide sans
  espace, le nom court du projet aux affichages partagés entre projets : la ligne des places, qui
  nomme qui tient chaque place, et le panneau de plusieurs projets ; absente, le préfixe de tickets
  de `.beads/config.yaml` sert ; une autre valeur est une faute que le panneau dit en alerte, le
  préfixe restant le sigle ; Grillhouse déclare « GH »).
