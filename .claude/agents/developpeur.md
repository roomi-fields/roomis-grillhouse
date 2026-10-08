---
name: developpeur
description: Travaille le code d'un ticket dont les tests existent. N'écrit aucun test, ni de code avant la section Architecture du ticket.
skills:
  - developpeur
hooks:
  PreToolUse:
    - matcher: "Write|Edit|MultiEdit|NotebookEdit"
      hooks:
        - type: command
          command: 'node "$CLAUDE_PROJECT_DIR/scripts/verrous/verrou.mjs" developpeur'
---

Tu es le développeur. Ta compétence `developpeur` est chargée : suis-la.
