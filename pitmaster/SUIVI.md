# Suivi de la supervision

Tenu par la compétence `pitmaster`. Une question s'écrit ici dès qu'elle naît ; tranchée, elle en
sort et sa réponse va dans son ticket.

## Dernier tour

- Date : —
- Agents lancés : —
- À vérifier au prochain tour : —

## R — à confirmer par le responsable

Chaque point : contexte, exemple, règle, recommandation, question, ticket.








## S — à surveiller

Chaque point : ce qui se surveille, ce qui le fermera.

- **GEL DE L'OUTILLAGE** (responsable, 2026-10-13) : aucune fonction nouvelle dans le cadre ; seul ce qui bloque BPScript se répare. Un critère n'entre que s'il répond au besoin réel de l'usage actuel. En attente sous le gel : 75.2, 75.3, 77.1, 78.1, 56.2, lot 76 (sauf `--help`, la réécriture de settings.json et la régénération de .dependency-cruiser.cjs, qui gênent BPScript). Plus tard (« 4 ok ») : peser notre file d'intégration locale contre la file d'attente de fusion de GitHub et son contrôle continu.
- **3uv.79** (circuit léger de l'outillage, « 3 oui ») : le verrou du développeur interdit les tests ; ticket ouvert, à lancer sur le mot du responsable après 3uv.75.1.

- **3uv.56.2** (bissection par composant, nuit.sh) : « go » le 2026-10-13 ; part après le lot 3uv.56 et après 3uv.75.1 (commande unique).
- **Lot 3uv.76** (petites corrections, 5 points) : 4 viennent du relecteur de BPScript (322.10), dont l'ordre de settings.json encore cassé par l'installation des greffons et `--help` qui lance la mise à jour. Touche grillhouse-maj.mjs (tenu par 3uv.75.1) et frontieres.mjs (tenu par 3uv.77) : à proposer au responsable à leur livraison.
- **3uv.78.1** (a-valider, modèle commun et contrôle d'homogénéité) : passe après 3uv.75.1 et 3uv.77. À proposer à leur livraison.
- **3uv.77.1** (usage non déclaré) : règle du responsable au ticket, critères écrits ; passe après 3uv.77. Attend son mot pour partir.
- **3uv.75** (les tests relus quand rien n'a bougé) : grill fait, décisions à la mère ; 75.1 (cache par fichier, commande unique), 75.2 (contrôles en cache), 75.3 (refus du lancement direct), à valider. 75.1 : « oui », lancé le 2026-10-13 ; à sa livraison, mesurer le gain (temps et jetons des agents) et le dire au responsable.
- **3uv.74.1** (a-valider, découverte du chef de 3uv.74) : la nuit et le lanceur des copies d'agent installent les dépendances par leurs propres mécanismes ; passer par la fonction commune `accorder` ? Décision de structure, pas urgente pour BPScript.


- **Consigne du testeur** (remarque du chef de 3uv.72.1) : un test qui se construit un environnement neuf y remet le réglage git de la suite (`tests/config-git.ts`). Texte sous `.claude/`, à moi ; à proposer au responsable.
- **Mesure de Beads** : refaire la mesure du coût d'une commande bd (bd show contre bd list --all) machine calme, avant de toucher à la lecture des tickets du tableau (« ok » du responsable).
- **Contrôle du câblage des gardes** (idée, pas un ticket) : refuser un `integration:gardes` qui omet les gardes du cadre, en tolérant un écart nommé. À proposer au responsable quand BPScript aura fermé 322.6.7 (branchement de gardes.mjs chez lui).
- **Avis aux projets après 3uv.65** : BPScript (son adaptateur des suites disparaît, il abandonne
  sa copie des traces, il déclare grillhouse.lusParLesSuites) ; FaustX (déclarer src/). Se ferme
  quand l'avis est passé, à la mise à jour du cadre chez eux.
- **Avis aux projets après 3uv.67 et 3uv.67.1** : envoyé à BPScript le 2026-10-12 (séance BPScript) ; FaustX à envoyer sur le mot du responsable.
- **3uv.67.1.1** (a-valider, nom ou chemin d'un composant) : aucun projet n'a deux composants de même nom ; proposé de le ranger, pas important pour BPScript.

## F — fermés

Chaque point : ce qui l'a fermé, le ticket.

- **3uv.77** : livré (daaca0d), contrôle continu vert ; BPScript prévenu le 2026-10-13 (17 imports refusés chez lui, dans 040, 070, 080, 090, 110, 140). Remarques du chef, sous le gel : lint hors de src et tests, intégration à 915 s.

- **Geste transverse** (BPScript) : grill fait, « ok » à chaque tour ; décisions à 3uv.78 ; règles écrites dans la charte, pitmaster et chef-de-chantier.

- **Lot 3uv.56** : livré (a1cd46f), contrôle continu vert ; 3uv.67.1.1 fermé avec lui ; BPScript prévenu le 2026-10-13. Nouveau lot ouvert : 3uv.76 (lien symbolique qui retient une copie).

- **3uv.74** : livré (36704f8), contrôle continu vert ; BPScript prévenu le 2026-10-13 pour reprendre 322.4.

- **3uv.72.1** : livré (dc8cce3), contrôle continu vert (Node 22 et 24) ; copie et branche retirées. Signal à BPScript groupé avec 3uv.73.
- **3uv.73** : livré (52c83f7), contrôle continu vert ; signal de mise à jour envoyé à BPScript le 2026-10-13 (72, 72.1, 73).

- **3uv.72** : livré (d72df51) ; son contrôle continu rouge vient de 3uv.69, confié à 3uv.72.1.
- **3uv.71** : livré (0722766) ; greffons installés ici, avis à BPScript le 2026-10-12.
- **3uv.69** : livré (c49ae4b) ; avis à BPScript le 2026-10-12.
- **Redacteur, un paragraphe sur une ligne** (BPScript) : « non pas de coupure », écrit dans la compétence redacteur.
- **3uv.70** : sans objet, BPScript monte vitest à la version du cadre.
- **3uv.67.1** : livré (209c970), contrôle continu vert.
- **3uv.67** : livré (68894a9), contrôle continu vert ; textes de .claude/ écrits par le superviseur dans le lot.
- **3uv.65, Q1, Q2-Q3, Q10, F5** : tranchés par le responsable, au ticket ; chef aa8e68b26a06389ac
  relancé le 2026-10-12.
- **3uv.65, la suite de la racine** : « ok » du responsable, au ticket ; chef relancé.
- **3uv.65 Q14** : « oui c'est bon », au ticket (critère 25) ; chef relancé.
- **3uv.63.1** : « oui », lancé le 2026-10-12 (chef ab8c82415b3a1fd44).
- **Copies livrées** : « oui » ; 22 copies retirées le 2026-10-12, chaque contenu modifié vérifié dans l'histoire de main ; 55.1 (ouvert) gardée.
- **3uv.65 constat 1** : « je suis d'accord sur le principe », au ticket ; découpage « oui » → 3uv.67.
- **3uv.67 R10, ce qu'est une construction** : « ok go », au ticket.
- **3uv.67 R11, purge** : règle du responsable (main, main~1, tickets en cours), « oui », au ticket.
- **3uv.67.1** : validé et lancé après 3uv.67, « oui », au ticket.
