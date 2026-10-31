# grillhouse-essais — architecture

Le paquet des grands tests de Grillhouse, ceux qui prouvent l'enchaînement du cadre (le circuit
d'abord ; la nuit, l'intégration et sa file, le lanceur d'un agent, l'ouverture de séance, la mise
à jour et l'init, le retrait d'une copie) : des tests de nuit, qui montent un dépôt d'essai et y
lancent les scripts du cadre en processus. S'y ajoutent les cas d'un module du cadre que seul un
grand test prouve (l'enveloppe réelle sous bwrap, la passe de `npm run verifier` et de `npm test`
sous Turborepo et Vitest, le rapporteur d'avancement dans une vraie passe, un crochet dans un dépôt
git et sa copie, le crochet d'un commit par ticket, les verrous, la garde des consommateurs et la
commande de sortie lancés en processus, le graphe et les empreintes de Turborepo sur les
`turbo.json` générés) ; les autres cas de ce module sont des petits tests de jour, dans le fichier
du même nom du paquet du cadre.

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
  arbre, `packages/grillhouse` à côté de ce paquet (`CADRE`, `tests/cadre.ts`), jamais
  celui qu'atteint la résolution de son nom (depuis une copie sans installation propre, celui de
  main) ; un test lance ses scripts, comme turborepo-tests lance le binaire de turbo construit
  dans son arbre. Une fonction d'un script s'appelle dans un processus à elle (`enProcessus`, ses
  arguments et son résultat en JSON), une valeur qu'il exporte s'y lit (`valeursDe`) ; une base
  de passe s'ouvre dans un processus qui vit jusqu'à sa fermeture (`ouvrirBaseEnProcessus`). Aucun test n'importe un script du cadre dans son
  processus ; seule la configuration de Vitest du paquet importe son entrée `./vitest-config`.
- **Un petit test de jour** (`tests/paquet.spec.ts`) : il tient la forme du paquet et le compte des
  tests déplacés, ceux d'un fichier déplacé entier comme ceux d'un fichier scindé, et donne à la
  journée un test à jouer.

## Composants

- `tests/cadre.ts` : le paquet du cadre du même arbre, et l'appel d'un script en processus.
- `tests/circuit-essai.ts` : le dépôt d'essai du circuit et ses remplaçants, partagés par les
  `circuit*.nuit.spec.ts` et `base-de-passe.nuit.spec.ts`.
- `tests/integration-essai.ts` et `tests/file-integration-essai.ts` : le dépôt d'essai de
  l'intégration et de sa file, partagé par les `integrer*`, les `file-integration*` et le banc de
  l'enveloppe.
- `tests/sous-modules-essai.ts` : les mondes d'essai des sous-modules (`sous-modules*.nuit.spec.ts`).
- `tests/enveloppe-essai.ts` : l'enveloppe du cadre et le projet que prépare le lanceur d'un agent
  (`enveloppe*.nuit.spec.ts`, `lancer-modele*.nuit.spec.ts`).
- La matière que ces tests partagent avec ceux du cadre vient de
  `@roomi-fields/grillhouse-matiere/test-fixtures` : les projets d'essai de la nuit
  (`testsDeNuitEssai`, le dépôt et sa mise à jour passés par l'appelant), le langage d'un projet
  d'essai et les dossiers d'essai de l'enveloppe (`declarerLesLangages`, `enveloppeEssai`).
- `tests/base-de-passe.essai.mjs` : le fichier de test du projet d'essai de
  `base-de-passe.nuit.spec.ts`.

Le cadre du paquet : `CADRE.md` ; ce qui traverse : `INTERFACE.md`.
