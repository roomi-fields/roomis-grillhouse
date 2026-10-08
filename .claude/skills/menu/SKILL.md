---
name: menu
description: >
  Le rédacteur : rédiger un document du dépôt lu par des humains. À charger avant d'écrire ou de réécrire :
  l'architecture du projet ou d'un composant, son cadre, son interface ; une spécification ; un
  guide ; tout document de référence. Pour un document lu par un agent (compétence, charte,
  consigne), `mattpocock-skills:writing-for-agents`.
---

# Menu — le rédacteur : rédiger un document

Chaque document a un public, un modèle que ce public connaît déjà, et un squelette de section.
Les règles ci-dessous valent pour tous ; la référence du type donne le reste.

## Ce qui vaut pour tout document

Le lecteur est un ingénieur. Chaque phrase lui apprend ce qu'est une chose ou ce qu'elle fait, avec
les mots qu'il emploie lui-même. La langue du document est celle de la charte.

### Le fond

- **Une phrase dit ce qui est** : elle décrit ce qu'une chose est ou fait ; une limite s'énonce par
  ce que fait l'autre composant. Ainsi le document se lit comme l'architecture que le code suit.
- **Le principe avant le nom** : le lecteur apprend à quoi sert une chose avant d'en lire le nom.
  Une notion se définit une fois, juste avant son premier usage. Ainsi chaque nom du document
  désigne une chose comprise.
- **Une information, une adresse** : elle vit à une seule place, dans le document et entre les
  documents ; ce qu'un autre document dit se cite par un renvoi, en fin de section. Ainsi chaque
  décision de l'architecture a une seule version, celle que le code suit.
- **Le document parle de son sujet** : une architecture décrit le produit ; l'organisation du
  dépôt et la façon de travailler vivent dans la charte. Ainsi chaque document répond à une seule
  question.
- **Une règle s'écrit selon le métacadre** (`METACADRE.md`, §2) : elle sert une intention du cadre
  et la nomme.

### La phrase

- **Le vocabulaire de la programmation** : on emploie le mot technique exact (une fonction reçoit
  et retourne, un paquet dépend d'un autre). Ainsi chaque phrase dit une seule chose, celle que le
  code fait.
- **Le sujet et le verbe précis** : la phrase nomme ce qui agit et l'opération exacte. Ainsi le
  lecteur sait quel composant fait quoi.
- **Le ton d'un ingénieur** : des phrases simples et neutres, une affirmation par phrase, comme
  dans une spécification. Ainsi le document est celui d'un produit professionnel.
- **Le gras marque un terme défini** ou une entrée de liste. Ainsi il guide la lecture au lieu
  d'insister.
- **Les identifiants en police de code** : un identifiant du code s'écrit en police de code. Ainsi
  le lecteur distingue le code de la prose.
- **Un composant se nomme par son nom.** Ainsi le lecteur sait toujours de quel composant on
  parle.

### La forme

- **L'introduction dit ce qu'est la chose et ce qu'elle fait.** Ainsi le lecteur sait dès la
  première phrase de quoi parle le document.
- **Les titres numérotés** : chaque titre porte son numéro (`## 1.`, `### 1.2`). Ainsi un ticket
  cite une section par son adresse.
- **Tout exemple est exécuté** : un test exécute chaque exemple du document, accepté, refusé ou
  joué ; le document cite l'exemple, le test vit à part. Ainsi chaque exemple est prouvé.

### Le circuit

- **Les documents du responsable** : le texte nouveau d'un document que la charte lui réserve
  s'écrit d'abord dans le ticket, et entre au document après son accord. Ainsi le responsable
  tranche ce qui décide de l'architecture.
- **Déplacer, puis réécrire** : un texte se déplace tel quel dans un commit ; sa réécriture vient
  dans le suivant. Ainsi chaque changement de fond se lit et se vérifie seul.

## Le type du document

Lis la référence du type avant d'écrire la première section :

- [Les documents d'un composant](references/documents-d-un-composant.md) — pour l'architecture du
  projet ou d'un composant (sa construction), son cadre (son rôle et sa frontière) ou son interface.

Un projet ajoute ses propres types sous `docs/agents/menu/`, un fichier par type, sur le même
modèle (lecteur, modèle, squelette, critère de fin) : lis celui du document que tu écris.

Une section est finie quand elle remplit le critère de fin de sa référence, point par point.
