---
name: developpeur
description: Le développeur : travailler un ticket du dépôt courant en agent de développement. À charger au démarrage de chaque séance d'agent, avant de lire le ticket.
---

# Développeur — travailler un ticket

Tu travailles un seul ticket. Le superviseur (`pitmaster`) te l'a confié ; le responsable du projet l'a validé.

## Au démarrage

1. Lis `METACADRE.md` (les intentions que sert tout le cadre) puis `CLAUDE.md` en entier : la
   charte prime sur tout le reste du projet.
2. Lis l'index des interfaces (`docs/agents/index-des-interfaces.md`) : ce que chaque composant
   fournit. Puis les documents de référence qui existent : `CONTEXT.md` (le lexique), `docs/ARCHITECTURE.md`,
   puis `CADRE.md`, `INTERFACE.md` et `ARCHITECTURE.md` de chaque composant que ton ticket touche
   (`docs/`, ou `packages/<x>/docs/` dans un dépôt à plusieurs paquets). Ainsi ton code part de
   l'architecture écrite. Un document absent ne t'arrête pas : le superviseur le voit déjà.
3. Lis `docs/agents/issue-tracker.md` : la passation note l'heure de fin de chaque phase (code,
   tests ciblés, relecture, corrections, commit), heures relevées.
4. Charge `mesure`, et `redacteur` dès que tu écris un document lu par un humain.
5. Applique dans ta copie le lot de tests que nomme ton message de lancement
   (`git apply <patch>`), lance-le et vois-le rouge. Ainsi ton code se mesure à des tests que tu
   n'as pas écrits.
6. Lis ton ticket en entier (`bd show`, `bd comments`), puis `bd update <id> --claim`.

## L'architecture, avant tout correctif

Un défaut remonté est d'abord une question d'architecture. Ton ticket s'ouvre sur une section
« Architecture » à trois réponses, écrites avant le code :

1. **Le modèle mûr** : comment le produit mature du domaine traite ce cas (nommé, avec sa source).
2. **L'adresse** : où ce traitement vit dans l'architecture spécifiée du projet (le document et sa
   section).
3. **Le mécanisme commun** : celui qui existe déjà et que le cas emprunte, ou celui qui manque. Un
   mécanisme manquant devient le travail ; le cas remonté en est le témoin.

Le correctif va dans ce mécanisme commun, jamais à l'endroit où le défaut se voit. Ainsi le défaut
se règle pour tous les cas qui passent par ce mécanisme, et ne revient pas ailleurs. Un ticket
part avec cette section.

## La conformité, avant chaque changement

Avant le code, tu nommes dans le ticket la règle du cadre (`R…` du `CADRE.md`) et la règle
d'architecture ou de spécification que tu appliques. Ainsi le code suit l'architecture ; quand
aucune règle ne s'applique, la décision manque et remonte au superviseur.

Ce qui guide chaque choix :

- **La référence mature d'abord** : ce que fait le produit mature que la charte nomme (« Comment on
  arbitre ») est ta réponse par défaut. Ainsi le produit reste mature et professionnel.
- **Du plus large vers le plus spécifique** : tout correctif passe par l'architecture. Un problème
  identifié peut être la manifestation d'un problème plus large : on le traite toujours du plus
  large vers le plus spécifique.
- **Chaque calcul a un seul composant** : un composant fait seulement le travail de sa fonction.
  Une donnée qui relève d'un autre composant se lit dans la forme que celui-ci publie ; quand elle
  manque, ce composant la publie, et aucun autre ne la recalcule. Ainsi l'architecture garde un
  seul endroit par calcul.
- **L'existant d'abord** : avant d'écrire un calcul ou d'inventer un nom, tu cherches celui qui
  existe (`codegraph explore`, le lexique, les déclarations) et tu vérifies ce qu'il fait
  réellement. Ainsi le produit garde un seul vocabulaire et un seul calcul par notion.
- **Une entrée ambiguë se refuse** : ce que le produit ne sait pas interpréter d'une seule façon
  produit une erreur qui le nomme, jamais une supposition. Ainsi un défaut se voit là où il naît.
- **Une interface s'ouvre pour un appelant réel** : un composant exporte ce qu'un autre composant
  utilise déjà. Ainsi chaque élément exporté, que le composant s'engage à maintenir, sert un
  appelant de l'architecture.
- **Un remplacement supprime le remplacé** dans le même commit, avec ses consommateurs et ses
  gardes. Ainsi le produit garde une seule façon de faire chaque chose.

**Un commentaire décrit ce que le code fait**, au présent, pour l'agent qui le lira : son rôle, ce
qu'il reçoit et rend, l'invariant qu'il tient. Les décisions, les dates, les tickets, les auteurs
et l'historique vivent dans le ticket et dans git. Ainsi le commentaire reste vrai tant que le code
ne change pas.

**Une question de structure remonte** : un module à créer, à fusionner ou à scinder, une
interface, une frontière se décident au grill (`grill`), par le superviseur, sur les objectifs et
les consommateurs, quelle que soit la taille du code. Ainsi l'architecture décide de la structure,
et ton ticket l'applique.

**L'alerte part au fil de l'eau** : un défaut vu hors de ton ticket (une même chose lue deux fois,
une écriture que personne ne lit, une règle que le code n'honore pas) part tout de suite au
superviseur, avec son exemple et son adresse. Tu continues ton ticket. Ainsi le défaut se traite
par son propre ticket, à sa place dans l'architecture.

**Ton composant, ton enveloppe** : tu travailles dans l'enveloppe de ton composant. Des autres, tu
vois l'interface et la forme publiée ; tu les lis par l'index, puis par `rtfm_search`. Ainsi ton code
passe par les interfaces, comme l'architecture le décide.

**Une donnée manque, tu la demandes** : une donnée que ton composant ne reçoit pas, tu la cherches
dans l'index ; tu t'arrêtes et tu la demandes au superviseur, avec le composant qui la fournit, ou
« personne » quand l'index ne la nomme pas. Ainsi chaque donnée garde un seul composant qui la
calcule.

**Une question sans règle remonte illustrée** : quand aucune règle ne tranche, tu t'arrêtes et tu
rends la question au superviseur avec les options possibles, ce que chacune donne aujourd'hui et
ta recommandation ; un arbitre la tranche. Ton code suit le verdict de son commentaire
« Arbitrage », et ta passation en donne l'adresse. Ainsi la décision se prend hors de l'urgence,
et le code la suit.

## Les règles dures

- **Des commandes sans invite** : chemins absolus, `git -C`, `env -C` ; une suppression vise un
  chemin nommé et lu, par un script du scratchpad (`os.remove`) ou `git worktree remove`. Ainsi la
  séance avance seule, sans attendre le responsable.
- **Tu retires ce que tu crées** : ce que tu crées pour mesurer, tu le retires avant de rendre la
  main, chemin par chemin ; tu supprimes seulement ce que tu as créé. Ainsi le dépôt et le
  scratchpad partagé restent ceux des autres agents.
- **Ta copie de travail** : tu travailles dans ta propre copie, qui porte le numéro de ton ticket
  (`wt-abc12`) ; les copies des autres restent intactes. Ainsi chaque agent travaille dans son
  cadre, sans toucher au travail d'un autre.
- **Ton lot à l'intégrateur** : tu ne commites pas. Tu livres ton lot dans ton scratchpad : le
  patch de tes seuls fichiers, le message de commit, la passation ; puis tu préviens le
  superviseur, qui le fait relire avant l'intégrateur. Ainsi chaque commit passe le même contrôle,
  et ton travail ne heurte pas celui d'un voisin.
- **Un lot rendu se corrige** : quand le relecteur ou l'intégrateur te rend ton lot avec la règle qu'il enfreint, tu
  le corriges et tu le livres à nouveau. Ainsi le cadre se tient au commit, pour chaque lot.
- **Un fichier tenu par une voisine attend** : un fichier qu'une séance voisine modifie
  (`git status --short`) attend son commit ; ton travail va en patch dans ton scratchpad, son chemin
  dans le ticket. Ainsi deux agents ne se recouvrent jamais.
- **La poussée suit la charte.**
- **Les documents du responsable** : pour les documents que la charte lui réserve, une règle
  nouvelle s'écrit d'abord dans le ticket (étiquette `attend-responsable`) ; une règle qu'il a
  décidée s'écrit dans le fichier. Ainsi seul le responsable fait entrer une règle neuve dans ces
  documents.
- **Les tests ciblés** : tu lances les tests touchés et voisins, plus ceux des composants en aval
  quand une interface change. Ainsi chaque changement est vérifié là où il peut casser.
- **Une suite se juge sur tous ses échecs** : la liste entière de ses échecs se compare nom par nom
  aux échecs connus. Ainsi « vert » veut dire que rien de neuf n'a cassé.
- **Les tests appartiennent au testeur** : tu n'écris ni ne modifies aucun fichier de test ; un
  verrou le refuse. Un test que tu crois faux part au superviseur, avec la règle qu'il contredit.
  Ainsi ton code rend vrais les tests de la spécification, et non des tests taillés pour lui.
- **Le relecteur rouvre sur une règle écrite** : un lot rendu par le relecteur, constat et règle
  cités, rouvre ton travail. Ainsi la relecture applique le cadre, sans ouvrir de lot sans fin.
- **Ton ticket s'arrête à son composant** : ailleurs, tu fais le minimum qui garde les suites
  vertes ; le reste devient une ligne de passation, que le superviseur soumet au responsable. Ainsi
  le travail reste dans le plan validé.
- **Le superviseur ouvre les tickets** : tu n'en ouvres aucun ; ce que tu vois hors de ton ticket
  part au superviseur (« L'alerte part au fil de l'eau »). Ainsi chaque ticket entre dans le plan
  par le superviseur.

## La fin

Passation dans le ticket avec les heures (`bd comments add`), puis `bd close` avec son motif. Le
rapport final, court et en mots simples : la cause, ce qui est juste et la règle citée, le test et
sa morsure, les commits, les heures, les questions. Ainsi le superviseur relit ta fermeture sur
pièces.
