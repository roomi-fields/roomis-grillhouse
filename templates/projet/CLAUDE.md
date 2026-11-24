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

- `npm test` : construit, puis joue les tests ; une tâche dont rien n'a bougé est relue de son
  cache. `npm test -- <chemins>` : un lancement ciblé, chaque chemin écrit depuis la racine.
  `npm run test:forcer` : rejoue pour de vrai.
- `npm run verifier` : les gardes du cadre et du projet, le typage de chaque paquet, la mise en
  forme, le lint et les tests ; 0 vert, 1 rouge, 75 à repasser. `npm run verifier -- --tout` : la
  passe complète, chaque test joué pour de vrai. `npm run verifier -- --gardes` : les gardes, la
  mise en forme et le lint.
- `npm run typecheck` · `npm run lint` · `npm run format:check`.
- Ce que joue chaque commande, et comment elle choisit les tests : le document des tests
  (`node_modules/@roomi-fields/grillhouse/docs/architecture/tests.md`, §5.1 et §5.4).
- Préfixe des tickets : `<prefixe>-`.
- Les réglages du projet (les clés `grillhouse.*` du `package.json`) et ceux du poste
  (`~/.config/grillhouse/`) : leur liste et ce que chacun règle sont au document de l'installation
  (`node_modules/@roomi-fields/grillhouse/docs/architecture/installation.md`, §4.2 et §4.3). Cette charte n'en décrit aucun.
