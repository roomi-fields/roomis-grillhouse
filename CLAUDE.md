# <Nom du projet>

<Ce qu'est le projet et ce qu'il fait, en deux ou trois phrases.>

**Responsable** : <nom>. Il valide <la spécification, les ARCHITECTURE.md, les CADRE.md, les
INTERFACE.md> ; le superviseur valide les autres documents.

## Ce qui décide

<La spécification ou la cible>, puis le cadre de chaque composant (`docs/CADRE.md`,
`docs/INTERFACE.md`, `docs/ARCHITECTURE.md`), puis le code. Une décision vit dans le document
qu'elle règle. Une règle s'écrit affirmative, au présent, sans date ni auteur.

## Le flux d'une tâche

1. `bd ready`, `bd update <id> --claim`, lis le ticket et le cadre de chaque composant touché.
2. Une décision reste à prendre : `/grill-me` avant d'écrire, ses questions dans le ticket.
3. Le plan va dans le ticket (`bd update <id> -d`), la réalisation se fait en `/tdd`. Un commit qui
   change un comportement corrige dans le même commit tout texte qui le décrit.
4. Le ticket se ferme sur ses tests ciblés, la relecture (`mattpocock-skills:code-review`, qui pose
   la question : cette notion existe-t-elle déjà ailleurs ?) et un commit.
5. `/handoff` dans le ticket, puis `bd close`, avec ce qui n'est pas fait et pourquoi.

Une séance de supervision charge la compétence `superviseur` ; un agent de développement charge
`developper`.

## Ce qui tient le dépôt droit

- **Une matière, une adresse.** Ce qu'un document décrit déjà s'y verse.
- **Un remplacement supprime le remplacé** dans le même commit, avec ses consommateurs et ses gardes.
- **Un commentaire dit ce que la chose est**, au présent.
- **Une règle de cette charte entre à la place d'une autre.** La charte tient sur une page.

## Outils

- ⛔ **Aucune commande qui puisse demander une validation** : une invite gèle la séance. Tout
  fichier temporaire dans le scratchpad de session ; aucun `cd` (`env -C <dossier>` ou `git -C`) ;
  une suppression passe par un script du scratchpad (`os.remove`) sur un chemin nommé et lu.
- **L'index d'abord** : toute recherche commence par `rtfm_search` (mode `hybrid`) pour le quoi, et
  par `codegraph explore` pour l'appel quand le dépôt a un `.codegraph/`.
- Tickets : Beads (`bd`), préfixe `<prefixe>-`, voir `docs/agents/issue-tracker.md`.
- Compétences du dépôt : `superviseur`, `developper`, `mesurer`, `rediger` (lecteur humain),
  `release`. Flux : greffon `mattpocock-skills`, préfixe obligatoire ; un document pour un agent
  s'écrit avec `mattpocock-skills:writing-for-agents`.
- Réponses en français ; le code et les noms d'API restent en anglais.

## Commandes

- `npm test` · `npm run typecheck` · `npm run lint` · `npm run format:check`.
- Commits conventionnels, message par fichier (`git commit -F`), trailer `Co-Authored-By: Claude`.
  <La politique de poussée : à chaque commit, ou jamais sans le responsable.>
