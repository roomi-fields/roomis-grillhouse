#!/usr/bin/env bash
# Creates a new project from this template, then prepares it (scripts/setup.sh).
# The first Claude session opened in it proposes the initialisation grill.
#
# The project receives the template's files: the frame's, and the example application (src/) with
# its tests (tests/unit/config.spec.ts, errors.spec.ts, types.spec.ts), which its `npm test` plays.
# What stays in Grillhouse: its local state (dependencies, indexes, tickets, git, the agents'
# copies), what serves the template alone (this script, .claude/template, mods/, templates/turbo/),
# and each path the list of the frame's files retires from a project (« - <path> » in
# .claude/grillhouse/fichiers.txt): the frame's own tests and their material among them.
#
# Usage: npm run new -- <destination> [ticket-prefix]
set -euo pipefail

template="$(cd "$(dirname "$0")/.." && pwd)"
dest="${1:?usage: npm run new -- <destination> [ticket-prefix]}"

if [ -e "$dest" ] && [ -n "$(ls -A "$dest" 2>/dev/null)" ]; then
  echo "$dest exists and is not empty: an existing project adopts the framework by copying its files, then opens a session (skill grill)." >&2
  exit 1
fi

# The paths the list of the frame's files retires from a project (« - <path> »), each excluded:
# the frame's own tests and their material, which stay in Grillhouse, are among them.
retires=()
while read -r signe chemin; do
  [ "$signe" = "-" ] && [ -n "$chemin" ] && retires+=("--exclude=./$chemin")
done <"$template/.claude/grillhouse/fichiers.txt"

mkdir -p "$dest"
tar -C "$template" --exclude=./node_modules --exclude=./.rtfm --exclude=./.codegraph \
  --exclude=./.beads --exclude=./.git --exclude=./dist --exclude=./coverage --exclude=./.turbo \
  --exclude=./.claude/settings.local.json --exclude=./.claude/template --exclude=./.claude/worktrees \
  --exclude=./scripts/new-project.sh --exclude=./mods --exclude=./templates/turbo \
  "${retires[@]}" -cf - . | tar -C "$dest" -xf -

# The project's README starts from templates/README.md; the template's own README describes Grillhouse.
# The project's turbo.json is the template's own, the single-package form; templates/turbo/, which
# the frame's update reads in Grillhouse, stays out.
mv "$dest/templates/README.md" "$dest/README.md" && rmdir "$dest/templates"
# `npm run new` belongs to the template only
node -e 'const f=process.argv[1],p=JSON.parse(require("fs").readFileSync(f));delete p.scripts.new;require("fs").writeFileSync(f,JSON.stringify(p,null,2)+"\n")' "$dest/package.json"

bash "$dest/scripts/setup.sh" ${2:+"$2"}
git -C "$dest" add -A
git -C "$dest" commit -q -m "chore: initial commit from Roomi's Grillhouse"

echo "Project created in $dest. Open Claude Code there: the first session proposes the initialisation grill."
