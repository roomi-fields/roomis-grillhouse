---
name: rediger
description: >
  Rédiger un document du dépôt lu par des humains. À charger avant d'écrire ou de réécrire :
  l'architecture du projet ou d'un composant, son cadre, son interface ; une spécification ; un
  guide ; tout document de référence. Pour un document lu par un agent (compétence, charte,
  consigne), `mattpocock-skills:writing-for-agents`.
---

# Rédiger un document

Chaque document a un public, un modèle que ce public connaît déjà, et un squelette de section.
Les règles ci-dessous valent pour tous ; la référence du type donne le reste.

## Ce qui vaut pour tout document

Le lecteur est un ingénieur. Chaque phrase lui apprend ce qu'est une chose ou ce qu'elle fait, avec
les mots qu'il emploie lui-même. La langue du document est celle de la charte.

### Le fond

- **Une phrase dit ce qui est.** Elle décrit ce qu'une chose est ou fait, jamais ce qu'elle n'est
  pas, ni ce qu'on a écarté. Une limite s'énonce par ce que fait l'autre composant.
- **Le principe vient avant le nom.** Aucun nom n'apparaît avant que le lecteur sache à quoi il
  sert. Une notion se définit une fois, juste avant son premier usage.
- **Une information a une seule adresse**, dans le document et entre les documents. Ce qu'un autre
  document dit se cite par un renvoi, en fin de section.
- **Deux choses parallèles se décrivent de la même manière.** Un mot de comparaison (« même »,
  « aussi ») a son antécédent dans la phrase ou juste avant.
- **Le document parle de son sujet, et de lui seul.** Une architecture décrit le produit ;
  l'organisation du dépôt et la façon de travailler vivent dans la charte.
- **Une règle est au présent**, sans date, sans auteur, sans histoire de sa décision.

### La phrase

- **Le vocabulaire est celui de la programmation.** Une fonction reçoit et retourne ; un paquet
  importe, exporte, dépend de ; un objet contient un champ. Un verbe courant pris dans un sens
  détourné se remplace par le mot technique.
- **Le sujet et le verbe sont précis.** On nomme ce qui agit et l'opération exacte.
- **Le ton est celui d'un ingénieur, jamais littéraire** : pas de maxime, pas de gras rhétorique,
  pas de formule ramassée, pas de génitifs empilés. Le gras marque un terme défini ou une entrée de
  liste, jamais une sentence.
- **Les identifiants du code sont en police de code** ; les composants se nomment par leur nom.

### La forme

- **L'introduction dit ce qu'est la chose et ce qu'elle fait** ; elle n'est ni un sommaire ni une
  carte des documents.
- **Les titres sont numérotés** (`## 1.`, `### 1.2`), pour qu'une section se cite par son numéro.
- **Un paragraphe s'écrit sur une seule ligne**, sans retour à la ligne forcé.
- **Tout exemple est exécuté par un test** — accepté, refusé ou joué ; le document ne nomme pas le
  test.

### Le circuit

- **Les documents que la charte réserve au responsable** : le texte nouveau s'écrit d'abord dans
  le ticket, et entre au document après son accord.
- **Un déplacement se fait tel quel, puis la réécriture**, en deux commits.

## Le type du document

Lis la référence du type avant d'écrire la première section :

- [Les documents d'un composant](references/documents-d-un-composant.md) — pour l'architecture du
  projet ou d'un composant (sa construction), son cadre (son rôle et sa frontière) ou son interface.

Un projet ajoute ses propres types sous `docs/agents/rediger/`, un fichier par type, sur le même
modèle (lecteur, modèle, squelette, critère de fin) : lis celui du document que tu écris.

Une section est finie quand elle remplit le critère de fin de sa référence, point par point.
