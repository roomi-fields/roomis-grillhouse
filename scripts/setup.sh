#!/usr/bin/env bash
# Prepares a fresh copy of the template for its first session: dependencies, and the Beads
# ticket store the `pitmaster` and `developpeur` skills work from. Idempotent.
#
# Usage: npm run setup [-- <ticket-prefix>]   (prefix: the store's own, else the directory name)
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
prefix="${1:-$(basename "$root" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9\n' '-')}"
# An initialised store keeps its prefix: a run without argument reuses it.
if [ -z "${1:-}" ] && [ -d "$root/.beads" ] && command -v bd >/dev/null; then
  existing="$(cd "$root" && bd config get issue_prefix 2>/dev/null | tr -d '[:space:]')"
  [ -n "$existing" ] && [ "${existing#*(}" = "$existing" ] && prefix="$existing"
fi

if ! git -C "$root" rev-parse --git-dir >/dev/null 2>&1; then
  git -C "$root" init -q
fi

# Beads, the ticket store the skills work from
if ! command -v bd >/dev/null; then
  npm install -g @beads/bd || { echo "Installing Beads failed: run npm install -g @beads/bd, then bash scripts/setup.sh again." >&2; exit 1; }
fi
# CodeGraph, the code knowledge graph the skills query for call paths (MCP server in .mcp.json)
if ! command -v codegraph >/dev/null; then
  npm install -g @colbymchenry/codegraph || { echo "Installing CodeGraph failed: run npm install -g @colbymchenry/codegraph, then bash scripts/setup.sh again." >&2; exit 1; }
fi
[ -d "$root/.codegraph" ] || codegraph init "$root"

(cd "$root" && bd init --init-if-missing --non-interactive --skip-agents --quiet --prefix "$prefix")
git -C "$root" config beads.role maintainer
# One ticket, one commit: the commit-msg hook, next to the hooks Beads installs
hook="$root/.beads/hooks/commit-msg"
if ! grep -q un-commit-par-ticket "$hook" 2>/dev/null; then
  mkdir -p "$root/.beads/hooks"
  printf '%s\n' '#!/usr/bin/env sh' \
    '# One ticket, one commit (Grillhouse): refuses a second commit for a ticket.' \
    'exec node "$(git rev-parse --show-toplevel)/scripts/un-commit-par-ticket.mjs" "$1"' > "$hook"
  chmod +x "$hook"
fi
[ -n "$(git -C "$root" config core.hooksPath)" ] || git -C "$root" config core.hooksPath .beads/hooks

[ -f "$root/package.json" ] && npm --prefix "$root" install

echo "Ready: tickets '$prefix-*' (bd ready), skills: $(ls "$root/.claude/skills" | tr '\n' ' ')"
