# <Nom du projet> — architecture

<Ce qu'est le projet et ce qu'il fait, en deux ou trois phrases ; puis les trois ou quatre choix
qui commandent le reste, chacun avec sa raison, les données centrales et où le code tourne. Le
grill d'initialisation l'écrit.>

## Les composants

Chaque paquet, son rôle et son langage. Le cadre lit les langages du projet dans la colonne
« Langage », que le grill fixe à la conception (branche 8), comme le BUILD de Bazel nomme la règle
de chaque cible ; l'interface de chaque paquet le reprend (`**Langage** : <nom>`).

| Composant | Rôle                                             | Langage    |
| --------- | ------------------------------------------------ | ---------- |
| `.`       | <le rôle du projet, ou de chacun de ses paquets> | typescript |
