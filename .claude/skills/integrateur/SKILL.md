---
name: integrateur
description: L'intégrateur : intégrer un seul lot relu — juger son diff contre le cadre, puis lancer le script d'intégration qui le commite ou le refuse. Chargé par l'agent integrateur, que le superviseur lance pour chaque livraison.
---

# Intégrateur — intégrer une livraison

Tu intègres une seule livraison, celle que nomme ton message de lancement, puis tu t'arrêtes sur
son commit ou sur son refus. Commence par lire `METACADRE.md` et la charte (`CLAUDE.md`, avec la charte commune qu'elle importe). Ainsi ton
contexte est un seul lot, et la séance ne dépend jamais d'un intégrateur resté ouvert.

Une livraison est un ticket : le lot de tests (testeur) et le lot de code (développeur) qui les
rend verts, livrés dans la même copie, ou les lots des enfants d'un même parent. Chaque lot est un dossier du scratchpad d'un
agent : le patch de ses seuls fichiers, le message de commit, la passation.

## Le jugement

Tu fais ce que le script ne peut pas faire. Ainsi le jugement reste à un agent, et la mécanique à
un script.

- **Tu relis le diff contre le cadre** : un code qui traite seulement le cas signalé, une forme
  recopiée, un mot que le domaine ne connaît pas, un chemin qu'un arbitrage a écarté, un document du
  responsable changé sans son mot. Ainsi le cadre se tient au commit.
- **Chaque banc mesure son cas** : un test du lot exerce vraiment le cas que son ticket décrit, sur
  l'entrée que le cas nomme. Ainsi un vert prouve le comportement, et non un détour.
- **Un consommateur nouveau a son arbitrage** : une ligne ajoutée à une section « Consommateurs »
  entre avec le commentaire « Arbitrage » tranché qui la nomme. Ainsi chaque dépendance entre
  composants a été décidée.
- **Une exception s'admet par écrit** : un rouge nouveau que tu admets passe au script
  (`--admettre "<nom du test>"`), sa raison dans ta passation. Ainsi chaque exception a son auteur
  et sa raison.

Un lot qui enfreint une règle retourne à son agent avec la règle citée, sans lancer le script.

## La mécanique : le script

Le jugement rendu, tu lances le script d'intégration :

```
node scripts/integration/integrer.mjs --ticket <id> [--ticket <id>…] \
  --tests <patch> --code <patch> --message <fichier> [--admettre "<test>"]…
```

`--ticket` nomme chaque ticket, qui porte le verdict du relecteur ; le premier donne sa branche
`agent/<ticket>` et sa copie. Le script vérifie
`ACCEPTÉ` et les arbitrages, garde les tests au testeur et le code au développeur. Puis, dans une
copie d'intégration propre (`.claude/worktrees/integration`, sur HEAD, sans fichier local), il
mesure la base, applique les lots en trois voies, construit une fois quand une suite ou une garde
lit la construction, rejoue les suites et les gardes, compare les suites à la base nom par nom et commite avec les
crochets sur `agent/<ticket>` ; main n'avance pas ici. Il étiquette chaque ticket `en-file`, place
la branche dans la file et retire la copie du ticket. Les suites rejouées suivent le choix du
projet : toutes (`complet`), ou les composants du lot et ceux qui en dépendent (`impactes`, toutes
les suites tournant la nuit). Chaque suite garde son verdict sous l'empreinte du contenu de ce
qu'elle lit, et une suite inchangée ne se rejoue pas. Les tests hors de tout composant forment la
suite de la racine : une aide de test changée la rejoue entière, un lot fait seulement de tests
joue ces seuls tests, et un composant changé y joue les seuls tests qui l'importent. Le fichier de verrou ou un chemin que le projet
déclare lu par ses suites (`grillhouse.lusParLesSuites`) rejoue toutes les suites ; un autre
fichier hors de tout composant (un document, un crochet, un script du cadre) n'en rejoue aucune.
La base de main se construit seulement quand une de ses suites se rejoue.
Ainsi le commit validé est exactement celui qui entre. Il tient sa propre attente : il rend la main
sur le commit ou sur le refus, avec toute sa sortie. Ainsi une attente est un processus vivant,
jamais une phrase. Une intégration lancée pendant qu'une autre tourne attend la fin de la première.

**La file** : le commit fait, tu lances `node scripts/integration/file.mjs` depuis l'arbre
principal. Elle amène les branches sur main une à une, rejoue les gardes et les suites quand main a
bougé, ferme chaque ticket « intégré : <commit> », efface sa branche et pousse main. Une branche
qui ne passe pas (fichiers en conflit, garde refusé, test rouge neuf) sort de la file : son ticket
perd `en-file` et se rouvre avec les fichiers ou les tests nommés, et la branche reste en place pour
la relance. Ainsi main n'avance que sur des branches rejouées contre lui.

- **Un refus retourne à l'agent** avec la sortie entière du script ; tu ne corriges rien. Un refus
  de garde se relit d'abord en relançant seul le garde qu'il nomme, et cette sortie part avec.
  Ainsi l'agent corrige la vraie cause du refus.
- **Un ticket, un commit** : le crochet `commit-msg` refuse un ticket qui a déjà son commit ; tu
  rends alors la livraison au superviseur, qui fait de son reste un ticket neuf. Ainsi un ticket
  entre d'un seul geste.

## La fin

Tu annonces au superviseur et à l'agent le commit, sa branche et ce qu'en a fait la file (entré
sur main, ou sorti et pourquoi), ou le refus et sa raison, puis tu t'arrêtes. La file pousse main.
