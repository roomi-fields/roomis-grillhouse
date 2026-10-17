#!/usr/bin/env bash
# The removal of a working copy, called by the three places that end one: the agent copy (by
# scripts/integration/integrer.mjs once its lot is committed), the integration copy (by the same
# script) and the night copy (scripts/nuit.sh), the last two when their existing copy does not get
# ready.
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
#   modified or at another commit, read by `git status --ignore-submodules=none`, whatever the
#   project's `submodule.<name>.ignore` or `diff.ignoreSubmodules`), or whose state does not read,
#   is refused, and stays in place intact. Local work that has entered the branch `main` loses
#   nothing and does not hold the copy: each file of the work (its deletion, or its submodule at a
#   commit with no work in it) holds the content and the mode that a commit of `main` after the
#   copy's base gave that path; a content `main` held before the base is not work that entered. The
#   refusal names the work that has not entered. The agent copy's removal passes no option.
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
# tree, never removable; a `locked` line marks a locked copy. `trouvee` is the verdict of the block
# of the copy, printed once (`dit`: `exit` runs the END rule, which must not read the same block
# again).
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

# Whether the work at path $1 of the copy has entered `main`: what the copy holds there (a file's
# blob and mode, a submodule's commit once its own state is clean, zeros for a deleted path) is
# what a commit of `main` after the copy's base (`HEAD..refs/heads/main` in the copy) gave that
# path, mode included, as git judges a branch already merged.
est_entre() {
  local p=$1 id mode
  if [ -e "$chemin/$p/.git" ]; then
    [ -z "$(git -C "$chemin/$p" status --porcelain --ignore-submodules=none 2>/dev/null)" ] ||
      return 1
    id=$(git -C "$chemin/$p" rev-parse HEAD 2>/dev/null) || return 1
    mode=160000
  elif [ -L "$chemin/$p" ]; then
    id=$(git -C "$chemin" hash-object --no-filters -- "$p" 2>/dev/null) || return 1
    mode=120000
  elif [ -e "$chemin/$p" ]; then
    id=$(git -C "$chemin" hash-object -- "$p" 2>/dev/null) || return 1
    if [ -x "$chemin/$p" ]; then mode=100755; else mode=100644; fi
  else
    id=0
    mode=000000
  fi
  git -C "$chemin" log HEAD..refs/heads/main --no-renames --format= --raw --no-abbrev -- "$p" \
    2>/dev/null |
    awk -v id="$id" -v mode="$mode" '
      $2 == mode && ($4 == id || (id == 0 && $4 ~ /^0+$/)) { ok = 1 }
      END { exit !ok }'
}

if [ "$jetable" -eq 0 ]; then
  etat=$(git -C "$chemin" status --porcelain -z -uall --no-renames --ignore-submodules=none 2>&1 |
    tr '\0' '\n') ||
    refuser "l'état de la copie $copie ne se lit pas : elle n'est pas retirée." "$etat"
  restant=
  while IFS= read -r ligne; do
    [ -n "$ligne" ] || continue
    est_entre "${ligne:3}" || restant+="${restant:+$'\n'}$ligne"
  done <<<"$etat"
  [ -z "$restant" ] ||
    refuser "la copie $copie porte du travail local : elle n'est pas retirée." "$restant"
fi

sortie=$(git worktree remove --force "$chemin" 2>&1) ||
  refuser "la copie $copie ne se retire pas :" "$sortie"
