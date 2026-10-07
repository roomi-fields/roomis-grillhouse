---
name: thermometre
description: >
  La mesure : mesurer sans se mentir. À charger avant : un compte ou un chiffre affirmé ; un garde ou un test
  à écrire, à éprouver ou à déclarer vert ; une absence conclue (« aucun document sur X », « rien
  ne lit ça », « code mort ») ; une affirmation sur ce que fait une référence externe.
---

# Thermomètre — mesurer sans se mentir, et prouver qu'un garde mord

Cette page dit comment mesurer. Ce qui est tranché vit dans le document qu'il règle, les exigences
du dépôt et ses instruments dans la charte (`CLAUDE.md`), y compris les commandes permises. Une
mesure qui exige une commande que la charte interdit attend : elle s'écrit dans le compte rendu.

## Avant de mesurer

1. **Demande d'abord si ton axe peut voir l'effet cherché.** Un axe qui ne bouge pas ne prouve rien
   tant que tu n'as pas montré qu'il **pouvait** bouger.
2. **Construis le cas où deux lectures divergent, avant de trancher entre elles.** Une vérification
   de plus sur le même cas ne tranche rien.
3. **Pose un témoin de discrimination**, où l'effet **doit** apparaître. Sans lui, ta mesure prouve
   seulement que ton test ne mesure rien.
4. **Quand un désaccord surgit, vérifie d'abord que vous mesurez le même mot** — avant les chiffres.
5. **Dérive plutôt qu'écrire à la main**, puis demande ce que ta source **contient** : l'inventaire
   du dépôt omet ce qui n'est pas suivi, que ton compilateur, lui, compile.
6. **Choisis ta source sur ce que ton instrument prétend mesurer.** Ce qui est **publié** →
   l'enregistré ; ce que la construction **embarque** → le disque ; ce qu'un script **exécute à
   l'instant** → le disque ; ce que le dépôt exécute comme **crochet** → le chemin des crochets
   configuré.

## Pendant

7. **Suspecte l'instrument avant le sujet — puis la cause que tu lui prêtes.**
8. **Suspecte aussi un instrument qui affirme.** Une recherche qui rend **un** se mesure comme une
   qui rend zéro : périmètre, casse, nature du fichier.
9. **Ralentis quand tu viens de trouver quelque chose.** La satisfaction d'avoir trouvé fait sauter
   la vérification que l'instrument répond à la question posée.
10. **Conclus sur la source entière, jamais sur une sortie coupée.** Tronque une sortie (`| tail`)
    seulement quand tu sais ce que tu cherches.
11. **Répare le lecteur, jamais le témoin.** Un témoin ajusté verdit et laisse ton instrument faux.
12. **Répare la famille, pas l'occurrence.** Un défaut corrigé dans un outil survit dans son jumeau.
13. **Au deuxième défaut de la même famille, cherche ce que les deux ont en commun** avant de
    corriger.

## Ce qui fait mentir un comptage

- **Un compte par graphie est un plancher, jamais un total** — et il ne distingue pas l'**emploi**
  d'une graphie de sa **mention**. Un relevé par `grep` ou `find` rate l'intermédiaire, la forme
  non textuelle ; l'index (`rtfm_search`, `codegraph explore`) trouve où vit la chose. Causes de
  zéro trompeur : le périmètre, la casse, la nature du fichier, la forme du motif, les
  diacritiques, la délégation, le balisage, un chemin assemblé par variables.
- **Pour inventorier, change de point d'entrée** : cherche les **lecteurs dans le code**, pas les
  occurrences dans les données.
- **Une mention n'est pas un lien.** Compter les fichiers qui *citent* un chemin rend un plafond,
  pas un compte de lecteurs.
- **Un zéro se ferme par trois appuis** : l'instrument mord ailleurs · rien n'est laissé dehors
  (différence d'ensembles, pas égalité de comptes) · la forme qu'il ne sait pas voir est sondée.
- **Un relevé se rend avec deux nombres égaux** : les lignes que l'instrument a produites, et celles
  qui ont été qualifiées.
- **Une comparaison de production se fait à graine figée** quand le produit tire au hasard.
- **Une sortie identique se lit dans les deux sens** : *rien n'a bougé*, ou *rien n'a été regardé*.
- **Un compte recopié devient faux sans que personne le sache.** Recompte à la source.
- **Un compte qui baisse sans signalement ressemble trait pour trait à un compte juste.** Un filtre
  qui écarte un cas fait tomber le dénominateur en silence ; demande ce que le filtre écarte, pas ce
  qu'il garde.

## Ne pas trouver est une information sur ta recherche

Le signal d'arrêt : tu t'apprêtes à écrire « il n'existe aucun document sur X ». Un balayage dit où
un **mot** apparaît, jamais où l'**autorité** vit. Ce qu'aucun domicile connu ne couvre est un
**trou à signaler**, pas une absence à conclure.

## Mesurer une interface : l'exécuter

Une description tirée d'une **lecture** du code ne peut pas diverger de lui : toute lecture la
confirme. Seule l'exécution la dément — ouvre l'interface, compte ce qu'elle **rend**, et compte ce
que les autres composants **ouvrent** vraiment.

- **Le texte se lit en entier, pas ligne à ligne.** Un import étalé sur plusieurs lignes n'est vu
  que par celle qui porte `from`.
- **Ancre le motif sur les délimiteurs** : un motif paresseux traverse les imports d'à côté.
- **Un test est un consommateur.** Un retrait le casse comme de la production ; il se compte à part.
- **Un consommateur à qui l'on interdit d'importer est invisible à tout relevé d'imports** : un
  miroir structurel, un contrat recopié en prose, une copie locale. « Personne n'importe » ne veut
  jamais dire « personne ne consomme ».
- **Un instrument qu'on ne peut pas pointer sur un cas connu rend un silence, pas un zéro.**
- **Un rouge peut n'accuser que l'endroit d'où tu lances** : compare les répertoires de lancement,
  relance chaque garde seul chez lui.
- **Devant un rouge qui nomme un chemin temporaire : `git status` d'abord** — un fichier neuf non
  suivi manque aux copies.

## Prouver qu'un garde mord

**La morsure se prouve par injection, chez soi, et dans les deux sens** : mordre *et* se taire.
Abaisser un seuil prouve qu'il **compare**, pas qu'il **détecte**. Le témoin injecté est **vu**
(suivi par le dépôt si le garde énumère les fichiers suivis) et **reconnu** (écrit dans la graphie
que le garde traque — copie celle d'une atteinte réelle). **Injecte la faute dans le juge, pas
seulement dans l'accusé.** **Une sonde d'injection repart de la source**, jamais du même objet.

## Les sept fautes de forme d'une assertion

Chacune rend un vert qui ne mesure rien. Une assertion juste :

1. **compte ce qu'elle a examiné, et refuse d'avoir examiné zéro** ;
2. **affirme une inclusion**, pas une égalité ni un seuil calé sur l'existant ;
3. **parle encore quand son objet disparaît** ;
4. **se produit son état**, elle ne va pas le chercher ;
5. **nomme sa cause** : un garde qui rougit en bloc ne discrimine rien ;
6. **capture tout** : un garde qui échoue fort ne rougit pas, il disparaît ;
7. **se rejuge après un déplacement** : un contrôle ne signale pas qu'il a perdu son objet.

## Affirmer ce que fait une référence externe

Une affirmation sur ce que fait un outil, une bibliothèque ou un système de référence cite son
**niveau** : l'exécution (le plus fort), puis le code source (fichier et symbole), puis la
documentation de son auteur, puis nos propres documents, qui ne prouvent jamais le comportement de
la référence. Entre deux niveaux, l'inférieur gagne.

## Quand tu rends une mesure

- **Donne son axe et son piège de reproduction.**
- **Dis ce que ta mesure ne tranche pas.** Le prochain qui la lit la croira close.
- **Cite le symbole en plus du numéro de ligne** : une ligne se périme sans rien casser.
- **« Pas mesuré » est une réponse complète.**
- **Mesure ton propre périmètre avant d'en affirmer quoi que ce soit.**

## Quand une mesure te vient d'ailleurs

- **Relaie seulement ce que tu as mesuré** : le relayer t'engage.
- **Va à la pièce, pas au relais.**
- **Quand une mesure reçue contredit une pièce que tu portes déjà, l'écart est l'information.**
- **Relis entière une source dont tu tires une loi.**

## Quand tu corriges

- **Vérifie qu'une observation faite ailleurs tient encore** après ta correction.
- **Prouve une exclusion chez celui qu'elle protège**, pas chez celui qui l'écrit.
- **Ajouter n'est pas corriger** : dans une référence, on **remplace**.
- **Compte une exécution par ses invocations, pas par sa sortie.**
- **Un remplacement en masse exclut de son motif les documents que le responsable valide**, remplace
  le chemin entier, jamais un fragment, et son diff se relit avant le commit.
