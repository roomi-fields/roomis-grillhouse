# Un tour de supervision — la procédure

Les commandes du tour lisent sans rien modifier ; elles s'enchaînent sans demander. Chemins
absolus, `git -C <racine>`, jamais de `cd`. `<racine>` est la racine du dépôt
(`git rev-parse --show-toplevel`). Les résultats sont pour moi ; le responsable reçoit ce que
SKILL.md dit.

## Le réveil

La fin d'un agent arrive en notification : elle déclenche la relecture de sa fermeture (étape 5 b),
puis le lancement du ticket suivant. Un tour complet a lieu à l'ouverture de séance, quand un
document de référence a bougé, ou quand le responsable le demande. Aucune boucle horaire : elle
contrôle à vide.

## 0. Le point de départ

Lis `pitmaster/SUIVI.md` : le dernier tour, les agents lancés, ce qui est « à vérifier ». Un tour
commence par vérifier que ce qui était à vérifier l'est.

## 1. Le périmètre

```bash
git -C <racine> log --format='%h %ad %an %s' --date=iso --since='<dernier tour>'
git -C <racine> log @{u}..HEAD --oneline | wc -l   # commits non poussés
git -C <racine> status --short
```

Le message complet d'un commit compte autant que ses fichiers :
`git -C <racine> show --stat --format='%B' <c>`.

## 2. Les documents de référence, en premier

```bash
git -C <racine> log --since='<dernier tour>' --format='%h %s' -- CLAUDE.md CONTEXT.md docs \
  'packages/*/docs'
```

- Spécification : la règle ajoutée est-elle déjà vraie dans le code, ou change-t-il dans le même
  commit ?
- Décision : est-elle dans le document qu'elle règle, au présent, sans récit ni option écartée
  (`cadre.md` §2) ?
- Charte : a-t-elle grandi, et sur quel échec (`cadre.md` §5) ?

## 3. Une matière, une adresse

Cherche les seconds domiciles : un fichier « frontière » ou « contrat » hors de l'`INTERFACE.md`
de l'offrant, un registre de décisions à part, deux documents sur la même matière.

## 4. Les tickets suivent-ils le geste ?

```bash
bd list --status in_progress
bd list --all --json   # fermés (closed_at) et créés (created_at) depuis le dernier tour
bd show <id>           # la description d'abord
bd comments <id>       # la passation vit ici
```

Cherche : un ticket fermé qui dit attendre encore quelque chose ; un ticket en cours dont le
travail est commité ; un commit de produit sans ticket ; un ticket ouvert hors du chantier courant.

### 4 a. À l'ouverture

Chaque ticket créé depuis le dernier tour nomme ses règles et ses documents. Un ticket qui touche à
une interface ou à une décision sans nommer le document qui en portera la trace se complète avant
le lancement de son agent.

### 4 b. À la fermeture

Pour chaque ticket fermé : chaque aspect de la fermeture complète (SKILL.md) ; la passation lue en
entier ; chaque document nommé a bougé dans le même mouvement
(`git -C <racine> log --since='<dernier tour>' -- <chemin>`). Un document de référence touché sans
le mot du responsable, ou nommé et non touché, se dit le jour même, dans le ticket.

### 4 c. Le flux est-il suivi ?

```bash
for k in grill tdd code-review handoff; do
  printf '%-12s commits:%s tickets:%s\n' $k \
    "$(git -C <racine> log --since='<dernier tour>' --format=%B | grep -ci "$k")" \
    "$(bd list --all --json | grep -oi "$k" | wc -l)"; done
```

Zéro trace sur plusieurs tickets fermés est une dérive du cadre, qui se signale.

## 5. Les vérifications

```bash
git -C <racine> log --since='<dernier tour>' --format='%h %s' -- scripts/ .github/ .beads/hooks/
```

Une vérification nouvelle : les quatre critères, l'échec d'origine nommé (`cadre.md` §5).

## 6. La qualité

En une ligne : les messages de commit disent-ils encore l'échec d'origine, ce qui sort et pourquoi,
ce que le test a mordu ? Une fermeture exemplaire se nomme.

## 7. Lancer et reprendre un agent

- Avant le lancement : `bd ready` et `bd show <id>` (dépendances, dernier commentaire) ; le ticket
  est tranché, ses règles et ses documents nommés.
- Un agent se reprend avec `SendMessage` (chargé par `ToolSearch`, `select:SendMessage`) et son
  identifiant : il garde son contexte. Un nouvel appel `Agent` part de zéro.
- Chaque lancement s'inscrit dans `SUIVI.md` : le ticket, l'agent, les fichiers qu'il touchera.

## 8. Avant de rendre la main

- `SUIVI.md` à jour : points R/S ouverts ou fermés, ce qui est « à vérifier ».
- Relis `erreurs.md`.
