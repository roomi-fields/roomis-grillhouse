#!/usr/bin/env bash
# Launches a role agent on one ticket, as its own Claude session inside the envelope of its
# component. The supervisor runs it in the background and is told when the session ends.
#
#   bash scripts/enveloppe/lancer.sh <ticket> <rôle> <composant> <fichier de consigne>
#
# - The agent's copy is the worktree .claude/worktrees/<ticket> (branch agent/<ticket>), created
#   from HEAD when absent and moved forward to HEAD otherwise. Its dependencies are installed and every component is built there,
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
racine=$(git rev-parse --show-toplevel)
[ -f "$racine/.claude/agents/$role.md" ] || { echo "⛔ Rôle inconnu : $role (.claude/agents/$role.md absent)." >&2; exit 2; }
[ -f "$consigne" ] || { echo "⛔ Consigne introuvable : $consigne" >&2; exit 2; }
grep -q "TON TICKET : $ticket" "$consigne" || { echo "⛔ La consigne ne porte pas « TON TICKET : $ticket »." >&2; exit 2; }

copie="$racine/.claude/worktrees/$ticket"
if [ ! -d "$copie" ]; then
  git -C "$racine" worktree add -q -b "agent/$ticket" "$copie" HEAD
else
  git -C "$copie" merge -q --ff-only "$(git -C "$racine" rev-parse HEAD)"
fi
if [ -f "$copie/package.json" ]; then
  [ -d "$copie/node_modules" ] || npm --prefix "$copie" install --no-audit --no-fund --silent
  npm --prefix "$copie" run build --if-present --silent
fi

exec node "$racine/scripts/enveloppe/enveloppe.mjs" "$copie" "$composant" -- \
  "${CLAUDE_BIN:-claude}" -p "$(cat "$consigne")" --agent "$role" \
  --permission-mode bypassPermissions < /dev/null > "$copie.log" 2>&1
