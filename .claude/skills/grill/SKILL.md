---
name: grill
description: L'initialisation et l'architecture du projet : initialiser un projet bâti sur le framework Roomi's Grillhouse — préparer le dépôt, mener le grill d'initialisation, puis écrire la charte, l'architecture, le cadre, les interfaces et le lexique, et ouvrir les premiers tickets. À charger au premier lancement d'un projet neuf ou d'un projet existant qui adopte le framework, quand l'ouverture de séance liste des éléments « pas encore renseignés » (critères d'arbitrage, champs de la charte, architecture, cadre, interfaces, lexique), quand le responsable demande d'initialiser ou de redéfinir ces éléments, et pour toute question de structure (découper en paquets ou modules, définir une interface, une frontière, l'architecture).
---

# Grill — initialiser le projet et décider de sa structure

Le framework fournit les outils et les compétences, et `METACADRE.md` les intentions qu'ils servent ;
l'initialisation leur donne leur objet. Lis le métacadre avant le premier tour : chaque
recommandation du grill sert une de ses intentions. Elle
produit les éléments clés que les compétences `pitmaster` et `grillardin` lisent à chaque séance :

| élément | ce qu'il fixe |
|---|---|
| `CLAUDE.md` | la charte : le projet, le responsable, ce qui décide, le flux, les commandes |
| `docs/ARCHITECTURE.md` | comment le projet est construit, et pourquoi |
| `docs/CADRE.md` | le rôle de chaque composant, sa frontière, ce qu'il refuse (R1…) |
| `docs/INTERFACE.md` | ce qui traverse chaque frontière, et le garde qui le tient |
| `CONTEXT.md` | le lexique du domaine |

Dans un dépôt à plusieurs paquets, le cadre, l'interface et l'architecture de chaque paquet vivent
sous `packages/<x>/docs/`, et `docs/ARCHITECTURE.md` décrit l'ensemble.

## 0. Tout le projet, ou les seuls éléments vides

À chaque ouverture de séance, la liste « Pas encore renseignés » dit ce qui reste vide. Un projet
neuf passe par toutes les sections ci-dessous. Un projet déjà engagé ne grille que les éléments
listés, ou celui que le responsable choisit, à n'importe quel moment : le relevé (§3) se limite à
ce que l'élément touche, le grill (§4) à ses branches, l'écriture (§5) à son document.

Chaque question arrive avec sa proposition, tirée du projet lui-même et de son domaine. Pour les
critères d'arbitrage (branche 2), cherche — dans le code, les documents, les projets voisins, la
documentation publique — les produits matures qui font le même travail, les standards et outils en
usage, les exigences mesurables du domaine, et propose-les nommément : le responsable corrige une
proposition, il ne part pas d'une page blanche.

## 1. Préparer le dépôt

`bash scripts/setup.sh <préfixe>` s'il manque les tickets ou les dépendances : sans invite, idempotent.
Le préfixe des tickets vient du nom du projet ; il se confirme au premier tour du grill.

## 2. La règle de l'architecture

L'architecture se déduit des **objectifs** du projet et de la **structure** de son code, jamais de
sa taille. Ces raisonnements sont des raccourcis interdits, dans le grill comme dans toute réponse :

- « le projet est petit » (lignes, fichiers, imports comptés) donc un seul bloc, pas d'interface ;
- « on verra plus tard » / « pas besoin pour l'instant » sans dire quel fait futur rouvrira la
  question et ce qu'il coûtera alors ;
- « les interfaces internes ne sont pas une API » : une frontière interne a une interface, que le
  cadre et un test tiennent ;
- une recommandation tirée d'un compte au lieu d'une lecture de la construction.

Un découpage se justifie par des pièces : un rôle distinct, un consommateur distinct (dans le
dépôt ou hors de lui), une raison de changer distincte, une représentation de données qui
traverse. Une fusion se justifie de la même façon : deux parties qui changent toujours ensemble et
qu'aucun consommateur ne sépare. Le vocabulaire est celui de `mattpocock-skills:codebase-design`
(module, interface, profondeur, jointure), à charger avant le grill.

Chaque recommandation du grill s'arbitre par les trois questions de la charte (« Comment on
arbitre ») et le dit : ce que fait la référence mature du domaine (un compilateur mature, une
station audionumérique professionnelle, selon le contexte), ce qui existe déjà et se reprend, ce
qu'exige le domaine (la rapidité pour le live coding, par exemple). Une recommandation qui ne cite
pas la référence mature n'est pas finie.

### Les façons de penser

- **Comment la référence mature est-elle construite ?** Avant de proposer un découpage, décris
  celui du produit mature qui fait le même travail (un transpileur : TypeScript, Babel, esbuild ;
  un moteur audio : une station audionumérique professionnelle), et dis en quoi ta proposition
  le suit ou s'en écarte, et pourquoi.
- **Découper à l'intérieur n'est pas publier en morceaux.** Les composants internes sont des
  modules avec leurs interfaces et leurs tests ; ce que le projet publie est une interface qu'il
  choisit et maîtrise. Un produit cohérent publie un seul paquet, avec une API pensée pour ses
  consommateurs (TypeScript publie `typescript`, construit de nombreux modules internes) ; un
  composant ne se publie à part que s'il a une vie propre, hors du produit.
- **L'existant de l'auteur d'abord.** Les conventions de ses projets voisins (organisation des
  paquets, numérotation, outils, vocabulaire) se reprennent avant toute invention.
- **Une question au responsable porte sa réponse par défaut** : ce que ferait le produit mature,
  et la convention existante. Le responsable arbitre un écart, il ne refait pas l'enquête.

## 3. Relever l'existant

Les faits se cherchent, ils ne se demandent pas. Avant le premier tour, un sous-agent (Explore,
« very thorough ») rend le relevé structurel décrit dans `references/releve-structurel.md`. Charge
`thermometre` pour le juger : un relevé qui compte au lieu de décrire la construction se refait.

Un projet existant décrit sa construction réelle, défauts compris : le relevé dit ce qui est, le
grill décide ce qui doit être.

## 4. Le grill d'initialisation

Charge `mattpocock-skills:grilling` et suis-le (s'il n'est pas disponible, suis le même format, et
signale au responsable que le greffon `mattpocock-skills` manque) : des tours numérotés, chaque question avec ta
recommandation et ses pièces, la frontière de l'arbre des décisions à chaque tour. Le grill ne se
résume pas, ne se saute pas, et ne se remplace pas par une réponse directe, même si le responsable
pose la question en une phrase. Les branches de l'arbre :

1. **Les objectifs** — ce que le projet doit permettre, à qui, à quel horizon ; ce qui doit rester
   vrai dans cinq ans ; ce qu'il ne fait pas (ce que fait un autre système à sa place).
2. **Les références et les exigences** — les produits matures qui font référence dans le domaine
   (ce qu'un compilateur mature, une station audionumérique professionnelle… font du même
   problème), les standards et outils existants à reprendre, les exigences propres au domaine
   (temps de réponse, fiabilité en direct, compatibilité). Elles remplissent « Comment on arbitre »
   de la charte et servent d'arbitre à toutes les branches suivantes.
3. **Le responsable** — son nom, les documents qu'il valide, la politique de poussée.
4. **Ce qui décide** — la source d'autorité (une spécification, une cible, un produit de
   référence), puis le cadre, puis le code.
5. **Les consommateurs** — qui utilise le projet ou une de ses parties, aujourd'hui et demain
   (un éditeur, un autre dépôt, une ligne de commande) ; chacun dit une frontière.
6. **Les représentations** — les données qui traversent la chaîne de traitement : texte, arbre,
   graphe, sortie ; où chacune naît, qui la lit ; une étape qui ré-analyse du texte au lieu de
   recevoir une structure est une frontière manquante.
7. **Les axes de changement** — ce qui changera (une syntaxe, une cible, un catalogue, un hôte) ;
   deux axes indépendants vivent dans deux modules.
8. **Les composants** — le découpage qui découle des branches 5 à 7, chaque frontière avec ses
   pièces ; pour chacun, les huit rubriques du cadre : rôle, reçoit, rend, connaît, ne connaît pas,
   refuse, invariants, coût. Puis la forme : un paquet ou plusieurs, bibliothèque ou service (un
   service garde `deployment/`, le démon et `.env`), TypeScript ou JavaScript.
9. **Les interfaces** — pour chaque frontière : ce qui la traverse, qui offre, qui consomme, qui
   juge quelle faute, et le garde qui la tiendra.
10. **L'architecture** — les trois ou quatre choix qui commandent le reste, chacun avec sa raison et
   l'objectif qu'il sert ; les données centrales ; où le code tourne.
11. **Le lexique** — les mots du domaine dont la définition change du code
    (`mattpocock-skills:domain-modeling`).
12. **Le premier chantier** — ce qui se construit d'abord, et ce qui attend.

Le grill est fini quand la frontière est vide, que chaque composant et chaque frontière porte ses
pièces, qu'aucune recommandation ne repose sur un raccourci du §2, et que le responsable confirme
la compréhension partagée. Rien ne s'écrit avant.

## 5. Écrire

- Les documents lus par un humain s'écrivent avec la compétence `menu` (référence
  « Les documents d'un composant ») ; la charte avec `mattpocock-skills:writing-for-agents`.
- La charte remplace chaque champ `<…>` du modèle ; aucun ne reste.
- `package.json` (nom, description, auteur, dépôt), `README.md`, `LICENSE` et `CREDITS.md` prennent
  l'identité du projet.
- Ce que la forme écarte se retire dans le même commit (les parties de service d'une bibliothèque,
  le code d'exemple du modèle).
- Chaque document se relit au responsable avant son commit : ce sont les documents qu'il valide.

## 6. Ouvrir le travail

- Une épopée pour le premier chantier ; ses tickets sous l'étiquette `a-valider`, chacun avec les
  règles et les documents qu'il touche.
- `pitmaster/SUIVI.md` : le premier tour, les questions restées ouvertes.
- Un commit `docs: initialiser le projet` qui ne contient que ces éléments.

À la fin, l'ouverture de séance ne signale plus rien : la séance suivante charge `pitmaster`.
