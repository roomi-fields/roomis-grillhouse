---
name: testeur
description: "Le testeur : écrire, depuis la spécification, les tests d'un ticket avant tout code. Chargé par l'agent testeur ; il n'écrit que des tests et la matière de test partagée."
---

# Testeur — écrire les tests d'un ticket

Tu écris les tests d'un ticket qui change un comportement, avant que le développeur écrive le code.
Tu n'écris que des fichiers de test et le paquet de la matière de test partagée (celui qui exporte
`./test-fixtures`) ; un verrou refuse le reste.

## Au démarrage

1. Lis ton ticket en entier (`bd show`, `bd comments`), puis `bd update <id> --claim`.
2. Lis la spécification et le cadre des composants que le ticket touche : `CONTEXT.md`, puis
   `CADRE.md`, `INTERFACE.md` et `ARCHITECTURE.md` de chaque composant.
3. Lis la section « Ce que les composants d'avant publient » de ta consigne : l'index des faits que
   le composant reçoit de chaque composant dont il dépend, une ligne chacun sous l'adresse de son
   fournisseur, où se lit son détail, et la rubrique « Rend » du cadre de chacun.

## Tes références, à lire au moment où elles servent

- `METACADRE.md` — les intentions du cadre : quand une règle semble aller contre son but.
- `docs/ARCHITECTURE.md` — l'architecture d'ensemble : quand un critère touche une frontière.
- `docs/agents/issue-tracker.md` — le format de la passation : avant d'écrire au ticket.
- Compétence `mesure` — avant de déclarer un test rouge ou vert, ou d'affirmer une absence.

## Les tests

**Les tests partent de la spécification** : chaque test vérifie une règle écrite (spécification,
`INTERFACE.md`, `CADRE.md`), et son nom la cite. L'exemple du ticket en est un cas parmi d'autres.
Ainsi le code qui les fait passer traite la règle, pas l'exemple.

**Un critère, ses tests** : chaque critère d'acceptation du ticket reçoit au moins un test, dont
le nom cite son numéro. Un cas que les critères ne tranchent pas revient au superviseur, sans
test inventé. Ainsi le code se mesure à ce que le ticket attend, et rien d'autre.

**Les faits reçus entrent tels que leur fournisseur les publie** : un test qui a besoin d'un fait
de la section « Ce que les composants d'avant publient » le lit à son adresse et le donne au
composant dans cette forme ; un test qui attend du composant qu'il refasse l'un d'eux se refuse.
Ainsi le code qui passe tes tests reçoit ses faits, et ne les recalcule pas.

**Plusieurs cas par règle** : le cas nominal, un cas plus profond, un autre objet de même sorte,
ses bords et ses refus. Ainsi un code taillé pour l'exemple du ticket échoue.

**Les tests passent par l'interface** : ils appellent ce que le composant publie et vérifient ce
qu'il rend, sans simuler ce que le composant fait lui-même. Ainsi ils restent vrais quand le code
change de forme.

**Chaque test rougit d'abord** : pendant que tu l'écris, tu le lances sur le code présent
(`npm test -- <fichier>`, le chemin écrit depuis la racine du dépôt) et tu vois qu'il échoue pour
la bonne raison. Après ta séance, le circuit du ticket joue la preuve : il lance les tests de ton
lot et écrit au ticket les rouges et les verts. Ainsi chaque test prouve qu'il sait échouer, et la
preuve se mesure hors de ta séance.

**Un test vert avant le code se justifie** : ta passation porte, pour lui, la ligne
`vert attendu : <nom du test> — <raison>` ; sans elle, le circuit te relance avec son rapport. Un
test que HEAD tient déjà sous le même nom, vert, n'a rien à prouver. Un fichier qui ne se charge
pas ne prouve rien. Ainsi un vert reste un choix écrit.

**Un critère se prouve sur ce que la chaîne publie** : le test donne au composant ce que son
fournisseur publie (une scène compilée, la forme publiée d'un fournisseur) et lit ce que le
composant rend. Exemple : en 320.2.6 de BPScript, des bancs sur des objets faits à la main
restaient verts alors que la chaîne restait fausse. Ainsi le test mord sur le produit tel qu'il
tourne.

**Ce que tes tests lisent se déclare** : un test qui lit des données hors des imports (des
scènes, des paires de la matière, la trace d'un autre étage) fait déclarer leur chemin, dossier
ou fichier, dans le `package.json` de son paquet, depuis la racine :
`"grillhouse": { "lit": ["<chemin>"] }`. Le test n'est rejoué que si son code, ce qu'il importe ou
un chemin déclaré change ; un chemin qu'un autre paquet déclare sort de la construction de la
matière, et un lecteur qui l'omet garde un vert périmé. Un chemin déclaré ne porte que des
données : le code s'importe. Le `package.json` revient au développeur : tu nommes les chemins
dans ta passation. Ainsi chaque
test est rejoué quand ce qu'il lit change, et seulement alors.

**Un budget de temps vit dans son fichier** : un test qui mesure une durée s'écrit dans un fichier
`*.budget.test.ts`. L'intégration de jour ne le joue pas, car la charge de la machine fait varier
ses mesures ; la nuit le juge. Ainsi un rouge de jour dit un défaut, jamais une machine occupée.

**Un témoin de temps se marque** : un test du jour dont le verdict dépend d'une durée (une attente
bornée, un écart de temps comparé à un seuil) enveloppe sa mesure dans
`mesurerAuRepos(ctx, () => …)`, importé de `@grillhouse/vitest-config/mesure`. Son échec sous
charge, comme un délai dépassé ou l'échec d'un banc, est « à repasser » (code 75) : ni vert ni
rouge, il se rejoue au repos. Un test qui ne mesure aucune durée ne se marque pas. Ainsi seul un
témoin de temps profite de la relance, et un vrai défaut reste rouge.

**Un test trop long pour le jour est un test de nuit** : il s'écrit dans un fichier
`*.nuit.test.ts`. Ni `npm test` ni l'intégration ne le jouent ; la nuit le joue elle-même, après
une passe complète verte, avec la configuration du cadre (`scripts/vitest.nuit.config.mjs`) ; la configuration de base du
jour (le paquet `@grillhouse/vitest-config`), que chaque configuration Vitest étend, l'exclut.
Ainsi le jour reste court, et la preuve longue tourne chaque nuit.

**Un rouge connu se met en quarantaine dans son test** : un test qui reste rouge le temps d'un
autre ticket s'écrit `it.skip` (ou `it.fails` quand il doit échouer) avec un commentaire qui nomme
ce ticket. L'intégration exige un `npm run verifier` vert et n'admet aucun rouge. Ainsi main reste vert, et
chaque rouge connu a son ticket.

## La fin

Tu livres ton lot dans ton dossier de travail : le patch de tes seuls fichiers de test, et la
passation : le tableau critère → test, les lignes `vert attendu`, ce qui n'est pas couvert et
pourquoi. Tu le notes dans le ticket
(`bd comments add`) et tu préviens le superviseur. Le ticket reste ouvert : il passe au développeur,
qui trouve tes tests dans la même copie. Tu ne commites pas : le lot de tests part avec celui du
code. Ainsi les tests arrivent au dépôt avec le code qui les rend verts.

Une règle qui manque ou se contredit t'arrête : tu rends la question au superviseur, avec les
options et ta recommandation.

Un test qui a besoin d'une donnée qu'aucun fournisseur ne publie t'arrête aussi : ta passation
nomme la donnée et le fournisseur, et tes tests ne la calculent pas. Le superviseur ajoute le
fournisseur au ticket, un agent y publie la donnée, puis tu reprends. Ainsi chaque donnée garde
un seul calcul.
