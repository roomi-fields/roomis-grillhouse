#!/usr/bin/env bash
# Launches a role agent on one ticket, as its own Claude session inside the envelope of its
# plan, the packages it writes (one session of the testwriter or the developpeur for the whole
# ticket, `.` as its component and the plan as `--paquets`, grillhouse-3uv.95.6). The supervisor runs it in the background and is told when the session ends.
#
#   npx grillhouse lancer [--modele <m>] [--effort <e>] [--seance <id> | --reprise <id>] [--paquets <liste>] <ticket> <rôle> <composant> <fichier de consigne>
#
# - <composant> is the component's path from the root (`packages/<nom>`, or `.` for the whole
#   repository). It is judged before the copy is prepared, by the envelope's rule
#   (`jugerComposant` of enveloppe.mjs), as the role and the instruction are, in the ticket's copy
#   when it exists, else in the main tree or in the tree of the branch agent/<ticket> when it
#   exists (`git cat-file -e`; `.` is always admitted): a path that names nothing there is refused on the standard error, CODE_USAGE, nothing prepared; when
#   it is the name of a component of the module of its language (a package, a crate) or of its folder, the refusal names the path it means.
# - --paquets <liste> is the plan of the session: the paths of the packages it writes, in the form
#   of the envelope's variable (`ecrireLaListe` of paquets-du-plan.mjs, `packages/a:packages/b`),
#   each judged as <composant> is; without it, the plan is <composant> alone. The envelope shows
#   the session the whole copy and opens in writing the packages of the plan alone. It takes a
#   value as --modele does.
# - --modele <m> and --effort <e> override, for this session only, the model and the thinking level
#   of the role's definition (its agent in the frame's plugin, agents/<rôle>.md); they reach claude
#   as --model and --effort.
#   Each is optional and works alone; without them the role decides. The level is one of low,
#   medium, high, xhigh, max; the model is any non-empty text, passed to claude as given. They come
#   first, each as two words (`--modele opus`); `--modele=opus`, `--`, a value starting with `--`,
#   an unknown option or an option after the four arguments is refused, CODE_USAGE, before the copy
#   is prepared. A repeated option keeps its last value; every level given is checked.
# - --seance <id> opens the session under that id (claude's --session-id), and --reprise <id>
#   resumes the session of that id (claude's --resume), which claude finds among the transcripts
#   of the copy's working directory (`~/.claude/projects/<copy in dashes>/`, which the envelope
#   mounts in writing over the real directory, so that a transcript outlives its session). The
#   circuit gives them, so that a relaunch of an agent on its step resumes its session. The two
#   together are refused, CODE_USAGE; each takes a value as --modele does.
#   A resumed session receives its instruction alone: the session it resumes holds the sections
#   the launcher adds below, save « La construction échoue », which it receives.
# - The agent's copy is the worktree .claude/worktrees/<ticket> (branch agent/<ticket>), created
#   from the main tree's HEAD when absent and moved forward to it otherwise. When the branch exists
#   without a copy, it is brought back to the main tree's HEAD and the copy is made on it: the lot
#   the branch carried ahead of main (a branch the queue sent back) comes back as local work in
#   the copy, a conflict with main marked in its file; a branch with nothing ahead simply starts
#   again from main. A ticket whose branch is still in the integration queue is not launched:
#   the refusal goes to the log, which names the queue, CODE_COPIE, before any copy is made.
#   Moving forward keeps
#   the work in progress of the copy in the copy, never in git's stash, which every copy of the
#   repository shares: it is set aside as a lot, the copy fast-forwards, and the lot is applied
#   three ways, as the lot of a branch sent back is (scripts/enveloppe/travail-de-la-copie.mjs).
#   A refusal, such as commits of the agent on its branch or conflicts left unresolved, goes to
#   the log and stops the launch, CODE_COPIE; so does a reapplication that conflicts: the log
#   names the copy and each file in conflict, the conflicts stay marked in the copy's files and
#   unmerged in its index, and no agent starts on a half-merged copy. Its
#   submodules go through the common preparation (scripts/sous-modules.sh): before moving forward,
#   a submodule carrying local work stops the launch, CODE_COPIE, its log naming it, the work in
#   place; then every submodule is set at the commit of HEAD, before any installation, except one the
#   project shares (`grillhouse.partage`), which the copy reads from the main repository. Its
#   dependencies are installed when `node_modules` is absent or `package-lock.json` is newer than
#   the last installation (`node_modules/.package-lock.json`, written by npm), and it is built there
#   for the session's plan by the module of its language, when the module describes it
#   (`construire`, by scripts/commande-du-langage.mjs, as the night plays its night tests; the
#   module typescript builds by Turborepo, which restores
#   an unchanged build from its cache, scripts/langages/typescript/construire.mjs), outside the
#   envelope, so the agent finds built what it reads out of its plan. A build that fails does not
#   stop the launch: the session opens, its instruction ending with a section « La construction
#   échoue », whose first line says which build failed and what was built, with the end of its
#   output, since repairing it is the session's work (a provider's lot that breaks its consumers).
#   Any other failure of the command, the installation and every other step of the preparation
#   stop it, CODE_COPIE. The
#   installation and the build play through `scripts/sous-modules.sh monter`, each shared submodule
#   of the main repository read-only, by the list the pose printed, whatever the installation
#   rewrites afterwards; with a shared submodule and no possible mount (bwrap absent or
#   refused), the launch stops, CODE_COPIE, before any command runs. In the envelope the main
#   repository is read-only as a whole.
# - The envelope receives the role: it decides who writes the package of the shared test material.
# - The session runs `claude -p` with the role's agent and, as its prompt, read on its standard
#   input from a temporary file the launcher writes and removes (an argument may not pass the
#   128 KiB Linux allows one, MAX_ARG_STRLEN), the instruction file
#   followed by the section « Ce que les composants d'avant publient », for each package of the
#   plan (one part per package when the plan holds several, grillhouse-3uv.95.6): for each
#   component whose `## Consommateurs` section names the package, its line, the names of the
#   elements declared for the package, and the address of the rubric « Rend » of its frame, the
#   rest of its elements left to the index of the interfaces (`grillhouse index-interfaces
#   --publie <plan>`, a command of the module of the copy's language, read in the prepared copy; a reading that fails stops the launch,
#   CODE_COPIE), then the
#   section « Ton dossier de travail », which names the session's working directory, where every
#   temporary file goes (`dossierDeTravail` of enveloppe.mjs, the envelope's TMPDIR), then the
#   section « La construction échoue » when it fails. The prompt
#   carries « TON TICKET : <ticket> », which the role's locks read. The envelope is the sandbox, so
#   the session runs without permission prompts, under the rights and the context of its role
#   (scripts/droits.mjs, given the main tree, the copy and the ticket; a reading that fails stops
#   the launch, CODE_COPIE): the user's own configuration left out, its settings on the command
#   line (its refusals, among them the change of its author at the ticket, AUTEUR_FIXE: its
#   comments carry the author the launch names in BEADS_ACTOR, which the envelope passes on; its
#   locks), its tools and the servers of the index, for the reading of the whole copy.
# - A role that ends on a sheet (scripts/resultats.mjs: the testwriter, the developpeur) runs with
#   `--output-format json --json-schema <its schema>` (`npx grillhouse resultats --schema
#   <rôle>`): claude's JSON result, its sheet in `structured_output`, goes to
#   .claude/worktrees/<ticket>.resultat.json, which a launch removes first and the circuit reads,
#   then to the log; its errors go to the log.
# - Its output, and an envelope refusal (CODE_REFUS), are added to .claude/worktrees/<ticket>.log,
#   the log of the ticket, which keeps every session of the ticket: each launch past the checks of
#   its call adds a header line, `=== <time> · <rôle> · <composant> ===`, then its preparation and
#   its session. The agent writes its handover in the ticket. Once the envelope has ended, the
#   launcher writes the session's exit code to .claude/worktrees/<ticket>.fin, which a launch
#   removes first: a launch that stops before its session leaves none, so the circuit
#   (scripts/circuit.mjs) tells a code of the session from CODE_USAGE, CODE_REFUS and CODE_COPIE.
#   A session its lock stopped on a write out of the plan (scripts/verrous/verrou.mjs) left the
#   reason in its working directory (`hors-plan`, removed before the session): the launcher moves
#   it to .claude/worktrees/<ticket>.hors-plan, which a launch removes first and the circuit reads,
#   and adds it to the log. It then writes the session's line to the register
#   (scripts/registre.mjs --copie), and exits with the envelope's code.
# - The exit codes are named in scripts/enveloppe/codes.mjs; a malformed call exits CODE_USAGE.
# - CLAUDE_BIN replaces `claude` (the tests use it).
set -euo pipefail
ici="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
eval "$(node "$ici/codes.mjs")"
usage="usage: npx grillhouse lancer [--modele <m>] [--effort <e>] [--seance <id> | --reprise <id>] [--paquets <liste>] <ticket> <rôle> <composant> <fichier de consigne>"
refus_usage() { echo "$usage" >&2; exit "$CODE_USAGE"; }
modele="" effort="" seance="" reprise="" liste="" surcharge=()
while [ $# -gt 0 ]; do
  case "$1" in
    --modele|--effort|--seance|--reprise|--paquets)
      [ $# -ge 2 ] && [ -n "$2" ] && [[ "$2" != --* ]] || refus_usage
      if [ "$1" = --modele ]; then
        modele=$2
      elif [ "$1" = --seance ]; then
        seance=$2
      elif [ "$1" = --reprise ]; then
        reprise=$2
      elif [ "$1" = --paquets ]; then
        liste=$2
      else
        case "$2" in low|medium|high|xhigh|max) effort=$2 ;; *) refus_usage ;; esac
      fi
      shift 2 ;;
    -*) refus_usage ;;
    *) break ;;
  esac
done
[ -z "$modele" ] || surcharge+=(--model "$modele")
[ -z "$effort" ] || surcharge+=(--effort "$effort")
[ -z "$seance" ] || [ -z "$reprise" ] || refus_usage
[ -z "$seance" ] || surcharge+=(--session-id "$seance")
[ -z "$reprise" ] || surcharge+=(--resume "$reprise")
[ $# -eq 4 ] || refus_usage
ticket=$1 role=$2 composant=$3 consigne=$4
# The plan of the session: the packages it writes.
paquets=${liste:-$composant}
# The main tree, from the common git directory: launched from an agent copy, the new copy still
# lands next to the others, never inside one.
racine=$(cd "$(git rev-parse --path-format=absolute --git-common-dir)/.." && pwd)
# A role is one of the circuit's, whose rights scripts/droits.mjs gives (ROLES).
node --input-type=module -e "import { ROLES } from '$ici/../droits.mjs'; process.exit(Object.hasOwn(ROLES, process.argv[1]) ? 0 : 1);" "$role" || { echo "⛔ Rôle inconnu : $role (aucun rôle du circuit, scripts/droits.mjs)." >&2; exit "$CODE_USAGE"; }
[ -f "$consigne" ] || { echo "⛔ Consigne introuvable : $consigne" >&2; exit "$CODE_USAGE"; }
# The component, judged by the envelope's rule before anything is prepared: in the ticket's copy
# when it exists (a relaunch, whose package an earlier agent may have created), else in the main
# tree or, when the branch agent/<ticket> exists (one the queue sent back), in its tree, whose lot
# the copy made again carries.
juge="$racine" branche=
if [ -d "$racine/.claude/worktrees/$ticket" ]; then
  juge="$racine/.claude/worktrees/$ticket"
elif git -C "$racine" rev-parse --verify --quiet "refs/heads/agent/$ticket" > /dev/null; then
  branche="agent/$ticket"
fi
refus_composant=$(node --input-type=module -e "import { spawnSync } from 'node:child_process'; import { existsSync } from 'node:fs'; import path from 'node:path'; import { jugerComposant, paquetsDuLangage } from '$ici/enveloppe.mjs'; import { lireLaListe } from '$ici/paquets-du-plan.mjs'; import { langageDe } from '$ici/../langages.mjs'; const [depot, composant, liste, branche] = process.argv.slice(1); const dansBranche = p => { const rel = path.relative(depot, p); return rel === '' || (!rel.startsWith('..') && spawnSync('git', ['-C', depot, 'cat-file', '-e', branche + ':' + rel]).status === 0); }; const existe = p => existsSync(p) || (branche !== '' && dansBranche(p)); const tous = paquetsDuLangage(langageDe(depot), depot); process.stdout.write([composant, ...lireLaListe(liste)].map(c => jugerComposant({ depot, composant: c, paquets: tous }, { existe })).find(Boolean) ?? '');" "$juge" "$composant" "$paquets" "$branche") || exit "$CODE_USAGE"
[ -z "$refus_composant" ] || { echo "⛔ $refus_composant" >&2; exit "$CODE_USAGE"; }
# The ticket is matched whole: `demo-3160` is not `demo-316`, and its dots are dots.
motif=$(printf '%s' "$ticket" | sed 's/[.[\*^$]/\\&/g')
grep -qE "TON TICKET : ${motif}([^A-Za-z0-9_.-]|$)" "$consigne" || { echo "⛔ La consigne ne porte pas « TON TICKET : $ticket »." >&2; exit "$CODE_USAGE"; }

copie="$racine/.claude/worktrees/$ticket"
journal="$copie.log"
fin="$copie.fin"
resultat="$copie.resultat.json"
hors_plan="$copie.hors-plan"
mkdir -p "$(dirname "$copie")"
rm -f "$fin" "$resultat" "$hors_plan"
printf '=== %s · %s · %s ===\n' "$(date -Iseconds)" "$role" "$composant" >> "$journal"
# A branch still in the queue is not relaunched: the queue brings it onto main, or sends it back.
if node --input-type=module -e "import { lireEntrees } from '$ici/../integration/file-attente.mjs'; const [r, b, t] = process.argv.slice(1); process.exit(lireEntrees(r).some(e => e.branche === b || e.ticket === t) ? 0 : 1);" "$racine" "agent/$ticket" "$ticket"; then
  refus="⛔ La branche agent/$ticket est encore en file d'intégration : la file l'amène sur main ou la renvoie ; le ticket ne se relance pas avant."
  echo "$refus" >> "$journal"
  echo "$refus" >&2
  exit "$CODE_COPIE"
fi
# The output of the session's build, when it fails, behind its first line, which says what failed
# and what was built: the module's command `construire` writes it.
echec=$(mktemp)
(
  # Each step returns on failure: `set -e` does not act inside a subshell tested by `||`.
  if [ ! -d "$copie" ]; then
    tete=$(git -C "$racine" rev-parse HEAD) || exit 1
    branche="agent/$ticket"
    base= pointe=
    if git -C "$racine" rev-parse --verify -q "refs/heads/$branche" > /dev/null; then
      # A branch already there: the queue sent it back, or it was left without a commit. Its lot,
      # when it carries one, goes back as local work on main; the branch returns to main.
      if [ "$(git -C "$racine" rev-list --count "$tete..$branche")" -gt 0 ]; then
        base=$(git -C "$racine" merge-base "$tete" "$branche") || exit 1
        pointe=$(git -C "$racine" rev-parse "$branche") || exit 1
      fi
      git -C "$racine" branch -q -f "$branche" "$tete" || exit 1
      git -C "$racine" worktree add -q "$copie" "$branche" || exit 1
    else
      git -C "$racine" worktree add -q -b "$branche" "$copie" HEAD || exit 1
    fi
    if [ -n "$pointe" ]; then
      # The lot as local work, a conflict marked in its file (travail-de-la-copie.mjs).
      node "$ici/travail-de-la-copie.mjs" reporter "$copie" "$base" "$pointe" || exit 1
    fi
  else
    bash "$ici/../sous-modules.sh" garde "$copie" || exit 1
    # The work in progress moves with the copy, in the copy: a conflict stops the launch, marked
    # in the files, the log naming each one (travail-de-la-copie.mjs).
    node "$ici/travail-de-la-copie.mjs" avancer "$copie" "$(git -C "$racine" rev-parse HEAD)" || exit 1
  fi
  # The list the pose fixes is the one every mount gets, whatever the installation rewrites.
  partages=$(bash "$ici/../sous-modules.sh" pose "$copie") || exit 1
  monter() { bash "$ici/../sous-modules.sh" monter "$copie" --partages "$partages" "$@"; }
  monter true || exit 1
  if [ -f "$copie/package.json" ]; then
    # --no-save leaves the lock file as committed, so a clean copy stays clean.
    installe="$copie/node_modules/.package-lock.json"
    if [ ! -d "$copie/node_modules" ] || [ "$copie/package-lock.json" -nt "$installe" ]; then
      monter npm --prefix "$copie" install --no-save --no-audit --no-fund --silent || exit 1
    fi
    # The build of the copy for the session's plan, by the module of its language (`construire`),
    # when it describes one: a build that fails writes its first line and its output in $echec,
    # and the session opens with them; any other failure stops the launch.
    (cd "$copie" && monter node "$ici/../commande-du-langage.mjs" construire --echec "$echec" "$paquets") || exit 1
  fi
) >> "$journal" 2>&1 || { rm -f "$echec"; echo "⛔ La copie $copie n'a pas pu être préparée : voir $journal." >&2; exit "$CODE_COPIE"; }
# What the components before each package of the plan publish, read in the prepared copy,
# follows the instruction.
publie=$(cd "$copie" && node "$ici/../../bin/grillhouse.mjs" index-interfaces --publie "$paquets" 2>> "$journal") \
  || { rm -f "$echec"; echo "⛔ Ce que publient les composants d'avant n'a pas pu se lire : voir $journal." >&2; exit "$CODE_COPIE"; }
# The session's working directory, the one the envelope gives as TMPDIR, follows them.
travail=$(node --input-type=module -e "import { dossierDeTravail } from '$ici/enveloppe.mjs'; process.stdout.write(dossierDeTravail(process.argv[1]));" "$copie" 2>> "$journal") \
  || { rm -f "$echec"; echo "⛔ Le dossier de travail de la séance n'a pas pu se lire : voir $journal." >&2; exit "$CODE_COPIE"; }
# The mark a lock leaves there when it stops the session out of the plan: none before the session.
rm -f "$travail/hors-plan"
dossier=$'\n\n'"## Ton dossier de travail"$'\n\n'"Tout fichier temporaire s'écrit dans \`$travail\`, que \`\$TMPDIR\` nomme aussi."
construction=
if [ -s "$echec" ]; then
  construction=$'\n\n'"## La construction échoue"$'\n\n'"$(head -n 1 "$echec") La réparer fait partie de ta tâche. La fin de sa sortie :"$'\n\n```\n'"$(tail -n +2 "$echec" | tail -n 100)"$'\n```'
fi
rm -f "$echec"
# The prompt, assembled in a file: claude reads it on its standard input, since as an argument it
# may pass the size Linux allows one (MAX_ARG_STRLEN, 128 KiB).
# A resumed session holds the sections of its first instruction: only a failed build is news.
prompt=$(mktemp)
if [ -n "$reprise" ]; then
  printf '%s' "$(cat "$consigne")$construction" > "$prompt"
else
  printf '%s' "$(cat "$consigne")"$'\n\n'"$publie$dossier$construction" > "$prompt"
fi

# The rights and the context of the role's session (scripts/droits.mjs), one option per line.
droits=$(node "$ici/../droits.mjs" "$role" --racine "$racine" --copie "$copie" --ticket "$ticket" 2>> "$journal") \
  || { rm -f "$prompt"; echo "⛔ Les droits de la séance n'ont pas pu se lire : voir $journal." >&2; exit "$CODE_COPIE"; }
mapfile -t droits_du_role <<<"$droits"

# The schema of the role's end-of-session sheet (scripts/resultats.mjs), for a role that has one:
# the session ends on it, which claude writes in its JSON result, on the standard output.
fiche=()
schema=$(node "$ici/../resultats.mjs" --schema "$role" 2> /dev/null) || schema=
[ -z "$schema" ] || fiche=(--output-format json --json-schema "$schema")

# An envelope in error does not stop the launcher (set -e): its code is kept for the exit.
code=0
lancer_claude() {
  node "$ici/enveloppe.mjs" "$copie" "$paquets" "$role" -- \
    "${CLAUDE_BIN:-claude}" -p --agent "$role" \
    ${surcharge[@]+"${surcharge[@]}"} ${fiche[@]+"${fiche[@]}"} --permission-mode bypassPermissions \
    "${droits_du_role[@]}" < "$prompt"
}
if [ -n "$schema" ]; then
  lancer_claude > "$resultat" 2>> "$journal" || code=$?
  { cat "$resultat"; echo; } >> "$journal"
else
  lancer_claude >> "$journal" 2>&1 || code=$?
fi
rm -f "$prompt"
# A session its lock stopped out of the plan (scripts/verrous/verrou.mjs): its reason goes to the
# circuit, and to the log.
if [ -f "$travail/hors-plan" ]; then
  mv "$travail/hors-plan" "$hors_plan"
  { cat "$hors_plan"; echo; } >> "$journal"
fi
echo "$code" > "$fin"
# The envelope ended: the session's line goes to the register from outside it, whatever its end hook did.
node "$ici/../registre.mjs" --copie "$copie" >> "$journal" 2>&1 || true
exit "$code"
