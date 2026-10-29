# Index des interfaces

Généré par `npx grillhouse index-interfaces` depuis les `INTERFACE.md` ; ne pas éditer.
Une ligne par composant, puis une par élément qu'il fournit ; l'interface donne le détail.

## grillhouse-essais — interface

Le paquet n'exporte rien : il ne déclare ni `exports`, ni `main`, ni `types`, et aucun paquet ne l'importe. (`packages/grillhouse-essais/docs/INTERFACE.md`)

- **Consommateurs** — aucun

## grillhouse-matiere — interface

La matière de test que partagent les paquets de Grillhouse, par la seule entrée `@roomi-fields/grillhouse-matiere/test-fixtures` (`src/index.ts`). (`packages/grillhouse-matiere/docs/INTERFACE.md`)

- **Consommateurs** — grillhouse (AppelClaude, EtatClaude, canWrap, cheminSysteme, claudeSubstitut, configGit, couvre, hasBd, racineSousLaMaison, sansClaude) ; grillhouse-essais (canWrap, couvre, racineSousLaMaison)

## grillhouse — Le noyau de Grillhouse — interface

Le noyau demande à un module de langage ce que ce document écrit, et rien d'autre. (`packages/grillhouse/docs/INTERFACE.md`)

- **Consommateurs** — grillhouse-essais (*)
