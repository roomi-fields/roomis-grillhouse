#!/usr/bin/env bash
# Prepares a fresh copy of the template for its first session: dependencies, and the Beads
# ticket store the `pitmaster` and `developpeur` skills work from, the frame's git hooks
# (scripts/crochets.mjs) and the frame's plugins (scripts/greffons.mjs), both mechanisms that
# npm run grillhouse:maj also calls. Idempotent.
#
# The plugins are the ones `.claude/settings.json` declares at true in `enabledPlugins`, installed
# for the project (`--scope project`) after their absent marketplaces are added. A plugin that
# cannot be installed (no `claude` command, a failure) has its line naming the command to type; the
# other steps still run, then the exit code is non-zero.
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
# The frame's git hooks (commit-msg, pre-push), in the folder git reads: the hooks path first
[ -n "$(git -C "$root" config core.hooksPath)" ] || git -C "$root" config core.hooksPath .beads/hooks
node "$root/scripts/crochets.mjs" "$root"
# The frame's plugins, for the project: a failure is reported at the end, after the other steps.
greffons=0
node "$root/scripts/greffons.mjs" "$root" || greffons=1

[ -f "$root/package.json" ] && npm --prefix "$root" install

echo "Ready: tickets '$prefix-*' (bd ready), skills: $(ls "$root/.claude/skills" | tr '\n' ' ')"
exit "$greffons"
