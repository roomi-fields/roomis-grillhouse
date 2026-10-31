# grillhouse-matiere — interface

La matière de test que partagent les paquets de Grillhouse, par la seule entrée
`@roomi-fields/grillhouse-matiere/test-fixtures` (`src/index.ts`). Le paquet n'a pas d'API publique
au sens du cadre : il n'exporte que ce sous-chemin, et seuls des tests le lisent.

- `racineSousLaMaison(prefixe, maison?)` : un dossier d'essai neuf sous `~/.cache`, hors de `/tmp`,
  que l'enveloppe remplace par un dossier vide.
- `canWrap`, `hasBd` : la machine sait construire une enceinte bwrap, la machine a bd ; un test qui
  en a besoin se joue sous eux (`it.runIf`).
- `claudeSubstitut(dossier, etat?)`, `sansClaude(dossier)`, `cheminSysteme(...dossiers)`, et les
  types `EtatClaude`, `AppelClaude` : le remplaçant de la commande `claude`, qui note chaque appel.
- `configGit(...)`, le type `ReglageGit` : les réglages de git passés par l'environnement, composés
  avec ceux de la suite.
- `couvre(regle, appel)` : une règle de permission couvre un appel, comme Claude Code la lit.
- `ARCHITECTURE`, `architecture(paquets?)`, `declarerLesLangages(repo, paquets?)`,
  `declarerLeLangage(repo)` : le `docs/ARCHITECTURE.md` d'un projet d'essai, dont la colonne
  « Langage » déclare ses langages (TypeScript par défaut), et un projet de TypeScript qui le porte.
- `enveloppeEssai(ESSAIS)` : les dossiers d'essai d'un fichier de tests de l'enveloppe.
- `testsDeNuitEssai(ESSAIS, { depot, mettreAJour })`, le type `MiseAJour`, et `essai`, `PRESSION`,
  `JOUR`, `NUITS`, `lierDependances(repo, depot)`, `noms`, `rangs` : les projets d'essai des tests
  de nuit, que la mise à jour du cadre installe depuis `depot`.

**Langage** : typescript

## Les fautes

Aucune : la matière ne rend aucune faute.

## Consommateurs

Les lecteurs la déclarent en `devDependencies` et l'importent par son nom.

- `grillhouse` : architecture, canWrap, cheminSysteme, claudeSubstitut, configGit, couvre, declarerLeLangage, declarerLesLangages, hasBd, lierDependances, racineSousLaMaison
- `grillhouse-essais` : ARCHITECTURE, AppelClaude, EtatClaude, JOUR, NUITS, PRESSION, architecture, canWrap, cheminSysteme, claudeSubstitut, configGit, couvre, declarerLeLangage, declarerLesLangages, enveloppeEssai, essai, hasBd, lierDependances, noms, racineSousLaMaison, rangs, sansClaude, testsDeNuitEssai
