# La charte commune : le module du superviseur

Les règles de la charte commune que le superviseur seul applique.

**Le greffon pousse les questions des circuits à la séance du superviseur, et la réponse les
acquitte** : seule la séance qui tient le verrou du superviseur les reçoit, un message par
relevé, jamais pendant un de ses tours ; une question lue et restée sans réponse revient à
l'intervalle de rappel du projet. Les états d'une question, le groupe de projets et la réponse
portée au responsable sont au document du greffon (§5.1). Ainsi une question ne dépend d'aucune
attente que la séance relance.

**Un ticket ouvert naît du mot du responsable**, ou d'un défaut qu'un projet du cadre rencontre.
Une découverte d'agent se consigne dans un ticket fermé, sous le ticket qui l'a trouvée, étiqueté
`decouverte`. En fin de ticket, le tri des découvertes lui donne son verdict, avec sa pièce :
`traitee`, `doublon` ou `sans-suite` la laissent fermée ; `a-porter` (un défaut de l'usage
actuel) ou `non-confirmee` (sans preuve rejouée) la rouvrent sous `a-valider`, pour le
responsable. Ainsi chaque découverte est lue, et le backlog reste le plan du responsable.

**Un ticket de données suit le chemin de données du projet** : un ticket qui n'ajoute que des
données (des fichiers qu'un schéma valide, une fiche à un catalogue) ne passe pas par le circuit
de code ; il passe par la validation du projet et sa CI, comme une formule de Homebrew ou un
type de DefinitelyTyped. Ainsi le circuit garde les tests et le code pour ce qui en a.

**Un ticket prend l'une de trois voies** : le circuit complet pour un comportement qui change ;
le circuit court pour un geste sans comportement neuf, que l'explorateur juge au plan par son critère, et que la bascule rend dans les deux sens ; hors
du circuit, mené en direct par une commande du cadre (`npx grillhouse direct <ticket>`), pour un
défaut du circuit lui-même (le circuit ne se répare pas par lui-même), une correction triviale
repérée en analyse (une ligne fautive, un mauvais argument, sans exception), un ticket de données
ou le squelette d'un paquet ; il porte l'étiquette `direct`, que la file des
tickets ignore, même s'il porte aussi `circuit`. Un lot hors du circuit entre
sur main sur sa vérification complète verte. Un changement de comportement du produit va au
circuit, même pressé. Ainsi la voie d'un ticket se lit à la charte, et non au choix de la séance.

**Le superviseur n'écrit pas le code d'un direct** : la commande lance, dans une copie à elle, un
agent (le rôle `direct`, qui écrit tests et code ensemble, sous les droits que son rôle donne), puis
le relecteur sur son lot, et s'arrête : ni plan, ni preuve du rouge, ni contrôles, ni file. Un
défaut corrigé porte un test qui le reproduit, que la relecture exige. Le superviseur reprend la main
sur un lot relu : il relit, joue la vérification complète, commite, avance main et pousse ; un lot
`RENDU` repart à l'agent par la même commande, qui s'arrête à la troisième relecture rendue. Le
verrou du cadre refuse à toute séance hors enveloppe qui n'est pas un agent du cadre (le
superviseur, une séance lancée à la main, une séance qui perd sa variable d'enveloppe) le code et
les tests d'un paquet, et nomme la commande ; les documents, ceux d'un paquet comme ceux de la
racine, restent écrits par le superviseur. Ainsi celui qui relit n'est jamais celui qui a écrit.

**La file directe se tient comme la file des tickets** : un ticket direct attend ouvert, et l'en-tête
du panneau le compte (« ✎ N en direct ») ; le superviseur lance par la commande le seul qu'il mène,
rend ouvert celui qu'il quitte, et ferme celui dont le lot est sur main (« intégré : <commit> »),
même si une nuit doit encore le confirmer, après avoir déverrouillé sa copie
(`npx grillhouse direct <ticket> --deverrouiller`). Le panneau montre l'agent d'un direct en cours
sous le bloc « Direct », en tête des agents. Ainsi le panneau montre seulement ce qui tourne.

**Un paquet naît hors du circuit, en quatre temps** (un squelette n'a ni comportement ni test),
comme les générateurs de Nx et `cargo new --lib` : 1, le grill, le superviseur et le responsable
(son rôle, sa frontière, ses refus, son interface, son langage) ; 2, l'écriture, le superviseur
avec la compétence `redacteur`, relue par le responsable : sa ligne du tableau des composants de
`docs/ARCHITECTURE.md`, avec son langage, et ses documents (`<chemin>/docs/CADRE.md`,
`INTERFACE.md`) ; 3, la création, sans agent : `npx grillhouse paquet <chemin>` lit la ligne et
bâtit ce que son langage demande, les outils de ce langage compris pour son premier paquet ; 4, le
code, un ticket ordinaire du circuit sur un paquet qui existe. Les temps 2 et 3 entrent dans un
même commit, après une vérification verte. Ainsi main ne voit jamais un paquet déclaré sans
dossier.
