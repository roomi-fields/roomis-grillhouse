# grillhouse-matiere — architecture

Le paquet de la matière de test partagée de Grillhouse : quatre modules TypeScript que réunit
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
- `src/claude-substitut.ts` : le remplaçant de `claude`.
- `src/config-git.ts` : les réglages de git par l'environnement.
- `src/regle-de-permission.ts` : la lecture d'une règle de permission (`couvre`).
- `src/index.ts` : l'entrée, qui réexporte les quatre.

Le cadre du paquet : `CADRE.md` ; ce qui traverse : `INTERFACE.md`.
