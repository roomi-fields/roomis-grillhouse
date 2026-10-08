# Le métacadre de Grillhouse

Le métacadre dit ce que sert tout le cadre, et comment ses règles s'écrivent. La charte, les
compétences et les documents de chaque projet s'y rattachent ; une règle qui ne sert aucune de ses
intentions sort du cadre.

## 1. Les intentions

1. **Un produit mature et professionnel** : le projet construit une architecture robuste et
   pérenne, qui atteint ses objectifs et tient les exigences de son domaine (la rapidité pour le
   live coding). Il se base sur l'existant et sur ce que fait le produit mature du domaine. Les
   cinq autres intentions servent celle-ci.
2. **L'architecture décide, le code suit** : chaque décision s'écrit dans l'architecture avant
   d'être codée. Un problème remonté commence par une revue de l'architecture spécifiée : où il
   devrait se situer ; ensuite on implémente. Ainsi le produit reste cohérent dans le temps.
3. **Du plus large vers le plus spécifique** : tout correctif passe par l'architecture. Un problème
   identifié peut être la manifestation d'un problème plus large : on le traite toujours du plus
   large vers le plus spécifique.
4. **La preuve avant l'affirmation** : un résultat s'affirme sur une mesure, et un test prouve
   qu'il sait échouer avant de compter comme vert. Ainsi ce qui est déclaré fini l'est vraiment.
5. **Des agents cadrés** : chaque ticket part à un agent neuf, dans le cadre écrit, et un autre que
   lui relit sa fermeture. Ainsi le travail des agents reste dans l'architecture ; sans cadre, ils
   font systématiquement le contraire.
6. **Le responsable tranche l'essentiel** : ce qu'une règle écrite tranche, le superviseur le
   tranche. Le responsable reçoit les décisions qu'aucune règle ne couvre, avec leur contexte et une
   recommandation. Ainsi son temps va aux vraies décisions.

## 2. Écrire une règle

**Écrire une règle** : une règle part des mots de celui qui l'a décidée. Elle dit en positif ce
qu'on fait, au présent, en deux ou trois phrases courtes. Elle nomme l'intention du cadre qu'elle
sert, pour qu'on ne puisse pas l'appliquer contre elle. Elle nomme les objets qu'elle cadre, à leur
échelle ; un exemple l'éclaire, jamais une liste de cas.

**Une règle, une idée** : une règle dit une seule chose, qu'un lecteur comprend sans connaître son
origine. Deux idées font deux règles ; une idée déjà écrite ailleurs se cite à son adresse. Ainsi
un agent applique chaque règle sans la mal lire.

Exemple : « Avant le code, tu nommes dans le ticket la règle du cadre et la règle d'architecture
que tu appliques. Ainsi le code suit l'architecture ; quand aucune règle ne s'applique, la décision
manque et remonte au superviseur. »
