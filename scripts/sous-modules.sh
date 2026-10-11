#!/usr/bin/env bash
# The preparation of a working copy's submodules, called by the three places that create a copy:
# the integration copy (scripts/integration/integrer.mjs), the agent copy
# (scripts/enveloppe/lancer.sh) and the night copy (scripts/nuit.sh).
#
#   bash scripts/sous-modules.sh pose <copie>                every submodule, set or shared
#   bash scripts/sous-modules.sh garde <copie>               refuses a copy whose submodule carries local work
#   bash scripts/sous-modules.sh monter <copie> --partages <liste> <commande…>
#                                                            plays a command with the shared submodules read-only
#
# - `grillhouse.partage` in the package.json of the copy lists the paths of the submodules the
#   project shares (`npm pkg set 'grillhouse.partage[0]=vendor/natif'`). A shared submodule is not
#   set in a copy: the copy reads the one of the main repository at its usual path, through a
#   symbolic link marked « ignored in the copy » (`git update-index --skip-worktree`), so that
#   `git status` of the copy does not report it. The copy therefore reads the shared submodule at
#   the commit checked out in the main repository, not at the commit its own HEAD references, and
#   with the files the main repository holds there, untracked ones included. No repository holds
#   one more copy of it. Without the key, or with an empty list, nothing is shared.
# - `pose` reads the declaration first and refuses before setting anything (exit 1, its first line
#   on stderr citing `grillhouse.partage` and the faulty value, or naming the shared submodule):
#   a value that is not a list, an element that is not a non-empty relative path inside the
#   repository, a path that is not a submodule of .gitmodules, a shared submodule absent or not
#   initialized in the main repository (never set in the copy instead). Then it puts the link of
#   each shared submodule back (git replaces it by an empty folder when moving a copy forward
#   changes the submodule's commit), sets each other submodule, one by one, at the commit of HEAD,
#   nested ones included (`submodule update --init --recursive --force`), and removes their
#   untracked files: a local modification is overwritten. A submodule that was shared and no longer
#   is gets its own again. A submodule that cannot be set stops it, exit 1, its first line on
#   stderr naming the submodule and its commit, git's output after. A submodule whose address is
#   local (a path or a file:// URL) is set too: the command alone carries
#   `-c protocol.file.allow=always`, the authorization of the file transport; no repository or
#   machine configuration holds it.
# - `pose` never enters a shared submodule, nor a submodule nested in it: they belong to the main
#   repository, which neither sets nor cleans them.
# - `garde` reads the copy as it stands: a submodule modified in `git status` (an edited or
#   untracked file, another commit checked out) stops it, exit 1, its first line on stderr naming
#   the submodule. The agent copy calls it before moving forward, as its work stays in place.
# - `pose` prints on stdout the list it fixes: the target of each link it set (the path of the
#   shared submodule in the main repository), one per line, nothing when nothing is shared.
# - `monter` plays the command, from the current folder, with each shared submodule of the main
#   repository mounted read-only (bwrap), its working tree and its git repository (nested
#   submodules included): a write into it, a commit, reset, checkout or fetch fails. Its caller
#   hands it the list its pose printed (`--partages`, one path per line): the mount reads nothing
#   the copy or a command of the project rewrites during a lot (neither the declaration, nor
#   .gitmodules, nor the index, nor the main repository's state), only the git file of each shared
#   submodule, read-only under every earlier mount. The list is required: a call without it is
#   malformed. Every command of the project that the frame plays in a copy goes through it with
#   the list of its pose: the integration (installation, build, suites, guards, hooks of its
#   commit), the night, and the installation and build of the agent copy.
#   With an empty list the command plays as it is. With a path and no possible mount (bwrap absent
#   or refused, a shared submodule absent from the main repository or not initialized there),
#   nothing plays: exit 1, its first line on stderr gives that reason.
# - Without .gitmodules and without a declaration in the copy, `pose` and `garde` do nothing.
#   A malformed call exits 2.
set -uo pipefail
usage() {
  echo "usage: sous-modules.sh pose|garde <copie> | monter <copie> --partages <liste> <commande…>" >&2
  exit 2
}
[ $# -ge 2 ] || usage
action=$1 copie=$2
case "$action" in
  pose | garde) [ $# -eq 2 ] || usage ;;
  monter) [ $# -ge 5 ] && [ "$3" = --partages ] || usage ;;
  *) usage ;;
esac

refuser() {
  echo "$1" >&2
  shift
  [ $# -eq 0 ] || echo "$*" >&2
  exit 1
}

# The declaration of the copy: the paths it shares, one per line in `partages`; a faulty one
# refuses. A package.json that does not read declares nothing.
lire_partage() {
  local lecture ligne
  lecture=$(node -e '
    const fs = require("node:fs");
    let pkg;
    try { pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); } catch { process.exit(0); }
    const v = pkg?.grillhouse?.partage;
    if (v === undefined || v === null) process.exit(0);
    const faute = (valeur, raison) => { console.log(`faute\t${JSON.stringify(valeur)}\t${raison}`); process.exit(0); };
    if (!Array.isArray(v)) faute(v, "pas une liste de chemins de sous-modules");
    for (const e of v) {
      if (typeof e !== "string" || !e.trim()) faute(e, "pas un chemin non vide");
      if (e.startsWith("/")) faute(e, "un chemin absolu");
      if (e.split("/").includes("..")) faute(e, "un chemin qui sort du dépôt");
    }
    for (const e of v) console.log(`chemin\t${e}`);
  ' "$copie/package.json") || refuser "la clé grillhouse.partage de $copie/package.json ne se lit pas."
  partages=()
  while IFS= read -r ligne; do
    case "$ligne" in
      faute$'\t'*)
        local reste=${ligne#faute$'\t'}
        refuser "la clé grillhouse.partage vaut ${reste%%$'\t'*}, ${reste#*$'\t'} : rien n'est posé." ;;
      chemin$'\t'*) partages+=("${ligne#chemin$'\t'}") ;;
    esac
  done <<< "$lecture"
}

# The main repository's working tree: the first of the repository's copies.
dossier_principal() {
  git -C "$copie" worktree list --porcelain | sed -n '1s/^worktree //p'
}

est_partage() {
  local p
  for p in "${partages[@]}"; do [ "$p" = "$1" ] && return 0; done
  return 1
}

if [ "$action" = monter ]; then
  # The paths to mount: the list the caller holds from the pose, absolute paths only.
  cibles=()
  while IFS= read -r c; do
    [ -n "$c" ] || continue
    case "$c" in /*) cibles+=("$c") ;; *) usage ;; esac
  done <<< "$4"
  shift 4
  [ ${#cibles[@]} -gt 0 ] || exec "$@"
  command -v bwrap > /dev/null || refuser "le montage en lecture seule des sous-modules partagés est impossible : bwrap est absent."
  montage=(bwrap --dev-bind / / --die-with-parent)
  for c in "${cibles[@]}"; do
    [ -e "$c/.git" ] ||
      refuser "le montage en lecture seule du sous-module partagé $c est impossible : il est absent ou non initialisé dans le dépôt principal."
    depot=$(git -C "$c" rev-parse --absolute-git-dir) ||
      refuser "le montage en lecture seule du sous-module partagé $c est impossible : son dépôt git ne se lit pas."
    montage+=(--ro-bind "$c" "$c")
    # Its git repository (nested submodules' ones live under it) is read-only too.
    case "$depot" in "$c"/*) ;; *) montage+=(--ro-bind "$depot" "$depot") ;; esac
  done
  montage+=(--chdir "$PWD")
  sortie=$("${montage[@]}" -- true 2>&1) ||
    refuser "le montage en lecture seule des sous-modules partagés est impossible : bwrap est refusé." "$sortie"
  exec "${montage[@]}" -- "$@"
fi

lire_partage
[ -f "$copie/.gitmodules" ] || [ ${#partages[@]} -eq 0 ] || refuser "la clé grillhouse.partage nomme ${partages[0]}, mais la copie n'a pas de .gitmodules : rien n'est posé."
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

# Refuses before setting anything.
for p in "${partages[@]}"; do
  printf '%s\n' "${chemins[@]}" | grep -qxF -- "$p" ||
    refuser "la clé grillhouse.partage nomme « $p », qui n'est pas un sous-module de .gitmodules : rien n'est posé."
done
principal=
if [ ${#partages[@]} -gt 0 ]; then
  principal=$(dossier_principal)
  for p in "${partages[@]}"; do
    [ -e "$principal/$p/.git" ] ||
      refuser "le sous-module partagé $p est absent ou non initialisé dans le dépôt principal $principal : la copie ne le lit pas, rien n'est posé."
  done
fi

# A shared submodule: the link to the main repository's, ignored in the copy.
for p in "${partages[@]}"; do
  [ -L "$copie/$p" ] || rm -rf -- "${copie:?}/$p"
  ln -sfn -- "$principal/$p" "$copie/$p"
  git -C "$copie" update-index --skip-worktree -- "$p" || exit 1
done

# The others: set in the copy. A link left by an earlier declaration goes first, and the mark with it.
for p in "${chemins[@]}"; do
  est_partage "$p" && continue
  [ -L "$copie/$p" ] && rm -f -- "${copie:?}/$p"
  git -C "$copie" update-index --no-skip-worktree -- "$p" || exit 1
  if ! sortie=$(git -c protocol.file.allow=always -C "$copie" submodule update --init --recursive --force -- "$p" 2>&1); then
    commit=$(git -C "$copie" ls-tree HEAD -- "$p" | cut -d' ' -f3 | cut -f1)
    echo "le sous-module $p ne se pose pas au commit ${commit:0:7} :" >&2
    echo "$sortie" >&2
    exit 1
  fi
  git -C "$copie/$p" clean -q -f -d || exit 1
  git -C "$copie/$p" submodule foreach --quiet --recursive 'git clean -q -f -d' || exit 1
done

# The list the pose fixes: the target of each link, for the caller to hand to `monter`.
for p in "${partages[@]}"; do printf '%s\n' "$principal/$p"; done
