# La charte commune : le module de la preuve

Les règles de la charte commune sur la preuve d'un ticket : son rouge et la taille de ses tests.

**Le rouge prouve le travail du ticket** : un test qui échoue avant le code prouve qu'avant le
travail le comportement manque, et qu'après il est là ; c'est son seul sens. Seul un test qui
porte le travail du ticket rougit donc d'abord ; les autres sont verts avant le code, sans
justification à donner. Chaque sorte de test prouve une chose :

| Sorte | Ce qu'elle prouve | Rouge avant le code |
|---|---|---|
| Test du comportement développé | Le ticket fait ce que dit son critère | Oui : c'est la preuve du travail |
| Test d'un défaut corrigé | Le défaut est reproduit, puis corrigé | Oui : il montre le défaut |
| Test d'un comportement existant | Le lot ne casse rien | Non : vert attendu |
| Test d'interface | Un paquet tient ce qu'il publie | Oui s'il porte le travail du ticket, sinon non |
| Banc de temps, témoin de temps | Un temps reste sous sa borne | Non : mesuré la nuit |
| Test de nuit | Le produit entier, monté dans un projet d'essai | Oui s'il porte le travail du ticket, joué la nuit |

Ainsi la preuve du rouge mesure le travail, et aucun test ne rougit pour la forme. La preuve, ce
qu'elle joue et ce qu'elle refuse : le document des tests (§5.2).

**La taille d'un test suit la pyramide** (la pyramide des tests de Google, les tailles de
Bazel) : un test petit vérifie son module par son interface, sans processus ; un test moyen
assemble quelques modules sur la machine, avec des processus locaux ; un test grand monte un
projet d'essai et y lance le produit ou le cadre entier : il est un test de nuit (`*.nuit.test.*`,
`*_nuit_test.py`, un module de `tests/it_nuit/` en Rust), jamais joué au fil du travail. Chaque
test prend la plus petite taille qui prouve son critère, dans Grillhouse comme dans chaque projet.
La garde des tailles (`grillhouse tailles-des-tests`) refuse un grand test de jour, et la dette
inscrite des grands tests existants ne fait que baisser (les gardes : le document des tests, §3.4). Un
test de jour valide le code en l'important : lancer la commande grillhouse (son binaire, un
script du cadre) est réservé aux tests de bout-en-bout, sous un dossier `e2e/`, et la même garde
refuse les autres. Un test qui a besoin d'un autre paquet construit — le binaire ou la
bibliothèque d'un composant, dans quelque langage — le déclare en dépendance (ses `dependencies`,
comme la `data` d'une cible Bazel) : le graphe le construit avant ses tests et le cache le garde,
si bien qu'un lot qui ne touche pas ses sources le reprend sans le reconstruire. Un tel test reste
un test de jour ; seul un test qui monte le produit entier dans un projet d'essai est un test de
nuit. Un test qui lance le binaire d'un paquet sans déclarer qu'il en dépend plante le jour, faute
de l'avoir construit. Ainsi le jour reste court, le petit CPU ne reconstruit que ce qui a changé,
et la preuve longue tourne la nuit.
