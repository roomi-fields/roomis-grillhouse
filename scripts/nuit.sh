#!/usr/bin/env bash
# The night: once a day, the full suites, the only place they run. During the day an integration
# replays the touched components and those that depend on them (scripts/integration/integrer.mjs).
#
#   bash scripts/nuit.sh        from the crontab of the machine, e.g. « 0 3 * * * bash <root>/scripts/nuit.sh »
#
# - It plays main's HEAD in its own clean copy (.claude/worktrees/nuit): detached, every untracked
#   file removed, dependencies reinstalled (npm ci) when package-lock.json changes, built, then
#   `npm test` (the guards of pretest, then every suite).
# - It holds the integration lock while it runs: an integration waits for the morning.
# - Its log is <git common dir>/nuit/<date>.log. Green: HEAD becomes the last green commit
#   (<git common dir>/nuit/dernier-vert). Red: a ticket labelled `nuit`, with the commits since the
#   last green, where `git bisect` looks for the culprit; an open one gets a comment instead.
set -u
racine="$(cd "$(dirname "$0")/.." && pwd)"
commun="$(git -C "$racine" rev-parse --path-format=absolute --git-common-dir)"
dossier="$commun/nuit"
mkdir -p "$dossier"
journal="$dossier/$(date +%Y-%m-%d).log"
verrou="$commun/integration.lock"
if [ -f "$verrou" ] && kill -0 "$(cat "$verrou")" 2>/dev/null; then
  echo "⛔ Une intégration tourne (processus $(cat "$verrou")) : la nuit attend la prochaine." >> "$journal"
  exit 2
fi
echo $$ > "$verrou"
trap 'rm -f "$verrou"' EXIT

tete="$(git -C "$racine" rev-parse HEAD)"
copie="$racine/.claude/worktrees/nuit"
# Plays the copy; its status is the night's verdict.
jouer() {
  echo "— la nuit du $(date '+%Y-%m-%d %H:%M') sur ${tete:0:7}"
  if [ -d "$copie" ]; then
    git -C "$copie" checkout -q --detach --force "$tete" || return 1
    git -C "$copie" clean -q -f -d -x -e node_modules || return 1
  else
    git -C "$racine" worktree add -q --detach "$copie" "$tete" || return 1
  fi
  if [ -f "$copie/package-lock.json" ] && ! cmp -s "$copie/package-lock.json" "$copie/node_modules/.nuit-lock"; then
    npm --prefix "$copie" ci --no-audit --no-fund --silent || return 1
    cp "$copie/package-lock.json" "$copie/node_modules/.nuit-lock"
  fi
  npm --prefix "$copie" run --silent --if-present build || return 1
  npm --prefix "$copie" test
}
jouer >> "$journal" 2>&1
verdict=$?

if [ "$verdict" -eq 0 ]; then
  echo "$tete" > "$dossier/dernier-vert"
  echo "✓ vert : ${tete:0:7} est le dernier vert." >> "$journal"
  exit 0
fi

vert="$(cat "$dossier/dernier-vert" 2>/dev/null || true)"
intervalle="${vert:+${vert:0:7}..}${tete:0:7}"
texte="La nuit du $(date +%Y-%m-%d) est rouge sur ${tete:0:7}.
Commits à chercher (git bisect) : $intervalle.
Journal : $journal
Fin du journal :
$(tail -40 "$journal")"
ouvert="$(cd "$racine" && bd list --status open --label nuit --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const l=JSON.parse(s);process.stdout.write(l[0]?.id??"")}catch{}})')"
if [ -n "$ouvert" ]; then
  (cd "$racine" && bd comments add "$ouvert" "$texte" >/dev/null)
else
  (cd "$racine" && bd create "La nuit est rouge depuis ${tete:0:7}" -t bug -p 1 -l nuit -d "$texte" >/dev/null)
fi
echo "✗ rouge : ticket ${ouvert:-neuf} (étiquette nuit)." >> "$journal"
exit 1
