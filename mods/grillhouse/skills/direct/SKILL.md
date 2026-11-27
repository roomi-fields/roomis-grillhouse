---
name: direct
description: "Travailler un ticket étiqueté direct, mené hors du circuit : tests et code ensemble, dans la copie du ticket. À charger au démarrage d'une séance de la commande du direct, avant de lire le ticket."
---

# Direct — écrire un ticket hors du circuit

Un ticket direct est un défaut du circuit lui-même, une correction triviale, un ticket de données
ou le squelette d'un paquet. Il n'a ni plan, ni testwriter, ni preuve du rouge, ni contrôles du
circuit : tu écris ses tests et son code ensemble, un relecteur juge ton lot, puis le superviseur le
vérifie et l'entre sur main. Tu n'es ni le relecteur ni le superviseur. La charte du projet, déjà
dans ton contexte, prime sur tout le reste.

## Au démarrage

1. Ta consigne porte ton ticket, lu au lancement de ta séance : sa description et ses critères, ses
   notes, la tâche du superviseur et les constats du relecteur qui restent ouverts pour toi. Tu ne
   le relis pas par bd, qui le refuse à ta séance. Puis `bd update <id> --claim`. Des constats
   ouverts disent que ton lot a été rendu : tu reprends sur l'état de ta copie
   (`git -C <copie> status`, `git -C <copie> diff`) et tu lèves chacun.
2. Lis les documents des paquets du plan (`CADRE.md`, `INTERFACE.md`, `ARCHITECTURE.md`, dans
   `docs/` ou `packages/<x>/docs/`) et le lexique `CONTEXT.md`, puis ce que publient leurs
   fournisseurs (`docs/agents/index-des-interfaces.md`). Ainsi ton code part de l'architecture
   écrite.
3. Lis le code que le ticket change, **l'index d'abord** : avant toute recherche par le shell, tu
   appelles `mcp__rtfm__rtfm_search` (`rtfm_search`, mode `hybrid`) pour le quoi,
   `mcp__rtfm__rtfm_expand` (`rtfm_expand`) lit en entier un résultat, et
   `mcp__codegraph__codegraph_explore` ou `codegraph explore <symboles>` donne l'appel ; le shell
   lit un fichier déjà nommé. La même règle tient pour chaque recherche du travail.

## Devant un rouge ou un défaut

Devant un rouge que ton lot ne lève pas, celui d'une passe finale compris, ou devant un défaut, tu
charges la compétence `grillhouse:systematic-debugging` (outil Skill) avant tout correctif. Ainsi
la cause se trouve avant le correctif.

- **Les règles de ton rôle priment sur la méthode.** Tu écris toi-même le test qui reproduit le
  défaut. Là où la méthode renvoie au « human partner », tu remontes au superviseur par ta fiche.
  Ainsi la méthode sert le rôle sans l'élargir.
- **Un geste de la méthode que tes droits ou la charte refusent ne se lance pas et ne se contourne
  pas.** La cause se cherche avec les gestes permis : la lecture, l'index, `npm test -- <fichiers>`
  et une instrumentation temporaire dans les paquets du plan, retirée avant la fiche. Ce qui ne peut
  pas se prouver ainsi remonte par la fiche. Tu ne lances jamais `find-polluter.sh`, repris pour la
  fidélité de la copie. Ainsi chaque preuve vient d'un geste permis.

## Le travail

- **Un défaut corrigé porte un test qui le reproduit** : tu écris le test d'abord, tu le vois rouge
  par `npm test -- <fichiers>` (chemins depuis la racine du dépôt), puis tu corriges et tu le vois
  vert. Aucune preuve du rouge ne le rejoue : le relecteur et la vérification complète du
  superviseur la tiennent, et un défaut corrigé sans test qui le reproduit est rendu.
- **L'existant d'abord** : avant d'écrire un calcul ou d'inventer un nom, tu cherches celui qui
  existe et tu vérifies ce qu'il fait.
- **Tu écris les paquets du plan seuls** (les composants du titre du ticket, plus ceux que la
  commande a reçus) ; une écriture hors d'eux échoue (« Read-only file system »), quel que soit
  l'outil. Tu prends l'outil que ton travail demande : Write ou Edit, un script, une redirection du
  shell, le client d'une base ; ton lot n'est pas jugé sur une règle de rôle, le relecteur le lit.
  Un fichier temporaire va dans `$TMPDIR`, et le retrait d'un fichier par un script
  `node $TMPDIR/retire.mjs` (`rmSync` de `node:fs`).
- **Les tests se lancent par `npm test -- <fichiers>`**, jamais par l'outil de test directement ;
  `npm run api`, après lui, écrit le rapport d'API des paquets du plan.
- **Tu attends au premier plan ce que tu lances** : ta séance n'a aucune tâche de fond.
- **Tu ne commites pas** : ton lot est ton travail dans la copie.

## Ce qui t'arrête

Une décision qui revient au responsable, un fait qu'un fournisseur ne publie pas : ta fiche finit
sur BLOQUÉ ou BESOIN, avec sa pièce, et le superviseur tranche. Un fichier hors de ton plan : ta
fiche finit sur BESOIN, sa `question` nommant le paquet qui le possède et son champ `manque` le
fichier ; un fichier que le ticket nomme étend le plan et ta séance reprend. Une
découverte hors du ticket entre dans `decouvertes` de ta fiche.

## La fin

Ta passation au ticket (`bd comments add`), en mots simples : la cause, ce qui est juste, le test
et sa morsure, ce qui n'est pas fait. Ta séance finit sur ta fiche, la même que celle du
développeur. Ainsi le circuit du direct lit ta fiche, l'humain et ta séance suivante ta passation.
