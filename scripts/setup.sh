#!/usr/bin/env bash
# Prepares a fresh copy of the template for its first session: dependencies, and the Beads
# ticket store the `pitmaster` and `grillardin` skills work from. Idempotent.
#
# Usage: npm run setup [-- <ticket-prefix>]   (prefix defaults to the directory name)
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
prefix="${1:-$(basename "$root" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9\n' '-')}"

if ! git -C "$root" rev-parse --git-dir >/dev/null 2>&1; then
  git -C "$root" init -q
fi

# Beads, the ticket store the skills work from
if ! command -v bd >/dev/null; then
  npm install -g @beads/bd || { echo "Installing Beads failed: run npm install -g @beads/bd, then bash scripts/setup.sh again." >&2; exit 1; }
fi
(cd "$root" && bd init --init-if-missing --non-interactive --skip-agents --quiet --prefix "$prefix")
git -C "$root" config beads.role maintainer

[ -f "$root/package.json" ] && npm --prefix "$root" install

echo "Ready: tickets '$prefix-*' (bd ready), skills: $(ls "$root/.claude/skills" | tr '\n' ' ')"
