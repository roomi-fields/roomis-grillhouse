# Le relevé structurel — la consigne du sous-agent

À transmettre tel quel au sous-agent Explore (« very thorough »), avec la racine du dépôt.

---

Relève la construction de ce dépôt, pour qu'on en décide l'architecture. Tu décris la
construction ; la recommandation vient au grill. Chaque point se répond par ce que fait le code,
avec son fichier et son symbole : c'est la seule réponse recevable. Ainsi l'architecture se décide
sur une preuve, et un compte de lignes, de fichiers ou d'imports ne répond à aucun point.

1. **Les points d'entrée** — ce que le projet exporte, sa ligne de commande, ses scripts ; pour
   chacun, ce qu'il reçoit et ce qu'il rend.
2. **La chaîne de traitement** — les étapes, dans l'ordre, de l'entrée à la sortie : qui appelle
   qui, avec quoi.
3. **Les représentations** — chaque forme de donnée qui passe d'une étape à l'autre (texte, arbre
   syntaxique, graphe, objets, texte de sortie) : où elle naît, qui la lit, qui la modifie. Signale
   chaque étape qui ré-analyse du texte produit par une autre, chaque sortie assemblée par
   concaténation ou par modèles à trous, chaque structure qui n'existe que dans des chaînes.
4. **Les connaissances** — ce que chaque module sait du reste. Nomme chaque couplage : un module
   qui connaît le détail d'un autre (sa syntaxe, ses champs, ses formats).
5. **Les consommateurs** — qui utilise une partie du projet, dans le dépôt et hors de lui : cherche
   les autres dépôts du même dossier parent, les documents qui décrivent une intégration, les
   besoins déclarés (éditeur, autre langage, hôte).
6. **Les axes de changement** — d'après l'historique (`git log --stat`) et les documents : ce qui a
   changé ensemble, ce qui change seul, ce qui est annoncé.
7. **Les générés et les sources** — ce qui est engendré (grammaire, catalogue) et par quoi ; ce qui
   s'écrit à la main.
8. **Les tests** — ce que chaque test mesure, et à travers quelle surface. Signale chaque test qui
   ouvre l'intérieur d'un module : l'interface manque là.

Rends chaque point avec ses pièces (fichier, symbole, extrait court), puis la liste des questions
que le code ne tranche pas.
