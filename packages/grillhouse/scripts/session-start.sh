#!/usr/bin/env bash
# SessionStart hook: tells the session what the project still lacks before work can start.
# Silent once the project is set up and initialised. It changes nothing, save the lock of the
# supervisor below.
#
# The project's own check: `grillhouse.demarrage` in the package.json of the root names an npm
# script (`npm pkg set grillhouse.demarrage=<script>`). The session start plays
# `npm run --silent <script>` at the root; each non-blank line it writes joins the list « Pas encore
# renseignés », as an item to deal with. The script has 10 s: past them its whole process group is
# stopped. A failure (non-zero code) or a stop adds a line that says so, after the lines already
# written; the session start goes on. Without the key (or with null), nothing runs; a value that is
# not a non-blank string runs nothing and adds a line that says so. An agent's copy does not play it.
#
# The frame's plugins: scripts/greffons.mjs --absents reads `.claude/settings.json` and
# `claude plugin list --json` (each call stopped after 5 s). Each declared plugin not installed for
# the project joins « Manque » as « le greffon <id> », the missing claude command as « la commande
# claude » (the line gives `npx grillhouse setup`, which installs them), and a reading that fails
# or is stopped as « la lecture des greffons … ». The same reading names the frame's mod installed
# for the project at another version than the package @roomi-fields/grillhouse, both released under
# one version, with the command that aligns the one behind. An agent's copy does not read them.
#
# One supervisor per project (scripts/superviseur.mjs): the session takes the lock of its
# repository; a second session, while the first one lives, receives first the section « Un autre
# superviseur tient ce dépôt », which asks it to say so to the owner and to launch no circuit. An
# agent's copy and a session of a role the circuit launches take nothing and receive nothing.
#
# A session of a role agent of the project (`claude --agent <rôle>`, the circuit's sessions: the
# hook's input names it, `agent_type`, and `.claude/agents/<rôle>.md` defines it) receives nothing:
# what the project lacks is the supervisor's to deal with, and in an envelope the documents of the
# hidden packages read as absent.
set -uo pipefail

# The project is Claude Code's, else the working directory; the frame's scripts are this one's
# neighbours.
root="${CLAUDE_PROJECT_DIR:-$PWD}"
ici="$(cd "$(dirname "$0")" && pwd)"
entree=
[ -t 0 ] || entree="$(cat)"
role="$(printf '%s' "$entree" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const a=JSON.parse(s).agent_type;if(typeof a==="string"&&/^[A-Za-z0-9_-]+$/.test(a))process.stdout.write(a)}catch{}})' 2>/dev/null)"
[ -n "$role" ] && [ -f "$root/.claude/agents/$role.md" ] && exit 0
if [ -f "$root/.claude/template" ]; then
  echo "## Gabarit Roomi's Grillhouse"
  echo "Ce dossier est le gabarit du framework, pas un projet : il ne s'initialise pas. Un projet neuf se crée par \`npm run new -- <chemin> [préfixe]\` ; sa première séance propose le grill d'initialisation."
  exit 0
fi

# One supervisor per project: the lock of the repository, or the section that says who holds it.
superviseur="$(node "$ici/superviseur.mjs" "$root" 2>/dev/null)"
[ -z "$superviseur" ] || echo "$superviseur"

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
# The frame's plugins not installed for the project (scripts/greffons.mjs): the plugins are the
# machine's installation for the project, so an agent's copy does not read them.
if [ -z "$copie_agent" ]; then
  while IFS= read -r ligne; do
    case "$ligne" in
      claude) missing+=("la commande claude") ;;
      "greffon "*) missing+=("le greffon ${ligne#greffon }") ;;
      "lecture "*) missing+=("la lecture des greffons : ${ligne#lecture }") ;;
      "ecart "*)
        read -r _ e_id e_greffon e_paquet e_commande <<< "$ligne"
        ecart_versions="Le greffon $e_id est en $e_greffon, le paquet @roomi-fields/grillhouse en $e_paquet : les deux sortent ensemble, sous une même version. Aligne-les : \`$e_commande\`."
        ;;
    esac
  done < <(timeout -k 1 8 node "$ici/greffons.mjs" --absents "$root" 2>/dev/null)
fi
# The frame's git hooks absent from the folder git reads (scripts/crochets.mjs), each named.
while IFS= read -r crochet; do
  [ -n "$crochet" ] && missing+=("le crochet git $crochet du cadre")
done < <(node "$ici/crochets.mjs" --absents "$root" 2>/dev/null)
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
# version), read by scripts/paquets.mjs as every check reads it; Turborepo plays none of
# its tasks (scripts/turbo-des-paquets.mjs). Line 1: the names listed;
# line 2: the names that no directory under packages/ or src/ bears.
{ read -r hors; read -r inconnus; } < <(node --input-type=module -e '
const { pathToFileURL } = await import("node:url");
const { horsCadre } = await import(pathToFileURL(process.argv[1]).href);
const { horsCadreInconnus } = await import(pathToFileURL(process.argv[2]).href);
process.stdout.write(`${[...horsCadre(process.argv[3])].join(" ")}\n${horsCadreInconnus(process.argv[3]).join(" ")}\n`);
' "$ici/paquets.mjs" "$ici/consommateurs.mjs" "$root" 2>/dev/null)
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

# The agents run the tests by `npm test`; the integration, the queue and the night run the guards
# and the tests by `npm run verifier` (Turborepo): two npm scripts to wire.
wiring=()
if [ -f "$root/package.json" ]; then
  for s in test verifier; do
    node -e 'const p=require(process.argv[1]);process.exit(p.scripts&&p.scripts[process.argv[2]]?0:1)' \
      "$root/package.json" "$s" 2>/dev/null || wiring+=("$s")
  done
fi

# Once the architecture is written, the night (the full pass played for real, the night tests and
# the time budget benches) needs its line in the crontab.
if [ -f "$root/docs/ARCHITECTURE.md" ] && ! crontab -l 2>/dev/null | grep -qF "cd $root && node_modules/.bin/grillhouse nuit"; then
  nuit="0 3 * * * cd $root && node_modules/.bin/grillhouse nuit"
fi

# An epic is a chantier, at the root: one with a mother is a mother ticket typed by mistake.
epopees="$(cd "$root" && bd list --type epic --all --json --limit 0 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).filter(t=>t.parent).map(t=>t.id).join(" "))}catch{}})')"

# The frame's files as the project installed them (scripts/grillhouse-maj.mjs).
ecarts="$(cd "$root" && node "$ici/grillhouse-maj.mjs" --ecarts 2>/dev/null)"

[ ${#missing[@]} -eq 0 ] && [ ${#pending[@]} -eq 0 ] && [ ${#wiring[@]} -eq 0 ] && [ -z "${nuit:-}" ] && [ -z "$epopees" ] && [ -z "$ecarts" ] && [ -z "${inconnus:-}" ] && [ -z "${ecart_versions:-}" ] && exit 0

echo "## Éléments du projet à définir (Roomi's Grillhouse)"
if [ ${#missing[@]} -gt 0 ]; then
  echo "Manque : $(IFS=';'; echo "${missing[*]}" | sed "s/;/, /g"). Lance \`npx grillhouse setup\` toi-même avant tout autre geste : il est sans invite et idempotent."
fi
if [ ${#pending[@]} -gt 0 ]; then
  echo "Pas encore renseignés :"
  for p in "${pending[@]}"; do echo "- $p"; done
  echo "Dès ta première réponse, propose au responsable de les griller, chacun avec ce que tu recommandes pour ce projet (compétence \`grill\`). Il peut accepter, en choisir un, ou reporter ; tant qu'un élément reste vide, cette proposition revient à chaque séance."
fi
if [ ${#wiring[@]} -gt 0 ]; then
  echo "À brancher : $(IFS=' '; echo "${wiring[*]}") dans le package.json de la racine. L'intégration (\`npx grillhouse integrer\`, contrat en tête de son script) et la nuit lancent \`npm run verifier\` (Turborepo, \`turbo.json\` : construction, puis gardes et tests), les agents \`npm test\` ; sans eux, l'intégration refuse chaque lot. Un projet testé par Vitest les reçoit de \`npm run grillhouse:maj\` ; sinon, écris-les pour ses tests."
fi
if [ -n "${nuit:-}" ]; then
  echo "La nuit n'est pas programmée : elle rejoue pour de vrai la passe complète, puis les tests de nuit et les bancs de budget, que le jour ne joue pas (\`npx grillhouse nuit\`). Propose au responsable d'ajouter à la table des tâches du poste (\`crontab -e\`) : \`$nuit\`."
fi
if [ -n "$epopees" ]; then
  echo "Épopées qui ont une mère : $epopees. Une épopée est un chantier, à la racine ; une mère sous un chantier est une tâche (\`bd update <id> -t task\`, docs/agents/issue-tracker.md, « Numéros et titres »)."
fi
if [ -n "${inconnus:-}" ]; then
  echo "docs/agents/hors-cadre.txt nomme un dossier absent de packages/ et de src/ : $inconnus. Corrige la ligne (faute de frappe) ou retire-la : un nom sans dossier n'écarte rien."
fi
[ -n "${ecart_versions:-}" ] && echo "$ecart_versions"
[ -n "$ecarts" ] && echo "$ecarts"
exit 0
