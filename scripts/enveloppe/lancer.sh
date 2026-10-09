#!/usr/bin/env bash
# Launches a role agent on one ticket, as its own Claude session inside the envelope of its
# component. The supervisor runs it in the background and is told when the session ends.
#
#   bash scripts/enveloppe/lancer.sh <ticket> <rôle> <composant> <fichier de consigne>
#
# - The agent's copy is the worktree .claude/worktrees/<ticket> (branch agent/<ticket>), created
#   from the main tree's HEAD when absent and moved forward to it otherwise (a refusal, such as
#   commits of the agent on its branch, goes to the log and stops the launch, exit code 4). Its dependencies are installed and every component is built there,
#   outside the envelope, so the agent finds the published parts of its neighbours.
# - The session runs `claude -p` with the role's agent and the instruction file as its prompt;
#   the prompt carries « TON TICKET : <ticket> », which the role's locks read. The envelope is the
#   sandbox, so the session runs without permission prompts.
# - Its output, and an envelope refusal (exit code 3), go to .claude/worktrees/<ticket>.log; the
#   agent writes its report in the ticket.
# - CLAUDE_BIN replaces `claude` (the tests use it).
set -euo pipefail
[ $# -eq 4 ] || { echo "usage: lancer.sh <ticket> <rôle> <composant> <fichier de consigne>" >&2; exit 2; }
ticket=$1 role=$2 composant=$3 consigne=$4
# The main tree, from the common git directory: launched from an agent copy, the new copy still
# lands next to the others, never inside one.
racine=$(cd "$(git rev-parse --path-format=absolute --git-common-dir)/.." && pwd)
[ -f "$racine/.claude/agents/$role.md" ] || { echo "⛔ Rôle inconnu : $role (.claude/agents/$role.md absent)." >&2; exit 2; }
[ -f "$consigne" ] || { echo "⛔ Consigne introuvable : $consigne" >&2; exit 2; }
# The ticket is matched whole: `demo-3160` is not `demo-316`, and its dots are dots.
motif=$(printf '%s' "$ticket" | sed 's/[.[\*^$]/\\&/g')
grep -qE "TON TICKET : ${motif}([^A-Za-z0-9_.-]|$)" "$consigne" || { echo "⛔ La consigne ne porte pas « TON TICKET : $ticket »." >&2; exit 2; }

copie="$racine/.claude/worktrees/$ticket"
journal="$copie.log"
mkdir -p "$(dirname "$copie")"
(
  # Each step returns on failure: `set -e` does not act inside a subshell tested by `||`.
  if [ ! -d "$copie" ]; then
    git -C "$racine" worktree add -q -b "agent/$ticket" "$copie" HEAD || exit 1
  else
    git -C "$copie" merge -q --ff-only "$(git -C "$racine" rev-parse HEAD)" || exit 1
  fi
  if [ -f "$copie/package.json" ]; then
    # --no-save leaves the lock file as committed, so a clean copy stays clean.
    [ -d "$copie/node_modules" ] || npm --prefix "$copie" install --no-save --no-audit --no-fund --silent || exit 1
    npm --prefix "$copie" run build --if-present --silent || exit 1
  fi
) > "$journal" 2>&1 || { echo "⛔ La copie $copie n'a pas pu être préparée : voir $journal." >&2; exit 4; }

exec node "$racine/scripts/enveloppe/enveloppe.mjs" "$copie" "$composant" -- \
  "${CLAUDE_BIN:-claude}" -p "$(cat "$consigne")" --agent "$role" \
  --permission-mode bypassPermissions < /dev/null >> "$journal" 2>&1
