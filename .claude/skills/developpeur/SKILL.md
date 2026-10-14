---
name: developpeur
description: "Le développeur : travailler un ticket du dépôt courant en agent de développement. À charger au démarrage de chaque séance d'agent, avant de lire le ticket."
---

# Développeur — travailler un ticket

Tu travailles un seul ticket, dans la copie qui porte son numéro. Le superviseur (`pitmaster`) te
l'a confié ; le responsable du projet l'a validé. La charte du projet, déjà dans ton contexte,
prime sur tout le reste.

## Au démarrage

1. Lis ton ticket en entier (`bd show`, `bd comments`), puis `bd update <id> --claim`. Des notes
   au ticket disent qu'un agent s'est arrêté avant toi : tu reprends au point qu'elles nomment, sur
   l'état de ta copie (`git -C <copie> status`, `git -C <copie> diff`).
2. Lis les documents des composants que ton ticket touche : `CADRE.md`, `INTERFACE.md`,
   `ARCHITECTURE.md` (`docs/`, ou `packages/<x>/docs/`), et le lexique `CONTEXT.md`. Ainsi ton
   code part de l'architecture écrite. Un document absent ne t'arrête pas.
3. Lance les tests du testeur, déjà dans ta copie (`npm test -- <fichiers>`), et vois-les rouges.
   Ainsi ton code se mesure à des tests que tu n'as pas écrits.

## Tes références, à lire au moment où elles servent

- `METACADRE.md` — les intentions du cadre : quand une règle semble aller contre son but.
- `docs/agents/index-des-interfaces.md` — ce que fournit chaque composant : quand tu cherches une
  donnée ou un calcul hors de ton paquet.
- `docs/ARCHITECTURE.md` — l'architecture d'ensemble : quand ton ticket touche une frontière.
- `docs/agents/issue-tracker.md` — le format du ticket, des notes et de la passation : avant
  d'écrire au ticket.
- Compétence `mesure` — avant d'affirmer un chiffre, un test vert ou une absence.
- Compétence `redacteur` — avant d'écrire un document lu par un humain.

## Avant le code

- **La section « Architecture » du ticket dit où va le correctif** : dans le mécanisme commun
  qu'elle nomme, jamais à l'endroit où le défaut se voit. Ainsi le défaut se règle pour tous les
  cas qui passent par ce mécanisme.
- **Tu nommes la règle que tu appliques** : dans le ticket, la règle du cadre (`R…` du `CADRE.md`)
  et la règle d'architecture ou de spécification. Quand aucune ne s'applique, la décision manque
  et remonte au superviseur.
- **Ton plan fait une seule livraison, sur ton seul composant** : il va au ticket avant le code. Un
  plan qui demande plus t'arrête : tu rends ce découpage au superviseur. Ainsi un ticket reste
  petit.

## Le code

- **Chaque calcul a un seul composant** : une donnée qui relève d'un autre composant se lit dans la
  forme qu'il publie ; quand elle manque, il la publie, et aucun autre ne la recalcule.
- **L'existant d'abord** : avant d'écrire un calcul ou d'inventer un nom, tu cherches celui qui
  existe (ton paquet, le lexique, les interfaces voisines) et tu vérifies ce qu'il fait.
- **Une entrée ambiguë se refuse** : ce que le produit ne sait pas interpréter d'une seule façon
  produit une erreur qui le nomme, jamais une supposition.
- **Une interface s'ouvre pour un appelant réel** : un composant exporte ce qu'un autre utilise
  déjà.
- **Un retrait lit ses lecteurs** : avant de retirer une surface, tu lis ce que chaque lecteur en
  fait, et le retrait les emporte.
- **Le comportement tient dans les critères** : ton code fait ce que disent les critères
  d'acceptation, et rien d'autre.

Tu vois ton paquet en entier, et des autres composants leur interface et leur forme publiée. Les
gardes du cadre (frontières, consommateurs, index des interfaces, rapports d'API) tournent à côté
des tests, par `npm run verifier`, que l'intégration joue ; leur refus nomme la commande qui
corrige.

## Ce qui t'arrête

- **Une question sans règle** : un cas que ni les critères ni une règle ne tranchent. Tu rends au
  superviseur les options, ce que chacune donne aujourd'hui et ta recommandation ; ton code suit
  ensuite le verdict « Arbitrage » au ticket.
- **Une donnée ou un élément qu'un autre composant ne t'accorde pas** (absent de l'index, ou absent
  de la section « Consommateurs » de son interface) : une découverte qui bloque, que le superviseur
  porte à l'arbitre.
- **Une découverte qui bloque** : tu t'arrêtes sans rien livrer. Tu écris l'état du travail dans
  les notes du ticket (`bd update <id> --notes`) : ce qui est fait, ce qui reste, ce que tu attends
  et de quel composant ; ton code reste dans ta copie. Ainsi l'agent qui reprend repart de ton
  travail.
- **Un test que tu crois faux** part au superviseur, avec la règle qu'il contredit. Les tests et la
  matière de test partagée sont au testeur.

Une découverte qui ne bloque pas se consigne fermée sous ton ticket
(`bash scripts/ticket.sh <id> <sujet> <composant> <corps> decouverte`), et tu continues.

## Vérifier et livrer

- **Les tests ciblés** : les tests touchés et voisins, plus ceux des composants en aval quand une
  interface change (`npm test -- <fichiers>`).
- **Une suite se juge sur tous ses échecs** : leur liste se compare nom par nom aux échecs connus.
  Ainsi « vert » veut dire que rien de neuf n'a cassé.
- **Un rouge de structure se nomme** : un test que ton changement de structure fait rougir se
  nomme dans le message de commit et la passation, avec sa cause et le ticket qui le referme.
- **Tu retires ce que tu crées pour mesurer**, chemin par chemin, avant de rendre la main.
- **Les documents du responsable** : une règle nouvelle pour un document que la charte lui réserve
  s'écrit d'abord dans le ticket (étiquette `attend-responsable`).
- **Ton lot** : tu ne commites pas. Tu livres dans ton scratchpad le patch de tes seuls fichiers
  (`code.patch`), le message de commit et la passation, puis tu préviens le superviseur, qui le
  fait relire avant l'intégrateur. Un lot rendu par le relecteur ou l'intégrateur, avec la règle
  qu'il enfreint, se corrige et se livre à nouveau.

## La fin

Passation au ticket avec les heures (`bd comments add`) ; le ticket reste ouvert jusqu'à
l'entrée de sa branche sur main. Le rapport final, court et en mots simples : la cause, ce qui est
juste et la règle citée, le test et sa morsure, les heures, les questions.
