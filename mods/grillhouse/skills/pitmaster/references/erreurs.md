# Les pièges des outils

Ce que les outils du dépôt cachent, et que ni un script ni une autre règle ne couvre.

## Lire juste

- **`bd show --json` peut taire la passation** : un ticket se lit par `bd show <id>` puis
  `bd comments <id>`, description, notes et commentaires.
- **`bd --json` donne l'heure en UTC** : je la convertis avant de la comparer à une heure locale.
- **Une date de commit s'affiche complète** (`--date=iso`), et « ce soir » se vérifie par
  `--since`.
- **La sortie d'un crochet est tronquée** et accuse parfois le mauvais garde : je relance seul le
  garde nommé avant de dire la cause d'un refus.
- **Un compactage perd ce que le résumé ne cite pas** : une décision se cherche dans la
  transcription avant d'être dite absente.

## Écrire à côté des agents

- **L'index git est partagé** : je commite mes seuls fichiers, nommés
  (`git -C <racine> commit -F <message> -- <fichiers>`), après
  `git -C <racine> diff --cached --name-only`.
- **Chaque commit pose un verrou que l'agent heurte** : je groupe mes commits, un par événement
  notable.
- **Ce qui attend le mot du responsable vit en patch dans le scratchpad** : l'arbre de travail
  reste propre, et le patch s'applique dès son mot.
