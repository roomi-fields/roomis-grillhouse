---
name: thermometre
description: >
  La mesure : mesurer sans se mentir. À charger avant : un compte ou un chiffre affirmé ; un garde ou un test
  à écrire, à éprouver ou à déclarer vert ; une absence conclue (« aucun document sur X », « rien
  ne lit ça », « code mort ») ; une affirmation sur ce que fait une référence externe.
---

# Thermomètre — mesurer sans se mentir, et prouver qu'un garde mord

Cette compétence sert l'intention 4 du métacadre (`METACADRE.md`), « La preuve avant
l'affirmation » : chaque règle dit ce que sa preuve protège. Les commandes permises et les
instruments du dépôt sont dans la charte (`CLAUDE.md`). Une mesure qui demande une commande que la
charte interdit s'écrit dans le compte rendu, et attend le responsable. Ainsi le cadre reste
intact, et la mesure manquante reste visible.

## Avant de mesurer

2. **Le cas qui sépare deux explications** : entre deux explications, tu construis le cas où elles
   donnent deux résultats différents, puis tu le mesures. Ainsi tu tranches sur une différence, et
   non sur une vérification de plus du même cas.
3. **Un témoin où l'effet doit apparaître** : chaque mesure a un cas témoin où l'effet est certain.
   Ainsi un test qui ne voit pas le témoin se répare avant de servir de preuve.
4. **La même chose d'abord** : devant un désaccord, tu vérifies que les deux parties mesurent la
   même chose, puis tu compares les chiffres. Ainsi le désaccord porte sur les faits, et non sur
   les mots.
5. **Une liste produite depuis sa source** : une liste se produit à partir de sa source, et tu
   vérifies ce que cette source contient (la liste des fichiers suivis par git omet un fichier
   neuf que le compilateur compile). Ainsi la liste couvre ce que le produit utilise vraiment.
6. **La source qui répond à la question** : tu lis la source qui correspond à ce que tu affirmes.
   Ce qui est publié se lit dans l'enregistré ; ce que la construction embarque ou ce qu'un script
   exécute se lit sur le disque ; ce que le dépôt exécute comme crochet se lit dans le chemin des
   crochets configuré. Ainsi ta mesure porte sur ce que le produit fait, et non sur une copie
   voisine.

## Pendant la mesure

7. **L'outil de mesure d'abord** : devant un résultat surprenant, tu vérifies ton test ou ta
   recherche, puis la cause que tu lui prêtes, puis le code mesuré. Ainsi un défaut de l'outil ne
   devient pas un défaut du produit.
8. **Un résultat trouvé se vérifie aussi** : une recherche qui trouve se vérifie comme une recherche
   qui ne trouve rien (son périmètre, sa casse, le type de fichier lu). Ainsi un résultat unique
   ne cache pas les autres.
10. **La sortie entière** : tu conclus sur la sortie complète d'une commande ; tu la tronques
    seulement quand tu sais déjà ce que tu cherches. Ainsi rien de ce qui contredit ta conclusion
    ne reste hors de vue.
11. **On répare l'outil, et le témoin reste** : quand un témoin contredit ton outil, c'est l'outil
    qui se corrige. Ainsi l'outil devient juste pour toutes les mesures suivantes.
12. **On répare tous les jumeaux** : un défaut corrigé dans un outil se cherche et se corrige dans
    les outils écrits sur le même modèle. Ainsi le défaut se règle à sa source, du plus large vers
    le plus spécifique.
13. **Deux défauts du même genre, une cause commune** : au deuxième défaut du même genre, tu
    cherches ce que les deux ont en commun, et tu corriges cette cause. Ainsi la correction porte
    sur le problème plus large dont les deux défauts sont les manifestations.

## Compter juste

- **Un compte par recherche de texte est un minimum** : une recherche par `grep` ou `find` donne
  un minimum. Pour savoir où vit une chose, tu passes par l'index (`rtfm_search`,
  `codegraph explore`). Ainsi un nom écrit autrement, un chemin assemblé ou un appel indirect
  entrent dans le compte.
- **Un zéro se vérifie par ses causes** : avant de croire un zéro, tu vérifies le périmètre, la
  casse, le type de fichier, la forme du motif, les accents, la délégation à une autre fonction, le
  balisage et les chemins assemblés par variables. Ainsi un zéro dit l'absence de la chose, et non
  l'étroitesse de la recherche.
- **Inventorier par les lecteurs** : un inventaire part des lecteurs dans le code, puis va aux
  données. Ainsi il compte ce que le produit utilise.
- **Un lecteur se compte par son usage** : le nombre de fichiers qui citent un chemin est un
  maximum ; les lecteurs se comptent dans le code qui l'ouvre. Ainsi une citation dans un
  commentaire ou un document ne passe pas pour un usage.
- **Un zéro se prouve par trois appuis** : l'outil trouve ce qu'il cherche sur un autre cas ; la
  comparaison des deux listes ne laisse rien dehors (par différence des listes, et non par
  égalité des comptes) ; la forme que l'outil ne sait pas lire est sondée à part. Ainsi « rien »
  se démontre.
- **Deux nombres égaux** : un relevé donne le nombre de lignes produites par l'outil et le nombre
  de lignes examinées, et les deux sont égaux. Ainsi une lecture tronquée se voit.
- **Une graine fixe** : quand le produit tire au hasard, deux sorties se comparent à graine fixe.
  Ainsi la différence mesurée vient du changement, et non du tirage.
- **Une sortie identique se qualifie** : une sortie identique veut dire que rien n'a changé, ou que
  rien n'a été regardé ; tu vérifies laquelle. Ainsi « identique » prouve la stabilité.
- **Un compte se reprend à la source** : un compte recopié d'un document se recompte à sa source
  avant d'être cité. Ainsi un chiffre cité est un chiffre actuel.
- **Un filtre se lit par ce qu'il écarte** : devant un compte qui baisse, tu lis ce que le filtre
  écarte et tu nommes chaque cas écarté. Ainsi une baisse se distingue d'un dénominateur réduit en
  silence.

## Conclure à une absence

**Une absence se démontre** : avant d'écrire « il n'existe aucun document sur X », tu cherches où
vit la décision, et non seulement où le mot apparaît. Ce qu'aucun document connu ne couvre se
signale comme un trou. Ainsi un défaut de ta recherche ne devient pas un fait du projet.

## Mesurer une interface

- **Une interface se mesure en l'exécutant** : tu appelles l'interface, tu comptes ce qu'elle rend
  et ce que les autres composants appellent vraiment. Ainsi la mesure peut contredire le code, ce
  qu'une lecture du code ne fait jamais.
- **Un import se lit en entier** : un import écrit sur plusieurs lignes se lit comme un bloc. Ainsi
  chaque nom importé compte, y compris ceux des lignes sans `from`.
- **Un motif borné par ses délimiteurs** : un motif de recherche s'ancre sur les délimiteurs de ce
  qu'il cherche. Ainsi il reste dans l'import visé et ne ramasse pas les noms de l'import voisin.
- **Un test compte comme consommateur** : un test qui utilise une interface se compte comme un
  consommateur, dans une colonne à part. Ainsi un retrait mesure tout ce qu'il casse.
- **Un consommateur sans import** : une copie locale, un contrat recopié en texte ou un miroir de
  structure consomme une interface sans l'importer ; « personne n'importe » se vérifie contre ces
  formes avant de devenir « personne ne consomme ». Ainsi un retrait ne casse pas un consommateur
  qu'aucun compilateur ne signalera.
- **Un garde se relance chez lui** : devant un échec qui dépend de l'endroit d'où tu lances, tu
  compares les répertoires de lancement et tu relances chaque garde seul, depuis son répertoire.
  Ainsi l'échec accuse le code, et non le répertoire courant.
- **Un chemin temporaire : `git status` d'abord** : devant un échec qui nomme un chemin temporaire,
  tu lances `git status`. Ainsi un fichier neuf non suivi, absent des copies, se repère avant
  d'être pris pour un défaut d'import.

## Prouver qu'un garde mord

- **Un garde se prouve par une faute injectée** : tu injectes chez toi une faute réelle, et le
  garde échoue ; tu la retires, et il passe. La faute est suivie par git quand le garde lit les
  fichiers suivis, et écrite dans la forme que le garde traque, copiée d'une vraie atteinte. Ainsi
  le garde détecte la faute réelle, et ses deux sens sont prouvés : il mord, et il se tait.
- **Le garde lui-même se met à l'épreuve** : tu injectes aussi une faute dans le garde, et son test
  la voit. Ainsi un garde aveugle à sa propre panne ne reste pas vert.
- **Chaque injection repart de la source** : chaque faute s'injecte dans une copie neuve de la
  source, jamais dans un objet déjà modifié par une autre injection. Ainsi chaque résultat mesure
  une seule faute.

## Écrire une assertion juste

Chaque assertion ci-dessous évite un vert qui ne mesure rien. Ainsi un test vert prouve ce qu'il
affirme.

1. **Elle compte ce qu'elle examine** : elle dit combien de cas elle a examinés, et échoue sur zéro.
2. **Elle vérifie une inclusion** : elle vérifie que l'attendu est présent, sans égalité stricte ni
   seuil recopié de l'état actuel.
3. **Elle échoue quand son objet disparaît** : un objet absent la fait échouer.
4. **Elle produit son état de départ** : elle crée dans le test l'état qu'elle vérifie.
5. **Elle nomme sa cause** : son échec dit quel cas a échoué.
6. **Elle reste dans le rapport** : une erreur du test lui-même la fait échouer, visible, au lieu
   de la faire sortir du rapport.
7. **Elle se relit après un déplacement** : quand son objet change de place, tu vérifies qu'elle le
   trouve encore.

## Affirmer ce que fait une référence externe

- **Une affirmation cite son niveau de preuve** : une affirmation sur un outil, une bibliothèque ou
  un système de référence dit sur quoi elle s'appuie : l'exécution, puis le code source (fichier
  et symbole), puis la documentation de son auteur. Le niveau le plus proche de l'exécution
  l'emporte. Ainsi nos propres documents ne passent pas pour la preuve de ce que fait la
  référence.
- **La référence fixe le comportement** : on reproduit ce que la référence fait, mesuré, et non
  son code ligne à ligne ; un écart mesuré se nomme. Ainsi le produit se base sur l'existant
  éprouvé.
- **Une capture de la référence ne suit pas le code** : une sortie capturée de la référence change
  seulement par une nouvelle capture, nommée. Ainsi le code ne réécrit pas la référence à son image.

## Rendre une mesure

- **Une mesure dit son axe** : tu donnes ce qu'elle mesure et ce qu'il faut pour la reproduire.
  Ainsi le lecteur sait jusqu'où elle prouve.
- **Une mesure dit ce qu'elle laisse ouvert** : tu écris ce qu'elle ne tranche pas. Ainsi le
  prochain lecteur ne la croit pas close.
- **Le symbole avec la ligne** : une citation de code donne le nom du symbole en plus du numéro de
  ligne. Ainsi la citation reste juste quand les lignes bougent.
- **« Pas mesuré » est une réponse** : quand tu n'as pas mesuré, tu réponds « pas mesuré ». Ainsi
  une supposition ne passe pas pour une mesure.
- **Ton propre travail se mesure aussi** : avant d'affirmer quelque chose sur ce que tu as fait, tu
  le mesures. Ainsi ce que tu déclares fini l'est vraiment.

## Une mesure reçue d'ailleurs

- **Tu relaies ce que tu as mesuré** : une mesure reçue se vérifie avant d'être transmise. Ainsi tu
  n'engages ta parole que sur ce que tu as prouvé.
- **La pièce d'origine** : tu lis le document, le code ou la sortie d'origine, et non le résumé
  qu'on t'en donne. Ainsi tu vérifies le fait, et non sa reformulation.
- **Un écart est une information** : quand une mesure reçue contredit ce que tu as déjà mesuré, tu
  rapportes l'écart. Ainsi la contradiction se résout sur pièces.
- **Une source se lit en entier** : une source dont tu tires une règle se lit en entier. Ainsi la
  règle tient compte de ce qui la limite.

## Quand tu corriges

- **Ce qui tenait tient encore** : après une correction, tu revérifies les observations faites
  ailleurs qui en dépendent. Ainsi une correction juste ne rend pas aveugle un outil juste.
- **Une exclusion se vérifie chez celui qu'elle protège** : quand une règle ou un garde exclut un
  cas pour protéger un composant, tu vérifies l'exclusion dans ce composant, pas là où elle est
  écrite. Ainsi elle protège vraiment ce composant.
- **Corriger, c'est remplacer** : dans un document de référence, la phrase fausse se remplace par
  la juste. Ainsi le lecteur ne trouve que la version juste.
- **Une exécution se compte par ses appels** : tu comptes les lancements d'un programme, en
  interposant un appelant qui les note, et non les lignes de sa sortie. Ainsi les sous-processus
  comptent aussi.
- **Un remplacement en masse se borne** : il exclut les documents que le responsable valide,
  remplace le chemin entier, et son diff se relit avant le commit. Ainsi le responsable garde la
  main sur ses documents, et aucun fragment de chemin ne casse un texte voisin.
