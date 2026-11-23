#!/usr/bin/env bash
# The night: once a day, the full pass played for real, then what the day never plays: the night
# tests and the measures of time (the time budget benches and the time witnesses). During the day `npm run verifier` (the integration's) plays
# what the changes since the last green touch (scripts/integration/integrer.mjs,
# scripts/dernier-vert.mjs); the module of the project's language plays each step
# (scripts/jointure.d.ts).
#
#   npx grillhouse nuit        from the root of the project, which runs it alone
#                              (src/temporal/nuits/commande.ts): the workflow of the nights of the
#                              machine (src/temporal/nuits/) launches it for each project that moved,
#                              one after the other
#   nuit.sh --help             the usage on the output (also -h), exit 0; any other argument is
#                              refused, the usage on the error stream, exit 2: nothing runs.
#
# - It plays main's HEAD in its own clean copy (.claude/worktrees/nuit): detached, every untracked
#   file removed, its submodules set at the commit of HEAD (scripts/sous-modules.sh, a local
#   modification overwritten; one that cannot be set turns the night red; a submodule the project
#   shares, `grillhouse.partage`, is linked to the main repository's instead, not set),
#   dependencies reinstalled (npm ci) when package-lock.json changes or when the Node that plays
#   the night is not the one they were installed under (its binary interface, the mark of
#   scripts/abi-des-dependances.mjs, which the night writes after its `npm ci`), then
#   `npm run verifier -- --force`: the build, the guards (the frame's and the project's own, its
#   root script `gardes`) and every test of the day, each task played for real (`--force`, no log
#   replayed from a cache, no measure against the last green: the complete pass); green, its tree
#   becomes the last green of the day's passes.
#   Its three steps (the full pass, the night tests, the project's night script) each play even
#   when one before is red, as a CI plays its independent jobs; the night is red when one of them
#   is. A full pass « à repasser » (75: the wait for the machine reached its bound; the pass plays
#   no measure of time, and a delay past is a red there) ends the night there, « à repasser »,
#   below.
#   An existing copy that does not get ready (its move onto HEAD, its cleaning or the setting of
#   its submodules fails) is removed by `scripts/retirer-copie.sh --jetable` (local work does not
#   hold it, a lock does) and created again, once; a copy that does not get ready the second time
#   turns the night red, and so does a removal the script refuses, the log repeating its reason.
# - Every command of the project (installation, build, tests, night tests, night script) plays
#   through `scripts/sous-modules.sh monter`, each shared submodule of the main repository
#   read-only, its working tree and its git repository (the list the preparation's pose printed,
#   whatever a command rewrites afterwards): a write into it fails. With a shared submodule and no possible mount (bwrap absent
#   or refused), the night turns red, the log saying so, before any command runs.
# - The tools of the project: `grillhouse.outils` in the package.json of the main tree
#   (scripts/outils-cles.mjs) gives each command of the project its variables, each set to its
#   path, whatever the environment of the night's launcher; a faulty key turns the night red, the
#   log naming it, and nothing runs.
# - TEMPORAL: after the tools of the project, before any command, the night lays the pinned program of
#   Temporal down (`grillhouse temporal installer --programme-seul`, by the built command of the
#   version playing the night, not the copy's: the copy has no build yet; idempotent: a program
#   already laid down is not downloaded again) and exports its path as TEMPORAL, over any key left
#   in a package.json. A laying that fails does not stop the night: the log names it, TEMPORAL
#   stays unset, and a test that starts a server resolves the program from the shared cache
#   (~/.cache/grillhouse/temporal/<version>/temporal), or fails on itself naming the command that
#   lays it down. A night of trial, whose copy holds no build, thus plays on.
# - The frame's package: after the installation, before the full pass, the night builds
#   @roomi-fields/grillhouse (`npm run build --workspace=@roomi-fields/grillhouse`) when it is a
#   package of the copy's repository, one the `workspaces` of its root select (scripts/paquets.mjs);
#   a project that installs the frame, even with a copy of the frame's package.json under
#   packages/grillhouse/, builds nothing. A failed build turns the night red, and nothing runs.
# - The night tests: after the full pass, the night tests, then the measures of time alone (the
#   time budget benches and the time witnesses), which `npm test` and the integration leave out
#   (grillhouse-bd7), played by the command `tests-de-nuit` of the module of the copy's language
#   (the module typescript's: the files `*.nuit.test.*` and `*.nuit.spec.*`, then the files
#   `*.budget.test.*`, `*.budget.spec.*` and those that import `mesurerAuRepos`, one at a time, by
#   Vitest; the module python's, `*_nuit_test.py`; the module cargo's, the test targets
#   `tests/*_nuit.rs` then the benches `tests/*_budget.rs`, by nextest), when the project declares a language
#   whose module describes it (scripts/commande-du-langage.mjs); none otherwise. A red turns the night red, with a log line that
#   says so, and the project's night script still plays. A run « à repasser » (75: every failure
#   depended on a duration, one under load) waits for rest (`npx grillhouse pression attendre`,
#   bound 15 min) and plays once more; green then, the night goes on; à repasser again, or no rest in the bound, the night
#   ends there, « à repasser », red if the full pass is.
# - The two parts of the night: a project whose `.github/workflows/nuit.yml` plays on the label
#   `pc2` leaves PC2 its night tests but those tagged @poste (the flow's tranches,
#   `tests-de-nuit --hors-du-poste`). The measures of time play on PC3, on dedicated cores, unless
#   the flow declares a job that plays them (a command `tests-de-nuit --mesures`, as the flow of
#   Grillhouse: scripts/flux-de-la-nuit.mjs): then that job's verdict, read for the commit of the
#   night, stands for them, and PC3 plays them only when the job was interrupted. The night of PC3
#   plays the tests tagged @poste, then the measures (`tests-de-nuit --du-poste`, on its part), then
#   reads the flow of its commit by `gh`
#   (scripts/repli-de-la-nuit.mjs): a tranche whose job has not started 60 minutes after the flow's
#   hour is cancelled and played on PC3, a tranche started then interrupted plays whole again, a
#   tranche finished on PC2, green or red, is never replayed; the log says which tranches played
#   where. Each part keeps its verdict (scripts/verdict-de-la-nuit.mjs: `nuit/verdict` for PC3,
#   `nuit/verdict-pc2`), the night is red when either is, and a red tranche opens or comments its
#   night ticket.
# - « À repasser » (exit 75): neither green nor red. The last green stays, no ticket opens,
#   the log says so; the next night plays again.
# - The project's night script: `grillhouse.nuit` in the package.json of the commit it plays names
#   an npm script (`npm pkg set grillhouse.nuit=<script>`). After the night tests, the night plays
#   `npm run <script>` in its copy; a red script turns the night red, with a log line that names it.
#   The key is read as written, before any work: without it (or with null) the night plays
#   no script of the project; a value that is not a non-blank string, or a name absent from the scripts of
#   that package.json, turns the night red, with a log line that cites it, and nothing runs.
# - The night pushes nothing: main receives every lot by the queue, on a tree judged; the night keeps
#   its last green (`<git common dir>/nuit/dernier-vert`), a mark and not a branch. A project whose
#   package.json carries the retired key `grillhouse.poussee`, whatever its value, turns the night
#   red before any work, with a log line that names the key and the gesture (remove it,
#   scripts/poussee-retiree.mjs).
# - The copies whose content is on main: once its steps are played, whatever their verdict, the
#   night passes each copy `git worktree list` names, the main tree and its own left out, through
#   scripts/retirer-copie.sh without `--jetable` (scripts/retirer-les-copies-finies.mjs), as a CI cleans its
#   workspaces at the end of a pipeline: a copy whose commits and local work have all entered
#   main by their content goes, and its branch (main and a branch another copy holds stay); a copy
#   refused (commits or work not entered, a lock) or held by a running circuit (its ticket in progress, its
#   `<copie>.travail`, the lock of the integration or of the queue) stays, its log line naming
#   why and the place it holds, a kept copy whose ticket is closed losing what the tools of its
#   languages wrote there. The night names its own copy to the removal, its steps played: the copy
#   stays, and loses what the tools of its languages wrote there (`target`, `.turbo`), its
#   `node_modules` kept, which its next preparation would remove anyway (grillhouse-k5y). The
#   removal never changes the night's verdict; the end of each circuit runs it too
#   (scripts/circuit.mjs), the night's copy untouched.
# - It takes no lock of the integration or of the queue (scripts/integration/file.mjs): an
#   integration and the queue run during the night, each in its own copy.
# - Its log is <git common dir>/nuit/<date>.log. Green: HEAD becomes the last green commit
#   (<git common dir>/nuit/dernier-vert), only once the measures of time were played and are green,
#   by PC3 or by the flow's job for that commit. Red: the red tasks, each grouped by its cause as an
#   alerting system groups by fingerprint: each red task of the full pass (the file
#   GRILLHOUSE_ROUGES names, which the verification of the module writes: `<task>` per line, then
#   a tab and the command that replays it alone when the language has one, no task à repasser
#   among them), else the full pass by its command, the night tests, the project's
#   night script by its command, or the preparation when the night is red before any step. Each
#   red task comments the open ticket labelled `nuit` whose title names it (« <task> »), once per
#   ticket, or opens its own, « La nuit est rouge sur « <task> » depuis la nuit du <date> ». The
#   text, the same for each, gives the commits since the last green, where `git bisect` looks for
#   the culprit, each red step and each red task, with or without a last green, then the end of
#   the log. With a last green, each red task of the full pass that comes with its command gets the
#   command that looks for the culprit with that task alone:
#   `git bisect start <head> <last green> && git bisect run <its command>` (the module typescript's:
#   `npx turbo run <task> --filter=<package>`, `--filter=//` for the root, Turborepo's hash
#   replaying at each step only what changed).
set -u
usage() {
  echo "Usage : grillhouse nuit"
  echo "La nuit : la passe complète jouée pour de vrai, puis les tests de nuit et les bancs de budget,"
  echo "sur le HEAD de main, dans sa copie (.claude/worktrees/nuit). Se lance depuis la racine du projet."
  echo "Options :"
  echo "  -h, --help  affiche cette aide, sans lancer la nuit"
}
for argument in "$@"; do
  case "$argument" in
    -h | --help) ;;
    *)
      echo "⛔ grillhouse nuit : argument inconnu : $argument" >&2
      usage >&2
      exit 2
      ;;
  esac
done
if [ $# -gt 0 ]; then
  usage
  exit 0
fi
# The project is the working directory; the frame's scripts are this one's neighbours.
racine="$PWD"
ici="$(cd "$(dirname "$0")" && pwd)"
commun="$(git -C "$racine" rev-parse --path-format=absolute --git-common-dir)"
dossier="$commun/nuit"
mkdir -p "$dossier"
journal="$dossier/$(date +%Y-%m-%d).log"
# The red tasks of the full pass, written by the verification of the module of the language.
rouges="$dossier/rouges"
rm -f "$rouges"
# The results directory of the full pass: each language writes its reports there, and the pass reads
# them to keep the registry of results (scripts/registre-des-resultats.mjs), which the proof of the
# red reads to tell a test main holds green from a new one.
resultats="$dossier/resultats"
rm -rf "$resultats"
mkdir -p "$resultats"

tete="$(git -C "$racine" rev-parse HEAD)"
copie="$racine/.claude/worktrees/nuit"
# The red steps of the night, and its red tasks: those of the full pass, each with the command
# that replays it alone when the language has one (in `rejeux`, which a bisect runs), then a step
# red without a task of its own, named by its command (no command).
etapes=()
taches=()
rejeux=()
# The part of PC2 of the night (the tranches of the Nuit flow), when the project's flow plays on PC2:
# its red steps and tasks, kept apart from PC3's so that each part has its own verdict, and its exit
# code (empty when the project has no part on PC2; 75 when a tranche is still to play there).
etapes_pc2=()
taches_pc2=()
code_pc2=
# Gets the copy ready on HEAD: detached, cleaned, its submodules set; `partages` holds the list the
# pose fixes, which every mount gets. Prints the reason on failure.
partages=
preparer() {
  if [ -d "$copie" ]; then
    git -C "$copie" checkout -q --detach --force "$tete" || return 1
    git -C "$copie" clean -q -f -d -x -e node_modules || return 1
  else
    git -C "$racine" worktree add -q --detach "$copie" "$tete" || return 1
  fi
  partages=$(bash "$ici/sous-modules.sh" pose "$copie")
}
# The part of PC2: reads the Nuit flow of the commit the night plays by `gh` (scripts/repli-de-la-nuit.mjs), which cancels the
# run when a tranche has not started 60 minutes after the flow's hour, then plays on PC3, whole, each
# tranche not played on PC2 (never one finished there, green or red). A tranche still running or
# waiting leaves the part of PC2 « à repasser » (75). The statement says which tranches played where.
repli() {
  local depot decision ligne
  code_pc2=0
  if ! depot="$(cd "$racine" && gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)" || [ -z "$depot" ]; then
    echo "⏱ le repli de la nuit ne lit pas le dépôt GitHub (gh) : la part de PC2 reste à repasser."
    code_pc2=75
    return
  fi
  if ! decision="$(node "$ici/repli-de-la-nuit.mjs" "$depot" "$tranches" "" "$tete")"; then
    echo "⏱ le repli de la nuit ne lit pas le flux Nuit : la part de PC2 reste à repasser."
    code_pc2=75
    return
  fi
  local lignes rejouer= rouges_pc2= attend= mesures_du_flux=
  lignes="$(printf '%s' "$decision" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s);const l=k=>(d[k]??[]).join(" ");process.stdout.write(["pc2","pc3","rouges","enAttente","enCours","mesures"].map(k=>k+"\t"+l(k)).join("\n")+"\n")})')"
  while IFS= read -r ligne; do
    case "$ligne" in
      pc2$'\t'*) echo "relevé de la nuit : tranches jouées sur PC2 : ${ligne#pc2$'\t'}" ;;
      pc3$'\t'*) rejouer="${ligne#pc3$'\t'}"; echo "relevé de la nuit : tranches jouées sur PC3 : ${rejouer:-aucune}" ;;
      rouges$'\t'*) rouges_pc2="${ligne#rouges$'\t'}" ;;
      mesures$'\t'*) mesures_du_flux="${ligne#mesures$'\t'}"; echo "relevé de la nuit : mesures de temps du flux : ${mesures_du_flux}" ;;
      enAttente$'\t'*|enCours$'\t'*) attend="$attend ${ligne#*$'\t'}" ;;
    esac
  done <<< "$lignes"
  local t code
  for t in $rouges_pc2; do
    echo "✗ la tranche $t de la nuit est rouge sur PC2."
    etapes_pc2+=("la tranche $t de la nuit sur PC2")
    taches_pc2+=("la tranche $t de la nuit sur PC2")
  done
  for t in $rejouer; do
    (cd "$copie" && monter node "$ici/commande-du-langage.mjs" tests-de-nuit --hors-du-poste --tranche "$t/$tranches")
    code=$?
    if [ "$code" -ne 0 ] && [ "$code" -ne 75 ]; then
      echo "✗ la tranche $t, rejouée sur PC3, est rouge."
      etapes_pc2+=("la tranche $t de la nuit, rejouée sur PC3")
      taches_pc2+=("la tranche $t de la nuit sur PC3 (repli)")
    elif [ "$code" -eq 75 ]; then
      attend="$attend $t"
    fi
  done
  # The measures of time: the flow's job plays them when its file declares one; the night of the
  # poste plays them itself otherwise (tests-de-nuit --du-poste), so no last green without them.
  if node "$ici/flux-de-la-nuit.mjs" mesures "$copie"; then
    case "$mesures_du_flux" in
      rouge)
        echo "✗ les mesures de temps du flux sont rouges sur PC2."
        etapes_pc2+=("les mesures de temps de la nuit sur PC2")
        taches_pc2+=("les mesures de temps de la nuit sur PC2") ;;
      a-rejouer)
        (cd "$copie" && monter node "$ici/commande-du-langage.mjs" tests-de-nuit --mesures)
        code=$?
        if [ "$code" -eq 75 ]; then
          attend="$attend mesures"
        elif [ "$code" -ne 0 ]; then
          echo "✗ les mesures de temps, rejouées sur PC3, sont rouges."
          etapes_pc2+=("les mesures de temps de la nuit, rejouées sur PC3")
          taches_pc2+=("les mesures de temps de la nuit sur PC3 (repli)")
        fi ;;
      verte) ;;
      *) attend="$attend mesures" ;;
    esac
  fi
  if [ "${#etapes_pc2[@]}" -gt 0 ]; then
    code_pc2=1
  elif [ -n "${attend// /}" ]; then
    echo "⏱ la part de PC2 reste à repasser : tranche(s) en cours, en attente ou à repasser :$attend."
    code_pc2=75
  fi
}
# Plays the copy; its status is the night's verdict. An existing copy that does not get ready is
# removed (scripts/retirer-copie.sh --jetable) and created again, once.
jouer() {
  echo "— la nuit du $(date '+%Y-%m-%d %H:%M') sur ${tete:0:7}"
  local existait=0 raison
  [ -d "$copie" ] && existait=1
  if ! preparer; then
    [ "$existait" -eq 1 ] || return 1
    if ! raison=$(cd "$racine" && bash "$ici/retirer-copie.sh" --jetable "$copie" 2>&1); then
      echo "✗ la copie de la nuit ne se prépare pas et ne se retire pas : $raison"
      return 1
    fi
    preparer || return 1
  fi
  # The project's commands play with the shared submodules read-only; no possible mount stops here.
  monter() { bash "$ici/sous-modules.sh" monter "$copie" --partages "$partages" "$@"; }
  if ! raison=$(monter true 2>&1); then
    echo "✗ le montage en lecture seule des sous-modules partagés est impossible : rien n'est joué."
    echo "$raison"
    return 1
  fi
  # The reading gives one line per finding: « script<TAB>name », or a fault « nuit-invalide<TAB>value
  # as JSON », « nuit-absent<TAB>name », « poussee-retiree<TAB>line ». Every faulty key is reported
  # before any work.
  local lecture ligne nuit=
  lecture="$(node --input-type=module -e '
    import { readFileSync } from "node:fs";
    import { pathToFileURL } from "node:url";
    const pkg = JSON.parse(readFileSync(process.argv[1], "utf8"));
    const { pousseeRetiree } = await import(pathToFileURL(process.argv[2]).href);
    const out = (...l) => process.stdout.write(l.join("\t") + "\n");
    const vide = v => typeof v !== "string" || !v.trim();
    const v = pkg.grillhouse?.nuit;
    if (v != null) {
      if (vide(v)) out("nuit-invalide", JSON.stringify(v));
      else if (!Object.hasOwn(pkg.scripts ?? {}, v)) out("nuit-absent", v);
      else out("script", v);
    }
    const retiree = pousseeRetiree(pkg);
    if (retiree) out("poussee-retiree", retiree);
  ' "$copie/package.json" "$ici/poussee-retiree.mjs" 2>/dev/null)"
  local faute=0
  while IFS= read -r ligne; do
    case "$ligne" in
      script$'\t'*) nuit="${ligne#script$'\t'}" ;;
      nuit-invalide$'\t'*)
        echo "✗ la clé grillhouse.nuit vaut ${ligne#nuit-invalide$'\t'}, pas un nom de script npm : rien n'est joué."
        faute=1 ;;
      nuit-absent$'\t'*)
        echo "✗ la clé grillhouse.nuit nomme « ${ligne#nuit-absent$'\t'} », absent des scripts du package.json : rien n'est joué."
        faute=1 ;;
      poussee-retiree$'\t'*)
        echo "✗ ${ligne#poussee-retiree$'\t'} Rien n'est joué."
        faute=1 ;;
    esac
  done <<< "$lecture"
  [ "$faute" -eq 0 ] || return 1
  # The tools of the project, one `export VARIABLE='chemin'` each (exportsDesOutils of
  # outils-cles.mjs), evaluated for every command.
  local outils
  if ! outils=$(node "$ici/outils-cles.mjs" "$copie"); then
    echo "✗ la clé grillhouse.outils est refusée : rien n'est joué."
    return 1
  fi
  eval "$outils"
  # The pinned program of Temporal, laid down and exported for every command. The command is that
  # of the version playing the night (already built), not the copy's: the copy is cleaned of its
  # build and has no node_modules before the `npm ci` below.
  local temporal
  if temporal=$(env -C "$copie" node "$ici/../bin/grillhouse.mjs" temporal installer --programme-seul); then
    export TEMPORAL="$temporal"
  else
    echo "⚠ la pose du programme temporal n'a pas abouti : un test qui monte un serveur le résout depuis le cache partagé, ou échoue en le nommant."
  fi
  # The data of the project (donnees-cles.mjs), exported the same way.
  local donnees
  if ! donnees=$(node "$ici/donnees-cles.mjs" "$copie"); then
    echo "✗ la clé grillhouse.donnees est refusée : rien n'est joué."
    return 1
  fi
  eval "$donnees"
  # The dependencies, installed again when the lock moved or when they were installed under
  # another Node (scripts/abi-des-dependances.mjs: a native module refuses another interface).
  if [ -f "$copie/package-lock.json" ] && { ! cmp -s "$copie/package-lock.json" "$copie/node_modules/.nuit-lock" || ! node "$ici/abi-des-dependances.mjs" --a-jour "$copie"; }; then
    monter npm --prefix "$copie" ci --no-audit --no-fund --silent || return 1
    cp "$copie/package-lock.json" "$copie/node_modules/.nuit-lock"
    node "$ici/abi-des-dependances.mjs" --marquer "$copie"
  fi
  # The frame's package, built once when the copy carries it as a package of the repository (one
  # the `workspaces` of its root select, as scripts/paquets.mjs maps them, named
  # @roomi-fields/grillhouse): the copy is cleaned of dist/ and the pass (the taking of its place)
  # and the night tests of Temporal read dist/temporal. A project that installs the frame builds
  # nothing more, even with a copy of the frame's package.json no `workspaces` select.
  if node --input-type=module -e '
const { pathToFileURL } = await import("node:url");
const { paquets } = await import(pathToFileURL(process.argv[1]).href);
process.exit(paquets(process.argv[2]).some(p => p.pkg.name === "@roomi-fields/grillhouse") ? 0 : 1);
' "$ici/paquets.mjs" "$copie" 2>/dev/null; then
    if ! monter npm --prefix "$copie" run build --workspace=@roomi-fields/grillhouse; then
      echo "✗ la construction du paquet @roomi-fields/grillhouse échoue : rien n'est joué."
      return 1
    fi
  fi
  # The full pass, played for real: the night replays no log of the cache. Each step plays even
  # when one before it is red; a step à repasser ends the night there, red if a step before it is.
  local code tache avant
  GRILLHOUSE_ROUGES="$rouges" GRILLHOUSE_RESULTATS="$resultats" GRILLHOUSE_VERIFICATION_SORTE=Nuit monter npm --prefix "$copie" run verifier -- --force
  code=$?
  if [ "$code" -eq 75 ]; then
    echo "⏱ la passe complète est à repasser (code 75) : l'attente de la machine a atteint sa borne, ou la veille de la mémoire a coupé la passe."
    return 75
  fi
  if [ "$code" -ne 0 ]; then
    echo "✗ la passe complète (npm run verifier -- --force) a échoué."
    etapes+=("la passe complète (npm run verifier -- --force)")
    avant=${#taches[@]}
    if [ -s "$rouges" ]; then
      while IFS= read -r ligne; do
        [ -n "$ligne" ] || continue
        taches+=("${ligne%%$'\t'*}")
        if [[ "$ligne" == *$'\t'* ]]; then rejeux+=("${ligne#*$'\t'}"); else rejeux+=(""); fi
      done < "$rouges"
    fi
    if [ "${#taches[@]}" -eq "$avant" ]; then
      taches+=("npm run verifier -- --force")
      rejeux+=("")
    fi
  fi
  # A project whose Nuit flow plays on PC2 (its runner label `pc2`) leaves PC2 the night tests that
  # do not need the poste: PC3 plays the tests tagged @poste, then the tranches PC2 did not play
  # (the fallback, scripts/repli-de-la-nuit.mjs). The measures of time play on PC3 too, unless the
  # flow declares a job that plays them (`tests-de-nuit --mesures`, scripts/flux-de-la-nuit.mjs,
  # the flow of Grillhouse): then the verdict of its job, read for the commit of the night, counts.
  # The last green is set only when the measures were played and are green, by PC3 or by that job.
  local sur_pc2=0 tranches=
  if grep -q "\bpc2\b" "$copie/.github/workflows/nuit.yml" 2>/dev/null; then
    sur_pc2=1
    tranches="$(sed -n 's/^  TRANCHES: *\([0-9]*\).*/\1/p' "$copie/.github/workflows/nuit.yml")"
  fi
  bancs() {
    local args=()
    [ "$sur_pc2" -eq 0 ] || args=(--du-poste)
    (cd "$copie" && monter node "$ici/commande-du-langage.mjs" tests-de-nuit "${args[@]}")
  }
  bancs
  code=$?
  if [ "$code" -eq 75 ]; then
    echo "⏱ les bancs de temps ou les tests de nuit sont à repasser (code 75) : attente du repos, puis une relance."
    if ! node "$ici/mesure/pression.mjs" attendre; then
      echo "⏱ à repasser : pas de repos dans la borne."
      fin 75
      return
    fi
    bancs
    code=$?
    if [ "$code" -eq 75 ]; then
      echo "⏱ à repasser : les bancs échouent encore sous charge après la relance."
      fin 75
      return
    fi
  fi
  if [ "$code" -ne 0 ]; then
    echo "✗ les bancs de temps ou les tests de nuit (*.budget.*, *.nuit.*) ont échoué."
    etapes+=("les bancs de temps et les tests de nuit (*.budget.*, *.nuit.*)")
    taches+=("les bancs de temps et les tests de nuit")
    rejeux+=("")
  fi
  if [ "$sur_pc2" -eq 1 ]; then
    repli
  fi
  if [ -n "$nuit" ] && ! monter npm --prefix "$copie" run "$nuit"; then
    echo "✗ le script de nuit du projet \`npm run $nuit\` (grillhouse.nuit) a échoué."
    etapes+=("le script de nuit du projet (npm run $nuit, grillhouse.nuit)")
    taches+=("npm run $nuit")
    rejeux+=("")
  fi
  fin 0
}
# The night's verdict once its steps are played: red when a step is red, else <code>.
fin() {
  [ "${#etapes[@]}" -eq 0 ] || return 1
  return "$1"
}
jouer >> "$journal" 2>&1
verdict=$?
# The copies whose content is on main go once the steps are played, the night's own kept and
# pruned of its tools' outputs; their removal never changes the verdict.
(cd "$racine" && node "$ici/retirer-les-copies-finies.mjs" "$copie") >> "$journal" 2>&1 || true
# The project's durable verdict, read by the board: green on 0, red on any other code but 75, which
# writes nothing (the previous verdict stays).
node "$ici/verdict-de-la-nuit.mjs" "$commun" "$verdict" pc3 >> "$journal" 2>&1 || true
# The part of PC2, when the project has one: its own durable verdict, and the night's, which is red
# when either part is red and « à repasser » while a tranche of PC2 is still to play.
if [ -n "$code_pc2" ]; then
  node "$ici/verdict-de-la-nuit.mjs" "$commun" "$code_pc2" pc2 >> "$journal" 2>&1 || true
  if [ "$code_pc2" -eq 1 ]; then
    etapes+=("${etapes_pc2[@]}")
    taches+=("${taches_pc2[@]}")
    for _ in "${taches_pc2[@]}"; do rejeux+=(""); done
    verdict=1
  elif [ "$code_pc2" -eq 75 ] && [ "$verdict" -eq 0 ]; then
    verdict=75
  fi
fi

if [ "$verdict" -eq 75 ]; then
  echo "⏱ à repasser : ${tete:0:7} n'est ni vert ni rouge, la machine est restée chargée ; le dernier vert reste, aucun ticket, la nuit suivante rejoue." >> "$journal"
  exit 75
fi

# The open night tickets, read once; a ticket names a cause when its title holds « <cause> ».
ouverts=
commentes=" "
# Reports one cause: comments the open night ticket whose title names it (once a night), or opens
# its own (title « number — subject — parent », the number being the id without the project's
# prefix as `prefixe` reads it in `.beads/config.yaml`, the subject naming « <cause> »); its id goes to
# `numero`.
signaler() {
  local cause="$1" sujet="$2" texte="$3" ouvert neuf= prefixe
  [ -n "$ouverts" ] || ouverts="$(cd "$racine" && bd list --status open --label nuit --json 2>/dev/null)"
  ouvert="$(printf '%s' "$ouverts" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const c=`« ${process.argv[1]} »`;process.stdout.write(JSON.parse(s).find(t=>String(t.title??"").includes(c))?.id??"")}catch{}})' "$cause")"
  if [ -n "$ouvert" ]; then
    case "$commentes" in
      *" $ouvert "*) ;;
      *)
        (cd "$racine" && bd comments add "$ouvert" "$texte" >/dev/null)
        commentes="$commentes$ouvert " ;;
    esac
  else
    neuf="$(cd "$racine" && bd create "$sujet" -t bug -p 1 -l nuit -d "$texte" --silent)"
    if prefixe="$(node "$ici/prefixe-des-tickets.mjs" "$racine" 2>&1)"; then
      [ -n "$neuf" ] && (cd "$racine" && bd update "$neuf" --title "${neuf#"$prefixe"-} — $sujet — parent" >/dev/null)
    else
      echo "⛔ ${prefixe}" >> "$journal"
    fi
  fi
  numero="${ouvert:-$neuf}"
}

if [ "$verdict" -eq 0 ]; then
  echo "$tete" > "$dossier/dernier-vert"
  echo "✓ vert : ${tete:0:7} est le dernier vert." >> "$journal"
  exit 0
fi

vert="$(cat "$dossier/dernier-vert" 2>/dev/null || true)"
intervalle="${vert:+${vert:0:7}..}${tete:0:7}"
# A red before any step (the copy, its mount, the keys, the installation) is the preparation's.
if [ "${#etapes[@]}" -eq 0 ]; then
  etapes=("la préparation (la copie, ses sous-modules, les clés grillhouse, l'installation)")
  taches=("la préparation")
  rejeux=("")
fi
liste="Étapes rouges :"
for e in "${etapes[@]}"; do
  liste="$liste
- $e"
done
liste="$liste
Tâches rouges"
[ -n "$vert" ] && liste="$liste, avec pour une tâche de la passe complète la commande qui cherche le commit fautif"
liste="$liste :"
for i in "${!taches[@]}"; do
  tache="${taches[$i]}"
  if [ -n "$vert" ] && [ -n "${rejeux[$i]}" ]; then
    tache="$tache : git bisect start ${tete:0:7} ${vert:0:7} && git bisect run ${rejeux[$i]}"
  fi
  liste="$liste
- $tache"
done
texte="La nuit du $(date +%Y-%m-%d) est rouge sur ${tete:0:7}.
Commits à chercher (git bisect) : $intervalle.
$liste
Journal : $journal
Fin du journal :
$(tail -40 "$journal")"
# Each red task reports on the night ticket that names it, else on its own; a night ticket is the
# mother of its fixes.
for tache in "${taches[@]}"; do
  signaler "$tache" "La nuit est rouge sur « $tache » depuis la nuit du $(date +%Y-%m-%d)" "$texte"
  echo "✗ rouge : ticket ${numero:-neuf} (étiquette nuit) sur « $tache »." >> "$journal"
done
exit 1
