#!/usr/bin/env node
// The frame's git hooks, placed by one mechanism: `scripts/setup.sh` (installation) and
// `scripts/grillhouse-maj.mjs` (update) both call it, and the session start asks it which are absent.
//
//   node scripts/crochets.mjs [<project>]            places both hooks (the current directory by default)
//   node scripts/crochets.mjs --absents [<project>]  prints the name of each absent hook, one per line
//
// - commit-msg: « un ticket fermé garde sa livraison ; un ticket rouvert reçoit ses corrections » (scripts/un-commit-par-ticket.mjs).
// - pre-push: the night branch guard (scripts/branche-de-nuit.mjs).
// - A hook lives in the folder git reads for the project (`git rev-parse --git-path hooks`, which
//   follows `core.hooksPath`); the configuration is never changed here.
// - A hook that does not exist is created (shebang, the frame's lines), executable; one that lacks
//   the frame's mark receives the lines right after its shebang, before the project's own lines;
//   one that has the mark stays as it is. The frame's lines never end the hook early (no `exec`),
//   so the lines of the project that follow still run.
// - A hook is absent when it is missing from that folder or lacks the frame's mark.
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// The frame's hooks: name, mark (a word of its command, which tells it is placed) and lines. The
// pre-push guard reads git's standard input, which is kept in a file and given back to the lines
// that follow (Beads' section).
export const CROCHETS = {
  'commit-msg': {
    marque: 'un-commit-par-ticket',
    lignes: [
      '# A closed ticket keeps its one delivery (Grillhouse): a second commit for a closed ticket whose delivery stands is refused, a commit for an open (reopened) ticket is a correction and passes; a revert (Revert "…", Reapply "…") passes and withdraws the delivery it names.',
      'node "$(git rev-parse --show-toplevel)/scripts/un-commit-par-ticket.mjs" "$1" || exit 1',
    ],
  },
  'pre-push': {
    marque: 'branche-de-nuit',
    lignes: [
      '# Night branch guard (Grillhouse): only the night pushes the branch of grillhouse.poussee.nuit, after its green.',
      '_gh_entree=$(mktemp) && cat > "$_gh_entree" && node "$(git rev-parse --show-toplevel)/scripts/branche-de-nuit.mjs" "$@" < "$_gh_entree" || { rm -f "$_gh_entree"; exit 1; }',
      'exec < "$_gh_entree"',
      'rm -f "$_gh_entree"',
    ],
  },
};

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

// Places the frame's hook `nom` in the project (see the header). Returns its path when written.
function poserCrochet(projet, nom) {
  const dossier = dossierDesCrochets(projet);
  if (!dossier) {
    return null;
  }
  const { marque, lignes } = CROCHETS[nom];
  const f = path.join(dossier, nom);
  const bloc = `${lignes.join('\n')}\n`;
  let texte;
  if (!existsSync(f)) {
    texte = `#!/usr/bin/env sh\n${bloc}`;
  } else {
    const actuel = readFileSync(f, 'utf8');
    if (actuel.includes(marque)) {
      chmodSync(f, statSync(f).mode | 0o111);
      return null;
    }
    const i = actuel.startsWith('#!') ? actuel.indexOf('\n') + 1 : 0;
    texte = `${actuel.slice(0, i)}${bloc}${actuel.slice(i)}`;
  }
  mkdirSync(dossier, { recursive: true });
  writeFileSync(f, texte);
  chmodSync(f, statSync(f).mode | 0o111);
  return f;
}

/** Places both frame hooks in the project; returns the paths written. */
export function poserCrochets(projet) {
  return Object.keys(CROCHETS)
    .map(nom => poserCrochet(projet, nom))
    .filter(Boolean);
}

/** Names the frame hooks absent from the folder git reads for the project. */
export function crochetsAbsents(projet) {
  const dossier = dossierDesCrochets(projet);
  return Object.entries(CROCHETS)
    .filter(([nom, { marque }]) => {
      const f = dossier && path.join(dossier, nom);
      return !f || !existsSync(f) || !readFileSync(f, 'utf8').includes(marque);
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
