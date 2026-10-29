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
#   it is the name of a package or of its folder, the refusal names the path it means.
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
#   the work in progress of the copy: git stashes it, fast-forwards, and reapplies it
#   (`--autostash`). A refusal, such as commits of the agent on its branch, goes to the log and
#   stops the launch, CODE_COPIE; so does a reapplication that conflicts: the log names each file
#   in conflict, the work stays in git's stash, and no agent starts on a half-merged copy. Its
#   submodules go through the common preparation (scripts/sous-modules.sh): before moving forward,
#   a submodule carrying local work stops the launch, CODE_COPIE, its log naming it, the work in
#   place; then every submodule is set at the commit of HEAD, before any installation, except one the
#   project shares (`grillhouse.partage`), which the copy reads from the main repository. Its
#   dependencies are installed when `node_modules` is absent or `package-lock.json` is newer than
#   the last installation (`node_modules/.package-lock.json`, written by npm), and it is built there
#   by Turborepo, which restores an unchanged build from its cache, outside the envelope, so the
#   agent finds the builds of the packages out of its plan. As Bazel builds the dependencies of a
#   target before the target: for a plan whose every path is a package of the frame (the circuit's
#   session over the whole ticket, `.` as its component and the plan as `--paquets`, or a component
#   alone), their providers are built first (the builds their builds wait for, read in Turborepo's
#   graph, `turbo run build --filter=<paquet>… --dry=json`, which node reads on its standard input,
#   whatever its size), and a failure stops the launch, CODE_COPIE;
#   then the traces of other packages their tests wait for (`grillhouse.traces`, read in Turborepo's
#   plan of their tests, `turbo run test:vitest --filter=<paquet>… --dry=json`), which the envelope
#   shows read-only, and a failure stops the launch, CODE_COPIE. A task of either step that waits,
#   directly or not, for a task of a package of the plan (`attendentLePlan` of
#   turbo-des-paquets.mjs) is not played there: as with Bazel's --keep_going, a package of the plan
#   stays a target of the plan even as another's provider (BPScript's 990-corpus, the shared test
#   material, which the trace of 060-encoder waits for), and goes with the plan. Then the packages,
#   the traces of the plan or that wait for it, and what their tests read (`turbo run build <those
#   traces> --filter=<paquet>...… --continue=dependencies-successful`), whose failure does not
#   stop it: each task whose
#   dependencies succeed goes to its end, so what their tests read without depending on them is
#   built whole; the session opens, its instruction ending with a section « La construction
#   échoue » with the end of that output, since repairing it is the session's work (a
#   provider's lot that breaks its consumers). Their consumers are not built. Any other plan, the
#   whole repository (`.`) included, or a path that is no package of the frame (BPScript's
#   libraries/), reads the graph of the whole copy dry (`turbo run build --dry=json`), whose
#   failure (Turborepo absent, its configuration refused) stops the launch, CODE_COPIE, then builds
#   the copy whole as far as it builds (`turbo run build --continue=dependencies-successful`): its
#   failure does not stop the launch either, and goes into the same section. The first line of the
#   section says which build failed and what was built. The installation and every other step of
#   the preparation stop it, CODE_COPIE. The
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
refus_composant=$(node --input-type=module -e "import { spawnSync } from 'node:child_process'; import { existsSync } from 'node:fs'; import path from 'node:path'; import { jugerComposant } from '$ici/enveloppe.mjs'; import { lireLaListe } from '$ici/paquets-du-plan.mjs'; import { paquets } from '$ici/../paquets.mjs'; const [depot, composant, liste, branche] = process.argv.slice(1); const dansBranche = p => { const rel = path.relative(depot, p); return rel === '' || (!rel.startsWith('..') && spawnSync('git', ['-C', depot, 'cat-file', '-e', branche + ':' + rel]).status === 0); }; const existe = p => existsSync(p) || (branche !== '' && dansBranche(p)); const tous = paquets(depot); process.stdout.write([composant, ...lireLaListe(liste)].map(c => jugerComposant({ depot, composant: c, paquets: tous }, { existe })).find(Boolean) ?? '');" "$juge" "$composant" "$paquets" "$branche") || exit "$CODE_USAGE"
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
# and what was built (`echouer`).
echec=$(mktemp)
echouer() { local sortie; sortie=$(cat "$echec"); printf '%s\n%s\n' "$1" "$sortie" > "$echec"; }
(
  # Each step returns on failure: `set -e` does not act inside a subshell tested by `||`.
  if [ ! -d "$copie" ]; then
    tete=$(git -C "$racine" rev-parse HEAD) || exit 1
    branche="agent/$ticket"
    lot=
    if git -C "$racine" rev-parse --verify -q "refs/heads/$branche" > /dev/null; then
      # A branch already there: the queue sent it back, or it was left without a commit. Its lot,
      # when it carries one, goes back as local work on main; the branch returns to main.
      if [ "$(git -C "$racine" rev-list --count "$tete..$branche")" -gt 0 ]; then
        base=$(git -C "$racine" merge-base "$tete" "$branche") || exit 1
        lot=$(mktemp) || exit 1
        git -C "$racine" diff --binary "$base" "$branche" > "$lot" || exit 1
      fi
      git -C "$racine" branch -q -f "$branche" "$tete" || exit 1
      git -C "$racine" worktree add -q "$copie" "$branche" || exit 1
    else
      git -C "$racine" worktree add -q -b "$branche" "$copie" HEAD || exit 1
    fi
    if [ -n "$lot" ]; then
      # The lot is applied three ways: a conflict is marked in the file, the rest of the lot is
      # there. The index is left as HEAD has it, so that all of it is local work.
      git -C "$copie" apply --3way "$lot" || [ -n "$(git -C "$copie" ls-files -u)" ] || exit 1
      git -C "$copie" reset -q || exit 1
      rm -f "$lot"
    fi
  else
    bash "$ici/../sous-modules.sh" garde "$copie" || exit 1
    git -C "$copie" merge -q --ff-only --autostash "$(git -C "$racine" rev-parse HEAD)" || exit 1
    # A conflicting reapplication exits 0: the unmerged files are what tells it.
    conflits=$(git -C "$copie" diff --name-only --diff-filter=U) || exit 1
    if [ -n "$conflits" ]; then
      echo "⛔ Le travail en cours de la copie entre en conflit avec main ; il reste dans la remise de git (git stash list)."
      echo "Fichiers en conflit :"
      sed 's/^/  /' <<<"$conflits"
      exit 1
    fi
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
    # The packages of the session's plan that are packages of the frame: their names, one per
    # line; none when a path of the plan is no package of the frame (the root, `.`, a folder).
    noms=$(node --input-type=module -e "import path from 'node:path'; import { lireLaListe } from '$ici/paquets-du-plan.mjs'; import { paquets } from '$ici/../paquets.mjs'; const [r, liste] = process.argv.slice(1); const tous = paquets(r).filter(p => !p.hors); const l = lireLaListe(liste).map(d => tous.find(p => p.dossier === path.normalize(d).replace(/\/\$/, ''))?.pkg.name ?? null); process.stdout.write(l.length && l.every(Boolean) ? l.join('\n') : '');" "$copie" "$paquets") || exit 1
    if [ -z "$noms" ]; then
      # The graph read dry first: Turborepo absent or its configuration refused is a preparation
      # that fails, which stops the launch. Then the whole copy, built as far as it builds
      # (--continue=dependencies-successful): a failure does not stop the launch, it goes into the
      # instruction, as for a plan of packages.
      (cd "$copie" && monter npx --no-install turbo run build --dry=json > /dev/null) || exit 1
      if ! (cd "$copie" && monter npx --no-install turbo run build --continue=dependencies-successful) > "$echec" 2>&1; then
        cat "$echec"
        echo "⚠️  La construction de la copie échoue : la séance s'ouvre, la consigne porte l'erreur."
        echouer "La construction de la copie entière échoue ; ce qui n'attend pas la construction en échec est construit."
      else
        : > "$echec"
      fi
    else
      mapfile -t lesNoms <<<"$noms"
      cibles=() lecteurs=()
      for n in "${lesNoms[@]}"; do cibles+=("--filter=$n"); lecteurs+=("--filter=$n..."); done
      # Their providers: the builds their own builds wait for, as Turborepo reads them, save those
      # that wait for a package of the plan, which go with the plan below. The graph comes on the
      # standard input: as an argument, it may pass the size Linux allows one.
      graphe=$(cd "$copie" && monter npx --no-install turbo run build "${cibles[@]}" --dry=json) || exit 1
      fournisseurs=$(node --input-type=module -e "import { readFileSync } from 'node:fs'; import { attendentLePlan } from '$ici/../langages/typescript/turbo-des-paquets.mjs'; const g = JSON.parse(readFileSync(0, 'utf8')); const avec = attendentLePlan(g, process.argv.slice(1)); console.log(g.tasks.map(t => t.taskId).filter(id => !avec.has(id)).sort().join('\n'));" "${lesNoms[@]}" <<<"$graphe") || exit 1
      if [ -n "$fournisseurs" ]; then
        mapfile -t ids <<<"$fournisseurs"
        (cd "$copie" && monter npx --no-install turbo run "${ids[@]}") || exit 1
      fi
      # The traces their tests wait for, as Turborepo's plan of their tests reads them. Another
      # package's trace that waits for no package of the plan is produced here, and a failure
      # stops the launch, as a provider's; a trace of the plan, or one that waits for a package of
      # the plan, is produced with the plan below.
      plan=$(cd "$copie" && monter npx --no-install turbo run test:vitest "${cibles[@]}" --dry=json) || exit 1
      traces() { node --input-type=module -e "import { readFileSync } from 'node:fs'; import { attendentLePlan, tracesDuPlan } from '$ici/../langages/typescript/turbo-des-paquets.mjs'; const [avec, ...noms] = process.argv.slice(1); const p = JSON.parse(readFileSync(0, 'utf8')); const attend = attendentLePlan(p, noms); console.log(tracesDuPlan(p, t => attend.has(t.taskId) === (avec === 'oui')).join('\n'));" "$1" "${lesNoms[@]}" <<<"$plan"; }
      autres=$(traces non) || exit 1
      if [ -n "$autres" ]; then
        mapfile -t ids <<<"$autres"
        (cd "$copie" && monter npx --no-install turbo run "${ids[@]}") || exit 1
      fi
      avec=$(traces oui) || exit 1
      ids=()
      [ -z "$avec" ] || mapfile -t ids <<<"$avec"
      # The packages of the plan, the traces that go with them, and what their tests read (the
      # shared test material), built after their providers: a failure does not stop the launch, it
      # goes into the instruction. Each task whose dependencies succeed goes to its end
      # (--continue=dependencies-successful): one package's failure does not cancel the build of
      # what the tests read without depending on it, which the envelope shows read-only.
      if ! (cd "$copie" && monter npx --no-install turbo run build ${ids[@]+"${ids[@]}"} "${lecteurs[@]}" --continue=dependencies-successful) > "$echec" 2>&1; then
        cat "$echec"
        echo "⚠️  La construction du plan (${lesNoms[*]}) échoue : la séance s'ouvre, la consigne porte l'erreur."
        echouer "La construction des paquets de ton plan échoue ; leurs fournisseurs et ce que leurs tests lisent sans dépendre d'eux sont construits."
      else
        : > "$echec"
      fi
    fi
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
