# <Nom du projet>

<Ce qu'est le projet et ce qu'il fait, en deux ou trois phrases.>

**Responsable** : <nom>. Il valide <la spécification, les ARCHITECTURE.md, les CADRE.md, les
INTERFACE.md> ; le superviseur valide les autres documents. Ainsi le responsable tranche
l'essentiel.

## Ce qui décide

Le métacadre (`METACADRE.md` : les intentions du cadre et l'écriture des règles), puis
<la spécification ou la cible>, puis le cadre de chaque composant (`docs/CADRE.md`,
`docs/INTERFACE.md`, `docs/ARCHITECTURE.md`), puis le code. Ainsi l'architecture décide, et le
code suit.

Une décision vit dans le document qu'elle règle. Ainsi on la trouve là où on la cherche.

Une règle s'écrit selon le métacadre (`METACADRE.md`, §2).

## Comment on arbitre

Une décision ou une question se tranche par ces questions, dans cet ordre : la première qui
s'applique l'emporte, et le choix la nomme ; deux réponses de même rang vont au responsable. Le
projet ajoute ses propres forces à la liste, à leur rang (« le temps d'abord », « une personne
maintient le projet »…). Ainsi chaque choix construit un produit mature et professionnel.

1. **Que fait la référence mature ?** <Les références du domaine : un compilateur mature, une
   station audionumérique professionnelle…> Ce qu'elles font est la réponse par défaut ; un écart
   porte sa raison écrite.
2. **Qu'est-ce qui existe déjà ?** Un standard, un outil sur étagère, une bibliothèque éprouvée,
   une convention des projets voisins se reprend tel quel.
3. **Le domaine l'exige-t-il ?** <Les exigences du domaine : la rapidité pour le live coding…> Un
   choix qui les dégrade se mesure et se dit.

## Le flux d'une tâche

1. `bd ready`, `bd update <id> --claim`, lis le ticket et le cadre de chaque composant touché.
2. Un défaut remonté est d'abord une question d'architecture : le ticket s'ouvre sur sa section
   « Architecture » (le modèle mûr nommé, l'adresse dans l'architecture, le mécanisme commun), et
   le correctif va dans ce mécanisme. Ainsi tout correctif passe par l'architecture.
3. Une décision reste à prendre : `/grill-me` avant d'écrire, ses questions dans le ticket. Ainsi
   la décision est prise et écrite avant le code.
4. Le plan va dans le ticket (`bd update <id> -d`). Un travail qui change un comportement part en
   deux tickets : les tests d'abord (agent `testeur`), puis le code qui les rend verts (agent
   `developpeur`). Ainsi le code se mesure à des tests qu'il n'a pas écrits.
5. Le ticket se ferme sur ses tests ciblés, le verdict de l'agent `relecteur` sur le lot, et le
   commit de l'agent `integrateur`, seul à commiter. Ainsi ce qui est déclaré fini l'est vraiment.
6. `/handoff` dans le ticket, puis `bd close`, avec ce qui n'est pas fait et pourquoi.

Une séance de supervision charge le superviseur (`pitmaster`). Les rôles sont des agents du projet
(`.claude/agents/`) : `testeur`, `developpeur`, `relecteur`, `integrateur`, chacun sous ses verrous,
`arbitre`, qui tranche une question de conception, et `explorateur`, qui mène une exploration.
Ainsi chaque agent travaille dans son cadre.

Un objectif dont le découpage n'est pas connu commence par une exploration, sans code ; un ticket
de réalisation touche un composant et fait une seule livraison ; une découverte devient un ticket
lié (`discovered-from`), à valider. Ainsi l'avancement se lit ticket par ticket.

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
  scratchpad (`os.remove`) sur un chemin nommé et lu. Ainsi la séance avance seule, sans geler
  jusqu'au passage du responsable.
- **L'index d'abord** : toute recherche commence par `rtfm_search` (mode `hybrid`) pour le quoi, et
  par `codegraph explore` (ou l'outil `codegraph_explore`) pour l'appel. Ainsi une affirmation sur
  le code repose sur ce que le code contient.
- Tickets : Beads (`bd`), préfixe `<prefixe>-`, voir `docs/agents/issue-tracker.md`.
- Compétences du dépôt : le superviseur (`pitmaster`), les six rôles (`testeur`,
  `developpeur`, `relecteur`, `integrateur`, `arbitre`, `explorateur`), l'initialisation et
  l'architecture (`grill`), la mesure (`mesure`), le rédacteur pour un lecteur humain
  (`redacteur`), la publication (`release`). Flux : greffon `mattpocock-skills`, préfixe obligatoire ; un document pour un agent
  s'écrit avec `mattpocock-skills:writing-for-agents`.
- Réponses en français ; le code et les noms d'API restent en anglais.

## Commandes

- `npm test` · `npm run typecheck` · `npm run lint` · `npm run format:check`.
- Un intégrateur neuf par livraison fait chaque commit, par le script
  `scripts/integration/integrer.mjs` (`pitmaster`) : commits conventionnels, message par fichier
  (`git commit -F`), trailer `Co-Authored-By: Claude`.
  <La politique de poussée : à chaque commit, ou jamais sans le responsable.>
