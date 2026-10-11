#!/usr/bin/env bash
# The preparation of a working copy's submodules, called by the three places that create a copy:
# the integration copy (scripts/integration/integrer.mjs), the agent copy
# (scripts/enveloppe/lancer.sh) and the night copy (scripts/nuit.sh).
#
#   bash scripts/sous-modules.sh pose <copie>     every submodule at the commit HEAD references
#   bash scripts/sous-modules.sh garde <copie>    refuses a copy whose submodule carries local work
#
# - `pose` sets each submodule of .gitmodules, one by one, at the commit of HEAD, nested ones
#   included (`submodule update --init --recursive --force`), then removes the untracked files of
#   every submodule: a local modification is overwritten. A submodule that cannot be set stops it,
#   exit 1, its first line on stderr naming the submodule and its commit, git's output after.
#   A submodule whose address is local (a path or a file:// URL) is set too: the command alone
#   carries `-c protocol.file.allow=always`, the authorization of the file transport; no
#   repository or machine configuration holds it.
# - `garde` reads the copy as it stands: a submodule modified in `git status` (an edited or
#   untracked file, another commit checked out) stops it, exit 1, its first line on stderr naming
#   the submodule. The agent copy calls it before moving forward, as its work stays in place.
# - Without .gitmodules in the copy, both do nothing. A malformed call exits 2.
set -uo pipefail
[ $# -eq 2 ] && { [ "$1" = pose ] || [ "$1" = garde ]; } || {
  echo "usage: sous-modules.sh pose|garde <copie>" >&2
  exit 2
}
action=$1 copie=$2
[ -f "$copie/.gitmodules" ] || exit 0
mapfile -t chemins < <(git -C "$copie" config -f .gitmodules --get-regexp '^submodule\..*\.path$' | cut -d' ' -f2-)

if [ "$action" = garde ]; then
  for p in "${chemins[@]}"; do
    etat=$(git -C "$copie" status --porcelain --ignore-submodules=none -- "$p") || exit 1
    if [ -n "$etat" ]; then
      echo "le sous-module $p porte des modifications locales dans $copie : elles restent en place, et la copie s'arrête." >&2
      echo "$etat" >&2
      exit 1
    fi
  done
  exit 0
fi

for p in "${chemins[@]}"; do
  if ! sortie=$(git -c protocol.file.allow=always -C "$copie" submodule update --init --recursive --force -- "$p" 2>&1); then
    commit=$(git -C "$copie" ls-tree HEAD -- "$p" | cut -d' ' -f3 | cut -f1)
    echo "le sous-module $p ne se pose pas au commit ${commit:0:7} :" >&2
    echo "$sortie" >&2
    exit 1
  fi
done
git -C "$copie" submodule foreach --quiet --recursive 'git clean -q -f -d' || exit 1
