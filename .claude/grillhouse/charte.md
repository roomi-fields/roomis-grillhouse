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
3. Une décision reste à prendre : `/grill-me` avant d'écrire, ses questions dans le ticket. Ainsi
   la décision est prise et écrite avant le code.
4. Le plan va dans le ticket (`bd update <id> -d`). Un travail qui change un comportement est un
   seul ticket, qui passe d'un agent au suivant dans sa copie : les tests d'abord (agent
   `testeur`), puis le code qui les rend verts (agent `developpeur`). Ainsi le code se mesure à des
   tests qu'il n'a pas écrits.
5. Le ticket se ferme sur ses tests ciblés, le verdict de l'agent `relecteur` sur le lot, et le
   commit de l'agent `integrateur`, seul à commiter, qui le ferme. Ainsi ce qui est déclaré fini
   l'est vraiment.
6. Chaque agent laisse sa passation dans le ticket (`/handoff`), avec ce qui n'est pas fait et
   pourquoi.

Une séance de supervision charge le superviseur (`pitmaster`). Les rôles sont des agents du projet
(`.claude/agents/`), chacun désigné par le numéro de son rôle, dans l'ordre du flux :
1 `explorateur`, qui mène une exploration, 2 `arbitre`, qui tranche une question de conception,
3 `testeur`, 4 `developpeur`, 5 `relecteur`, 6 `integrateur`, chacun sous ses verrous. Ainsi chaque
agent travaille dans son cadre, et son numéro dit son rôle.

Un objectif dont le découpage n'est pas connu commence par une exploration, sans code ; un ticket
de réalisation touche un composant et fait une seule livraison ; tout ticket se crée sous sa mère, et une découverte sous le ticket
qui l'a trouvée, à valider (`docs/agents/issue-tracker.md`). Ainsi l'avancement se lit ticket par ticket.

## Ce qui tient le dépôt droit

- **Une matière, une adresse** : ce qu'un document décrit déjà s'y verse. Ainsi l'architecture
  écrite reste une, et le code suit une seule version.
- **Un changement de comportement corrige ses textes** : un commit qui change un comportement
  corrige dans le même commit tout texte qui le décrit. Ainsi les documents restent vrais.
- **Une décision de structure passe par le grill** (compétence `grill`) : découpage, paquets,
  modules, interfaces, frontières se tranchent sur les objectifs, les consommateurs, les
  représentations de données et les axes de changement, quelle que soit la taille du code. Ainsi
  l'architecture décide de la structure, et le code la suit.
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
- **L'index d'abord** : toute recherche commence par `rtfm_search` (mode `hybrid`) pour le quoi, et
  par `codegraph explore` (ou l'outil `codegraph_explore`) pour l'appel ; le shell lit un fichier
  déjà nommé. Une recherche vide se reformule dans les mots du code. Ainsi une affirmation sur le
  code repose sur ce que le code contient.
- Tickets : Beads (`bd`), sous le préfixe du projet, voir `docs/agents/issue-tracker.md`.
- Compétences du dépôt : le superviseur (`pitmaster`), les six rôles (`testeur`,
  `developpeur`, `relecteur`, `integrateur`, `arbitre`, `explorateur`), l'initialisation et
  l'architecture (`grill`), la mesure (`mesure`), le rédacteur pour un lecteur humain
  (`redacteur`), la publication (`release`). Flux : greffon `mattpocock-skills`, préfixe obligatoire ; un document pour un agent
  s'écrit avec `mattpocock-skills:writing-for-agents`.
- Réponses en français ; le code et les noms d'API restent en anglais.

## Le commit

Un intégrateur neuf par livraison fait chaque commit, par le script
`scripts/integration/integrer.mjs` (`pitmaster`) : commits conventionnels, message par fichier
(`git commit -F`), trailer `Co-Authored-By: Claude`.
