#!/usr/bin/env bash
# Launches a role agent on one ticket, as its own Claude session inside the envelope of its
# component. The supervisor runs it in the background and is told when the session ends.
#
#   bash scripts/enveloppe/lancer.sh [--modele <m>] [--effort <e>] <ticket> <rôle> <composant> <fichier de consigne>
#
# - --modele <m> and --effort <e> override, for this session only, the model and the thinking level
#   of the role's definition (.claude/agents/<rôle>.md); they reach claude as --model and --effort.
#   Each is optional and works alone; without them the role decides. The level is one of low,
#   medium, high, xhigh, max; the model is any non-empty text, passed to claude as given. They come
#   first, each as two words (`--modele opus`); `--modele=opus`, `--`, a value starting with `--`,
#   an unknown option or an option after the four arguments is refused, CODE_USAGE, before the copy
#   is prepared. A repeated option keeps its last value; every level given is checked.
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
#   the last installation (`node_modules/.package-lock.json`, written by npm), and every component
#   is built there, outside the envelope, so the agent finds the published parts of its neighbours. The
#   installation and the build play through `scripts/sous-modules.sh monter`, each shared submodule
#   of the main repository read-only, by the list the pose printed, whatever the installation
#   rewrites afterwards; with a shared submodule and no possible mount (bwrap absent or
#   refused), the launch stops, CODE_COPIE, before any command runs. In the envelope the main
#   repository is read-only as a whole.
# - The envelope receives the role: it decides who writes the package of the shared test material.
# - The session runs `claude -p` with the role's agent and the instruction file as its prompt;
#   the prompt carries « TON TICKET : <ticket> », which the role's locks read. The envelope is the
#   sandbox, so the session runs without permission prompts.
# - Its output, and an envelope refusal (CODE_REFUS), go to .claude/worktrees/<ticket>.log; the
#   agent writes its report in the ticket.
# - The exit codes are named in scripts/enveloppe/codes.mjs; a malformed call exits CODE_USAGE.
# - CLAUDE_BIN replaces `claude` (the tests use it).
set -euo pipefail
ici="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
eval "$(node "$ici/codes.mjs")"
usage="usage: lancer.sh [--modele <m>] [--effort <e>] <ticket> <rôle> <composant> <fichier de consigne>"
refus_usage() { echo "$usage" >&2; exit "$CODE_USAGE"; }
modele="" effort="" surcharge=()
while [ $# -gt 0 ]; do
  case "$1" in
    --modele|--effort)
      [ $# -ge 2 ] && [ -n "$2" ] && [[ "$2" != --* ]] || refus_usage
      if [ "$1" = --modele ]; then
        modele=$2
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
[ $# -eq 4 ] || refus_usage
ticket=$1 role=$2 composant=$3 consigne=$4
# The main tree, from the common git directory: launched from an agent copy, the new copy still
# lands next to the others, never inside one.
racine=$(cd "$(git rev-parse --path-format=absolute --git-common-dir)/.." && pwd)
[ -f "$racine/.claude/agents/$role.md" ] || { echo "⛔ Rôle inconnu : $role (.claude/agents/$role.md absent)." >&2; exit "$CODE_USAGE"; }
[ -f "$consigne" ] || { echo "⛔ Consigne introuvable : $consigne" >&2; exit "$CODE_USAGE"; }
# The ticket is matched whole: `demo-3160` is not `demo-316`, and its dots are dots.
motif=$(printf '%s' "$ticket" | sed 's/[.[\*^$]/\\&/g')
grep -qE "TON TICKET : ${motif}([^A-Za-z0-9_.-]|$)" "$consigne" || { echo "⛔ La consigne ne porte pas « TON TICKET : $ticket »." >&2; exit "$CODE_USAGE"; }

copie="$racine/.claude/worktrees/$ticket"
journal="$copie.log"
mkdir -p "$(dirname "$copie")"
# A branch still in the queue is not relaunched: the queue brings it onto main, or sends it back.
if node --input-type=module -e "import { lireEntrees } from '$ici/../integration/file-attente.mjs'; const [r, b, t] = process.argv.slice(1); process.exit(lireEntrees(r).some(e => e.branche === b || e.tickets.includes(t)) ? 0 : 1);" "$racine" "agent/$ticket" "$ticket"; then
  refus="⛔ La branche agent/$ticket est encore en file d'intégration : la file l'amène sur main ou la renvoie ; le ticket ne se relance pas avant."
  echo "$refus" > "$journal"
  echo "$refus" >&2
  exit "$CODE_COPIE"
fi
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
    monter npm --prefix "$copie" run build --if-present --silent || exit 1
  fi
) > "$journal" 2>&1 || { echo "⛔ La copie $copie n'a pas pu être préparée : voir $journal." >&2; exit "$CODE_COPIE"; }

exec node "$racine/scripts/enveloppe/enveloppe.mjs" "$copie" "$composant" "$role" -- \
  "${CLAUDE_BIN:-claude}" -p "$(cat "$consigne")" --agent "$role" \
  ${surcharge[@]+"${surcharge[@]}"} --permission-mode bypassPermissions < /dev/null >> "$journal" 2>&1
