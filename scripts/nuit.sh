#!/usr/bin/env bash
# The night: once a day, the full suites, the only place they run. During the day an integration
# replays the touched components and those that depend on them (scripts/integration/integrer.mjs).
#
#   bash scripts/nuit.sh        from the crontab of the machine, e.g. « 0 3 * * * bash <root>/scripts/nuit.sh »
#
# - It plays main's HEAD in its own clean copy (.claude/worktrees/nuit): detached, every untracked
#   file removed, its submodules set at the commit of HEAD (scripts/sous-modules.sh, a local
#   modification overwritten; one that cannot be set turns the night red; a submodule the project
#   shares, `grillhouse.partage`, is linked to the main repository's instead, not set),
#   dependencies reinstalled (npm ci) when package-lock.json changes, built once by the one entry
#   point that builds (scripts/integration/constructions.mjs), then the guards, then `npm test`
#   (every suite of the day, time budget benches included), under FORCER=1: it reads no trace of the
#   suites (scripts/integration/suites-vitest.mjs) and no stored build, and writes them again. The
#   guards are those of `integration:gardes` (the controls of `grillhouse:gardes` without its build
#   step), played by the night itself, and `npm test` runs without its pretest: nothing builds behind
#   the entry point. `npm test` skips its pretest only when the pretest is exactly the call of `grillhouse:gardes`
#   (`npm run [flags] grillhouse:gardes`); a project whose pretest does anything more, or that has no
#   `integration:gardes` script, plays `npm test` as it is, pretest included.
#   An existing copy that does not get ready (its move onto HEAD, its cleaning or the setting of
#   its submodules fails) is removed by `scripts/retirer-copie.sh --jetable` (local work does not
#   hold it, a lock does) and created again, once; a copy that does not get ready the second time
#   turns the night red, and so does a removal the script refuses, the log repeating its reason.
# - Every command of the project (installation, build, tests, night tests, night script) plays
#   through `scripts/sous-modules.sh monter`, each shared submodule of the main repository
#   read-only, its working tree and its git repository (the list the preparation's pose printed,
#   whatever a command rewrites afterwards): a write into it fails. With a shared submodule and no possible mount (bwrap absent
#   or refused), the night turns red, the log saying so, before any command runs.
# - The night tests: after a green `npm test`, the files `*.nuit.test.*` and `*.nuit.spec.*` of the
#   copy (outside node_modules, dist and .git), which `npm test` and the integration leave out, run
#   by Vitest with the frame's configuration (scripts/vitest.nuit.config.mjs of the copy). A red
#   turns the night red, with a log line that says so, and the project's night script does not run.
#   A copy without any night test plays none.
# - The project's night script: `grillhouse.nuit` in the package.json of the commit it plays names
#   an npm script (`npm pkg set grillhouse.nuit=<script>`). After the night tests, the night plays
#   `npm run <script>` in its copy; a red script turns the night red, with a log line that names it.
#   The key is read as written, before any work: without it (or with null) the night plays
#   no script of the project; a value that is not a non-blank string, or a name absent from the scripts of
#   that package.json, turns the night red, with a log line that cites it, and nothing runs.
# - The night push: `grillhouse.poussee.nuit` in the package.json of the commit it plays names a
#   remote branch (`npm pkg set grillhouse.poussee.nuit=<branch>`). After a green night, once the
#   last green is written, the night runs `git push origin <commit>:<branch>` with GRILLHOUSE_NUIT=1
#   set for that push alone, the mark by which the pre-push guard (scripts/branche-de-nuit.mjs)
#   lets it through; any other push to that branch is refused there. Without the key
#   (or with null, as for grillhouse.poussee itself) or after a red night it pushes nothing. The
#   keys are read as written, before any work: a grillhouse.poussee that is neither null nor an
#   object, or a grillhouse.poussee.nuit that is not a non-blank string, turns the night red with
#   a log line that cites it, one line per faulty key. A refused push keeps the last green, opens
#   (or completes) the night ticket « La poussée de la nuit est refusée sur <commit> », and exits
#   1; a remote already at the commit accepts the push.
# - It takes no lock of the integration or of the queue (scripts/integration/file.mjs): an
#   integration and the queue run during the night, each in its own copy.
# - Its log is <git common dir>/nuit/<date>.log. Green: HEAD becomes the last green commit
#   (<git common dir>/nuit/dernier-vert). Red: a ticket labelled `nuit`, with the commits since the
#   last green, where `git bisect` looks for the culprit; an open one gets a comment instead.
set -u
racine="$(cd "$(dirname "$0")/.." && pwd)"
commun="$(git -C "$racine" rev-parse --path-format=absolute --git-common-dir)"
dossier="$commun/nuit"
mkdir -p "$dossier"
journal="$dossier/$(date +%Y-%m-%d).log"

tete="$(git -C "$racine" rev-parse HEAD)"
copie="$racine/.claude/worktrees/nuit"
branche=
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
  partages=$(bash "$racine/scripts/sous-modules.sh" pose "$copie")
}
# Plays the copy; its status is the night's verdict. An existing copy that does not get ready is
# removed (scripts/retirer-copie.sh --jetable) and created again, once.
jouer() {
  echo "— la nuit du $(date '+%Y-%m-%d %H:%M') sur ${tete:0:7}"
  local existait=0 raison
  [ -d "$copie" ] && existait=1
  if ! preparer; then
    [ "$existait" -eq 1 ] || return 1
    if ! raison=$(cd "$racine" && bash "$racine/scripts/retirer-copie.sh" --jetable "$copie" 2>&1); then
      echo "✗ la copie de la nuit ne se prépare pas et ne se retire pas : $raison"
      return 1
    fi
    preparer || return 1
  fi
  # The project's commands play with the shared submodules read-only; no possible mount stops here.
  monter() { bash "$racine/scripts/sous-modules.sh" monter "$copie" --partages "$partages" "$@"; }
  if ! raison=$(monter true 2>&1); then
    echo "✗ le montage en lecture seule des sous-modules partagés est impossible : rien n'est joué."
    echo "$raison"
    return 1
  fi
  # The reading gives one line per finding: « script<TAB>name », « pousse<TAB>branch », or a fault
  # « nuit-invalide<TAB>value as JSON », « nuit-absent<TAB>name », « poussee-invalide<TAB>value »,
  # « poussee-nuit-invalide<TAB>value ». Every faulty key is reported before any work.
  local lecture ligne nuit=
  lecture="$(node --input-type=module -e '
    import { readFileSync } from "node:fs";
    import { pathToFileURL } from "node:url";
    const pkg = JSON.parse(readFileSync(process.argv[1], "utf8"));
    const { lirePoussee } = await import(pathToFileURL(process.argv[2]).href);
    const out = (...l) => process.stdout.write(l.join("\t") + "\n");
    const vide = v => typeof v !== "string" || !v.trim();
    const v = pkg.grillhouse?.nuit;
    if (v != null) {
      if (vide(v)) out("nuit-invalide", JSON.stringify(v));
      else if (!Object.hasOwn(pkg.scripts ?? {}, v)) out("nuit-absent", v);
      else out("script", v);
    }
    const { nuit, fautes } = lirePoussee(pkg);
    for (const f of fautes) out(f.cle === "grillhouse.poussee" ? "poussee-invalide" : "poussee-nuit-invalide", f.valeur);
    if (nuit) out("pousse", nuit);
  ' "$copie/package.json" "$racine/scripts/poussee-cles.mjs" 2>/dev/null)"
  local faute=0
  while IFS= read -r ligne; do
    case "$ligne" in
      script$'\t'*) nuit="${ligne#script$'\t'}" ;;
      pousse$'\t'*) branche="${ligne#pousse$'\t'}" ;;
      nuit-invalide$'\t'*)
        echo "✗ la clé grillhouse.nuit vaut ${ligne#nuit-invalide$'\t'}, pas un nom de script npm : rien n'est joué."
        faute=1 ;;
      nuit-absent$'\t'*)
        echo "✗ la clé grillhouse.nuit nomme « ${ligne#nuit-absent$'\t'} », absent des scripts du package.json : rien n'est joué."
        faute=1 ;;
      poussee-invalide$'\t'*)
        echo "✗ la clé grillhouse.poussee vaut ${ligne#poussee-invalide$'\t'}, pas un objet : rien n'est joué."
        faute=1 ;;
      poussee-nuit-invalide$'\t'*)
        echo "✗ la clé grillhouse.poussee.nuit vaut ${ligne#poussee-nuit-invalide$'\t'}, pas un nom de branche : rien n'est joué."
        faute=1 ;;
    esac
  done <<< "$lecture"
  [ "$faute" -eq 0 ] || return 1
  if [ -f "$copie/package-lock.json" ] && ! cmp -s "$copie/package-lock.json" "$copie/node_modules/.nuit-lock"; then
    monter npm --prefix "$copie" ci --no-audit --no-fund --silent || return 1
    cp "$copie/package-lock.json" "$copie/node_modules/.nuit-lock"
  fi
  # The night reads no trace and no stored build, and writes them again: FORCER=1.
  (cd "$copie" && FORCER=1 monter node "$racine/scripts/integration/constructions.mjs") || return 1
  if node -e '
    const s = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).scripts ?? {};
    const appel = /^npm\s+run(?:\s+-{1,2}[\w-]+(?:=\S+)?)*\s+grillhouse:gardes$/;
    process.exit(appel.test((s.pretest ?? "").trim()) && s["integration:gardes"] ? 0 : 1);
  ' "$copie/package.json"; then
    monter npm --prefix "$copie" run --silent integration:gardes || return 1
    FORCER=1 monter npm --prefix "$copie" test --ignore-scripts || return 1
  else
    FORCER=1 monter npm --prefix "$copie" test || return 1
  fi
  if [ -n "$(find "$copie" \( -name node_modules -o -name dist -o -name .git \) -prune -o \
      -type f -regextype posix-extended -regex '.*\.nuit\.(test|spec)\.(c|m)?[jt]sx?' -print -quit)" ]; then
    if ! (cd "$copie" && monter npx --no-install vitest run --root "$copie" \
        --config "$copie/scripts/vitest.nuit.config.mjs"); then
      echo "✗ les tests de nuit (*.nuit.test.*, *.nuit.spec.*) ont échoué."
      return 1
    fi
  fi
  [ -n "$nuit" ] || return 0
  if ! monter npm --prefix "$copie" run "$nuit"; then
    echo "✗ le script de nuit du projet \`npm run $nuit\` (grillhouse.nuit) a échoué."
    return 1
  fi
}
jouer >> "$journal" 2>&1
verdict=$?

# Opens the night ticket (subject « number — subject — parent », the number being the id without the
# project's prefix as `bd config get issue_prefix` gives it), or comments the open one; prints its id.
signaler() {
  local sujet="$1" texte="$2" ouvert neuf= prefixe
  ouvert="$(cd "$racine" && bd list --status open --label nuit --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const l=JSON.parse(s);process.stdout.write(l[0]?.id??"")}catch{}})')"
  if [ -n "$ouvert" ]; then
    (cd "$racine" && bd comments add "$ouvert" "$texte" >/dev/null)
  else
    neuf="$(cd "$racine" && bd create "$sujet" -t bug -p 1 -l nuit -d "$texte" --silent)"
    prefixe="$(cd "$racine" && bd config get issue_prefix 2>/dev/null)"
    [ -n "$neuf" ] && (cd "$racine" && bd update "$neuf" --title "${neuf#"$prefixe"-} — $sujet — parent" >/dev/null)
  fi
  echo "${ouvert:-$neuf}"
}

if [ "$verdict" -eq 0 ]; then
  echo "$tete" > "$dossier/dernier-vert"
  echo "✓ vert : ${tete:0:7} est le dernier vert." >> "$journal"
  if [ -n "$branche" ]; then
    if GRILLHOUSE_NUIT=1 GIT_TERMINAL_PROMPT=0 git -C "$racine" push origin "$tete:$branche" >> "$journal" 2>&1; then
      echo "✓ poussée : ${tete:0:7} est sur origin/$branche." >> "$journal"
    else
      echo "✗ la poussée de ${tete:0:7} vers origin/$branche (grillhouse.poussee.nuit) est refusée." >> "$journal"
      texte="La poussée de la nuit du $(date +%Y-%m-%d) est refusée : ${tete:0:7} vers origin/$branche (grillhouse.poussee.nuit).
Le dernier vert reste ${tete:0:7}.
Journal : $journal
Fin du journal :
$(tail -40 "$journal")"
      numero="$(signaler "La poussée de la nuit est refusée sur ${tete:0:7}" "$texte")"
      echo "✗ vert, poussée refusée : ticket ${numero:-neuf} (étiquette nuit)." >> "$journal"
      exit 1
    fi
  fi
  exit 0
fi

vert="$(cat "$dossier/dernier-vert" 2>/dev/null || true)"
intervalle="${vert:+${vert:0:7}..}${tete:0:7}"
texte="La nuit du $(date +%Y-%m-%d) est rouge sur ${tete:0:7}.
Commits à chercher (git bisect) : $intervalle.
Journal : $journal
Fin du journal :
$(tail -40 "$journal")"
# A night ticket is the mother of its fixes.
numero="$(signaler "La nuit est rouge depuis ${tete:0:7}" "$texte")"
echo "✗ rouge : ticket ${numero:-neuf} (étiquette nuit)." >> "$journal"
exit 1
