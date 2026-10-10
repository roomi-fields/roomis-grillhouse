# <Nom du projet>

<Ce qu'est le projet et ce qu'il fait, en deux ou trois phrases.>

**Responsable** : <nom>. Il valide <la spécification, les ARCHITECTURE.md, les CADRE.md, les
INTERFACE.md> ; le superviseur valide les autres documents. Ainsi le responsable tranche
l'essentiel.

Les règles du cadre : @.claude/grillhouse/charte.md

## Ce qui décide

Le métacadre (`METACADRE.md` : les intentions du cadre et l'écriture des règles), puis
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

## Commandes

- `npm test` · `npm run typecheck` · `npm run lint` · `npm run format:check`.
- Préfixe des tickets : `<prefixe>-`.
- <La politique de poussée : à chaque commit, ou jamais sans le responsable.>
