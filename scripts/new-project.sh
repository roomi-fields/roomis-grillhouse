#!/usr/bin/env bash
# Creates a new project from this template, then prepares it (scripts/setup.sh).
# The first Claude session opened in it proposes the initialisation grill.
#
# Usage: npm run new -- <destination> [ticket-prefix]
set -euo pipefail

template="$(cd "$(dirname "$0")/.." && pwd)"
dest="${1:?usage: npm run new -- <destination> [ticket-prefix]}"

if [ -e "$dest" ] && [ -n "$(ls -A "$dest" 2>/dev/null)" ]; then
  echo "$dest exists and is not empty: an existing project adopts the framework by copying its files, then opens a session (skill initialiser)." >&2
  exit 1
fi

mkdir -p "$dest"
tar -C "$template" --exclude=./node_modules --exclude=./.rtfm --exclude=./.codegraph \
  --exclude=./.beads --exclude=./.git --exclude=./dist --exclude=./coverage \
  --exclude=./.claude/settings.local.json --exclude=./.claude/template \
  --exclude=./scripts/new-project.sh -cf - . | tar -C "$dest" -xf -

# The template's own README banner and `npm run new` belong to the template only
node -e 'const fs=require("fs"),f=process.argv[1];fs.writeFileSync(f,fs.readFileSync(f,"utf8").replace(/<!-- grillhouse:start[\s\S]*?<!-- grillhouse:end -->\n*/,""))' "$dest/README.md"
node -e 'const f=process.argv[1],p=JSON.parse(require("fs").readFileSync(f));delete p.scripts.new;require("fs").writeFileSync(f,JSON.stringify(p,null,2)+"\n")' "$dest/package.json"

bash "$dest/scripts/setup.sh" ${2:+"$2"}
git -C "$dest" add -A
git -C "$dest" commit -q -m "chore: initial commit from Roomi's Grillhouse"

echo "Project created in $dest. Open Claude Code there: the first session proposes the initialisation grill."
