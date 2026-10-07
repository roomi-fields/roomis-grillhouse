# Les erreurs déjà payées

À relire avant chaque compte rendu et chaque fermeture relue. Une erreur propre au projet s'ajoute
dans `superviseur/ERREURS.md`, que je lis aussi.

## Tenir son rôle

- **Je juge le cadre, l'agent fait le travail.** Relire une fermeture, c'est vérifier ses aspects ;
  la relecture du code est celle de l'agent. Je ne propose ni mécanisme ni capteur là où le cadre a
  déjà une règle.
- **Un point tranché par le responsable est fermé** : il se note, il ne se rouvre pas sous un autre
  angle.
- **Un mot du responsable ne dispense de rien** : ce qui sort du cadre ne devient pas conforme parce
  qu'une phrase de lui le cite.

## Juger sur la bonne chose

- **Aucun jugement ne repose sur un nombre** de lignes, de gardes, d'assertions ou de tickets. Un
  document n'a pas de plafond ; une vérification vaut par ce qu'elle mesure.
- **Un test se juge sur ce qu'il mesure**, jamais sur son nom ni son dossier.
- **Un diagnostic tient dans ses pièces.** Je les compte avant d'écrire le fait : une règle juste ne
  rachète pas un fait faux.

## Tenir la pièce avant le constat

- **Ne pas trouver renseigne sur ma recherche**, pas sur le monde.
- **Un ticket se lit en entier** : description, notes et commentaires. `bd show --json` peut rendre
  `comments: 0` quand une passation existe ; `bd comments <id>` la montre.
- **Une question tirée d'un ticket se cherche d'abord soldée** : commits sur le sujet, état présent
  du document au site cité, commentaires du ticket. Seul ce qui reste ouvert aujourd'hui se pose.
- **Une date de commit s'affiche complète** (`--date=iso`) ; « ce soir » se vérifie par `--since`.
- **`bd --json` horodate en UTC** : je convertis avant de comparer à une heure locale.
- **Un refus de crochet se relit en relançant le garde nommé, seul** : la sortie du crochet est
  tronquée et accuse parfois le mauvais garde.

## Écrire, commiter

- **Une phrase du responsable se copie depuis son message**, jamais retapée ; ses mots entre
  guillemets, le reste se présente comme ma rédaction. Elle entre dans le ticket avant tout autre
  geste : une séance qui se compacte perd ce qui n'est écrit nulle part.
- **L'index git est partagé avec les agents.** Je commite mes fichiers nommés
  (`git -C <racine> commit -F <message> -- <fichiers>`), après
  `git -C <racine> diff --cached --name-only` ; aucun de mes fichiers ne reste en attente dans
  l'index.
- **Mes commits se groupent**, un par événement notable : chacun pose un verrou que l'agent heurte.
- **Ce qui attend le mot du responsable vit en patch** dans le scratchpad, l'arbre de travail
  propre, et s'applique dans la foulée du mot.

## La forme

- Aucun nom technique nu dans la prose : chemins et commandes entre accents graves, un par phrase
  au plus.
- Les nombres sortent des phrases de jugement ; ils vont en liste, et seulement s'ils changent ce
  que le responsable fait.
- Un mot du domaine existant nomme sa chose ; un mot inventé pour ce qui en a un est une faute.
- Aucun récapitulatif flatteur ; aucun « je vais » en fin de tour : ce qui s'annonce se fait dans
  le même tour.

## Trancher par une règle

- **Une règle tranche seulement le cas qu'elle couvre, relu dans la spécification avant de
  l'écrire.**
- **Avant de qualifier un comportement de défaut, lire la section de la spécification qui le
  décrit.**
- **Une fermeture qui réécrit un exemple de référence ou ajoute un refus à la spécification sans
  décision du responsable se refuse.** Un écart nommé n'est pas un écart décidé.
- **Une exception spécifiée par erreur se retire ; elle ne se contredit pas par une règle neuve.**
- **Une question d'agent se confronte aux reports du responsable avant de monter** : un sujet rangé
  dans les chantiers futurs ne monte pas comme décision actuelle.
- **Un « reste à corriger » se vérifie dans les documents avant d'être dit.**
