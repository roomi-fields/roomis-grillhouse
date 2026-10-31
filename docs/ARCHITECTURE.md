# Roomi's Grillhouse — architecture

Le dépôt du cadre : un espace de travail npm de trois paquets. La construction de chacun vit dans
son architecture (`packages/<paquet>/docs/ARCHITECTURE.md`) ; ce document les liste.

## Les composants

Chaque paquet, son rôle et son langage. Le cadre lit les langages du dépôt dans la colonne
« Langage », comme dans tout projet qui l'installe.

| Composant            | Rôle                                                                      | Langage    |
| -------------------- | ------------------------------------------------------------------------- | ---------- |
| `grillhouse`         | le paquet publié : la commande du cadre, ses scripts et leurs tests       | typescript |
| `grillhouse-essais`  | les tests de la chaîne du cadre (circuit, nuit, intégration, mise à jour) | typescript |
| `grillhouse-matiere` | la matière de test que partagent les paquets (`./test-fixtures`)          | typescript |
