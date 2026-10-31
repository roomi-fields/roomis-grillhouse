#!/usr/bin/env node
// The frame's git hooks, on Husky's model: the project's `prepare`, which npm runs at its install,
// places them, and each calls the project's command, `grillhouse hook <nom>`.
//
//   npx grillhouse hooks [<project>]            places both hooks and the merge driver of the
//                                               CHANGELOG (the current directory by default)
//   npx grillhouse hooks --absents [<project>]  prints the name of each absent hook, one per line
//
// - commit-msg: « un ticket fermé garde sa livraison ; un ticket rouvert reçoit ses corrections » (scripts/un-commit-par-ticket.mjs).
// - pre-push: the night branch guard (scripts/branche-de-nuit.mjs).
// - A hook lives in the folder git reads for the project (`git rev-parse --git-path hooks`, which
//   follows `core.hooksPath`, Beads' `.beads/hooks` included); `core.hooksPath` is never changed
//   here. The update of the frame (scripts/grillhouse-maj.mjs) places them by the same function.
// - The frame's lines run `node_modules/.bin/grillhouse` of the project, the package installed;
//   without it they do nothing and let the hook go on, as Husky's lines do without Husky.
// - A hook that does not exist is created (shebang, the frame's lines), executable. In one that
//   exists, the frame's lines of any version (a comment « … (Grillhouse): », a line that names a
//   guard's script or the frame's shell variables `_gh_…`) give way to the current ones, written
//   where the first stood, else right after the shebang; the project's lines and Beads' sections
//   stay as they are. The frame's lines never end the hook early (no `exec` of a command), so the
//   lines that follow still run.
// - A hook is absent when it is missing from that folder or lacks the current lines of the frame.
// - The merge driver of the CHANGELOG (scripts/fusion-du-changelog.mjs) is written in the
//   repository's configuration by the same function, `poserCrochets`, which each `npm install`
//   runs, as git asks a driver's command of the configuration, never of a versioned file.
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { poserLePilote } from './fusion-du-changelog.mjs';

// The project's command, which the frame's lines run.
const COMMANDE = '_gh_commande="$(git rev-parse --show-toplevel)/node_modules/.bin/grillhouse"';

// The frame's hooks: name, guard (the script `grillhouse hook <nom>` runs) and lines. The pre-push
// guard reads git's standard input, which is kept in a file and given back to the lines that
// follow (Beads' section).
export const CROCHETS = {
  'commit-msg': {
    garde: 'un-commit-par-ticket.mjs',
    lignes: [
      '# A closed ticket keeps its one delivery (Grillhouse): a second commit for a closed ticket whose delivery stands is refused, a commit for an open (reopened) ticket is a correction and passes; a revert (Revert "…", Reapply "…") passes and withdraws the delivery it names. Without the package @roomi-fields/grillhouse installed, nothing.',
      COMMANDE,
      'if [ -x "$_gh_commande" ]; then "$_gh_commande" hook commit-msg "$@" || exit 1; fi',
    ],
  },
  'pre-push': {
    garde: 'branche-de-nuit.mjs',
    lignes: [
      '# Night branch guard (Grillhouse): only the night pushes the branch of grillhouse.poussee.nuit, after its green. Without the package @roomi-fields/grillhouse installed, nothing.',
      COMMANDE,
      'if [ -x "$_gh_commande" ]; then _gh_entree=$(mktemp) && cat > "$_gh_entree" && "$_gh_commande" hook pre-push "$@" < "$_gh_entree" || { rm -f "$_gh_entree"; exit 1; }; exec < "$_gh_entree"; rm -f "$_gh_entree"; fi',
    ],
  },
};

// A line of the frame, of this version or of a former one (see the header).
const ligneDuCadre = ligne =>
  /^# .*\(Grillhouse\):/.test(ligne) ||
  ligne.includes('_gh_') ||
  Object.values(CROCHETS).some(({ garde }) => ligne.includes(garde));

// The folder git reads the hooks of `projet` from, or null when it is not a git repository.
function dossierDesCrochets(projet) {
  try {
    return path.resolve(
      projet,
      execFileSync('git', ['-C', projet, 'rev-parse', '--git-path', 'hooks'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
    );
  } catch {
    return null;
  }
}

// The text of the hook `nom` once the frame's current lines are placed in `actuel` (null: none).
function texteDuCrochet(nom, actuel) {
  const { lignes } = CROCHETS[nom];
  if (actuel === null) {
    return `#!/usr/bin/env sh\n${lignes.join('\n')}\n`;
  }
  const avant = actuel.split('\n');
  const premiere = avant.findIndex(ligneDuCadre);
  const reste = avant.filter(l => !ligneDuCadre(l));
  const ou = premiere >= 0 ? premiere : avant[0]?.startsWith('#!') ? 1 : 0;
  reste.splice(ou, 0, ...lignes);
  return reste.join('\n');
}

// Places the frame's hook `nom` in the project (see the header). Returns its path when written.
function poserCrochet(projet, nom) {
  const dossier = dossierDesCrochets(projet);
  if (!dossier) {
    return null;
  }
  const f = path.join(dossier, nom);
  const actuel = existsSync(f) ? readFileSync(f, 'utf8') : null;
  const texte = texteDuCrochet(nom, actuel);
  const ecrit = texte !== actuel;
  if (ecrit) {
    mkdirSync(dossier, { recursive: true });
    writeFileSync(f, texte);
  }
  chmodSync(f, statSync(f).mode | 0o111);
  return ecrit ? f : null;
}

/** Places both frame hooks and the merge driver of the CHANGELOG in the project; returns the paths written. */
export function poserCrochets(projet) {
  poserLePilote(projet);
  return Object.keys(CROCHETS)
    .map(nom => poserCrochet(projet, nom))
    .filter(Boolean);
}

/** Names the frame hooks absent from the folder git reads for the project. */
export function crochetsAbsents(projet) {
  const dossier = dossierDesCrochets(projet);
  return Object.entries(CROCHETS)
    .filter(([nom, { lignes }]) => {
      const f = dossier && path.join(dossier, nom);
      return !f || !existsSync(f) || !readFileSync(f, 'utf8').includes(`${lignes.join('\n')}\n`);
    })
    .map(([nom]) => nom);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const absents = args[0] === '--absents';
  const projet = path.resolve((absents ? args[1] : args[0]) ?? '.');
  if (absents) {
    const noms = crochetsAbsents(projet);
    if (noms.length > 0) {
      process.stdout.write(`${noms.join('\n')}\n`);
    }
  } else {
    poserCrochets(projet);
  }
}
