# Le cadre — ce que je vérifie, règle par règle

La charte (`CLAUDE.md`) prime sur ce fichier ; ce qu'elle dit ne se répète pas ici. Un arbitrage du
responsable qui change le cadre du projet s'écrit dans la charte, en règle. Ainsi la charte reste la
seule adresse du cadre du projet.

## 1. Les outils

Le cadre s'appuie sur des produits sur étagère, toujours présents : Beads (`bd`) pour les tickets
(`docs/agents/issue-tracker.md`), le greffon `mattpocock-skills` pour le flux, RTFM pour la
recherche, CodeGraph pour les appels. Les commandes du dépôt sont celles de la charte. Ainsi le
projet se base sur l'existant, et chaque agent trouve les mêmes outils.

## 2. Une matière, une adresse

Chaque matière a une seule adresse ; une seconde adresse, quel que soit son nom, est une dérive
majeure. Ainsi un lecteur trouve une seule version vraie.

- **Une décision vit dans le document qu'elle règle** (spécification, architecture, cadre ou
  interface du composant, charte), au présent, avec sa raison, sans ce qu'elle écarte ni son
  histoire ; ce document est son seul registre. Ainsi l'architecture dit l'état décidé, au seul
  endroit où on la cherche.
- **Les contrats entre composants** vivent dans l'`INTERFACE.md` du composant qui offre : la liste
  de ce qui traverse, avec le garde qui la tient. Le consommateur lit cette liste chez l'offrant,
  sans en tenir de copie. Ainsi une interface a un seul texte, et son garde le tient.
- **Une décision de structure passe par le grill** (`grill`, §2 à §4) : relevé structurel, puis
  questions sur les objectifs, les consommateurs, les représentations de données et les axes de
  changement, tranchées sur ce que ferait un produit professionnel et mature du domaine. Je refuse
  une recommandation fondée sur la taille du code, ou sur « pas besoin pour l'instant » sans le fait
  qui rouvrira la question. Ainsi le projet construit une architecture robuste et pérenne, qui
  permet d'atteindre ses objectifs.

## 3. Les documents de référence

`docs/ARCHITECTURE.md`, `docs/CADRE.md`, `docs/INTERFACE.md` (ou ceux de chaque paquet sous
`packages/<x>/docs/`), la spécification si le projet en a une, `CONTEXT.md` pour le lexique. La
charte nomme ceux que le responsable valide.

- **Un document faux se corrige avant d'entrer** : un document entre dans le dépôt relu et corrigé,
  ou reste dehors. Ainsi chaque document trouvé par recherche dit vrai.
- **Un écart entre document et code se lit dans les deux sens** : le document a vieilli, ou il porte
  une décision que le code n'honore pas. Je le tranche sur pièces ; sinon il s'écrit comme écart
  ouvert, que le responsable arbitre. Ainsi l'architecture décidée reste celle que le code suit.
- **Une règle s'écrit selon le métacadre** (`METACADRE.md`, §2) : elle sert une intention du cadre
  et la nomme.
- **Une rédaction se présente comme une rédaction** : une rédaction, d'un agent ou la mienne, se
  présente comme la nôtre ; seule une décision du responsable, citée mot pour mot, se présente
  comme la sienne. Ainsi le responsable reste le seul à décider de l'essentiel.

## 4. Le flux d'une tâche

Le flux est celui de la charte, et toutes ses compétences s'appliquent. Ce que j'y vérifie :

- **Une décision ouverte se grille avant le plan** : quand une décision reste à prendre, l'agent la
  grille avant d'écrire son plan, et les questions vont dans le ticket. Ainsi une décision se prend
  avant le code, jamais dans le code.
- **Le ticket suit le geste** : il s'ouvre avant le premier commit et se ferme avec le travail.
  Chaque commit cite un ticket ouvert avant lui. Ainsi chaque changement du dépôt se relit avec son
  ticket.
- **Un ticket nomme ses documents à l'ouverture** ; à la fermeture, chacun a bougé. Ainsi
  l'architecture écrite suit le code dans le même mouvement.

## 5. Les vérifications

- **Une vérification entre sur quatre critères** : elle refuse un défaut réel, dont l'échec
  d'origine est nommé dans son fichier ; elle se tait quand tout va bien ; son temps est borné ; elle
  seule mesure ce qu'elle mesure. Ainsi chaque vérification prouve quelque chose, sans bruit.
- **Un plafond ne remonte jamais** : quand une vérification tolère des défauts jusqu'à un plafond,
  ce plafond baisse avec les corrections et ne remonte jamais. Ainsi le compte mesure le progrès
  réel.
- **Un commentaire dit ce que la chose est, au présent** ; la décision vit dans le document qu'elle
  règle, la mesure dans son ticket. Ainsi le code se lit sans son histoire, et chaque fait garde
  une seule adresse.
- **La charte grandit sur un échec réel, d'une ligne, à la place d'une autre.** Je signale une ligne
  ajoutée sans ligne retirée. Ainsi la charte reste courte, et chaque règle répond à un échec vécu.

## 6. La file ne s'arrête pas

- **Un agent tourne** tant qu'un ticket tranché du chantier courant attend. Ainsi le travail décidé
  avance sans attendre une relance du responsable.
- **L'arrêt appartient au responsable** : je continue tant que la file a des tickets tranchés ; un
  motif d'arrêt, par exemple un état propre, c'est le responsable qui le juge. Ainsi l'arrêt du
  travail reste sa décision.
- **Une attente ne bloque pas la file** : un ticket qui attend le responsable laisse partir le
  suivant ; sa question s'inscrit dans le ticket et dans `pitmaster/SUIVI.md`. Ainsi une décision
  en attente ne retient pas le travail qui n'en dépend pas.

## 7. Ce qui monte vers le responsable

- **Un point qui monte porte son exemple et son impact** ; une question nue, un renvoi à un ticket
  ou un « à valider » se réécrit avant de monter. Ainsi le responsable décide sur pièces.
- **Ce qui découle d'une décision du responsable, je le tranche**, au plus simple. Ainsi il décide
  l'essentiel, et la suite s'en déduit sans lui.

## 8. Les commandes sans invite

Mes propres fichiers s'écrivent par les outils Write et Edit, jamais par une redirection du shell
(`>`, `>>`, `tee`) vers le dépôt. Ainsi aucune de mes écritures ne gèle la séance sur une invite.

Un agent silencieux longtemps se vérifie d'abord sur une invite en attente. Ainsi un agent gelé
repart sans attendre le passage du responsable.
