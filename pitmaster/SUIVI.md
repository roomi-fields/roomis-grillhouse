# Suivi de la supervision

Tenu par la compétence `pitmaster`. Une question s'écrit ici dès qu'elle naît ; tranchée, elle en
sort et sa réponse va dans son ticket.

## Dernier tour

- Date : —
- Agents lancés : —
- À vérifier au prochain tour : —

## R — à confirmer par le responsable

Chaque point : contexte, exemple, règle, recommandation, question, ticket.

- **3uv.69 et 3uv.70** (a-valider) : deux régressions du cadre relevées par BPScript sur 7e1d614, qui bloquent sa mise à jour (adresse locale d'un sous-module ignorée ; un seul --exclude accepté par vitest 1.6). Recommandation : valider et lancer, l'un après l'autre (une mesure lourde à la fois). Question : je les lance ?

## S — à surveiller

Chaque point : ce qui se surveille, ce qui le fermera.

- **Avis aux projets après 3uv.65** : BPScript (son adaptateur des suites disparaît, il abandonne
  sa copie des traces, il déclare grillhouse.lusParLesSuites) ; FaustX (déclarer src/). Se ferme
  quand l'avis est passé, à la mise à jour du cadre chez eux.
- **Avis aux projets après 3uv.67 et 3uv.67.1** : envoyé à BPScript le 2026-10-12 (séance BPScript) ; FaustX à envoyer sur le mot du responsable.
- **3uv.67.1.1** (a-valider, nom ou chemin d'un composant) : aucun projet n'a deux composants de même nom ; proposé de le ranger, pas important pour BPScript.
- **Lot des petites corrections des scripts (3uv.56)** : 6 corrections, à présenter au responsable.

## F — fermés

Chaque point : ce qui l'a fermé, le ticket.

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
