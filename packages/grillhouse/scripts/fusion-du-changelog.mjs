#!/usr/bin/env node
// The frame's merge driver of the CHANGELOG, on the model of gnulib's git-merge-changelog: two
// lots that each add an entry under the same heading both keep their entry, wherever git merges
// three ways (the integration's `git apply --3way --index`, the relaunch's `git apply --3way`, the
// copy's `git merge --ff-only --autostash`, a rebase, a cherry-pick).
//
//   grillhouse fusion-du-changelog <base> <nous> <eux>   git's %O %A %B; writes the result in <nous>
//
// - The project's `.gitattributes` names the driver for CHANGELOG.md (ATTRIBUT); git runs the
//   command the repository's configuration gives it (`merge.grillhouse-changelog.driver`), which
//   `poserLePilote` writes with the git hooks (`poserCrochets`, scripts/crochets.mjs), which
//   `grillhouse hooks` (the project's `prepare`, at each `npm install`) and the update of the frame
//   (scripts/grillhouse-maj.mjs, which writes the attribute) run. The command is the main
//   tree's `node_modules/.bin/grillhouse`, found from git's common directory, so that a copy
//   writes the same; without it, git's own merge (`git merge-file`) marks the conflict as git
//   would.
// - The merge is git's (`git merge-file --diff3`). A conflict whose base is empty is two additions
//   at the same place: both are kept, ours first, then theirs, each word for word. Any other
//   conflict (a line changed on both sides, an addition beside a line the other side changes)
//   stays one: <nous> receives git's marks, and the exit code is 1, as git expects of a driver.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** The name of the driver, as `.gitattributes` and the configuration name it. */
export const PILOTE = 'grillhouse-changelog';
/** The line of `.gitattributes` that gives the CHANGELOG to the driver. */
export const ATTRIBUT = `CHANGELOG.md merge=${PILOTE}`;

// The marks of the merge the driver reads: longer than any line of a CHANGELOG starts with.
const TAILLE = 40;
const DEBUT = `${'<'.repeat(TAILLE)} `;
const BASE = `${'|'.repeat(TAILLE)} `;
const MILIEU = '='.repeat(TAILLE);
const FIN = `${'>'.repeat(TAILLE)} `;

const etiquettes = ['-L', 'ours', '-L', 'base', '-L', 'theirs'];

// The text of the merge of <nous> and <eux> from <base> when each conflict is two additions, else
// null.
function lesAjouts(base, nous, eux) {
  const r = spawnSync(
    'git',
    ['merge-file', '-p', '--diff3', `--marker-size=${TAILLE}`, ...etiquettes, nous, base, eux],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  if (r.status === null || r.status < 0 || r.status > 127) {
    return null;
  }
  const sortie = [];
  let partie = null;
  let conflit = { nous: [], base: [], eux: [] };
  for (const ligne of r.stdout.split(/(?<=\n)/)) {
    const nue = ligne.replace(/\r?\n$/, '');
    if (partie === null && nue.startsWith(DEBUT)) {
      partie = 'nous';
    } else if (partie === 'nous' && nue.startsWith(BASE)) {
      partie = 'base';
    } else if (partie === 'base' && nue === MILIEU) {
      partie = 'eux';
    } else if (partie === 'eux' && nue.startsWith(FIN)) {
      if (conflit.base.length > 0) {
        return null;
      }
      sortie.push(...conflit.nous, ...conflit.eux);
      partie = null;
      conflit = { nous: [], base: [], eux: [] };
    } else if (partie === null) {
      sortie.push(ligne);
    } else {
      conflit[partie].push(ligne);
    }
  }
  return partie === null ? sortie.join('') : null;
}

/**
 * Merges <nous> and <eux> from <base> (paths), the result written in <nous>: 0 when every conflict
 * is two additions, kept both; else 1, <nous> holding git's marks.
 */
export function fusionner(base, nous, eux) {
  const texte = lesAjouts(base, nous, eux);
  if (texte !== null) {
    writeFileSync(nous, texte);
    return 0;
  }
  const r = spawnSync('git', ['merge-file', ...etiquettes, nous, base, eux]);
  return r.status === 0 ? 0 : 1;
}

/**
 * Writes the driver in the configuration of the git repository at <projet> (see the header);
 * nothing outside a repository. Returns whether it is written.
 */
export function poserLePilote(projet) {
  const git = (...a) => spawnSync('git', ['-C', projet, ...a], { encoding: 'utf8' });
  const commun = git('rev-parse', '--path-format=absolute', '--git-common-dir');
  if (commun.status !== 0) {
    return false;
  }
  const commande = path.join(path.dirname(commun.stdout.trim()), 'node_modules/.bin/grillhouse');
  const pilote =
    `c='${commande}'; if [ -x "$c" ]; then "$c" fusion-du-changelog %O %A %B; ` +
    `else git merge-file ${etiquettes.join(' ')} %A %O %B; fi`;
  return (
    git('config', '--local', `merge.${PILOTE}.name`, 'the CHANGELOG of Grillhouse').status === 0 &&
    git('config', '--local', `merge.${PILOTE}.driver`, pilote).status === 0
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [base, nous, eux] = process.argv.slice(2);
  if (!base || !nous || !eux) {
    process.stderr.write('usage: grillhouse fusion-du-changelog <base> <nous> <eux>\n');
    process.exitCode = 2;
  } else {
    process.exitCode = fusionner(base, nous, eux);
  }
}
