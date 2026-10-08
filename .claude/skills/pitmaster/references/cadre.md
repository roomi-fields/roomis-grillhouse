# Le cadre — ce que je vérifie, règle par règle

La charte (`CLAUDE.md`) prime sur ce fichier ; ce qu'elle dit ne se répète pas ici. Un arbitrage du
responsable qui change le cadre du projet s'écrit dans la charte, en règle.

## 1. Les outils

Des produits sur étagère, et seulement eux : Beads (`bd`) pour les tickets
(`docs/agents/issue-tracker.md`), le greffon `mattpocock-skills` pour le flux, l'index RTFM pour la
recherche, CodeGraph pour les appels. Les commandes du dépôt sont celles
de la charte.

## 2. Une matière, une adresse

Une seconde adresse pour une matière existante est une dérive majeure, quel que soit son nom.

- **Une décision vit dans le document qu'elle règle** (spécification, architecture, cadre ou
  interface du composant, charte), au présent, affirmative, avec sa raison ; jamais ce qu'elle
  écarte, jamais son histoire. Il n'y a pas de registre de décisions à part.
- **Les contrats entre composants** vivent dans l'`INTERFACE.md` du composant qui offre : la liste
  de ce qui traverse, avec le garde qui la tient. Le consommateur n'a ni fichier « frontière » ni
  « contrat ».
- **Un document qui décrit ce qu'un autre décrit déjà** se verse dans celui-ci.

- **Une décision de structure passe par le grill** (`grill`, §2 à §4) : relevé structurel,
  puis questions sur les objectifs, les consommateurs, les représentations et les axes de
  changement. Une recommandation qui repose sur la taille du code, ou sur « pas besoin pour
  l'instant » sans le fait qui rouvrira la question, se refuse.

## 3. Les documents de référence

`docs/ARCHITECTURE.md`, `docs/CADRE.md`, `docs/INTERFACE.md` (ou ceux de chaque paquet sous
`packages/<x>/docs/`), la spécification si le projet en a une, `CONTEXT.md` pour le lexique. La
charte nomme ceux que le responsable valide.

- **Un document entre relu et redressé, ou n'entre pas.** Un document faux se trouve par recherche
  et trompe le suivant.
- **Un écart document / code va dans les deux sens** : le document a vieilli, ou il porte une
  décision que le code n'honore pas. Il se tranche sur pièces ; sinon il s'écrit comme écart
  ouvert, et le responsable l'arbitre.
- **Une règle s'écrit affirmative, au présent, sans date ni auteur, à l'échelle du travail qu'elle
  cadre**, en phrases courtes et directives, dans les mots du responsable : elle nomme ses objets, l'acte qu'elle demande et ce qui se fait quand il manque. Un
  exemple l'éclaire ; une liste de cas ne la remplace pas. Une règle abstraite, qui pourrait viser
  une valeur, un document ou un paquet, se réécrit. Une rédaction, d'un agent ou
  la mienne, ne se présente jamais comme une décision du responsable.

## 4. Le flux d'une tâche

Le flux est celui de la charte ; ses compétences sont obligatoires. Ce que j'y vérifie :

- **Le gril quand il reste une décision à prendre, le plan quand elle est prise.** L'agent décide
  seul du gril ; ses questions vont dans le ticket.
- **Le ticket suit le geste** : ouvert avant le premier commit, fermé quand le travail l'est.
  Chaque commit cite un ticket ouvert avant lui.
- **Un ticket nomme ses documents à l'ouverture** ; à la fermeture, chacun a bougé.

## 5. Les vérifications

- **Quatre critères** pour qu'une vérification entre : elle refuse un défaut réel dont l'échec
  d'origine est nommé dans son fichier ; elle se tait quand tout va bien ; son temps est borné ;
  aucune autre ne mesure la même chose.
- **Un registre de plafonds** ne bouge que vers le bas. Une valeur ajustée pour passer est une
  dérive.
- **Un commentaire dit ce que la chose est, au présent** : la décision vit dans le document qu'elle
  règle, la mesure dans son ticket.
- **La charte grandit sur un échec réel, d'une ligne, à la place d'une autre.** Une ligne ajoutée
  sans ligne retirée se signale.

## 6. La file ne s'arrête pas

- Tant qu'un ticket tranché du chantier courant attend, un agent tourne.
- Aucun motif d'arrêt ne s'accepte par moi : terme atteint, durée de séance, état propre. S'il en
  existe un, le responsable le juge.
- Un ticket qui attend le responsable ne bloque pas la file : la question s'inscrit dans le ticket
  et dans `pitmaster/SUIVI.md`, le ticket suivant part.

## 7. Ce qui monte vers le responsable

- **Je cherche la règle avant de monter** : documents de référence, `SUIVI.md`, mémoire,
  commentaires du ticket. Un point déjà tranché ne remonte pas.
- **Un point qui monte porte son exemple et son impact**, jamais une question nue, un renvoi à un
  ticket ou un « à valider ».
- **Ce qui découle d'une décision du responsable se tranche par moi**, au plus simple.

## 8. Les commandes qui demandent une validation

Une invite gèle l'agent jusqu'au passage du responsable. Les causes : un chemin d'écriture hors du
scratchpad de session, un `cd` dans une commande composée, une suppression. La consigne les
interdit. Une redirection du shell (`>`, `>>`, `tee`) vers le dépôt est un chemin hors du
scratchpad : mes propres fichiers s'écrivent par les outils Write et Edit. Un agent silencieux
longtemps se vérifie d'abord sur ce point.
