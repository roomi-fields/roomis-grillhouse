# <Nom du projet>

<Ce qu'est le projet et ce qu'il fait, en deux ou trois phrases.>

**Responsable** : <nom>. Il valide <la spécification, les ARCHITECTURE.md, les CADRE.md, les
INTERFACE.md> ; le superviseur valide les autres documents.

## Ce qui décide

<La spécification ou la cible>, puis le cadre de chaque composant (`docs/CADRE.md`,
`docs/INTERFACE.md`, `docs/ARCHITECTURE.md`), puis le code. Une décision vit dans le document
qu'elle règle. Une règle s'écrit affirmative, au présent, sans date ni auteur.

## Comment on arbitre

Une décision ou une question se tranche par ces questions, dans cet ordre : la première qui
s'applique l'emporte, et le choix la nomme ; deux réponses de même rang se tranchent par le
responsable. Le projet ajoute ses propres forces à la liste, à leur rang (« le temps d'abord »,
« une personne maintient le projet »…).

1. **Que fait la référence mature ?** <Les références du domaine : un compilateur mature, une
   station audionumérique professionnelle…> Ce qu'elles font est la réponse par défaut ; s'en
   écarter demande une raison écrite.
2. **Qu'est-ce qui existe déjà ?** Un standard, un outil sur étagère, une bibliothèque éprouvée,
   une convention des projets voisins se reprend ; on ne réinvente pas ce qui existe.
3. **Le domaine l'exige-t-il ?** <Les exigences du domaine : la rapidité pour le live coding…> Un
   choix qui les dégrade se mesure et se dit.

Le but est un produit mature et professionnel, qui tient les exigences de son domaine.

## Le flux d'une tâche

1. `bd ready`, `bd update <id> --claim`, lis le ticket et le cadre de chaque composant touché.
2. Un défaut remonté est d'abord une question d'architecture : le ticket s'ouvre sur sa section
   « Architecture » (le modèle mûr nommé, l'adresse dans l'architecture, le mécanisme commun),
   jamais sur une compensation locale. Une décision reste à prendre : `/grill-me` avant d'écrire,
   ses questions dans le ticket.
3. Le plan va dans le ticket (`bd update <id> -d`), la réalisation se fait en `/tdd`. Un commit qui
   change un comportement corrige dans le même commit tout texte qui le décrit.
4. Le ticket se ferme sur ses tests ciblés, la relecture (`mattpocock-skills:code-review`, qui pose
   la question : cette notion existe-t-elle déjà ailleurs ?) et un commit.
5. `/handoff` dans le ticket, puis `bd close`, avec ce qui n'est pas fait et pourquoi.

Une séance de supervision charge le superviseur (`pitmaster`) ; un agent de développement
charge le développeur (`grillardin`).

## Ce qui tient le dépôt droit

- **Une matière, une adresse.** Ce qu'un document décrit déjà s'y verse.
- **Une décision de structure passe par le grill** (compétence `grill`) : découpage,
  paquets, modules, interfaces, frontières. Elle se tranche sur les objectifs, les consommateurs,
  les représentations de données et les axes de changement, jamais sur la taille du code.
- **Un remplacement supprime le remplacé** dans le même commit, avec ses consommateurs et ses gardes.
- **Un commentaire dit ce que la chose est**, au présent.

## Outils

- ⛔ **Aucune commande qui puisse demander une validation** : une invite gèle la séance. Tout
  fichier temporaire dans le scratchpad de session ; aucun `cd` (`env -C <dossier>` ou `git -C`) ;
  une suppression passe par un script du scratchpad (`os.remove`) sur un chemin nommé et lu.
- **L'index d'abord** : toute recherche commence par `rtfm_search` (mode `hybrid`) pour le quoi, et
  par `codegraph explore` (ou l'outil `codegraph_explore`) pour l'appel.
- Tickets : Beads (`bd`), préfixe `<prefixe>-`, voir `docs/agents/issue-tracker.md`.
- Compétences du dépôt : le superviseur (`pitmaster`), le développeur (`grillardin`),
  l'initialisation et l'architecture (`grill`), la mesure (`thermometre`), le rédacteur pour un
  lecteur humain (`menu`), la publication (`release`). Flux : greffon `mattpocock-skills`, préfixe obligatoire ; un document pour un agent
  s'écrit avec `mattpocock-skills:writing-for-agents`.
- Réponses en français ; le code et les noms d'API restent en anglais.

## Commandes

- `npm test` · `npm run typecheck` · `npm run lint` · `npm run format:check`.
- Commits conventionnels, message par fichier (`git commit -F`), trailer `Co-Authored-By: Claude`.
  <La politique de poussée : à chaque commit, ou jamais sans le responsable.>
