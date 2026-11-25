# grillhouse-matiere — architecture

Le paquet de la matière de test partagée de Grillhouse : six modules TypeScript que réunit
une entrée, lue par les tests du cadre et par ceux de ses essais.

## Contexte

```
packages/grillhouse (tests) ──┐
                              ├──> @roomi-fields/grillhouse-matiere/test-fixtures
packages/grillhouse-essais ───┘
```

## Stratégie

- **Un paquet à part, qui n'importe aucun paquet** : le cadre et ses essais en dépendent tous deux,
  et les essais dépendent du cadre ; la matière sous l'un d'eux ferait un cycle, que Turborepo
  refuse. C'est la convention du corpus de BPScript (`990-corpus`, son entrée `./test-fixtures`).
- **Des sources TypeScript sans construction** : l'entrée pointe sur `src/index.ts`, que Vitest
  transforme ; seuls des tests la lisent.

## Composants

- `src/machine.ts` : ce qu'offre la machine d'une passe (`racineSousLaMaison`, `canWrap`, `hasBd`).
- `src/claude-substitut.ts` : le remplaçant de `claude`, qu'aucun test ne lance pour de vrai : il note chaque appel (ses arguments, son dossier) et répond aux commandes des greffons (`plugin list --json`, `plugin marketplace list` et `add`, `plugin install`, `plugin update`) depuis un fichier d'état, comme le fait Claude Code ; une installation à la portée du projet réécrit le `.claude/settings.json` du dossier, ses clés dans l'ordre du schéma de Claude Code. Un test peut faire échouer une lecture ou une mise à jour.
- `src/config-git.ts` : les réglages de git par l'environnement (`GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_<n>`, `GIT_CONFIG_VALUE_<n>`, comme le décrit git-config(1)) : la suite règle git une fois pour tous ses processus, et un test qui ajoute ou retire un réglage garde les autres.
- `src/regle-de-permission.ts` : si une règle de permission couvre un appel, une commande ou le nom d'un outil, comme Claude Code la lit : `*` vaut tout texte, et un ` *` final vaut aussi l'absence de texte (`couvre`) ; les tests des droits d'un rôle et ceux du tri des découvertes la partagent.
- `src/langage.ts` : les langages d'un projet d'essai, la colonne « Langage » de son
  `docs/ARCHITECTURE.md` (`ARCHITECTURE`, `architecture`, `declarerLesLangages`,
  `declarerLeLangage`), et les dépôts d'essai des tests de l'enveloppe (`enveloppeEssai`), un dossier neuf par appel sous le dossier d'essai du fichier de tests.
- `src/tests-de-nuit.ts` : les projets d'essai des tests de nuit (`testsDeNuitEssai`) ; le dépôt
  du cadre et sa mise à jour lui sont passés, pour qu'elle n'importe aucun paquet.
- `src/index.ts` : l'entrée, qui réexporte les six.

Le cadre du paquet : `CADRE.md` ; ce qui traverse : `INTERFACE.md`.
