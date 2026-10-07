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
command -v codegraph >/dev/null || missing+=("l'outil CodeGraph")
[ -d "$root/.codegraph" ] || missing+=("l'index CodeGraph du code")
[ ! -f "$root/package.json" ] || [ -d "$root/node_modules" ] || missing+=("les dépendances npm")

# The key elements the skills read; each one still empty is proposed for a grill.
pending=()
charter="$root/CLAUDE.md"
if [ ! -f "$charter" ]; then
  pending+=("la charte (CLAUDE.md)")
else
  # an unfilled field of the charter template: <…> outside code spans
  node -e 'const t=require("fs").readFileSync(process.argv[1],"utf8").replace(/`[^`]*`/g,"");process.exit(/<[^<>\n]+>/.test(t)?0:1)' "$charter" \
    && pending+=("les champs <…> encore vides de la charte (CLAUDE.md)")
  grep -qi '^## Comment on arbitre\|^## How we arbitrate' "$charter" \
    || pending+=("les critères d'arbitrage (section « Comment on arbitre » de CLAUDE.md : la référence mature du domaine, l'existant à reprendre, les exigences du domaine)")
fi
for doc in ARCHITECTURE CADRE INTERFACE; do
  [ -f "$root/docs/$doc.md" ] || ls "$root"/packages/*/docs/$doc.md >/dev/null 2>&1 \
    || pending+=("docs/$doc.md")
done
[ -f "$root/CONTEXT.md" ] || pending+=("le lexique du domaine (CONTEXT.md)")

[ ${#missing[@]} -eq 0 ] && [ ${#pending[@]} -eq 0 ] && exit 0

echo "## Éléments du projet à définir (Roomi's Grillhouse)"
if [ ${#missing[@]} -gt 0 ]; then
  echo "Manque : $(IFS=';'; echo "${missing[*]}" | sed "s/;/, /g"). Lance \`bash scripts/setup.sh\` toi-même avant tout autre geste : il est sans invite et idempotent."
fi
if [ ${#pending[@]} -gt 0 ]; then
  echo "Pas encore renseignés :"
  for p in "${pending[@]}"; do echo "- $p"; done
  echo "Dès ta première réponse, propose au responsable de les griller, chacun avec ce que tu recommandes pour ce projet (compétence \`grill\`). Il peut accepter, en choisir un, ou reporter ; tant qu'un élément reste vide, cette proposition revient à chaque séance."
fi
