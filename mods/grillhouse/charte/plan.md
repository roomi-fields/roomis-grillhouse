# La charte commune : le module du plan

Les règles de la charte commune sur le plan d'un ticket : sa voie, ses composants, ce qui monte.

**Une tension avec l'architecture monte, elle ne se résout pas dans le ticket** : le créateur du
ticket, ou l'explorateur au plan, qui ne trouve aucun paragraphe, ou en trouve un que le travail
contredit, s'arrête et monte au superviseur. Le superviseur charge la compétence `architecte`,
instruit la décision (l'existant, les options, leurs compromis) et la porte au responsable, qui
tranche. Ainsi aucun ticket ne décide de l'architecture.

**Un ticket de réalisation nomme ses composants** dans son titre (« numéro — sujet — composant,
composant ») et sa section « Architecture », le fournisseur d'abord ; il fait une seule livraison,
en un seul commit, et se crée sous sa mère (`docs/agents/issue-tracker.md`). Un objectif dont le
découpage n'est pas connu commence par une exploration, sans code. Ainsi l'avancement se lit
ticket par ticket.

**Un ticket prend le circuit court quand aucun test honnête ne peut rougir avant son lot**, le
produit se comportant pareil avant et après : la suite existante, qui reste verte, et la relecture
font la preuve, comme les grands changements de Google (Rosie, ClangMR), Renovate, `nx migrate`,
`eslint --fix`, sans test neuf. Un test honnête échoue avant le lot et passe après, sur un
comportement qu'un test, un autre paquet ou une interface publiée observe. Le doute va au circuit
complet. L'explorateur juge au plan que le ticket est mécanique, et l'écrit avec sa raison, ce
qu'il a cherché et sa commande. La liste qui suit donne des exemples du critère, non son
périmètre : montée du cadre, documents seuls, renommage ou déplacement, montée de dépendance,
configuration seule (sans garde qui en mesure l'effet), correction de style, seuil relevé,
commentaires de code seuls, suppression de code sans appelant vivant, fichiers engendrés
régénérés, textes de messages qu'aucun test ni aucun autre paquet ne lit, typage resserré sans
changement à l'exécution et dont aucun lecteur du relevé ne casse à la compilation.
Le circuit court a deux formes : le geste qu'une commande ou un outil joue passe par 1.1 (Geste
mécanique, l'explorateur joue la commande du plan), sans testwriter ni développeur ; le geste
écrit à la main (commentaires, code supprimé, texte d'un message, typage resserré) saute le
testwriter et la preuve du rouge, et une séance du développeur écrit, puis les contrôles et la
relecture. Reste au circuit complet ce qu'un utilisateur ou un autre paquet observe (une sortie,
un code de retour, une interface publiée) ; le texte qui accompagne un changement de comportement
reste dans son lot. Une configuration dont une garde mesure l'effet reste au circuit. Une
réorganisation qui a du code et dont les tests s'adaptent (« comportement tests-adaptés ») garde le
circuit complet, la suite existante faisant la preuve. La bascule marche dans les deux sens, sur le
même plan, ses paquets et ses critères gardés : un lot de tests dont aucun ne peut rougir passe au
circuit court, un lot du circuit court qui change un comportement repart au circuit complet ; ses
arrêts, les réponses du superviseur et leur compte parmi les `RENDU` sont au document du circuit
(§5.6, §5.4). Ainsi chaque séance du circuit a un lot à écrire.

- **Une décision de structure passe par le grill** (compétence `grill`) : découpage, paquets,
  modules, interfaces, frontières. Ainsi l'architecture décide de la structure, et le code la suit.
- **Un geste transverse, un seul ticket** : un même changement sur plusieurs composants se décide
  une fois, en gabarit dans la section « Architecture », et se mène dans une seule copie. Ainsi le
  geste reste le même partout.
