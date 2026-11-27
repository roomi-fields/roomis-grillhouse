# Le paquet grillhouse — architecture

Le paquet `@roomi-fields/grillhouse` porte le cadre entier : sa commande, son noyau et un module
par langage, ses déroulés Temporal, le greffon de Claude Code, la charte commune, le métacadre, les
compétences et les consignes des rôles, et le gabarit d'un projet. Sa place parmi les paquets du
dépôt, ses voisins et les choix qui commandent le cadre sont au document de tête
(`docs/ARCHITECTURE.md` à la racine du dépôt).

Chaque mécanisme du paquet a un seul document, qui en est la seule adresse :

| Document | Ce qu'il décrit |
|---|---|
| [Le circuit](architecture/circuit.md) | les étapes, les rôles et ce qu'ils écrivent, la règle de décision, les arrêts et les réponses, les gestes et l'attribution d'un rouge, les trois circuits, la voie de secours, la file des tickets, le journal des états et le bilan |
| [L'entrée sur main, la CI et la nuit](architecture/entree.md) | la passe finale, les arbres jugés, la file d'intégration, la CI de main, la nuit, la sortie |
| [La machine et l'enveloppe](architecture/machine.md) | le budget, les réservations, l'arbitre, le relevé et la table des consommations, les groupes de contrôle, l'enveloppe, la clé d'API du poste, les droits des rôles, le jugement du lot, le verrou hors enveloppe |
| [Les tests et les langages](architecture/tests.md) | la passe de vérification, le choix des tests, les modules de langage, les gardes et la dette, le style à l'écriture |
| [L'installation et les réglages d'un projet](architecture/installation.md) | l'installation, la montée, les clés `grillhouse.*`, les réglages du poste, le gabarit, les unités |
| [Le greffon et le panneau](architecture/greffon.md) | les crochets, les questions poussées, le tableau, le suiveur, la ligne d'état |

Ce que le paquet publie (ses entrées, ses commandes, ce qu'il demande à un module de langage) est à
son interface (`INTERFACE.md`) ; ses règles de conception, à son cadre (`CADRE.md`). Le détail
d'un module vit dans son en-tête, qui dit ce que le module est ; aucun autre document ne raconte un
mécanisme.
