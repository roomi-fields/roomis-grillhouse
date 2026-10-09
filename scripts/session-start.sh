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
grep -q un-commit-par-ticket "$root/.beads/hooks/commit-msg" 2>/dev/null || missing+=("le crochet « un ticket, un commit »")
command -v bwrap >/dev/null || missing+=("bubblewrap (bwrap), l'enveloppe des agents : sudo apt install bubblewrap")

# The key elements the skills read; each one still empty is proposed for a grill.
pending=()
charter="$root/CLAUDE.md"
if [ ! -f "$charter" ]; then
  pending+=("la charte (CLAUDE.md)")
else
  # an unfilled field of the charter template: <…> outside code spans
  node -e 'const t=require("fs").readFileSync(process.argv[1],"utf8").replace(/`[^`]*`/g,"");process.exit(/<[^<>\n]+>/.test(t)?0:1)' "$charter" \
    && pending+=("les champs <…> encore vides de la charte (CLAUDE.md)")
  # the arbitration criteria: a heading about arbitration in the charter or a reference document
  grep -qiE '^#+ .*(arbitr)' "$charter" "$root"/docs/*.md 2>/dev/null \
    || pending+=("les critères d'arbitrage (section « Comment on arbitre » de CLAUDE.md : la référence mature du domaine, l'existant à reprendre, les exigences du domaine)")
fi
# One package: docs/ at the root. Several: each package under packages/ has its own three documents,
# unless docs/agents/hors-cadre.txt lists it ("<package> <reason>", e.g. a frozen version).
exempt="$root/docs/agents/hors-cadre.txt"
if ls -d "$root"/packages/*/ >/dev/null 2>&1; then
  for pkg in "$root"/packages/*/; do
    name="$(basename "$pkg")"
    grep -qE "^$name( |$)" "$exempt" 2>/dev/null && continue
    for doc in ARCHITECTURE CADRE INTERFACE; do
      [ -f "$pkg/docs/$doc.md" ] || pending+=("packages/$name/docs/$doc.md")
    done
  done
else
  for doc in ARCHITECTURE CADRE INTERFACE; do
    [ -f "$root/docs/$doc.md" ] || pending+=("docs/$doc.md")
  done
fi
[ -f "$root/CONTEXT.md" ] || pending+=("le lexique du domaine (CONTEXT.md)")

# Once the architecture is written, the project chooses how an integration tests (grill, branch 9).
if [ -f "$root/docs/ARCHITECTURE.md" ] && [ -f "$root/package.json" ]; then
  mode="$(node -e 'process.stdout.write(require(process.argv[1]).grillhouse?.integration ?? "")' "$root/package.json" 2>/dev/null)"
  [ -n "$mode" ] || pending+=("les tests d'une intégration : « complet » ou « impactes » avec la nuit (grill, branche 9)")
fi
# The integration script runs the project's own suites and guards: two npm scripts to wire.
wiring=()
for s in integration:suites integration:gardes; do
  node -e 'const p=require(process.argv[1]);process.exit(p.scripts&&p.scripts[process.argv[2]]?0:1)' \
    "$root/package.json" "$s" 2>/dev/null || wiring+=("$s")
done

# The « impactes » mode leaves every suite to the night, which needs its line in the crontab.
if [ "${mode:-}" = impactes ] && ! crontab -l 2>/dev/null | grep -qF "$root/scripts/nuit.sh"; then
  nuit="0 3 * * * bash $root/scripts/nuit.sh"
fi

[ ${#missing[@]} -eq 0 ] && [ ${#pending[@]} -eq 0 ] && [ ${#wiring[@]} -eq 0 ] && [ -z "${nuit:-}" ] && exit 0

echo "## Éléments du projet à définir (Roomi's Grillhouse)"
if [ ${#missing[@]} -gt 0 ]; then
  echo "Manque : $(IFS=';'; echo "${missing[*]}" | sed "s/;/, /g"). Lance \`bash scripts/setup.sh\` toi-même avant tout autre geste : il est sans invite et idempotent."
fi
if [ ${#pending[@]} -gt 0 ]; then
  echo "Pas encore renseignés :"
  for p in "${pending[@]}"; do echo "- $p"; done
  echo "Dès ta première réponse, propose au responsable de les griller, chacun avec ce que tu recommandes pour ce projet (compétence \`grill\`). Il peut accepter, en choisir un, ou reporter ; tant qu'un élément reste vide, cette proposition revient à chaque séance."
fi
if [ ${#wiring[@]} -gt 0 ]; then
  echo "À brancher : $(IFS=' '; echo "${wiring[*]}") dans le package.json de la racine. Le script d'intégration (\`scripts/integration/integrer.mjs\`, contrat en tête) en a besoin pour lancer les suites et les gardes du projet ; sans eux, il refuse chaque lot. Un projet testé par Vitest reprend \`node scripts/integration/suites-vitest.mjs\` et \`npm run --silent pretest\` ; sinon, écris l'adaptateur de ses suites."
fi
if [ -n "${nuit:-}" ]; then
  echo "La nuit n'est pas programmée : le projet a choisi « impactes », et ses suites complètes ne tournent que la nuit (\`scripts/nuit.sh\`). Propose au responsable d'ajouter à la table des tâches du poste (\`crontab -e\`) : \`$nuit\`."
fi
