# grillhouse-matiere — cadre

## Rôle

- R1. Le paquet porte la matière de test que partagent les paquets de Grillhouse
  (`packages/grillhouse`, `packages/grillhouse-essais`), comme le corpus de BPScript porte la
  sienne.

## Reçoit

- R2. Les appels des tests qui l'importent par son nom.

## Rend

- R3. Son entrée `./test-fixtures`, seule : la liste de `docs/INTERFACE.md`.

## Connaît

- R4. Node et le système : bwrap, bd, git, le dossier personnel.
- R5. Le fichier `packages/grillhouse/package.json`, lu comme un fichier pour sa version.

## Ne connaît pas

- R6. Aucun paquet : il n'importe ni le cadre ni un autre paquet de l'espace de travail. Ainsi le
  cadre et ses essais en dépendent sans cycle.

## Refuse

- R7. Un import d'un paquet ; un export hors de `./test-fixtures`.

## Invariants

- R8. Privé : il ne se publie pas. Le testwriter seul l'écrit ; les autres rôles le lisent.

## Coût

- R9. Le chargement de l'entrée lance `bwrap` et `bd --version` une fois, pour `canWrap` et `hasBd`.
