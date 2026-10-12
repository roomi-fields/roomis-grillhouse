#!/usr/bin/env bash
# The removal of a working copy, called by the three places that end one: the agent copy (by the
# chef de chantier at the end of the circuit), the integration copy (scripts/integration/integrer.mjs)
# and the night copy (scripts/nuit.sh), the last two when their existing copy does not get ready.
#
#   bash scripts/retirer-copie.sh [--jetable] <copie>
#
# - The copy is a path read from the current directory, as git reads it, and must be a copy that
#   `git worktree list` names for the repository of the current directory: the main working tree,
#   an absent path, a plain folder or a submodule's folder is refused, nothing touched.
# - A copy that carries a submodule is removed too: `git worktree remove` refuses it, so the
#   script reads the copy first, then removes it with `git worktree remove --force`. Only the named
#   copy goes, with the link to a shared submodule (`grillhouse.partage`); the main repository and
#   its submodules (.git/modules) stay as they are.
# - Without `--jetable`, the reading stands in for what `--force` would erase: a copy that carries
#   local work (a modified tracked file, an untracked file outside the ignored ones, a submodule
#   modified or at another commit, read by `git status --ignore-submodules=none`), or whose state
#   does not read, is refused, and stays in place intact. The chef de chantier passes no option.
# - With `--jetable`, passed only by the integration and the night for their own copy, local work
#   and an unreadable state do not hold the removal.
# - A locked copy (`git worktree lock`) is refused in every case.
# - Exit 0 removed, 1 refused (the first line on stderr names the copy and what holds it), 2 a
#   malformed call (the usage on stderr).
set -uo pipefail
jetable=0
if [ "${1:-}" = --jetable ]; then jetable=1; shift; fi
[ $# -eq 1 ] && [ "${1#-}" = "$1" ] || {
  echo "usage: retirer-copie.sh [--jetable] <copie>" >&2
  exit 2
}
copie=$1

refuser() {
  echo "$1" >&2
  shift
  [ $# -eq 0 ] || echo "$*" >&2
  exit 1
}

[ -n "$copie" ] && [ -d "$copie" ] || refuser "la copie $copie n'existe pas : rien n'est retiré."
chemin=$(cd "$copie" && pwd -P) || refuser "la copie $copie ne se lit pas : rien n'est retiré."
liste=$(git worktree list --porcelain 2>&1) ||
  refuser "la liste des copies ne se lit pas pour retirer $copie : rien n'est retiré." "$liste"

# The list is one block per copy, separated by a blank line: the first block is the main working
# tree, never removable; a `locked` line marks a locked copy. `trouvee` is the verdict of the block of the copy, printed
# once (`dit`: `exit` runs the END rule, which must not read the same block again).
trouvee=$(printf '%s\n' "$liste" | awk -v cible="$chemin" '
  function fin() {
    if (n > 1 && dossier != "") {
      cmd = "cd \"" dossier "\" 2>/dev/null && pwd -P"
      cmd | getline reel; close(cmd)
      if (reel == cible) { print (verrou ? "verrouillee" : "libre"); dit = 1; exit }
    }
  }
  /^worktree / { fin(); n++; dossier = substr($0, 10); verrou = 0; reel = ""; next }
  /^locked/ { verrou = 1 }
  END { if (!dit) fin() }
')
[ -n "$trouvee" ] || refuser "$copie n'est pas une copie inscrite de ce dépôt (git worktree list) : rien n'est retiré."
[ "$trouvee" != verrouillee ] || refuser "la copie $copie est verrouillée (git worktree lock) : elle n'est pas retirée."

if [ "$jetable" -eq 0 ]; then
  etat=$(git -C "$chemin" status --porcelain --ignore-submodules=none 2>&1) ||
    refuser "l'état de la copie $copie ne se lit pas : elle n'est pas retirée." "$etat"
  [ -z "$etat" ] ||
    refuser "la copie $copie porte du travail local : elle n'est pas retirée." "$etat"
fi

sortie=$(git worktree remove --force "$chemin" 2>&1) ||
  refuser "la copie $copie ne se retire pas :" "$sortie"
