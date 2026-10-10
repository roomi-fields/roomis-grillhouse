#!/usr/bin/env bash
# Launches a role agent on one ticket, as its own Claude session inside the envelope of its
# component. The supervisor runs it in the background and is told when the session ends.
#
#   bash scripts/enveloppe/lancer.sh <ticket> <rôle> <composant> <fichier de consigne>
#
# - The agent's copy is the worktree .claude/worktrees/<ticket> (branch agent/<ticket>), created
#   from the main tree's HEAD when absent and moved forward to it otherwise. Moving forward keeps
#   the work in progress of the copy: git stashes it, fast-forwards, and reapplies it
#   (`--autostash`). A refusal, such as commits of the agent on its branch, goes to the log and
#   stops the launch, CODE_COPIE; so does a reapplication that conflicts: the log names each file
#   in conflict, the work stays in git's stash, and no agent starts on a half-merged copy. Its
#   dependencies are installed when `node_modules` is absent or `package-lock.json` is newer than
#   the last installation (`node_modules/.package-lock.json`, written by npm), and every component
#   is built there, outside the envelope, so the agent finds the published parts of its neighbours.
# - The session runs `claude -p` with the role's agent and the instruction file as its prompt;
#   the prompt carries « TON TICKET : <ticket> », which the role's locks read. The envelope is the
#   sandbox, so the session runs without permission prompts.
# - Its output, and an envelope refusal (CODE_REFUS), go to .claude/worktrees/<ticket>.log; the
#   agent writes its report in the ticket.
# - The exit codes are named in scripts/enveloppe/codes.mjs; a malformed call exits CODE_USAGE.
# - CLAUDE_BIN replaces `claude` (the tests use it).
set -euo pipefail
eval "$(node "$(dirname "${BASH_SOURCE[0]}")/codes.mjs")"
[ $# -eq 4 ] || { echo "usage: lancer.sh <ticket> <rôle> <composant> <fichier de consigne>" >&2; exit "$CODE_USAGE"; }
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
(
  # Each step returns on failure: `set -e` does not act inside a subshell tested by `||`.
  if [ ! -d "$copie" ]; then
    git -C "$racine" worktree add -q -b "agent/$ticket" "$copie" HEAD || exit 1
  else
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
  if [ -f "$copie/package.json" ]; then
    # --no-save leaves the lock file as committed, so a clean copy stays clean.
    installe="$copie/node_modules/.package-lock.json"
    if [ ! -d "$copie/node_modules" ] || [ "$copie/package-lock.json" -nt "$installe" ]; then
      npm --prefix "$copie" install --no-save --no-audit --no-fund --silent || exit 1
    fi
    npm --prefix "$copie" run build --if-present --silent || exit 1
  fi
) > "$journal" 2>&1 || { echo "⛔ La copie $copie n'a pas pu être préparée : voir $journal." >&2; exit "$CODE_COPIE"; }

exec node "$racine/scripts/enveloppe/enveloppe.mjs" "$copie" "$composant" -- \
  "${CLAUDE_BIN:-claude}" -p "$(cat "$consigne")" --agent "$role" \
  --permission-mode bypassPermissions < /dev/null >> "$journal" 2>&1
