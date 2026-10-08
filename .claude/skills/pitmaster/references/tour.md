# Un tour de supervision — la procédure

**Le tour lit sans modifier** : ses commandes s'enchaînent sans demander, avec des chemins absolus
et `git -C <racine>`. Ainsi le tour ne gèle jamais la séance sur une invite. `<racine>` est la racine du dépôt
(`git rev-parse --show-toplevel`). Les résultats sont pour moi ; le responsable reçoit ce que
SKILL.md dit.

## Le réveil

La fin d'un agent arrive en notification : elle déclenche la relecture de sa fermeture (étape 4 b),
puis le lancement du ticket suivant. **Le tour se déclenche sur un événement** : l'ouverture de
séance, un document de référence qui bouge, ou la demande du responsable. Ainsi chaque tour
contrôle du travail réel, jamais à vide.

## 0. Le point de départ

Lis `pitmaster/SUIVI.md` : le dernier tour, les agents lancés, ce qui est « à vérifier ». **Un tour
commence par ce qui était « à vérifier »** au tour précédent, et le vérifie. Ainsi aucun point
ouvert ne se perd entre deux tours.

## 1. Le périmètre

```bash
git -C <racine> log --format='%h %ad %an %s' --date=iso --since='<dernier tour>'
git -C <racine> log @{u}..HEAD --oneline | wc -l   # commits non poussés
git -C <racine> status --short
```

**Je lis le message complet de chaque commit avec ses fichiers**
(`git -C <racine> show --stat --format='%B' <c>`). Ainsi je juge le geste sur ce que l'agent a écrit
et sur ce qu'il a fait.

## 2. Les documents de référence, en premier

**Je relis d'abord ce qui a bougé dans les documents de référence.** Ainsi l'architecture reste ce
qui décide, et le code se juge contre elle.

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

**Je cherche les seconds domiciles d'une matière** : par exemple un fichier « contrat » hors de
l'`INTERFACE.md` de l'offrant, ou deux documents sur la même matière. Ainsi chaque décision garde
une seule adresse, dans l'architecture.

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

**Je vérifie que chaque ticket ouvert depuis le dernier tour nomme ses règles et ses documents** («
Un ticket nomme ses règles », SKILL.md). Un ticket incomplet se complète avant le lancement de son
agent. Ainsi le code suit l'architecture dès le premier geste.

### 4 b. À la fermeture

Pour chaque ticket fermé : chaque aspect de la fermeture complète (SKILL.md) ; la passation lue en
entier ; chaque document nommé a bougé dans le même mouvement
(`git -C <racine> log --since='<dernier tour>' -- <chemin>`). **Je signale le jour même,
dans le ticket, un document de référence touché sans le mot du responsable, ou nommé et resté
intact.** Ainsi l'architecture change par décision, et chaque ticket tient sa promesse.

### 4 c. Le flux est-il suivi ?

```bash
for k in grill testeur ACCEPTÉ handoff; do
  printf '%-12s commits:%s tickets:%s\n' $k \
    "$(git -C <racine> log --since='<dernier tour>' --format=%B | grep -ci "$k")" \
    "$(bd list --all --json | grep -oi "$k" | wc -l)"; done
```

**Je signale une dérive du cadre quand plusieurs tickets fermés ne portent aucune trace du flux**
(grill, tests d'abord, relecture, passation). Ainsi les agents restent dans le flux écrit.

## 5. Les vérifications

```bash
git -C <racine> log --since='<dernier tour>' --format='%h %s' -- scripts/ .github/ .beads/hooks/
```

**Une vérification nouvelle remplit les quatre critères et nomme son échec d'origine**
(`cadre.md` §5). Ainsi chaque garde prouve qu'il détecte un défaut réel.

## 6. La qualité

En une ligne : les messages de commit disent-ils encore l'échec d'origine, ce qui sort et pourquoi,
ce que le test a mordu ? **Je nomme une fermeture exemplaire** dans le compte rendu. Ainsi les
agents voient ce que le cadre attend.

## 7. Lancer et reprendre un agent

- Avant le lancement : `bd ready` et `bd show <id>` (dépendances, dernier commentaire). **Un agent
  part sur un ticket tranché**, dont les règles et les documents sont nommés. Ainsi il travaille
  dans l'architecture, pas dans ses suppositions.
- Un agent se reprend avec `SendMessage` (chargé par `ToolSearch`, `select:SendMessage`) et son
  identifiant : il garde son contexte. Un nouvel appel `Agent` part de zéro.
- **J'inscris chaque lancement dans `SUIVI.md`** : le ticket, l'agent, les fichiers qu'il
  touchera. Ainsi deux agents ne touchent jamais le même fichier.

## 8. Avant de rendre la main

- `SUIVI.md` à jour : points R/S ouverts ou fermés, ce qui est « à vérifier ».
- Relis `erreurs.md`.
