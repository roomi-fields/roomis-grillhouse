# Les documents d'un composant

Un composant (le projet entier, ou un paquet d'un dépôt à plusieurs paquets) a trois documents,
chacun avec son lecteur et sa question :

| document | lecteur | sa question |
|---|---|---|
| `docs/CADRE.md` | l'agent qui travaille un ticket | quel est mon rôle, ma frontière, ce que je refuse |
| `docs/INTERFACE.md` | le composant voisin | quelles formes traversent, qui juge quelle faute |
| `docs/ARCHITECTURE.md` | l'architecte, le développeur | comment il est construit, et pourquoi |

**Une matière, un document** : une matière vit dans un seul de ces trois documents ; les deux
autres y renvoient. Ainsi chaque décision a une seule version, celle que le code suit.

## Le cadre (`CADRE.md`)

La fiche de rôle, huit rubriques : Rôle · Reçoit · Rend · Connaît · Ne connaît pas · Refuse ·
Invariants · Coût. Chaque rubrique en phrases affirmatives, numérotées R1… pour qu'un ticket les
cite. **Le cadre décrit la frontière** du composant ; son intérieur vit dans l'architecture. Ainsi
l'agent qui travaille un ticket sait ce que son composant fait, et ce qu'il refuse.

## L'interface (`INTERFACE.md`)

La liste de ce qui traverse : chaque élément exporté, sa forme, ce qu'il rend, ce qu'il refuse, et
le garde qui la tient. **Un titre par élément fourni** : chaque élément que le composant fournit a
son titre (`##`, ou `###` sous un thème), suivi d'une phrase qui dit ce qu'il rend. Ainsi l'index des
interfaces (`docs/agents/index-des-interfaces.md`, généré par `npm run interfaces`) dit à chaque
agent ce qui existe et qui le fournit. **L'interface vit chez l'offrant** : la liste de ce qui traverse une frontière vit dans l'`INTERFACE.md` du composant qui offre ; le consommateur y renvoie. Ainsi la frontière a une seule définition, tenue par son garde.
**Un élément se titre par son nom en code** : « ## `parse`(source, previous?) ». Chaque export
du composant a son titre, et chaque titre en code est un export : le contrôle
`scripts/interfaces-contre-code.mjs` le vérifie contre le rapport de l'API que génère API Extractor
depuis le code construit (`docs/INTERFACE.api.md`, régénéré par `npm run api`), types exacts
compris. **Les fautes se listent** sous « ## Les fautes » : leurs codes sont exactement ceux que le
code du composant produit. Ainsi l'interface que lit un agent voisin dit vrai.
**Les consommateurs sont déclarés** : une section `## Consommateurs` liste chaque composant qui
utilise l'interface, avec les éléments qu'il importe (`` - `parser` : jeton, position ``, `*` pour
un import entier). Le garde `scripts/consommateurs.mjs` refuse un import qu'elle ne déclare pas, et
signale une déclaration qu'aucun code n'emploie ; une ligne nouvelle entre avec son arbitrage.
Ainsi chaque dépendance entre composants est écrite et décidée.

## L'architecture (`ARCHITECTURE.md`)

Le modèle : arc42, réduit à ce qu'un composant porte, et les vues composant de C4. **L'architecture montre la construction** : `ARCHITECTURE.md` décrit l'intérieur du composant ; pour sa frontière, il renvoie au cadre et à l'interface. Ainsi chaque document reste à sa place.

```
# <composant> — architecture

<introduction : ce qu'est le composant et ce qu'il fait, en deux ou trois phrases neutres>

## Contexte          un schéma : le composant, ses voisins, ce qui le traverse
## Stratégie         les trois ou quatre choix qui commandent tout le reste, chacun avec sa raison ;
                     chaque choix dit ce qu'il est, jamais ce qu'il écarte
## Composants        un schéma des modules internes et leurs dépendances ; pour chacun :
                     sa responsabilité en une phrase, ce qu'il possède, ce qu'il appelle
## Données           les structures internes : leur forme, qui les crée, qui les lit, leur durée de vie
## Déroulé           une ou deux séquences : qui appelle qui, dans quel ordre
## Exécution         où le code tourne, la mémoire, ce qui est synchrone ou non
## Concepts transverses   identité, erreurs, déterminisme, tels que ce composant les tient
## Qualité           le budget de coût et où il se dépense ; ce qui se mesure
## Risques           ce qui est fragile ou inconnu, et ce qui le lèvera
```

Un schéma est en mermaid ou en texte. **Un composant existant décrit sa construction réelle**,
relevée dans le code ; un composant neuf, la construction cible, que son code tiendra. Ainsi
l'architecture dit toujours ce qui est vrai, ou ce que le code doit rejoindre.

**Ce qui se dérive du code se génère** : la liste des fichiers, par exemple, se génère et se cite.
Ainsi le document reste exact quand le code bouge.

Dans un dépôt à plusieurs paquets, `docs/ARCHITECTURE.md` à la racine décrit l'ensemble sur le même
modèle et renvoie à l'architecture de chaque paquet.

## Le ton

Celui d'une spécification d'architecture (arc42, C4) : des noms de composants, des
responsabilités, des flux, des choix avec leur raison. **Une réécriture de forme se vérifie fait
par fait** : elle commence par l'inventaire des affirmations du document (une ligne par fait) et
se termine par leur vérification, une par une, sur le texte nouveau ; un fait absent ou changé se
rétablit. Ainsi la nouvelle forme garde tout le fond.

## Le critère de fin

- Chaque section répond à sa question avec un schéma ou un exemple.
- Chaque composant interne a une responsabilité, et une seule.
- Chaque choix de la stratégie dit ce qu'il est et sa raison.
- Ce que le cadre et l'interface disent y figure par renvoi.
