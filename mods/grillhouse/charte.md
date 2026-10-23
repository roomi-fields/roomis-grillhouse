# La charte commune de Roomi's Grillhouse

Les règles que tout agent applique, identiques dans chaque projet qui installe le cadre. La charte
du projet (`CLAUDE.md`) l'importe depuis le paquet installé et porte ce qui lui est propre : son
nom, son responsable, ce qui décide chez lui, ses critères d'arbitrage, ses commandes. Le détail
d'un rôle vit dans sa compétence, celui d'un outil dans l'architecture du paquet
(`node_modules/@roomi-fields/grillhouse/docs/ARCHITECTURE.md`). Ce fichier ne se modifie pas
dans un projet : un écart se propose à Grillhouse. Ainsi les projets suivent un seul cadre, et
chaque séance ne charge que ce qu'elle applique.

## Ce qui décide

Une décision vit dans le document qu'elle règle. Ainsi on la trouve là où on la cherche.

Une règle s'écrit selon le métacadre (`METACADRE.md`, à côté de cette charte, §2).

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
   seul ticket : les tests d'abord (agent `testwriter`), puis le code qui les rend verts (agent
   `developpeur`). Ainsi le code se mesure à des tests qu'il n'a pas écrits. Un critère répond à
   un besoin réel de l'usage actuel. Ainsi le ticket garde la taille du besoin.
5. Le ticket se ferme sur ses tests ciblés, le verdict du `relecteur` sur le lot et le commit du
   circuit, seul à commiter, entré sur main par la file. Ainsi ce qui est déclaré fini l'est
   vraiment.
6. Chaque agent laisse sa passation en commentaire au ticket (`bd comments add`), avec ce qui
   n'est pas fait et pourquoi ; une séance que le circuit mène finit sur sa fiche, la sortie
   structurée de son rôle, sur laquelle le circuit décide. Ainsi la passation sert l'humain, et
   la fiche le circuit.

Un ticket parcourt les étapes de son circuit (`etapes.mjs`, la seule liste), chacune tenue par un
rôle, agent du cadre, sous ses droits. Ainsi chaque agent travaille dans son cadre, et le numéro
d'une étape dit où en est chaque ticket.

**Tous les agents jugent sur le plan** : une décision du responsable entre dans la description du
ticket, comme une RFC amendée ; les commentaires restent l'historique. Ainsi chaque agent lit la
même décision.

**Un ticket de réalisation nomme ses composants** dans son titre (« numéro — sujet — composant,
composant ») et sa section « Architecture », le fournisseur d'abord ; il fait une seule livraison,
en un seul commit, et se crée sous sa mère (`docs/agents/issue-tracker.md`). Un objectif dont le
découpage n'est pas connu commence par une exploration, sans code. Ainsi l'avancement se lit
ticket par ticket.

**Un ticket ouvert naît du mot du responsable**, ou d'un défaut qu'un projet du cadre rencontre.
Une découverte d'agent se consigne dans un ticket fermé, sous le ticket qui l'a trouvée, étiqueté
`decouverte`. Ainsi chaque découverte est gardée, et le backlog reste le plan du responsable.

## Ce qui tient le dépôt droit

- **Une matière, une adresse** : ce qu'un document décrit déjà s'y verse. Ainsi l'architecture
  écrite reste une, et le code suit une seule version.
- **Un changement de comportement corrige ses textes** dans le même commit. Ainsi les documents
  restent vrais.
- **Une décision de structure passe par le grill** (compétence `grill`) : découpage, paquets,
  modules, interfaces, frontières. Ainsi l'architecture décide de la structure, et le code la suit.
- **Un geste transverse, un seul ticket** : un même changement sur plusieurs composants se décide
  une fois, en gabarit dans la section « Architecture », et se mène dans une seule copie. Ainsi le
  geste reste le même partout.
- **Les composants suivent un modèle commun** : chacun étend les configurations de base du cadre ;
  un écart passe seulement inscrit, avec sa raison, dans la liste que le superviseur valide.
  Ainsi le cadre ne maintient aucune spécificité par composant.
- **Une dette connue s'inscrit et se gèle** (`grillhouse-dette.json`) : une garde refuse tout
  constat neuf, et le compte ne remonte jamais. Ainsi la dette ne fait que baisser.
- **Un remplacement supprime le remplacé** dans le même commit, avec ses consommateurs et ses
  gardes. Ainsi le produit garde une seule façon de faire chaque chose.
- **Un commentaire dit ce que la chose est**, au présent. Ainsi il reste vrai tant que le code ne
  change pas.

## Outils

- ⛔ **Des commandes sans invite** : tout fichier temporaire dans le scratchpad de session ;
  `env -C <dossier>` ou `git -C` à la place de `cd` ; une suppression passe par un script node du
  scratchpad (`rmSync` de `node:fs`) sur un chemin nommé et lu ; un signal vise seulement un
  processus que la séance a lancé. Une commande dont on doute s'écrit dans le compte rendu, sans
  se lancer. Ainsi la séance avance seule.
- **Les tests se lancent par `npm test`** : `npm test -- <chemins>` pour un lancement ciblé,
  chaque chemin écrit depuis la racine du dépôt ; `npm run test:forcer -- <chemins>` pour rejouer
  pour de vrai un test soupçonné instable. `npm run verifier` joue les gardes et les tests ;
  `npm run verifier -- --gardes`, les gardes seules. Aucun agent ne lance l'outil de test
  directement. Ainsi chaque test tourne avec ce dont il dépend, et une seule fois tant que rien ne
  change.
- **Main reste vert** : l'intégration exige un `npm run verifier` vert. Un test connu rouge se met
  en quarantaine dans le test lui-même (`it.skip` ou `it.fails`), avec le ticket qui le corrige.
  Ainsi chaque rouge a son ticket.
- **L'index d'abord** : toute recherche commence par `rtfm_search` (mode `hybrid`) pour le quoi, et
  par `codegraph explore` (ou l'outil `codegraph_explore`) pour l'appel ; le shell lit un fichier
  déjà nommé. Ainsi une affirmation sur le code repose sur ce que le code contient.
- **Tout se lit, le plan s'écrit** : dans son enveloppe, un agent lit tout le dépôt, index compris,
  et n'écrit que les paquets que le plan de son ticket nomme. Une écriture hors du plan l'arrête,
  et le superviseur étend le plan ou refuse. Ainsi l'agent lit ce dont il a besoin, et les gardes
  tiennent l'architecture.
- Tickets : Beads (`bd`), sous le préfixe du projet, voir `docs/agents/issue-tracker.md`.
- Le greffon `mattpocock-skills` s'appelle avec son préfixe ; un document pour un agent s'écrit
  avec `mattpocock-skills:writing-for-agents`.
- Réponses en français ; le code et les noms d'API restent en anglais.
