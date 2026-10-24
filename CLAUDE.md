# <Nom du projet>

<Ce qu'est le projet et ce qu'il fait, en deux ou trois phrases.>

**Responsable** : <nom>. Il valide <la spécification, les ARCHITECTURE.md, les CADRE.md, les
INTERFACE.md> ; le superviseur valide les autres documents. Ainsi le responsable tranche
l'essentiel.

Les règles du cadre : @mods/grillhouse/charte.md

## Ce qui décide

Le métacadre (`mods/grillhouse/METACADRE.md` : les intentions du cadre et
l'écriture des règles), puis
<la spécification ou la cible>, puis le cadre de chaque composant (`docs/CADRE.md`,
`docs/INTERFACE.md`, `docs/ARCHITECTURE.md`), puis le code. Ainsi l'architecture décide, et le
code suit.

## Comment on arbitre

Dans cet ordre ; le projet ajoute ses propres forces à la liste, à leur rang (« le temps
d'abord », « une personne maintient le projet »…).

1. **Que fait la référence mature ?** <Les références du domaine : un compilateur mature, une
   station audionumérique professionnelle…> Ce qu'elles font est la réponse par défaut ; un écart
   porte sa raison écrite.
2. **Qu'est-ce qui existe déjà ?** Un standard, un outil sur étagère, une bibliothèque éprouvée,
   une convention des projets voisins se reprend tel quel.
3. **Le domaine l'exige-t-il ?** <Les exigences du domaine : la rapidité pour le live coding…> Un
   choix qui les dégrade se mesure et se dit.

## Ce qui monte au superviseur

Une question qu'aucun geste du circuit ne tranche monte au superviseur, avec sa pièce. Il monte au
responsable le fonctionnel, qu'il ne tranche jamais seul : <le langage, le moteur audio, une
interface publiée…>. Le cadre et l'architecture montent toujours (charte commune).

## Commandes

- `npm test` (Turborepo : construction, puis tests ; une tâche dont rien n'a bougé est relue de son cache, `npm run test:forcer` rejoue) · `npm test -- <chemins>` (un lancement ciblé : chaque chemin écrit depuis la racine, joué dans son paquet, avec les constructions dont ses tests dépendent, relues du cache ; ses tests rejouent dès que bouge ce qu'ils importent ; un lancement qui ne joue aucun test échoue ; un banc de temps ou un test de nuit se joue quand son propre fichier est nommé, au repos) · `npm run verifier` (après la construction, les gardes du cadre, celles du projet — son script `gardes` — et les tests, côte à côte, puis les témoins de temps seuls, sous le verrou de la machine : ce que jouent l'intégration, la file, la CI et la nuit ; mesuré contre le dernier vert, un paquet rejoué joue les tests que Vitest relie aux fichiers changés depuis, tous quand un changement sort de son graphe ; 0 vert, 1 rouge, 75 « à repasser ») · `npm run verifier -- --tout` (la passe complète, chaque test joué pour de vrai : ce que joue la nuit) · `npm run verifier -- --gardes` (les gardes seules, même verdict : ce que joue le relecteur) · `npm run typecheck` · `npm run lint` · `npm run format:check`.
- Préfixe des tickets : `<prefixe>-`.
- La politique de poussée : la clé `grillhouse.poussee` du `package.json` (`commit` : la branche où
  part chaque commit, main par défaut ; `nuit` : la branche où la nuit pousse son commit vert ;
  seule la nuit la pousse, le crochet pre-push refuse toute autre poussée vers elle).
- Les sous-modules partagés : la clé `grillhouse.partage` du `package.json` (les chemins des
  sous-modules qu'aucun ticket n'écrit ; chaque copie les lit dans le dépôt principal, en lecture
  seule, au lieu d'en recevoir un exemplaire).
- La plage de nuit : la clé `grillhouse.plageDeNuit` du `package.json` (`{ "debut": 23, "fin": 8 }`
  par défaut : les heures, à l'heure locale, où l'attente d'une réponse compte au bilan comme nuit,
  à part de l'attente du superviseur et de celle du responsable).
