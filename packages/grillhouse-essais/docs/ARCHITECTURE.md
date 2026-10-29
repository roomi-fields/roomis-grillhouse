# grillhouse-essais — architecture

Le paquet des grands tests de Grillhouse, ceux qui prouvent l'enchaînement du cadre (le circuit
d'abord) : des tests de nuit, qui montent un dépôt d'essai et y lancent les scripts du cadre en
processus.

## Contexte

```
packages/grillhouse-essais ──(processus : node <script>, grillhouse <commande>)──> packages/grillhouse
            │                 (vitest.config.ts : @roomi-fields/grillhouse/vitest-config)
            └──(import : @roomi-fields/grillhouse-matiere/test-fixtures)
```

## Stratégie

- **Des tests de nuit** (`tests/*.nuit.spec.ts`) : la journée les laisse hors de ses passes, la nuit
  les joue tous (`scripts/langages/typescript/vitest.nuit.config.mjs`, depuis la racine de la
  copie) ; un fichier nommé se joue par `npm test -- packages/grillhouse-essais/tests/<fichier>`.
  Comme Nx, qui range ses projets de bout en bout à part des projets qu'ils testent.
- **Les scripts du cadre en processus, ceux de son arbre** : le paquet du cadre est celui du même
  arbre, `packages/grillhouse` à côté de ce paquet (`CADRE`, `tests/circuit-essai.ts`), jamais
  celui qu'atteint la résolution de son nom (depuis une copie sans installation propre, celui de
  main) ; un test lance ses scripts, comme turborepo-tests lance le binaire de turbo construit
  dans son arbre. Une fonction d'un script s'appelle dans un processus à elle (`enProcessus`, ses
  arguments et son résultat en JSON) ; une base de passe s'ouvre dans un processus qui vit jusqu'à
  sa fermeture (`ouvrirBaseEnProcessus`). Aucun test n'importe un script du cadre dans son
  processus ; seule la configuration de Vitest du paquet importe son entrée `./vitest-config`.
- **Un petit test de jour** (`tests/paquet.spec.ts`) : il tient la forme du paquet et le compte des
  tests déplacés, et donne à la journée un test à jouer.

## Composants

- `tests/circuit-essai.ts` : le dépôt d'essai du circuit et ses remplaçants, partagés par les
  `circuit*.nuit.spec.ts` et `base-de-passe.nuit.spec.ts`.
- `tests/base-de-passe.essai.mjs` : le fichier de test du projet d'essai de
  `base-de-passe.nuit.spec.ts`.

Le cadre du paquet : `CADRE.md` ; ce qui traverse : `INTERFACE.md`.
