# Roomi's Grillhouse

Un cadre de travail pour mener un projet avec des agents de Claude Code : chaque travail est un
ticket, chaque ticket parcourt un circuit d'agents aux droits bornés, et seul un lot jugé entre sur
main. Ce dépôt construit le cadre et se mène avec sa version publiée.

**Responsable** : Romain. Il valide le métacadre, la charte commune, les ARCHITECTURE.md, les
CADRE.md et les INTERFACE.md ; le superviseur valide les autres documents. Ainsi le responsable
tranche l'essentiel.

Les règles du cadre : @mods/grillhouse/charte.md

## Ce qui décide

Le métacadre (`mods/grillhouse/METACADRE.md` : les intentions du cadre et l'écriture des
règles), puis l'architecture du cadre (`docs/ARCHITECTURE.md` et les documents de mécanisme
qu'elle nomme, sous `packages/grillhouse/docs/architecture/`), puis le cadre de chaque composant
(`docs/CADRE.md`, `docs/INTERFACE.md`, `docs/ARCHITECTURE.md`), puis le code. Ainsi
l'architecture décide, et le code suit.

## Comment on arbitre

Dans cet ordre :

1. **Que fait la référence mature ?** Les outils que le cadre reprend ou complète : Turborepo et Nx
   pour le graphe des tâches, Bazel pour les tailles et les moments des tests, Temporal pour les
   déroulés, bors et la file de fusion de GitHub pour l'entrée sur main, le TAP de Google pour la
   CI après l'entrée. Ce qu'ils font est la réponse par défaut ; un écart porte sa raison écrite.
2. **Qu'est-ce qui existe déjà ?** Un standard, un outil sur étagère, une bibliothèque éprouvée,
   une convention des projets voisins se reprend tel quel.
3. **Le domaine l'exige-t-il ?** Un outil simple, qui marche sur la machine de son responsable et
   cadre les dérives d'architecture des projets ; retirer plutôt qu'ajouter. Un choix qui le
   complique se mesure et se dit.

## Ce qui monte au superviseur

Une question qu'aucun geste du circuit ne tranche monte au superviseur, avec sa pièce. Il monte au
responsable le fonctionnel, qu'il ne tranche jamais seul : la charte commune, le métacadre, ce que
le cadre impose aux projets. Le cadre et l'architecture montent toujours (charte commune).

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
  (`packages/grillhouse/docs/architecture/tests.md`, §5.1 et §5.4).
- Préfixe des tickets : `grillhouse-`.
- Les réglages du projet (les clés `grillhouse.*` du `package.json`) et ceux du poste
  (`~/.config/grillhouse/`) : leur liste et ce que chacun règle sont au document de l'installation
  (`packages/grillhouse/docs/architecture/installation.md`, §4.2 et §4.3). Cette charte n'en décrit aucun.
