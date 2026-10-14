---
name: mesure
description: >
  La mesure : mesurer sans se mentir. À charger avant : un compte ou un chiffre affirmé ; un garde ou un test
  à écrire, à éprouver ou à déclarer vert ; une absence conclue (« aucun document sur X », « rien
  ne lit ça », « code mort ») ; une affirmation sur ce que fait une référence externe.
---

# Mesure — mesurer sans se mentir, et prouver qu'un garde mord

Cette compétence sert l'intention 4 du métacadre, « La preuve avant l'affirmation » : chaque règle
dit ce que sa preuve protège. Une mesure qui demande une commande que la charte interdit s'écrit
dans le compte rendu, et attend le responsable.

## Avant de mesurer

1. **Un axe qui peut voir l'effet** : avant de mesurer, tu montres que ton axe peut bouger sous
   l'effet cherché. Ainsi un axe immobile ne passe pas pour une absence d'effet.
2. **Le cas qui sépare deux explications** : entre deux explications, tu construis le cas où elles
   donnent deux résultats différents, puis tu le mesures. Ainsi tu tranches sur une différence, et
   non sur une vérification de plus du même cas.
3. **Un témoin où l'effet doit apparaître** : chaque mesure a un cas témoin où l'effet est certain.
   Ainsi un test qui ne voit pas le témoin se répare avant de servir de preuve.
4. **La même chose d'abord** : devant un désaccord, tu vérifies que les deux parties mesurent la
   même chose, puis tu compares les chiffres. Ainsi le désaccord porte sur les faits, et non sur
   les mots.
5. **Une liste produite depuis sa source** : une liste se produit à partir de sa source, et tu
   vérifies ce que cette source contient. Ainsi la liste couvre ce que le produit utilise
   vraiment.
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
9. **Ralentir après une trouvaille** : quand tu viens de trouver, tu vérifies que ton outil répond
   à la question posée, et non à sa voisine. Ainsi la satisfaction de trouver ne saute pas la
   vérification.
10. **La sortie entière** : tu conclus sur la sortie complète d'une commande ; tu la tronques
    seulement quand tu sais déjà ce que tu cherches. Ainsi rien de ce qui contredit ta conclusion
    ne reste hors de vue.
11. **On répare l'outil, et le témoin reste** : quand un témoin contredit ton outil, c'est l'outil
    qui se corrige. Ainsi l'outil devient juste pour toutes les mesures suivantes.
12. **On répare tous les jumeaux** : un défaut corrigé dans un outil se cherche et se corrige dans
    les outils écrits sur le même modèle. Un jumeau immuable, comme un message de commit poussé, se
    marque ailleurs, et tu le dis. Ainsi le défaut se règle à sa source, du plus large vers le plus
    spécifique.
13. **Deux défauts du même genre, une cause commune** : au deuxième défaut du même genre, tu
    cherches ce que les deux ont en commun, et tu corriges cette cause. Ainsi la correction porte
    sur le problème plus large dont les deux défauts sont les manifestations.

## Compter juste

- **Un compte par recherche de texte est un minimum** : une recherche par `grep` ou `find` donne
  un minimum. Pour savoir où vit une chose, tu passes par l'index (`rtfm_search`,
  `codegraph explore`) ; dans une enveloppe, qui n'en montre aucun, tu lis ton paquet en entier.
  Ainsi un nom écrit autrement, un chemin assemblé ou un appel indirect
  entrent dans le compte.
- **Un zéro se prouve par trois appuis** : l'outil trouve ce qu'il cherche sur un autre cas ; la
  comparaison des deux listes ne laisse rien dehors (par différence des listes, et non par
  égalité des comptes) ; la forme que l'outil ne sait pas lire est sondée à part. Ainsi « rien »
  se démontre.
- **Deux nombres égaux** : un relevé donne le nombre de lignes produites par l'outil et le nombre
  de lignes examinées, et les deux sont égaux. Ainsi une lecture tronquée se voit.
- **Un compte se reprend à la source** : un compte recopié d'un document se recompte à sa source
  avant d'être cité. Ainsi un chiffre cité est un chiffre actuel.
## Conclure à une absence

**Une absence se démontre** : avant d'écrire « il n'existe aucun document sur X », tu cherches où
vit la décision, et non seulement où le mot apparaît. Ce qu'aucun document connu ne couvre se
signale comme un trou. Ainsi un défaut de ta recherche ne devient pas un fait du projet.

## Mesurer une interface

- **Une interface se mesure en l'exécutant** : tu appelles l'interface, tu comptes ce qu'elle rend
  et ce que les autres composants appellent vraiment. Ainsi la mesure peut contredire le code, ce
  qu'une lecture du code ne fait jamais.
- **Trois instruments, chacun aveugle** : le manifeste voit ce qu'un composant déclare publier,
  l'appel réel ce qu'un autre ouvre vraiment, le garde ce qu'un composant défend. Un relevé dit de
  quel instrument il vient, donc ce qu'il ne voit pas. Ainsi aucune mesure d'une interface ne passe
  pour un total.
- **Une sonde accepte tout ce qui est valide** : elle accepte chaque valeur que l'interface peut
  légitimement rendre (« rien » pour un refus, un objet sans prototype). Ainsi un échec de la sonde
  accuse l'interface, et non l'observateur.
- **Un consommateur sans import** : une copie locale, un contrat recopié en texte ou un miroir de
  structure consomme une interface sans l'importer ; « personne n'importe » se vérifie contre ces
  formes avant de devenir « personne ne consomme ». Ainsi un retrait ne casse pas un consommateur
  qu'aucun compilateur ne signalera.
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
- **Une morsure se relit** : quand un garde mord, tu vérifies qu'il a mordu un défaut, et non une
  forme voulue. Ainsi un critère trop strict n'accuse pas un code juste.

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
## Quand tu corriges

- **Ce qui tenait tient encore** : après une correction, tu revérifies les observations faites
  ailleurs qui en dépendent. Ainsi une correction juste ne rend pas aveugle un outil juste.
- **Un indice se revalide** : quand la cause qu'un indice détectait est corrigée, tu vérifies
  qu'il discrimine encore. Ainsi un indice devenu muet ne passe pas pour un vert.
- **Corriger, c'est remplacer** : dans un document de référence, la phrase fausse se remplace par
  la juste ; dans un registre, l'entrée fausse se marque sur place, datée. Ainsi le lecteur ne
  trouve que la version juste.
