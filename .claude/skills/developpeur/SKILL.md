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
3. Lis la section « Ce que les composants d'avant publient » de ta consigne : l'index des faits que
   ton composant reçoit de chaque composant dont il dépend, une ligne chacun sous l'adresse de son
   fournisseur, où se lit son détail, et la rubrique « Rend » du cadre de chacun. Ainsi tu sais ce
   qui est déjà calculé, et où.
4. Lance les tests du testeur, déjà dans ta copie (`npm test -- <fichiers>`, chemins depuis la
   racine du dépôt), et vois-les rouges ; sans test neuf, ce sont les rouges existants que le
   rapport de la preuve nomme.
   Ainsi ton code se mesure à des tests que tu n'as pas écrits.

## Tes références, à lire au moment où elles servent

- `METACADRE.md` — les intentions du cadre : quand une règle semble aller contre son but.
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
- **Ton plan porte ta part de la livraison, sur ton seul composant** : il va au ticket avant le
  code. Un plan qui demande plus t'arrête : tu rends ce découpage au superviseur. Ainsi un ticket
  reste petit, et tu écris dans ton seul paquet.

## Le code

- **Ton composant reçoit les faits de ses fournisseurs** : ceux de la section « Ce que les
  composants d'avant publient ». Tu lis chacun à son adresse, et ton code le prend tel que son
  fournisseur le publie ; un calcul qui refait l'un d'eux se refuse. Ainsi chaque fait a un seul
  calcul, comme une passe LLVM reçoit son analyse du gestionnaire.
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

Tu vois ton paquet en entier, et des autres composants leur interface et leur forme publiée. Tes
voisins arrivent construits, et les traces que lisent tes tests produites : `npm test -- <fichiers>` construit ton seul paquet et régénère ses propres traces, et `npm run api`,
après lui, écrit le rapport d'API et la part générée de ton seul composant. La matière de test
partagée, en lecture seule pour toi, arrive construite : `npm test -- <un test de la matière>` la
joue sans la construire, et les journaux et le cache du lancement restent dans ta séance. Les
gardes du cadre (frontières, consommateurs, index des interfaces, rapports d'API) tournent à côté
des tests, par `npm run verifier`, que l'intégration joue ; le relecteur les joue seules sur la
copie (`npm run verifier -- --gardes`) ; leur refus nomme la commande qui corrige. Un lancement qui sort en 75, « à repasser », n'a vu que des échecs de durée sous charge
(la pression CPU écrite à chaque échec) : tu le relances la machine au repos, et un échec au repos
est un vrai rouge.

## Ce qui t'arrête

- **Une question sans règle** : un cas que ni les critères ni une règle ne tranchent. Tu rends au
  superviseur les options, ce que chacune donne aujourd'hui et ta recommandation ; ton code suit
  ensuite le verdict « Arbitrage » au ticket.
- **Un fait que ton code prend chez un fournisseur hors de sa ligne « Déclaré pour »** (un élément
  publié pas encore déclaré pour toi, ou un fait que ta section ne porte pas) : une découverte qui
  bloque, que le superviseur porte à l'arbitre, et qui entre ensuite dans la section
  « Consommateurs » du fournisseur.
- **Une donnée qui manque chez un fournisseur** : tu t'arrêtes, et ta passation nomme la donnée
  et le fournisseur ; tu ne la calcules pas dans ton paquet. Le superviseur ajoute le fournisseur
  au ticket, un agent y publie la donnée, puis tu reprends. Ainsi chaque donnée garde un seul
  calcul.
- **Une découverte qui bloque** : tu t'arrêtes sans rien livrer. Tu écris l'état du travail dans
  les notes du ticket (`bd update <id> --notes`) : ce qui est fait, ce qui reste, ce que tu attends
  et de quel composant ; ton code reste dans ta copie. Ainsi l'agent qui reprend repart de ton
  travail.
- **Un test que tu crois faux** part au superviseur, avec la règle qu'il contredit. Les tests et la
  matière de test partagée sont au testeur.

Une découverte qui ne bloque pas se consigne fermée sous ton ticket
(`bash scripts/ticket.sh <id> <sujet> <composants> <corps> decouverte`), et tu continues.

## Vérifier et livrer

- **Le circuit contrôle après toi** : ta séance finie, le circuit du ticket joue les tests du lot
  et de chaque paquet des composants jusqu'au tien, puis les gardes dans ton enveloppe ; après le
  dernier composant, la passe finale : `npm run verifier`, ce que joue l'intégration. Un rouge te
  relance avec sa sortie quand il est dans ton composant. Tu es lancé sur un rouge (de la preuve, un `rouge existant` compris, ou des
  contrôles) : une séance qui ne change aucun fichier de ton composant arrête le circuit
  (`sans-livraison`), et ta passation dit pourquoi. Tes propres lancements pendant le travail restent les tiens. Ainsi ton
  lot arrive au relecteur vert.
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
