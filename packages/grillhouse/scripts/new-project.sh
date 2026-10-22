#!/usr/bin/env bash
# Creates a new project from Grillhouse's repository, then prepares it (scripts/setup.sh).
# The first Claude session opened in it proposes the initialisation grill.
#
# The project receives the frame's files of the repository, then the template of a project
# (templates/projet/): the example application (src/) with its tests (tests/unit/config.spec.ts,
# errors.spec.ts, types.spec.ts), which its `npm test` plays, its package.json and its
# configurations, its README.md, CHANGELOG.md, CONTRIBUTING.md, CREDITS.md and an empty
# pitmaster/SUIVI.md, each at the same relative path, in place of Grillhouse's own. Its turbo.json
# is the frame's template of a repository without packages (templates/turbo/sans-paquets.json);
# the project keeps no templates/.
# What stays in Grillhouse: its local state (dependencies, the lock of its workspaces, indexes,
# tickets, git, the agents' copies), what serves Grillhouse alone (this script, .claude/template,
# mods/, templates/), and each path the list of the frame's files retires from a project
# (« - <path> » in .claude/grillhouse/fichiers.txt): the frame's own tests and their material
# among them.
#
# Usage: npx grillhouse new-project <destination> [ticket-prefix]   (npm run new -- …)
set -euo pipefail

ici="$(cd "$(dirname "$0")" && pwd)"
# Grillhouse's repository, which holds this package at packages/grillhouse.
template="$(cd "$ici/../../.." && pwd)"
dest="${1:?usage: npm run new -- <destination> [ticket-prefix]}"

if [ -e "$dest" ] && [ -n "$(ls -A "$dest" 2>/dev/null)" ]; then
  echo "$dest exists and is not empty: an existing project adopts the framework by copying its files, then opens a session (skill grill)." >&2
  exit 1
fi

# The paths the list of the frame's files retires from a project (« - <path> »), each excluded:
# the frame's own tests and their material, which stay in Grillhouse, are among them.
retires=()
while read -r signe chemin; do
  [ "$signe" = "-" ] && [ -n "$chemin" ] && retires+=("--exclude=./${chemin%/}")
done <"$template/.claude/grillhouse/fichiers.txt"

mkdir -p "$dest"
tar -C "$template" --exclude=./node_modules --exclude=./.rtfm --exclude=./.codegraph \
  --exclude=./.beads --exclude=./.git --exclude=./dist --exclude=./coverage --exclude=./.turbo \
  --exclude=./.claude/settings.local.json --exclude=./.claude/template --exclude=./.claude/worktrees \
  --exclude=./package-lock.json --exclude=./packages/grillhouse/scripts/new-project.sh \
  --exclude=./mods --exclude=./templates --exclude='*/node_modules' \
  "${retires[@]}" -cf - . | tar -C "$dest" -xf -

# The template of a project replaces Grillhouse's files of the same relative path (its
# package.json, its README, changelog, credits, contributing guide and supervisor's follow-up
# describe Grillhouse); the project's turbo.json is the single-package form.
tar -C "$template/templates/projet" -cf - . | tar -C "$dest" -xf -
cp "$template/templates/turbo/sans-paquets.json" "$dest/turbo.json"

(cd "$dest" && bash "$ici/setup.sh" ${2:+"$2"})
git -C "$dest" add -A
git -C "$dest" commit -q -m "chore: initial commit from Roomi's Grillhouse"

echo "Project created in $dest. Open Claude Code there: the first session proposes the initialisation grill."
