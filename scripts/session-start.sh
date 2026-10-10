#!/usr/bin/env bash
# SessionStart hook: tells the session what the project still lacks before work can start.
# Silent once the project is set up and initialised. Read-only: it changes nothing.
#
# The project's own check: `grillhouse.demarrage` in the package.json of the root names an npm
# script (`npm pkg set grillhouse.demarrage=<script>`). The session start plays
# `npm run --silent <script>` at the root; each non-blank line it writes joins the list « Pas encore
# renseignés », as an item to deal with. The script has 10 s: past them its whole process group is
# stopped. A failure (non-zero code) or a stop adds a line that says so, after the lines already
# written; the session start goes on. Without the key (or with null), nothing runs; a value that is
# not a non-blank string runs nothing and adds a line that says so. An agent's copy does not play it.
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
# The index of CodeGraph is for the roles that see the whole repository: an agent's copy (a git
# worktree under .claude/worktrees/) is asked for neither the tool nor the index.
copie_agent=
case "$root" in
  */.claude/worktrees/*)
    [ "$(git -C "$root" rev-parse --git-dir 2>/dev/null)" != "$(git -C "$root" rev-parse --git-common-dir 2>/dev/null)" ] && copie_agent=1
    ;;
esac
if [ -z "$copie_agent" ]; then
  command -v codegraph >/dev/null || missing+=("l'outil CodeGraph")
  [ -d "$root/.codegraph" ] || missing+=("l'index CodeGraph du code")
fi
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
# The packages out of the frame: docs/agents/hors-cadre.txt ("<package> <reason>", e.g. a frozen
# version), read by scripts/consommateurs.mjs as every check reads it. Line 1: the names listed;
# line 2: the names that no directory under packages/ or src/ bears.
{ read -r hors; read -r inconnus; } < <(node --input-type=module -e '
const { pathToFileURL } = await import("node:url");
const m = await import(pathToFileURL(process.argv[1]).href);
process.stdout.write(`${[...m.horsCadre(process.argv[2])].join(" ")}\n${m.horsCadreInconnus(process.argv[2]).join(" ")}\n`);
' "$root/scripts/consommateurs.mjs" "$root" 2>/dev/null)
# One package: docs/ at the root. Several: each package under packages/ has its own three documents,
# unless it is out of the frame.
if ls -d "$root"/packages/*/ >/dev/null 2>&1; then
  for pkg in "$root"/packages/*/; do
    name="$(basename "$pkg")"
    case " ${hors:-} " in *" $name "*) continue ;; esac
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

# The project's own check (grillhouse.demarrage, described in the header), outside an agent's copy.
# The reading gives « script<TAB>name », « invalide<TAB>value as JSON », or nothing.
lecture=
[ -n "$copie_agent" ] || lecture="$(node -e '
  const v = require(process.argv[1]).grillhouse?.demarrage;
  if (v == null) process.exit(0);
  if (typeof v === "string" && v.trim()) process.stdout.write("script\t" + v);
  else process.stdout.write("invalide\t" + JSON.stringify(v));
' "$root/package.json" 2>/dev/null)"
demarrage=
case "$lecture" in
  script$'\t'*) demarrage="${lecture#script$'\t'}" ;;
  invalide$'\t'*) pending+=("la clé grillhouse.demarrage vaut ${lecture#invalide$'\t'}, pas un nom de script npm : rien n'est lancé") ;;
esac
if [ -n "$demarrage" ]; then
  # timeout signals the script's whole process group, so a child that keeps the output open stops too.
  sortie="$(cd "$root" && timeout -k 2 10 npm run --silent "$demarrage" 2>/dev/null)"
  code=$?
  while IFS= read -r ligne; do
    ligne="${ligne%$'\r'}"
    [ -n "${ligne//[[:space:]]/}" ] && pending+=("$ligne")
  done <<< "$sortie"
  if [ "$code" -eq 124 ] || [ "$code" -eq 137 ]; then
    pending+=("le contrôle d'ouverture \`npm run $demarrage\` (grillhouse.demarrage) a été interrompu après 10 s")
  elif [ "$code" -ne 0 ]; then
    pending+=("le contrôle d'ouverture \`npm run $demarrage\` (grillhouse.demarrage) échoue (code $code)")
  fi
fi

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

# The « impactes » mode replays every suite once a night, which needs its line in the crontab.
if [ "${mode:-}" = impactes ] && ! crontab -l 2>/dev/null | grep -qF "$root/scripts/nuit.sh"; then
  nuit="0 3 * * * bash $root/scripts/nuit.sh"
fi

# An epic is a chantier, at the root: one with a mother is a mother ticket typed by mistake.
epopees="$(cd "$root" && bd list --type epic --all --json --limit 0 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).filter(t=>t.parent).map(t=>t.id).join(" "))}catch{}})')"

# The frame's files as the project installed them (scripts/grillhouse-maj.mjs).
ecarts="$(cd "$root" && node scripts/grillhouse-maj.mjs --ecarts 2>/dev/null)"

[ ${#missing[@]} -eq 0 ] && [ ${#pending[@]} -eq 0 ] && [ ${#wiring[@]} -eq 0 ] && [ -z "${nuit:-}" ] && [ -z "$epopees" ] && [ -z "$ecarts" ] && [ -z "${inconnus:-}" ] && exit 0

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
  echo "La nuit n'est pas programmée : le projet a choisi « impactes », et ses suites complètes tournent une fois la nuit (\`scripts/nuit.sh\`). Propose au responsable d'ajouter à la table des tâches du poste (\`crontab -e\`) : \`$nuit\`."
fi
if [ -n "$epopees" ]; then
  echo "Épopées qui ont une mère : $epopees. Une épopée est un chantier, à la racine ; une mère sous un chantier est une tâche (\`bd update <id> -t task\`, docs/agents/issue-tracker.md, « Numéros et titres »)."
fi
if [ -n "${inconnus:-}" ]; then
  echo "docs/agents/hors-cadre.txt nomme un dossier absent de packages/ et de src/ : $inconnus. Corrige la ligne (faute de frappe) ou retire-la : un nom sans dossier n'écarte rien."
fi
[ -n "$ecarts" ] && echo "$ecarts"
exit 0
