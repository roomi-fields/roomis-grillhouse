# Les documents d'un composant

Un composant (le projet entier, ou un paquet d'un dépôt à plusieurs paquets) a trois documents,
chacun avec son lecteur et sa question :

| document | lecteur | sa question |
|---|---|---|
| `docs/CADRE.md` | l'agent qui travaille un ticket | quel est mon rôle, ma frontière, ce que je refuse |
| `docs/INTERFACE.md` | le composant voisin | quelles formes traversent, qui juge quelle faute |
| `docs/ARCHITECTURE.md` | l'architecte, le développeur | comment il est construit, et pourquoi |

Une matière vit à une seule de ces adresses ; les autres y renvoient.

## Le cadre (`CADRE.md`)

La fiche de rôle, huit rubriques : Rôle · Reçoit · Rend · Connaît · Ne connaît pas · Refuse ·
Invariants · Coût. Chaque rubrique en phrases affirmatives, numérotées R1… pour qu'un ticket les
cite. C'est une frontière, pas une conception : rien sur l'intérieur.

## L'interface (`INTERFACE.md`)

La liste de ce qui traverse : chaque élément exporté, sa forme, ce qu'il rend, ce qu'il refuse, et
le garde qui la tient. Le consommateur n'a pas de copie de cette liste.

## L'architecture (`ARCHITECTURE.md`)

Le modèle : arc42, réduit à ce qu'un composant porte, et les vues composant de C4. Le document
montre la construction ; le cadre et l'interface disent la frontière, il y renvoie sans les
recopier.

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

Un schéma est en mermaid ou en texte. Un composant existant décrit sa construction réelle, relevée
dans le code ; un composant neuf, la construction cible, que son code tiendra. Ce qui se dérive du
code — la liste des fichiers, un compte de lignes — se génère et se cite ; le document ne le
recopie pas.

Dans un dépôt à plusieurs paquets, `docs/ARCHITECTURE.md` à la racine décrit l'ensemble sur le même
modèle et renvoie à l'architecture de chaque paquet.

## Le ton

Celui d'une spécification d'architecture (arc42, C4) : des noms de composants, des
responsabilités, des flux, des choix avec leur raison. Une réécriture de forme commence par
l'inventaire des affirmations du document (une ligne par fait) et se termine par leur vérification,
une par une, sur le texte nouveau : un fait absent ou changé se rétablit.

## Le critère de fin

- Chaque section répond à sa question avec un schéma ou un exemple, pas une liste de noms.
- Chaque composant interne a une responsabilité, et une seule.
- Chaque choix de la stratégie dit ce qu'il est et sa raison.
- Rien de ce que le cadre ou l'interface dit n'y est recopié.
