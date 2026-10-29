# grillhouse-essais — cadre

## Rôle

- R1. Le paquet porte les grands tests de Grillhouse qui prouvent l'enchaînement du cadre, joués la
  nuit.

## Reçoit

- R2. Le paquet du cadre du même arbre (`packages/grillhouse`) ; la matière partagée, par son nom.

## Rend

- R3. Le verdict de la nuit sur l'enchaînement ; une régression qu'eux seuls attrapent ouvre son
  ticket à la nuit.

## Connaît

- R4. Les scripts du cadre par leur chemin dans son paquet, et son entrée `./vitest-config`.

## Ne connaît pas

- R5. L'intérieur d'un script : un test le lance en processus, et n'en importe aucun dans son
  processus.

## Refuse

- R6. Un test de jour qui monte un dépôt d'essai : un tel test se nomme `*.nuit.spec.ts`.

## Invariants

- R7. Privé : il ne se publie pas.
- R8. Un test déplacé du cadre garde ses `it` et ses `expect` (`tests/paquet.spec.ts`).

## Coût

- R9. La nuit seule paie ses dépôts d'essai ; la journée joue `tests/paquet.spec.ts`.
