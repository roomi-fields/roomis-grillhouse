# grillhouse-essais — interface

Le paquet n'exporte rien : il ne déclare ni `exports`, ni `main`, ni `types`, et aucun paquet ne
l'importe. Ce qu'il lit des autres paquets :

- du cadre (`@roomi-fields/grillhouse`) : son entrée publiée `./vitest-config`, que sa
  configuration de Vitest importe ; ses scripts et sa commande `grillhouse`, en processus, dans
  `packages/grillhouse` du même arbre ;
- de la matière partagée (`@roomi-fields/grillhouse-matiere/test-fixtures`) : la liste de son
  `INTERFACE.md`.

**Langage** : typescript

## Les fautes

Aucune : le paquet ne rend aucune faute.

## Consommateurs

Aucun paquet.
