#!/usr/bin/env bash
# SessionStart hook: tells the session what the project still lacks before work can start.
# Silent once the project is set up and initialised. Read-only: it changes nothing.
set -uo pipefail

root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
if [ -f "$root/.claude/template" ]; then
  echo "## Gabarit Roomi's Grillhouse"
  echo "Ce dossier est le gabarit du framework, pas un projet : il ne s'initialise pas. Un projet neuf se crée par \`npm run new -- <chemin> [préfixe]\` ; sa première séance propose le grill d'initialisation."
  exit 0
fi

missing=()

command -v bd >/dev/null || missing+=("l'outil de tickets bd (Beads)")
[ -d "$root/.beads" ] || missing+=("le magasin de tickets (Beads)")
[ ! -f "$root/package.json" ] || [ -d "$root/node_modules" ] || missing+=("les dépendances npm")

pending=()
grep -q '<Nom du projet>' "$root/CLAUDE.md" 2>/dev/null && pending+=("la charte (CLAUDE.md)")
[ -f "$root/CLAUDE.md" ] || pending+=("la charte (CLAUDE.md)")
for doc in ARCHITECTURE CADRE INTERFACE; do
  [ -f "$root/docs/$doc.md" ] || ls "$root"/packages/*/docs/$doc.md >/dev/null 2>&1 \
    || pending+=("docs/$doc.md")
done

[ ${#missing[@]} -eq 0 ] && [ ${#pending[@]} -eq 0 ] && exit 0

echo "## Projet à initialiser (Roomi's Grillhouse)"
if [ ${#missing[@]} -gt 0 ]; then
  echo "Manque : $(IFS=';'; echo "${missing[*]}" | sed "s/;/, /g"). Lance \`bash scripts/setup.sh\` toi-même avant tout autre geste : il est sans invite et idempotent."
fi
if [ ${#pending[@]} -gt 0 ]; then
  echo "À définir : $(IFS=';'; echo "${pending[*]}" | sed "s/;/, /g")."
  echo "Dès ta première réponse, propose au responsable le grill d'initialisation (compétence \`initialiser\`) : il définit la charte, l'architecture, le cadre et les interfaces, puis ouvre les premiers tickets."
fi
