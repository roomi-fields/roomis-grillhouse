# Le lexique du cadre

Les mots de Roomi's Grillhouse, les mêmes dans chaque projet qui installe le cadre. Le
`CONTEXT.md` d'un projet porte les mots de son propre domaine ; ceux du cadre vivent ici.

## Les personnes et les rôles

**Responsable** :
La personne qui mène le projet et tranche ce qui lui revient.
_À éviter_ : utilisateur, propriétaire, owner

**Superviseur** :
La séance qui mène le dépôt : elle tient les tickets et répond aux questions des circuits.
_À éviter_ : pitmaster, chef, orchestrateur

**Rôle** :
La définition d'un agent du cadre : sa compétence et ses droits.
_À éviter_ : profil, persona

**Agent** :
Une séance lancée sous un rôle.
_À éviter_ : sous-agent, bot

**Séance** :
Une conversation de Claude Code.
_À éviter_ : session, instance

## Le travail

**Ticket** :
Un travail inscrit au suivi des tickets, sous le préfixe du projet.
_À éviter_ : issue, tâche

**Chantier** :
Un objectif à la racine du suivi, découpé en tickets.
_À éviter_ : épopée, epic

**Lot** :
Ce qu'un ticket apporte, entré sur main en un seul commit.
_À éviter_ : livraison, patch, changement

**Circuit** :
Le chemin que suit tout ticket, mené par le moteur des circuits : le circuit complet, le circuit
court ou le circuit direct.
_À éviter_ : parcours, voie, pipeline

**Circuit complet** :
Le circuit d'un comportement qui change : les tests d'abord, puis le code.

**Circuit court** :
Le circuit d'un geste sans comportement neuf, qu'aucun test honnête ne peut faire rougir.

**Circuit direct** :
Le circuit d'un défaut du circuit, d'une correction triviale, d'un ticket de données ou du
squelette d'un paquet : un agent écrit tests et code ensemble, un relecteur juge son lot.
_À éviter_ : hors du circuit

**Voie de secours** :
Le chemin d'un ticket hors du moteur des circuits, réservé à ses pannes.

**Étape** :
Un numéro de la liste unique des étapes, tenu par un rôle ou par le circuit lui-même.
_À éviter_ : phase, stade

**Déroulé** :
L'exécution d'un circuit dans le moteur des circuits.
_À éviter_ : workflow, exécution

**Fiche** :
La sortie structurée d'une étape, sur laquelle le circuit décide.
_À éviter_ : rapport, verdict

**Passation** :
Le commentaire qu'un agent laisse au ticket pour l'humain : ce qui est fait, ce qui ne l'est pas
et pourquoi.
_À éviter_ : compte rendu, handoff

## La machine

**Poste** :
La machine où tournent les circuits.
_À éviter_ : hôte, serveur, machine locale

**Copie** :
Le dossier de travail isolé d'un ticket, sous `.claude/worktrees/`.
_À éviter_ : worktree, clone, bac à sable

**Place** :
L'emplacement qu'occupe un circuit sur le poste.
_À éviter_ : slot, créneau

**Part** :
Les cœurs et la mémoire qu'une passe se réserve sur le poste.
_À éviter_ : réservation, quota

**Passe** :
Un lancement de tests ou de vérification.
_À éviter_ : run, exécution

**Passe finale** :
La passe qui juge un lot avant son entrée sur main.

## Le code

**Paquet** :
L'unité qu'on construit et qu'on publie, d'un seul langage, une ligne du tableau d'architecture.
_À éviter_ : composant, crate, projet

**Module** :
Une partie interne d'un paquet, le module d'un langage dans le cadre, ou un module de la charte
commune, ses règles propres à un public.

## L'entrée sur main

**File des tickets** :
Les tickets qui attendent leur départ dans un circuit.

**File d'entrée** :
Les lots qui attendent d'entrer sur main.
_À éviter_ : file de fusion, merge queue

**CI de main** :
Le rejeu de main après les entrées, par paquets de lots.
_À éviter_ : CI de branche

**Nuit** :
La passe complète, les tests de nuit et les bancs de temps, joués quand le poste est au repos.
_À éviter_ : nightly

**Sortie** :
Une version publiée du cadre.
_À éviter_ : release, publication

**Montée** :
Le passage d'un projet à une version du cadre.
_À éviter_ : mise à jour, upgrade, migration

## Ce qui remonte

**Question** :
Un arrêt du circuit qui attend le superviseur.
_À éviter_ : blocage, demande

**Remontée** :
Un défaut qu'un projet du cadre signale au cadre.
_À éviter_ : retour, feedback

**Découverte** :
Un défaut qu'un agent trouve en chemin, consigné dans un ticket fermé sous le ticket qui l'a
trouvé.
_À éviter_ : trouvaille, note

**Alerte** :
Un rouge de la CI de main ou de la nuit, avec son ticket de défaut.
_À éviter_ : incident, échec
