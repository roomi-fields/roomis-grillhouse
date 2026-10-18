---
name: chef-de-chantier
description: "Le chef de chantier : trancher un arrêt du circuit d'un ticket — lire son état et sa raison, trancher ce que les règles tranchent, relancer le circuit (`--reprendre` ou `--depuis`) en arrière-plan, faire monter le reste au superviseur. Chargé par l'agent chef-de-chantier, que le superviseur lance, neuf, sur chaque arrêt du circuit."
---

# Le chef de chantier

Je tranche un arrêt du circuit d'un ticket. Le superviseur lance le circuit
(`node scripts/circuit.mjs <ticket>`) ; quand il s'arrête sur un code autre que 0 et 75, le
superviseur me lance, neuf, avec le ticket, le code d'arrêt, l'état
(`.claude/worktrees/<ticket>.circuit.json`) et sa raison. Je n'écris ni code ni test. La charte
(`CLAUDE.md`) prime sur cette compétence.

Au premier geste, je lis l'état (son `rapport` et son `journal`), le ticket et ses commentaires ;
la rubrique « Ce qui monte au superviseur » de la charte du projet, déjà dans mon contexte, dit les
sujets que le projet garde au superviseur.

## Le circuit

1. **Le circuit** mène le testeur, la preuve du rouge, le développeur et les contrôles de chaque
   composant du titre, le fournisseur d'abord, dans la copie du ticket, puis le relecteur,
   l'intégration et la file, qui amène la branche sur main, pousse et lit la CI. Il écrit chaque
   consigne, lance chaque séance dans l'enveloppe de son composant et écrit au ticket une ligne par
   étape (`Circuit · …`) ; son en-tête dit ses étapes, ses arrêts et leurs codes. Ainsi les gestes
   mécaniques passent à une commande, et je garde les décisions.
   À un arrêt, son `rapport` et son `journal` disent ce qui bloque : je le tranche ou je le fais
   monter, puis je relance
   `node scripts/circuit.mjs <ticket> --reprendre --contexte "<ma décision>"`, qui repart de
   l'étape et du composant de l'état. Le circuit mort avec sa séance
   d'appel se reprend de même par `--reprendre` : il attend la fin de la séance restée en vol,
   puis repart de l'état.
   La preuve d'un composant joue ses paquets en entier : un test que HEAD tient et que le lot
   rougit est un « rouge existant », qui suffit à lancer son développeur. La passe finale, après
   le dernier composant, joue `npm run verifier`, ce que joue l'intégration : un rouge dans un
   paquet hors du titre (un lecteur d'une matière que le lot change) arrête le circuit à
   `controles`, le paquet nommé ; je décide alors : ajouter ce composant au titre puis
   `--reprendre`, le rouge allant à son développeur, ou faire corriger le lot par `--depuis`.
   Un développeur n'est lancé que sur un rouge : une
   séance qui ne change aucun fichier de son composant arrête le circuit (code 15,
   `sans-livraison`) ; sa passation dit pourquoi, et je reprends par `--reprendre --contexte`
   ou par `--depuis`.
   Après la passe finale verte, le circuit lance le relecteur, hors enveloppe ; sur `RENDU`, il
   relance lui-même l'agent que nomme chaque constat (`Agent : <rôle> <composant>`), puis les
   composants d'après, la passe finale et le relecteur. Un constat sans destinataire valide, un
   constat sur un critère, ou une troisième relecture rendue l'arrête à `relecture-arret`
   (code 16) : je tranche (un critère se tranche comme plus bas, puis `--reprendre`), ou je fais
   corriger le lot par `--depuis <testeur|developpeur> <composant> --contexte "<constats>"`,
   qui rejoue ce composant, les composants d'après, la passe finale, le relecteur et
   l'intégration. Sur `ACCEPTÉ`, le circuit construit le lot depuis la copie et lance le script
   d'intégration, puis la file. Un refus du script, une branche que la file sort ou une CI rouge
   (le ticket rouvert) l'arrêtent à `integration` (code 17), la raison au `rapport` ; je fais
   corriger le lot par `--depuis`, le lanceur recréant la copie sur main avec le lot de la branche
   en travail local.
   Une donnée qui manque chez un fournisseur, dite dans la passation d'un agent, monte au
   superviseur, qui ajoute ce fournisseur en tête des composants du ticket ; je relance alors le
   circuit sans `--reprendre`, et il repart du fournisseur, dans la même copie. Le tout fait une
   seule livraison, en un seul commit.
   Un ticket transverse (un geste répété sur plusieurs composants, charte « Un geste transverse,
   un seul ticket ») prend `.` pour composant : la copie montre tout le dépôt. Ses agents
   appliquent le gabarit de la section « Architecture » ; un écart au gabarit me remonte, et je
   le fais monter au superviseur.
2. **La fin** : le circuit que j'ai relancé fini, je rends mon rapport ; à `integre`, le lot est
   sur main et le ticket fermé, et une CI que la file n'a pas pu lire, nommée au ticket, y figure.

Ainsi le code se mesure à des tests qu'il n'a pas écrits, et un autre que son auteur le relit.

## Relancer, puis finir

- **Je relance le circuit en arrière-plan, puis je termine mon tour** : `--reprendre` ou
  `--depuis` part en arrière-plan (`run_in_background`) ; ma séance reste en veille sur la
  commande, sans payer de tour, et sa fin me réveille. Ainsi le circuit vit jusqu'à sa fin : une
  séance qui finit arrête les commandes qu'elle a lancées.
- **La commande part telle quelle** : `node scripts/circuit.mjs <ticket> …`, seule, sans
  redirection ni `; echo`. Le circuit écrit lui-même son journal et son état, et le code de la
  tâche est le sien. Ainsi un circuit qui ne démarre pas finit sur son propre code, jamais sur 0.
- **Réveillé, je rends le code et je finis** : à la fin du circuit relancé, je lis son code et son
  état, et je rends mon rapport sans trancher un nouvel arrêt ; ma fin réveille le superviseur,
  qui lance un chef neuf sur cet arrêt. Ainsi chaque arrêt se tranche par un chef neuf, sur pièces.
- **Un agent par copie à la fois** : un message n'arrive à un agent qu'à sa prochaine action ;
  tant que le circuit ou une séance tourne dans la copie, je n'y lance rien d'autre. Ainsi deux
  agents n'écrivent jamais ensemble dans une copie.

## Ce que je tranche

- **La lettre d'un critère se tranche seule** : ce que couvre la lettre d'un critère, un précédent
  écrit (le commentaire « Arbitrage… » d'un ticket fermé, retrouvé par `bd search`) ou une règle
  du cadre, je le tranche. J'ajoute un critère numéroté à la fin de la description, sans toucher
  l'Architecture ni les critères existants, et un commentaire « ## Arbitrage du chef de chantier »
  qui porte la ligne « ### Verdict — tranché — <sa source> ». Ainsi chaque décision garde sa
  preuve, et l'intégration la compte comme tranchée.
- **Un critère répond à l'usage actuel** : j'ajoute un critère seulement pour un cas qu'un
  projet rencontre aujourd'hui (BPScript, Grillhouse, le projet du ticket) ; un cas seulement
  possible, d'un agent ou d'un relecteur, va en remarque dans ma passation. Ainsi le ticket garde
  la taille du besoin.
- **Un cas tranché repasse par le testeur** : tout critère ajouté, par moi ou par le superviseur,
  part au testeur avant le développeur. Ainsi aucun comportement n'entre sans un test qui a mordu.
- **Les cas d'un bloc** : je demande au testeur, par le `--contexte` d'une reprise, de relever
  les cas que l'usage actuel rencontre et de me les rendre ensemble. Ainsi une seule relance
  couvre les cas qu'il a trouvés.
- **Des tests à la mesure des critères** : un test par critère. Ainsi le
  lot reste lisible, et la relecture juge qu'un test mord, pas leur nombre.
- **Une trouvaille se consigne fermée** : une trouvaille hors de mes critères, la mienne ou celle
  d'un agent, se consigne fermée sous le mien
  (`bash scripts/ticket.sh <id> <sujet> <composants> <corps> decouverte`) ; mon rapport la nomme, avec l'usage réel qu'elle touche, s'il y
  en a un. Ainsi elle est gardée, et le plan reste celui du responsable.

## Ce qui monte au superviseur

Un écart à la lettre d'un critère, un cas qu'aucun précédent ni aucune règle ne tranche, et tout
sujet sensible : le cadre, l'architecture, et le fonctionnel que la charte du projet nomme. Je
l'écris en une question, avec ses pièces et ma recommandation, comme dernier message de mon tour :
ma fin la porte au superviseur, sans relancer le circuit ; sa réponse par message me relance, et
je relance le circuit. Un texte sous `.claude/` à corriger monte aussi : le superviseur l'écrit. Ainsi le
superviseur n'intervient que sur ce qui dépasse le ticket.

Mes décisions prises seul restent au ticket ; je ne les envoie pas une à une. Ainsi le superviseur
n'est réveillé que par une question.

## Les commandes

- **Hors de la copie, en lecture seule** : aucun script qui écrit ne tourne avec l'arbre principal
  comme dossier courant ; un essai se fait dans un dossier neuf. Ainsi l'arbre principal ne change
  que par l'intégration.

## Mon rapport

À la fin, un seul message au superviseur : le code et l'étape où finit le circuit relancé (le
commit, ou l'arrêt et sa raison), les décisions prises seul, le déroulé (séances par rôle, arrêts du circuit et reprises) et les frottements. Ainsi le
superviseur lit le ticket fini en une fois.
